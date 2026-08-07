import assert from "node:assert/strict";
import { readFileSync as realReadFileSync } from "node:fs";
import test from "node:test";
import {
  PINNED_MIGRATIONS,
  EXIT,
  buildApplyStepSql,
  classifyTargetLedger,
  runApplyCandidateNumberMaintenanceMigrations,
} from "./apply-candidate-number-maintenance-migrations.mjs";

const [FIRST, SECOND] = PINNED_MIGRATIONS;

function targetsFrom(states) {
  // states: array of "absent" | "exact" | {version, name} (collision override)
  return PINNED_MIGRATIONS.map((expected, i) => {
    const state = states[i];
    if (state === "absent") return { version: expected.version, matches: [] };
    if (state === "exact") {
      return {
        version: expected.version,
        matches: [{ version: expected.version, name: expected.name }],
      };
    }
    // collision override: an explicit {version, name} row that does not
    // match the expected pair, or multiple rows.
    return { version: expected.version, matches: Array.isArray(state) ? state : [state] };
  });
}

// --- classifyTargetLedger: happy path -------------------------------------

test("classifyTargetLedger: both absent => apply, pendingIndexes covers both in order", () => {
  const result = classifyTargetLedger(targetsFrom(["absent", "absent"]));
  assert.equal(result.status, "apply");
  assert.deepEqual(result.pendingIndexes, [0, 1]);
});

test("classifyTargetLedger: both exact => verify_only, nothing pending", () => {
  const result = classifyTargetLedger(targetsFrom(["exact", "exact"]));
  assert.equal(result.status, "verify_only");
  assert.deepEqual(result.pendingIndexes, []);
});

test("classifyTargetLedger: exact prefix + absent suffix => resume, only the suffix is pending", () => {
  const result = classifyTargetLedger(targetsFrom(["exact", "absent"]));
  assert.equal(result.status, "resume");
  assert.deepEqual(result.pendingIndexes, [1]);
});

// --- classifyTargetLedger: edge boundaries ---------------------------------

test("classifyTargetLedger: absent-then-exact (reverse gap) is 'mixed', NOT 'resume' — step 2 cannot validate a constraint step 1 never added", () => {
  const result = classifyTargetLedger(targetsFrom(["absent", "exact"]));
  assert.equal(result.status, "mixed");
  assert.equal(result.reason, "partial_target_application");
});

test("classifyTargetLedger: a version claimed by a DIFFERENT name is a collision, not 'exact'", () => {
  const result = classifyTargetLedger(
    targetsFrom([{ version: FIRST.version, name: "some_other_name" }, "absent"]),
  );
  assert.equal(result.status, "collision");
  assert.match(result.reason, new RegExp(`target_collision:${FIRST.version}`));
});

test("classifyTargetLedger: a name claimed by a DIFFERENT version is a collision", () => {
  const result = classifyTargetLedger(
    targetsFrom(["absent", { version: "99999999999999", name: SECOND.name }]),
  );
  assert.equal(result.status, "collision");
});

test("classifyTargetLedger: multiple rows matching one expected slot is a collision, never 'exact'", () => {
  const result = classifyTargetLedger(
    targetsFrom([
      [
        { version: FIRST.version, name: FIRST.name },
        { version: FIRST.version, name: "duplicate_row" },
      ],
      "absent",
    ]),
  );
  assert.equal(result.status, "collision");
});

// --- classifyTargetLedger: null / invalid inputs ---------------------------

test("classifyTargetLedger: non-array input is invalid", () => {
  assert.deepEqual(classifyTargetLedger(null), { status: "invalid", reason: "target_count" });
  assert.deepEqual(classifyTargetLedger(undefined), { status: "invalid", reason: "target_count" });
  assert.deepEqual(classifyTargetLedger({}), { status: "invalid", reason: "target_count" });
});

