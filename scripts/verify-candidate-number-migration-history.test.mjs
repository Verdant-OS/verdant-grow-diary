import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPECTED_CONSTRAINT_DEF,
  EXPECTED_GUARD_FUNCTION_MD5,
  EXPECTED_MIGRATIONS,
  buildSchemaRepairGuidance,
  classifyHistory,
  describeApplyBehavior,
  parseVerifyStdout,
  runVerifyCandidateNumberMigrationHistory,
  EXIT,
} from "./verify-candidate-number-migration-history.mjs";

const [FIRST_VERSION, SECOND_VERSION] = EXPECTED_MIGRATIONS.map((m) => m.version);

function migrationsRow({ firstExact = true, secondExact = true, mismatchVersions = [] } = {}) {
  return EXPECTED_MIGRATIONS.map((expected) => ({
    version: expected.version,
    exact_match:
      expected.version === FIRST_VERSION
        ? firstExact && !mismatchVersions.includes(expected.version)
        : secondExact && !mismatchVersions.includes(expected.version),
    mismatch: mismatchVersions.includes(expected.version),
  }));
}

function stdoutFor(fields) {
  // Use "in" rather than "??" so an explicitly-passed `null` (simulating an
  // absent guard function or constraint) is not silently replaced by the
  // pinned default — the two are different scenarios under test.
  return `${JSON.stringify({
    migrations: migrationsRow(fields.migrations ?? {}),
    guard_functiondef_md5: "guardMd5" in fields ? fields.guardMd5 : EXPECTED_GUARD_FUNCTION_MD5,
    constraint_def: "constraintDef" in fields ? fields.constraintDef : EXPECTED_CONSTRAINT_DEF,
    constraint_validated: "constraintValidated" in fields ? fields.constraintValidated : true,
  })}\n`;
}

test("parseVerifyStdout accepts the new md5/def shape and null objects", () => {
  const parsed = parseVerifyStdout(stdoutFor({}));
  assert.equal(parsed.guard_functiondef_md5, EXPECTED_GUARD_FUNCTION_MD5);
  assert.equal(parsed.constraint_def, EXPECTED_CONSTRAINT_DEF);

  const absent = parseVerifyStdout(
    stdoutFor({ guardMd5: null, constraintDef: null, constraintValidated: false }),
  );
  assert.equal(absent.guard_functiondef_md5, null);
  assert.equal(absent.constraint_def, null);
});

test("parseVerifyStdout rejects a non-string, non-null md5/def value", () => {
  const malformed = JSON.stringify({
    migrations: migrationsRow({}),
    guard_functiondef_md5: 12345,
    constraint_def: EXPECTED_CONSTRAINT_DEF,
    constraint_validated: true,
  });
  assert.throws(() => parseVerifyStdout(`${malformed}\n`), /verify_result_shape/);
});

test("classifyHistory: exact pinned fingerprints + validated => schema effect live", () => {
  const result = parseVerifyStdout(stdoutFor({}));
  const classification = classifyHistory(result);
  assert.equal(classification.schemaEffectLive, true);
  assert.equal(classification.guardFunctionMatches, true);
  assert.equal(classification.constraintDefMatches, true);
});

test("classifyHistory: same-named constraint with different body reads as NOT live (the drift this fix closes)", () => {
  // This is the exact scenario from review comment 3738149487: a later DDL
  // change drops and re-adds the constraint under the SAME name with a
  // no-op expression. A name-and-validated-only check would have called
  // this live; comparing the canonical definition text must not.
  const result = parseVerifyStdout(stdoutFor({ constraintDef: "CHECK (true)" }));
  const classification = classifyHistory(result);
  assert.equal(classification.constraintDefMatches, false);
  assert.equal(classification.schemaEffectLive, false);
});

test("classifyHistory: guard function body drift (different logic under the same proname) reads as NOT live", () => {
  const result = parseVerifyStdout(stdoutFor({ guardMd5: "0".repeat(32) }));
  const classification = classifyHistory(result);
  assert.equal(classification.guardFunctionMatches, false);
  assert.equal(classification.schemaEffectLive, false);
});

test("classifyHistory: absent guard/constraint (null) reads as NOT live, not a crash", () => {
  const result = parseVerifyStdout(
    stdoutFor({ guardMd5: null, constraintDef: null, constraintValidated: false }),
  );
  const classification = classifyHistory(result);
  assert.equal(classification.schemaEffectLive, false);
});

test("describeApplyBehavior: both absent => apply", () => {
  const classification = { missingVersions: [FIRST_VERSION, SECOND_VERSION] };
  assert.equal(describeApplyBehavior(classification), "apply");
});