test("classifyTargetLedger: wrong target count (too few or too many) is invalid", () => {
  assert.equal(
    classifyTargetLedger([{ version: FIRST.version, matches: [] }]).status,
    "invalid",
  );
  assert.equal(
    classifyTargetLedger([...targetsFrom(["absent", "absent"]), { version: "x", matches: [] }])
      .status,
    "invalid",
  );
});

test("classifyTargetLedger: a target row missing entirely for an expected version is invalid", () => {
  const result = classifyTargetLedger([
    { version: FIRST.version, matches: [] },
    { version: "00000000000000", matches: [] }, // wrong version key, SECOND never found
  ]);
  assert.equal(result.status, "invalid");
  assert.match(result.reason, new RegExp(`target_missing:${SECOND.version}`));
});

test("classifyTargetLedger: a target row with a non-array matches field is invalid, not treated as absent", () => {
  const result = classifyTargetLedger([
    { version: FIRST.version, matches: null },
    { version: SECOND.version, matches: [] },
  ]);
  assert.equal(result.status, "invalid");
});

// --- classifyTargetLedger: deterministic repeatability ---------------------

test("classifyTargetLedger: identical input always produces an identical result (pure function, no hidden state)", () => {
  const input = targetsFrom(["exact", "absent"]);
  const first = classifyTargetLedger(input);
  const second = classifyTargetLedger(JSON.parse(JSON.stringify(input)));
  assert.deepEqual(first, second);
});

// --- buildApplyStepSql: safety-fence assertions ----------------------------

function validMigrationFor(pinned) {
  return { ...pinned, text: `-- body for ${pinned.version}\nselect 1;\n` };
}

test("buildApplyStepSql: rejects a migration object that does not match its own PINNED_MIGRATIONS entry", () => {
  const tampered = { ...validMigrationFor(FIRST), sha256: "0".repeat(64) };
  assert.throws(() => buildApplyStepSql(tampered), /validated_migration_step/);
});

test("buildApplyStepSql: rejects a migration whose version does not exist in PINNED_MIGRATIONS at all", () => {
  const bogus = { version: "11111111111111", name: "nope", sha256: "0".repeat(64), text: "select 1;\n" };
  assert.throws(() => buildApplyStepSql(bogus), /validated_migration_step/);
});

test("buildApplyStepSql: the generated collision guard is scoped to ONLY this migration's version/name, not the other one", () => {
  const sql = buildApplyStepSql(validMigrationFor(FIRST));
  assert.match(sql, new RegExp(FIRST.version));
  assert.match(sql, new RegExp(FIRST.name));
  // Regression guard for the bundled-transaction-era bug shape: a per-step
  // collision check must never reference the OTHER migration's identifiers,
  // or a legitimate partial-apply state would refuse itself.
  assert.doesNotMatch(sql, new RegExp(SECOND.version));
  assert.doesNotMatch(sql, new RegExp(SECOND.name));
});

test("buildApplyStepSql: embeds exactly one migration's file body, not both", () => {
  const sql = buildApplyStepSql(validMigrationFor(SECOND));
  assert.match(sql, new RegExp(`BEGIN EXACT PINNED FILE: ${SECOND.file}`));
  assert.doesNotMatch(sql, new RegExp(`BEGIN EXACT PINNED FILE: ${FIRST.file}`));
});

// --- runApplyCandidateNumberMaintenanceMigrations: runner safety fence ----
// End-to-end through the real entry point with a mocked psql, proving the
// classifier's decision actually controls what SQL gets submitted — not
// just that classifyTargetLedger returns the right label in isolation.

function baseEnv(overrides = {}) {
  return {
    TARGET_ENV: "production",
    CONFIRM_PROJECT_REF: "knkwiiywfkbqznbxwqfh",
    CONFIRM_APPLY: "APPLY CANDIDATE NUMBER MAINTENANCE MIGRATIONS",
    EXPECTED_HEAD_SHA: "a".repeat(40),
    GITHUB_SHA: "a".repeat(40),
    SUPABASE_DB_URL:
      "postgres://postgres:pass@db.knkwiiywfkbqznbxwqfh.supabase.co:5432/postgres?sslmode=require",
    ...overrides,
  };
}

test("runner safety fence: a 'resume' ledger submits exactly ONE apply file (the pending suffix), never re-submits the already-committed step", () => {
  const membershipPreflightStdout = `${JSON.stringify({
    orphan_count: 0,
    constraint_present: true,
    constraint_validated: true,
  })}\n`;
  const ledgerStdout = `${JSON.stringify([
    { version: FIRST.version, matches: [{ version: FIRST.version, name: FIRST.name }] },
    { version: SECOND.version, matches: [] },
  ])}\n`;
  const postflightStdout = `${JSON.stringify({
    migrations: PINNED_MIGRATIONS.map((m) => ({ version: m.version, exact_match: true, mismatch: false })),
    guard_functiondef_md5: "f80bd729ca8721780c01c4740cd3a7d6",
    constraint_def: "CHECK (((candidate_number IS NULL) OR (pheno_hunt_id IS NOT NULL)))",
    constraint_validated: true,
  })}\n`;

  const psqlFileCalls = [];
  let queryCallIndex = 0;
  const spawnImpl = (cmd, args) => {
    if (args.includes("--file")) {
      const fileIndex = args.indexOf("--file") + 1;
      psqlFileCalls.push(args[fileIndex]);
      return { status: 0, stdout: "", stderr: "" };
    }
    // -c query calls happen in order: membership preflight, ledger query, postflight.
    queryCallIndex += 1;
    if (queryCallIndex === 1) return { status: 0, stdout: membershipPreflightStdout, stderr: "" };
    if (queryCallIndex === 2) return { status: 0, stdout: ledgerStdout, stderr: "" };
    return { status: 0, stdout: postflightStdout, stderr: "" };
  };

  // buildApplyStepSql validates against PINNED_MIGRATIONS' real sha256, so
  // this test must supply file content that hashes to the pinned value —
  // instead of faking that, read the real repository files directly.
  const exitCode = runApplyCandidateNumberMaintenanceMigrations({
    env: baseEnv(),
    spawnImpl,
    readFile: realReadFileSync,
    logger: { log: () => {}, error: () => {} },
    now: () => new Date("2026-08-07T00:00:00.000Z"),
  });

  assert.equal(exitCode, EXIT.OK);
  assert.equal(psqlFileCalls.length, 1, `expected exactly one --file apply call, got ${psqlFileCalls.length}`);
});

test("runner safety fence: a 'collision' ledger submits NO apply file at all — fail closed", () => {
  const membershipPreflightStdout = `${JSON.stringify({
    orphan_count: 0,
    constraint_present: true,
    constraint_validated: true,
  })}\n`;
  const ledgerStdout = `${JSON.stringify([
    { version: FIRST.version, matches: [{ version: FIRST.version, name: "hijacked_name" }] },
    { version: SECOND.version, matches: [] },
  ])}\n`;

  const psqlFileCalls = [];
  let queryCallIndex = 0;
  const spawnImpl = (cmd, args) => {
    if (args.includes("--file")) {
      psqlFileCalls.push(args[args.indexOf("--file") + 1]);
      return { status: 0, stdout: "", stderr: "" };
    }
    queryCallIndex += 1;
    if (queryCallIndex === 1) return { status: 0, stdout: membershipPreflightStdout, stderr: "" };
    return { status: 0, stdout: ledgerStdout, stderr: "" };
  };

  const exitCode = runApplyCandidateNumberMaintenanceMigrations({
    env: baseEnv(),
    spawnImpl,
    readFile: realReadFileSync,
    logger: { log: () => {}, error: () => {} },
    now: () => new Date("2026-08-07T00:00:00.000Z"),
  });

  assert.equal(exitCode, EXIT.LEDGER_DRIFT);
  assert.equal(psqlFileCalls.length, 0, "a collision must never reach the apply step");
});