test("describeApplyBehavior: clean exact prefix + absent suffix => resume", () => {
  const classification = { missingVersions: [SECOND_VERSION] };
  assert.equal(describeApplyBehavior(classification), "resume");
});

test("describeApplyBehavior: both exact (nothing missing) => verify_only", () => {
  const classification = { missingVersions: [] };
  assert.equal(describeApplyBehavior(classification), "verify_only");
});

test("describeApplyBehavior: later version present while earlier is absent => reverse_gap_drift", () => {
  const classification = { missingVersions: [FIRST_VERSION] };
  assert.equal(describeApplyBehavior(classification), "reverse_gap_drift");
});

test("buildSchemaRepairGuidance: sandbox always declines to point at the production-only apply script", () => {
  const guidance = buildSchemaRepairGuidance({
    targetEnv: "sandbox",
    classification: { missingVersions: [FIRST_VERSION, SECOND_VERSION] },
  });
  assert.match(guidance, /no automated sandbox repair path/);
  assert.doesNotMatch(guidance, /apply-candidate-number-maintenance-migrations\.mjs`, which records/);
});

test("buildSchemaRepairGuidance: production + verify_only state names the real gap instead of telling the operator to re-apply", () => {
  // This is review comment 3738149494's exact scenario: both exact ledger
  // rows exist but the schema effect is not live. The apply script would
  // classify this ledger as verify_only, skip re-running SQL, and just
  // fail postflight again — so telling the operator to "apply the
  // migrations" here would send them in a circle.
  const guidance = buildSchemaRepairGuidance({
    targetEnv: "production",
    classification: { missingVersions: [] },
  });
  assert.match(guidance, /verify_only/);
  assert.match(guidance, /no automated repair path/);
  assert.match(guidance, /delete the stale ledger row/);
});

test("buildSchemaRepairGuidance: production + reverse-gap drift refuses to recommend dispatching apply", () => {
  const guidance = buildSchemaRepairGuidance({
    targetEnv: "production",
    classification: { missingVersions: [FIRST_VERSION] },
  });
  assert.match(guidance, /refuse to run against this state/);
  assert.doesNotMatch(guidance, /^Re-apply via/);
});

test("buildSchemaRepairGuidance: production + clean missing state still gives the direct apply instruction", () => {
  const guidance = buildSchemaRepairGuidance({
    targetEnv: "production",
    classification: { missingVersions: [FIRST_VERSION, SECOND_VERSION] },
  });
  assert.match(guidance, /^Re-apply via `scripts\/apply-candidate-number-maintenance-migrations\.mjs`, which records/);
});

test("end-to-end: a mismatch is reported even when the schema effect is ALSO not live (the ordering bug this fix closes)", () => {
  // Before the fix, the schema-effect check ran first and returned early,
  // so a compound failure (mismatched ledger row AND broken schema) was
  // silently reported as if it were only the schema failure — the
  // mismatch signal never surfaced.
  const env = {
    TARGET_ENV: "production",
    SUPABASE_DB_URL:
      "postgres://postgres:pass@db.knkwiiywfkbqznbxwqfh.supabase.co:5432/postgres?sslmode=require",
  };
  const stdout = stdoutFor({
    migrations: { mismatchVersions: [FIRST_VERSION] },
    constraintDef: "CHECK (true)",
  });
  const logged = [];
  const logger = { log: () => {}, error: (msg) => logged.push(msg) };
  const spawnImpl = () => ({ status: 0, stdout, stderr: "" });

  const exitCode = runVerifyCandidateNumberMigrationHistory({ env, spawnImpl, logger });

  assert.equal(exitCode, EXIT.LEDGER_VERSION_MISMATCH);
  assert.ok(
    logged.some((line) => line.includes("schema effect live: false")),
    `expected a log line surfacing that the schema effect is also not live, got: ${JSON.stringify(logged)}`,
  );
});

test("end-to-end: verify_only-but-drifted schema gives production the honest no-repair-path message, not a circular apply instruction", () => {
  const env = {
    TARGET_ENV: "production",
    SUPABASE_DB_URL:
      "postgres://postgres:pass@db.knkwiiywfkbqznbxwqfh.supabase.co:5432/postgres?sslmode=require",
  };
  const stdout = stdoutFor({ constraintDef: "CHECK (true)" });
  const logged = [];
  const logger = { log: () => {}, error: (msg) => logged.push(msg) };
  const spawnImpl = () => ({ status: 0, stdout, stderr: "" });

  const exitCode = runVerifyCandidateNumberMigrationHistory({ env, spawnImpl, logger });

  assert.equal(exitCode, EXIT.SCHEMA_EFFECT_MISSING);
  assert.ok(logged.some((line) => line.includes("no automated repair path")));
});
