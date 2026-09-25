import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rootCertificates } from "node:tls";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { PRODUCTION_SUPABASE_CA_FILENAME } from "../../scripts/lib/productionSupabaseTls.mjs";

const RUNNER_PATH = resolve("scripts/apply-quicklog-revision-idempotent-replay.mjs");
const WORKFLOW_PATH = resolve(".github/workflows/apply-quicklog-revision-idempotent-replay.yml");
const PG15_WORKFLOW_PATH = resolve(
  ".github/workflows/quicklog-revision-idempotent-replay-pg15.yml",
);
const RUNBOOK_PATH = resolve("docs/quicklog-revision-idempotent-replay-operator-runbook.md");
const MIGRATION_PATH = resolve(
  "supabase/migrations/20260916111000_quicklog_revision_idempotent_replay.sql",
);
const PREREQUISITE_MIGRATION_PATH = resolve(
  "supabase/migrations/20260811090000_quicklog_corrections_retractions.sql",
);

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const EXPECTED_HEAD_SHA = "a".repeat(40);
const ADVANCED_HEAD_SHA = "b".repeat(40);
const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
const DATABASE_SECRET = "revision-production-password-sentinel";
const DATABASE_URL = `postgresql://postgres:${DATABASE_SECRET}@db.${PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`;
const CA_SECRET_SENTINEL = "raw-production-ca-secret-sentinel";
const SOLO_FOUNDER_ACKNOWLEDGEMENT = "I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN";
const SOLO_FOUNDER_AUTHORIZATION_ENV = Object.freeze({
  SOLO_FOUNDER_DELIVERY_MODE: "solo_founder_self_review_v1",
  SOLO_FOUNDER_VERIFIED_USER_ID: "72639960",
  SOLO_FOUNDER_VERIFIED_LOGIN: "cheekhimself",
  SOLO_FOUNDER_VERIFIED_ENVIRONMENT: "verdant-production-solo-founder",
  SOLO_FOUNDER_ACKNOWLEDGEMENT_VERIFIED: "true",
  SOLO_FOUNDER_ENVIRONMENT_CONTRACT_VERIFIED: "true",
  SOLO_FOUNDER_ENVIRONMENT_APPROVAL_VERIFIED: "true",
  SOLO_FOUNDER_MINIMUM_REVIEW_SECONDS: "900",
  SOLO_FOUNDER_MAXIMUM_REVIEW_SECONDS: "86400",
});
const SOLO_FOUNDER_AUTHORIZATION_RECEIPT = Object.freeze({
  delivery_mode: "solo_founder_self_review_v1",
  founder_github_user_id: 72639960,
  founder_github_login: "cheekhimself",
  production_environment: "verdant-production-solo-founder",
  solo_founder_acknowledgement_verified: true,
  environment_contract_verified: true,
  environment_approval_verified: true,
  minimum_review_seconds: 900,
  maximum_review_seconds: 86400,
});

/** The production state measured read-only on 2026-09-25: legacy live, target absent. */
const BASELINE_STATE = Object.freeze({
  ledger_exact_count: 0,
  ledger_conflict_count: 0,
  ledger_exact_names: [],
  ledger_statements_contract: false,
  migration_ledger_contract: true,
  required_roles_contract: true,
  legacy_functions_contract: true,
  legacy_correct_oid: 46230,
  legacy_retract_oid: 46228,
  correct_overload_count: 1,
  retract_overload_count: 1,
  apply_once_overload_count: 0,
  receipt_table_present: false,
  receipt_table_contract: false,
  receipt_table_oid: 0,
  apply_once_present: false,
  apply_once_contract: false,
  apply_once_oid: 0,
  keyed_correct_present: false,
  keyed_correct_contract: false,
  keyed_correct_oid: 0,
  keyed_retract_present: false,
  keyed_retract_contract: false,
  keyed_retract_oid: 0,
});

const CANONICAL_LEDGER_ABSENT_STATE = Object.freeze({
  ...BASELINE_STATE,
  correct_overload_count: 2,
  retract_overload_count: 2,
  apply_once_overload_count: 1,
  receipt_table_present: true,
  receipt_table_contract: true,
  receipt_table_oid: 50001,
  apply_once_present: true,
  apply_once_contract: true,
  apply_once_oid: 50002,
  keyed_correct_present: true,
  keyed_correct_contract: true,
  keyed_correct_oid: 50003,
  keyed_retract_present: true,
  keyed_retract_contract: true,
  keyed_retract_oid: 50004,
});

const RECORDED_CANONICAL_STATE = Object.freeze({
  ...CANONICAL_LEDGER_ABSENT_STATE,
  ledger_exact_count: 1,
  ledger_exact_names: ["quicklog_revision_idempotent_replay"],
  ledger_statements_contract: true,
});

const WRITERS = Object.freeze([
  "apply-candidate-number-maintenance-migrations.yml",
  "apply-pinned-breeding-reconciliation.yml",
  "apply-pinned-production-migrations.yml",
  "apply-quicklog-corrections-retractions.yml",
  "apply-signup-acquisition-forward-repair.yml",
  "apply-quicklog-manual-delegate-forward-repair.yml",
  "apply-action-queue-transition-forward-repair.yml",
  "apply-agreement-acceptance-insert-forward-repair.yml",
  "apply-quicklog-revision-idempotent-replay.yml",
]);

/** Writers that snapshot every other writer before APPLY. */
const GUARDED_WRITERS = Object.freeze([
  "apply-quicklog-manual-delegate-forward-repair.yml",
  "apply-action-queue-transition-forward-repair.yml",
  "apply-agreement-acceptance-insert-forward-repair.yml",
  "apply-quicklog-revision-idempotent-replay.yml",
]);

function stdout(state: object) {
  return `${JSON.stringify(state)}\n`;
}

function baseEnv(extra: Record<string, string> = {}) {
  return {
    OPERATION: "APPLY",
    TARGET_ENV: "production",
    EXPECTED_HEAD_SHA,
    CURRENT_DEPLOY_HEAD_SHA: EXPECTED_HEAD_SHA,
    GITHUB_SHA: EXPECTED_HEAD_SHA,
    GITHUB_REF_NAME: "verdant-grow-diary",
    GITHUB_REPOSITORY: EXPECTED_REPOSITORY,
    GITHUB_REPOSITORY_ID: "8675309",
    GITHUB_RUN_ID: "24680",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF:
      "Verdant-OS/verdant-grow-diary/.github/workflows/apply-quicklog-revision-idempotent-replay.yml@refs/heads/verdant-grow-diary",
    CONFIRM_PROJECT_REF: PROJECT_REF,
    CONFIRM_APPLY: "APPLY QUICKLOG REVISION IDEMPOTENT REPLAY",
    PREFLIGHT_RUN_ID: "13579",
    PREFLIGHT_RECEIPT_DIGEST: "",
    SOLO_FOUNDER_ACKNOWLEDGEMENT,
    ...SOLO_FOUNDER_AUTHORIZATION_ENV,
    SUPABASE_DB_URL: DATABASE_URL,
    PATH: process.env.PATH ?? "",
    ...extra,
  };
}

async function loadRunner() {
  try {
    return await import(`${pathToFileURL(RUNNER_PATH).href}?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    expect.fail(
      `Quick Log revision delivery runner could not be imported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const temporaryRoots: string[] = [];

function evidenceEnv() {
  const root = mkdtempSync(join(tmpdir(), "verdant-quicklog-revision-delivery-test-"));
  temporaryRoots.push(root);
  const caPath = join(root, PRODUCTION_SUPABASE_CA_FILENAME);
  const ca = rootCertificates[0];
  if (!ca) throw new Error("Node did not provide a root certificate for the test.");
  writeFileSync(caPath, ca, { mode: 0o600 });
  return {
    REPORT_PATH: join(root, "report.md"),
    AUDIT_PATH: join(root, "audit.json"),
    PREFLIGHT_RECEIPT_PATH: join(root, "preflight-receipt.json"),
    RUNNER_TEMP: root,
    SUPABASE_DB_CA_CERT_PATH: caPath,
    SUPABASE_DB_CA_CERT_B64: CA_SECRET_SENTINEL,
  };
}

function prosrcFingerprints(path: string) {
  const source = readFileSync(path, "utf8");
  const pattern =
    /CREATE (?:OR REPLACE )?FUNCTION\s+public\.(\w+)\(([\s\S]*?)\)\s*RETURNS[\s\S]*?AS\s+(\$\w*\$)([\s\S]*?)\3/g;
  return [...source.matchAll(pattern)].map((match) => ({
    name: match[1],
    bytes: Buffer.byteLength(match[4]),
    md5: createHash("md5").update(match[4]).digest("hex"),
  }));
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Quick Log revision idempotent replay production delivery", () => {
  it("pins the exact merged LF migration bytes and preserves its own BEGIN/COMMIT boundary", async () => {
    const runner = await loadRunner();
    const raw = readFileSync(MIGRATION_PATH);
    const observed = createHash("sha256").update(raw).digest("hex").toUpperCase();
    const migration = runner.validatePinnedMigrationFile();

    expect(runner.PINNED_MIGRATION).toEqual({
      version: "20260916111000",
      name: "quicklog_revision_idempotent_replay",
      file: "20260916111000_quicklog_revision_idempotent_replay.sql",
      sha256: observed,
    });
    expect(raw.includes(13)).toBe(false);
    expect(raw.at(-1)).toBe(10);
    expect(migration.text).toMatch(/\nBEGIN;\n[\s\S]*\nCOMMIT;\n$/);
    expect(runner.findUnsafeSqlReason(migration.text)).toBe("transaction_control");
    expect(() =>
      runner.validatePinnedMigrationFile({
        readFile: () => Buffer.concat([raw, Buffer.from(" ")]),
      }),
    ).toThrow("hash_mismatch:20260916111000");
  });

  it("derives every pinned function fingerprint from the reviewed migration sources", async () => {
    const runner = await loadRunner();
    const delivered = prosrcFingerprints(MIGRATION_PATH);
    const legacy = prosrcFingerprints(PREREQUISITE_MIGRATION_PATH);
    const byName = (rows: typeof delivered, name: string) => {
      const matches = rows.filter((row) => row.name === name);
      expect(matches, name).toHaveLength(1);
      return { bytes: matches[0].bytes, md5: matches[0].md5 };
    };

    expect(runner.EXPECTED_FUNCTION_FINGERPRINTS).toEqual({
      legacyCorrect: byName(legacy, "quicklog_correct_entry"),
      legacyRetract: byName(legacy, "quicklog_retract_entry"),
      applyOnce: byName(delivered, "quicklog_revision_apply_once"),
      keyedCorrect: byName(delivered, "quicklog_correct_entry"),
      keyedRetract: byName(delivered, "quicklog_retract_entry"),
    });
  });

  it("classifies only baseline+absent, canonical+absent and canonical+exact as recoverable", async () => {
    const runner = await loadRunner();

    expect(runner.classifyPreflight(BASELINE_STATE)).toEqual({ status: "apply" });
    expect(runner.classifyPreflight(CANONICAL_LEDGER_ABSENT_STATE)).toEqual({
      status: "schema_live_ledger_absent",
    });
    expect(runner.classifyPreflight(RECORDED_CANONICAL_STATE)).toEqual({ status: "verify_only" });

    expect(runner.classifyPreflight({ ...BASELINE_STATE, ledger_conflict_count: 1 })).toEqual({
      status: "ledger_drift",
      reason: "target_collision",
    });
    for (const key of [
      "migration_ledger_contract",
      "required_roles_contract",
      "legacy_functions_contract",
    ]) {
      expect(runner.classifyPreflight({ ...BASELINE_STATE, [key]: false })).toEqual({
        status: "prerequisite_drift",
        reason: key,
      });
    }
    for (const partial of [
      { receipt_table_present: true },
      { apply_once_present: true, apply_once_overload_count: 1 },
      { correct_overload_count: 2 },
      { ...CANONICAL_LEDGER_ABSENT_STATE, keyed_retract_contract: false },
      { ...CANONICAL_LEDGER_ABSENT_STATE, receipt_table_contract: false },
      { ...CANONICAL_LEDGER_ABSENT_STATE, apply_once_overload_count: 2 },
    ]) {
      expect(runner.classifyPreflight({ ...BASELINE_STATE, ...partial })).toEqual({
        status: "schema_drift",
        reason: "target_partial_or_fingerprint",
      });
    }
    expect(
      runner.classifyPreflight({
        ...BASELINE_STATE,
        ledger_exact_count: 1,
        ledger_exact_names: ["quicklog_revision_idempotent_replay"],
        ledger_statements_contract: true,
      }),
    ).toEqual({ status: "schema_drift", reason: "recorded_effect_mismatch" });
    expect(
      runner.classifyPreflight({ ...RECORDED_CANONICAL_STATE, ledger_statements_contract: false }),
    ).toEqual({ status: "schema_drift", reason: "recorded_effect_mismatch" });
  });

  it("parses exactly one typed read-only catalog row", async () => {
    const runner = await loadRunner();
    const sql = runner.PREFLIGHT_SQL as string;

    expect(runner.parsePreflightStdout(stdout(BASELINE_STATE))).toEqual(BASELINE_STATE);
    expect(() => runner.parsePreflightStdout("{}\n")).toThrow("preflight_result_shape");
    expect(() =>
      runner.parsePreflightStdout(`${stdout(BASELINE_STATE)}${stdout(BASELINE_STATE)}`),
    ).toThrow("preflight_row_count:2");
    expect(() =>
      runner.parsePreflightStdout(stdout({ ...BASELINE_STATE, apply_once_present: "false" })),
    ).toThrow("preflight_result_shape");
    expect(() =>
      runner.parsePreflightStdout(stdout({ ...BASELINE_STATE, ledger_exact_names: ["other"] })),
    ).toThrow("preflight_result_shape");
    expect(sql).toMatch(/set transaction read only/i);
    expect(sql).toContain("set local search_path = pg_catalog, public, pg_temp;");
    expect(sql).not.toMatch(
      /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|notify)\b/im,
    );
  });

  it("pins the prerequisite and delivered ABIs, owners, configs and exact ACLs", async () => {
    const runner = await loadRunner();
    const sql = runner.CATALOG_STATE_QUERY_SQL as string;

    expect(runner.FUNCTION_SIGNATURES).toEqual({
      legacyCorrect: "public.quicklog_correct_entry(text,jsonb,uuid,uuid,text)",
      legacyRetract: "public.quicklog_retract_entry(text,uuid,uuid,text)",
      applyOnce: "public.quicklog_revision_apply_once(text,text,text,jsonb,uuid,uuid,text)",
      keyedCorrect: "public.quicklog_correct_entry(text,text,jsonb,uuid,uuid,text)",
      keyedRetract: "public.quicklog_retract_entry(text,text,uuid,uuid,text)",
    });
    for (const signature of Object.values(runner.FUNCTION_SIGNATURES) as string[]) {
      expect(sql).toContain(`'${signature}'`);
    }
    expect(sql).toContain("owner_role.rolname = 'postgres'");
    expect(sql).toContain("p.prosecdef");
    expect(sql).toContain("p.proconfig = array['search_path=public, pg_temp']::text[]");
    expect(sql).toContain("md5(replace(p.prosrc, E'\\r', ''))");
    expect(sql).toContain("not has_function_privilege('anon', p.oid, 'EXECUTE')");
    // Client EXECUTE only on the keyed and legacy RPCs; the helper is owner-only.
    expect(sql.match(/'authenticated\|EXECUTE\|f\|postgres'/g) ?? []).toHaveLength(4);
    expect(sql).toContain("array['postgres|EXECUTE|f|postgres']::text[]");
    // Receipt table: RLS on, no policies, no client privilege, service_role only.
    expect(sql).toContain("c.relrowsecurity");
    expect(sql).toContain("not exists(select 1 from pg_policy pol where pol.polrelid = c.oid)");
    expect(sql).toContain(
      "not has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",
    );
    expect(sql).toContain("PRIMARY KEY (user_id, idempotency_key)");
    expect(sql).toContain(
      "CHECK (char_length(idempotency_key) >= 8 AND char_length(idempotency_key) <= 200)",
    );
  });

  it("pins the production migration-ledger shape and inheriting client roles as measured", async () => {
    const runner = await loadRunner();
    const sql = runner.CATALOG_STATE_QUERY_SQL as string;

    expect(runner.MIGRATION_LEDGER_COLUMNS).toEqual([
      "1|version|text|t|||t",
      "2|statements|text[]|f|||t",
      "3|name|text|f|||t",
      "4|created_by|text|f|||t",
      "5|idempotency_key|text|f|||t",
      "6|rollback|text[]|f|||t",
    ]);
    expect(runner.MIGRATION_LEDGER_CONSTRAINTS).toEqual([
      "schema_migrations_idempotency_key_key|u|t|f|f|UNIQUE (idempotency_key)",
      "schema_migrations_pkey|p|t|f|f|PRIMARY KEY (version)",
    ]);
    for (const value of [
      ...runner.MIGRATION_LEDGER_COLUMNS,
      ...runner.MIGRATION_LEDGER_CONSTRAINTS,
    ]) {
      expect(sql).toContain(`'${value}'`);
    }
    expect(sql).toMatch(/when rolname='service_role' then[\s\S]*?and rolbypassrls/);
    expect(sql).toMatch(/else[\s\S]*?and not rolbypassrls end/);
    expect(sql).not.toContain("rolinherit");
  });

  it("builds an insert-only collision-guarded ledger transaction with no app-table lock", async () => {
    const runner = await loadRunner();
    const sql = runner.buildLedgerInsertSql();

    expect(sql).toMatch(/^\\set ON_ERROR_STOP on\nbegin;/i);
    expect(sql).toMatch(/\ncommit;\s*$/i);
    expect(sql).toContain("pg_advisory_xact_lock(20260916, 111000)");
    expect(sql).toContain("lock table supabase_migrations.schema_migrations");
    expect(sql).toContain("quicklog revision replay ledger collision");
    expect(sql).toContain(
      "insert into supabase_migrations.schema_migrations(version,name,statements)",
    );
    expect(sql).toContain(runner.PINNED_MIGRATION.sha256);
    for (const key of [
      "legacy_functions_contract",
      "receipt_table_contract",
      "apply_once_contract",
      "keyed_correct_contract",
      "keyed_retract_contract",
    ]) {
      expect(sql).toContain(`not coalesce((v_state->>'${key}')::boolean,false)`);
    }
    expect(sql).not.toMatch(/lock table public\./i);
    // Privilege names inside has_table_privilege('…') literals are not statements.
    const outsideLiterals = sql.replace(/'[^']*'/g, "''");
    expect(outsideLiterals).not.toMatch(
      /\b(create|alter|drop|grant|revoke|update|delete|truncate)\b/i,
    );
    expect(outsideLiterals.match(/\binsert\b/gi)).toHaveLength(1);
    expect(sql.match(/^\s*insert\s+into/gim)).toHaveLength(1);
    expect(sql).not.toContain(readFileSync(MIGRATION_PATH, "utf8"));
  });

  it.each([
    [BASELINE_STATE, "safe_to_apply"],
    [CANONICAL_LEDGER_ABSENT_STATE, "schema_live_ledger_absent"],
  ])("emits an immutable recoverable PREFLIGHT receipt (%#)", async (state, outcome) => {
    const runner = await loadRunner();
    const evidence = evidenceEnv();
    const status = runner.runQuickLogRevisionIdempotentReplay({
      env: baseEnv({
        ...evidence,
        OPERATION: "PREFLIGHT",
        CONFIRM_APPLY: "",
        PREFLIGHT_RUN_ID: "",
      }),
      spawnImpl: (_command: string, args: string[]) => {
        expect(args).toContain("--single-transaction");
        expect(args).toContain("-c");
        return { status: 0, stdout: stdout(state), stderr: "" };
      },
      logger: { log() {}, error() {} },
      now: () => new Date("2026-09-25T12:00:00.000Z"),
    });

    expect(status).toBe(runner.EXIT.OK);
    expect(JSON.parse(readFileSync(evidence.PREFLIGHT_RECEIPT_PATH, "utf8"))).toMatchObject({
      schema_version: 1,
      tool: "apply-quicklog-revision-idempotent-replay",
      operation: "PREFLIGHT",
      outcome,
      safe_to_apply: true,
      workflow_path: ".github/workflows/apply-quicklog-revision-idempotent-replay.yml",
      head_sha: EXPECTED_HEAD_SHA,
      project_ref: PROJECT_REF,
      migration_version: "20260916111000",
      migration_sha256: runner.PINNED_MIGRATION.sha256,
      state_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      ...SOLO_FOUNDER_AUTHORIZATION_RECEIPT,
    });
  });

  it("binds the receipt to prerequisite object identity, not just to booleans", async () => {
    const runner = await loadRunner();
    const original = runner.buildPreflightReceipt({
      state: BASELINE_STATE,
      headSha: EXPECTED_HEAD_SHA,
    });
    const replaced = runner.buildPreflightReceipt({
      state: { ...BASELINE_STATE, legacy_retract_oid: 99999 },
      headSha: EXPECTED_HEAD_SHA,
    });

    expect(replaced.digest).not.toBe(original.digest);
  });

  it("runs the exact self-transactional migration without --single-transaction, postflights, then records the ledger separately", async () => {
    const runner = await loadRunner();
    const evidence = evidenceEnv();
    const receipt = runner.buildPreflightReceipt({
      state: BASELINE_STATE,
      headSha: EXPECTED_HEAD_SHA,
    });
    const calls: Array<{ args: string[]; fileText?: string }> = [];
    let query = 0;
    const status = runner.runQuickLogRevisionIdempotentReplay({
      env: baseEnv({ ...evidence, PREFLIGHT_RECEIPT_DIGEST: receipt.digest }),
      spawnImpl: (_command: string, args: string[]) => {
        const fileIndex = args.indexOf("--file");
        calls.push({
          args: [...args],
          fileText: fileIndex >= 0 ? readFileSync(args[fileIndex + 1], "utf8") : undefined,
        });
        if (args.includes("-c")) {
          query += 1;
          return {
            status: 0,
            stdout:
              query === 1
                ? stdout(BASELINE_STATE)
                : query === 2
                  ? stdout(CANONICAL_LEDGER_ABSENT_STATE)
                  : stdout(RECORDED_CANONICAL_STATE),
            stderr: "",
          };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
      logger: { log() {}, error() {} },
    });

    expect(status).toBe(runner.EXIT.OK);
    expect(calls).toHaveLength(5);
    expect(calls[0].args).toContain("-c");
    expect(calls[1].args).toContain("--file");
    expect(calls[1].args).not.toContain("--single-transaction");
    expect(resolve(calls[1].args[calls[1].args.indexOf("--file") + 1])).toBe(MIGRATION_PATH);
    expect(calls[2].args).toContain("-c");
    expect(calls[3].args).toContain("--file");
    expect(calls[3].fileText).toContain("insert into supabase_migrations.schema_migrations");
    expect(calls[4].args).toContain("-c");
    expect(JSON.parse(readFileSync(evidence.AUDIT_PATH, "utf8"))).toMatchObject({
      outcome: "applied_verified",
      recovery_path: "migration_then_ledger",
      migration_version: "20260916111000",
      ...SOLO_FOUNDER_AUTHORIZATION_RECEIPT,
    });
  });

  it("recovers canonical schema with an absent ledger without replaying the migration", async () => {
    const runner = await loadRunner();
    const evidence = evidenceEnv();
    const receipt = runner.buildPreflightReceipt({
      state: CANONICAL_LEDGER_ABSENT_STATE,
      headSha: EXPECTED_HEAD_SHA,
    });
    const calls: string[][] = [];
    let query = 0;
    const status = runner.runQuickLogRevisionIdempotentReplay({
      env: baseEnv({ ...evidence, PREFLIGHT_RECEIPT_DIGEST: receipt.digest }),
      spawnImpl: (_command: string, args: string[]) => {
        calls.push([...args]);
        if (args.includes("-c")) {
          query += 1;
          return {
            status: 0,
            stdout:
              query < 3 ? stdout(CANONICAL_LEDGER_ABSENT_STATE) : stdout(RECORDED_CANONICAL_STATE),
            stderr: "",
          };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
      logger: { log() {}, error() {} },
    });

    expect(status).toBe(runner.EXIT.OK);
    expect(calls).toHaveLength(4);
    expect(calls.filter((args) => args.includes("--file"))).toHaveLength(1);
    const onlyFile = calls.find((args) => args.includes("--file"))!;
    expect(resolve(onlyFile[onlyFile.indexOf("--file") + 1])).not.toBe(MIGRATION_PATH);
    expect(JSON.parse(readFileSync(evidence.AUDIT_PATH, "utf8"))).toMatchObject({
      outcome: "applied_verified",
      recovery_path: "ledger_only",
    });
  });

  it("does not write when canonical schema and the exact ledger are already verified", async () => {
    const runner = await loadRunner();
    const evidence = evidenceEnv();
    const calls: string[][] = [];
    const status = runner.runQuickLogRevisionIdempotentReplay({
      env: baseEnv({ ...evidence, PREFLIGHT_RECEIPT_DIGEST: "f".repeat(64) }),
      spawnImpl: (_command: string, args: string[]) => {
        calls.push([...args]);
        return { status: 0, stdout: stdout(RECORDED_CANONICAL_STATE), stderr: "" };
      },
      logger: { log() {}, error() {} },
    });

    expect(status).toBe(runner.EXIT.OK);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("--file");
    expect(JSON.parse(readFileSync(evidence.AUDIT_PATH, "utf8"))).toMatchObject({
      outcome: "already_applied_verified",
    });
  });

  it("blocks drifted production with the named reason and no write", async () => {
    const runner = await loadRunner();
    const evidence = evidenceEnv();
    const calls: string[][] = [];
    const status = runner.runQuickLogRevisionIdempotentReplay({
      env: baseEnv({
        ...evidence,
        OPERATION: "PREFLIGHT",
        CONFIRM_APPLY: "",
        PREFLIGHT_RUN_ID: "",
      }),
      spawnImpl: (_command: string, args: string[]) => {
        calls.push([...args]);
        return {
          status: 0,
          stdout: stdout({ ...BASELINE_STATE, legacy_functions_contract: false }),
          stderr: "",
        };
      },
      logger: { log() {}, error() {} },
    });

    expect(status).toBe(runner.EXIT.PREREQUISITE_DRIFT);
    expect(calls).toHaveLength(1);
    expect(existsSync(evidence.PREFLIGHT_RECEIPT_PATH)).toBe(false);
    expect(JSON.parse(readFileSync(evidence.AUDIT_PATH, "utf8"))).toMatchObject({
      outcome: "prerequisite_drift",
      reason: "legacy_functions_contract",
    });
    expect(readFileSync(evidence.REPORT_PATH, "utf8")).toContain(
      "Reason: legacy_functions_contract",
    );
  });

  it("fails before any write for receipt mismatch, advanced head, bad input, target, or TLS", async () => {
    const runner = await loadRunner();
    const scenarios: Array<Record<string, string>> = [
      { PREFLIGHT_RECEIPT_DIGEST: "f".repeat(64) },
      { CURRENT_DEPLOY_HEAD_SHA: ADVANCED_HEAD_SHA },
      { CONFIRM_APPLY: "yes" },
      { CONFIRM_PROJECT_REF: "bzatgtgjvuojpoxcknaa" },
      { GITHUB_REF_NAME: "main" },
      { GITHUB_SHA: ADVANCED_HEAD_SHA },
      { TARGET_ENV: "sandbox" },
      { SUPABASE_DB_URL: "" },
      {
        SUPABASE_DB_URL:
          "postgresql://postgres:x@db.bzatgtgjvuojpoxcknaa.supabase.co:5432/postgres",
      },
      { SUPABASE_DB_CA_CERT_PATH: "/nonexistent/root.crt" },
    ];

    for (const scenario of scenarios) {
      const evidence = evidenceEnv();
      let calls = 0;
      const status = runner.runQuickLogRevisionIdempotentReplay({
        env: baseEnv({ ...evidence, ...scenario }),
        spawnImpl: () => {
          calls += 1;
          return { status: 0, stdout: stdout(BASELINE_STATE), stderr: "" };
        },
        logger: { log() {}, error() {} },
      });
      if (scenario.PREFLIGHT_RECEIPT_DIGEST) {
        expect(calls, JSON.stringify(scenario)).toBe(1);
        expect(status).toBe(runner.EXIT.RECEIPT_MISMATCH);
      } else {
        expect(calls, JSON.stringify(scenario)).toBe(0);
        expect(status, JSON.stringify(scenario)).not.toBe(runner.EXIT.OK);
      }
    }
  });

  it("rejects every missing or altered solo-founder authorization value before psql", async () => {
    const runner = await loadRunner();
    const protectedValues = {
      GITHUB_RUN_ATTEMPT: "1",
      SOLO_FOUNDER_ACKNOWLEDGEMENT,
      ...SOLO_FOUNDER_AUTHORIZATION_ENV,
    };
    const attackerValue = "attacker authorization comment https://attacker.invalid/secret";

    for (const key of Object.keys(protectedValues)) {
      for (const value of [undefined, attackerValue]) {
        const evidence = evidenceEnv();
        const lines: string[] = [];
        let calls = 0;
        const env = baseEnv({
          ...evidence,
          SUPABASE_DB_URL: `postgresql://attacker:${DATABASE_SECRET}@attacker.invalid/db`,
        });
        if (value === undefined) delete (env as Record<string, string | undefined>)[key];
        else (env as Record<string, string | undefined>)[key] = value;

        const status = runner.runQuickLogRevisionIdempotentReplay({
          env,
          spawnImpl: () => {
            calls += 1;
            return { status: 0, stdout: stdout(BASELINE_STATE), stderr: "" };
          },
          logger: {
            log: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
            error: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
          },
        });

        expect(status, key).toBe(runner.EXIT.INPUT_REJECTED);
        expect(calls, key).toBe(0);
        const surfaces = [
          ...lines,
          readFileSync(evidence.REPORT_PATH, "utf8"),
          readFileSync(evidence.AUDIT_PATH, "utf8"),
        ].join("\n");
        expect(surfaces, key).toContain("solo_founder_authorization_rejected");
        expect(surfaces, key).not.toContain(attackerValue);
        expect(surfaces, key).not.toContain(DATABASE_SECRET);
        expect(existsSync(evidence.PREFLIGHT_RECEIPT_PATH), key).toBe(false);
      }
    }
  });

  it("never records the ledger after migration or canonical-postflight failure", async () => {
    const runner = await loadRunner();
    const receipt = runner.buildPreflightReceipt({
      state: BASELINE_STATE,
      headSha: EXPECTED_HEAD_SHA,
    });

    for (const failure of ["migration", "postflight"] as const) {
      const evidence = evidenceEnv();
      const calls: string[][] = [];
      let query = 0;
      const status = runner.runQuickLogRevisionIdempotentReplay({
        env: baseEnv({ ...evidence, PREFLIGHT_RECEIPT_DIGEST: receipt.digest }),
        spawnImpl: (_command: string, args: string[]) => {
          calls.push([...args]);
          if (args.includes("-c")) {
            query += 1;
            return {
              status: 0,
              stdout:
                query === 1 || failure === "postflight"
                  ? stdout(BASELINE_STATE)
                  : stdout(CANONICAL_LEDGER_ABSENT_STATE),
              stderr: "",
            };
          }
          if (resolve(args[args.indexOf("--file") + 1]) === MIGRATION_PATH) {
            return failure === "migration"
              ? { status: 1, stdout: "", stderr: "secret owner@example.test" }
              : { status: 0, stdout: "", stderr: "" };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
        logger: { log() {}, error() {} },
      });

      expect(status, failure).not.toBe(runner.EXIT.OK);
      expect(
        calls.filter((args) => args.includes("--file")),
        failure,
      ).toHaveLength(1);
    }
  });

  it("keeps credentials, CA material, and database output out of evidence", async () => {
    const runner = await loadRunner();
    const evidence = evidenceEnv();
    const lines: string[] = [];
    const status = runner.runQuickLogRevisionIdempotentReplay({
      env: baseEnv({ ...evidence, OPERATION: "PREFLIGHT", CONFIRM_APPLY: "" }),
      spawnImpl: () => ({
        status: 1,
        stdout: "owner@example.test",
        stderr: `${DATABASE_SECRET} ${DATABASE_URL} ${CA_SECRET_SENTINEL}`,
      }),
      logger: {
        log: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
        error: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
      },
    });

    expect(status).toBe(runner.EXIT.PREFLIGHT_FAILED);
    const observable = [
      ...lines,
      readFileSync(evidence.REPORT_PATH, "utf8"),
      readFileSync(evidence.AUDIT_PATH, "utf8"),
    ].join("\n");
    for (const secret of [
      DATABASE_SECRET,
      DATABASE_URL,
      CA_SECRET_SENTINEL,
      "owner@example.test",
    ]) {
      expect(observable).not.toContain(secret);
    }
  });
});

describe("Quick Log revision idempotent replay workflow", () => {
  function parsed() {
    return loadYaml(readFileSync(WORKFLOW_PATH, "utf8")) as Record<string, any>;
  }

  it("is dispatch-only, founder-gated, serialized and environment-protected", () => {
    const workflow = parsed();
    const trigger = workflow.on ?? workflow.true;
    const apply = workflow.jobs.apply;
    const validateCommands = workflow.jobs.validate.steps
      .map((step: Record<string, string>) => step.run ?? "")
      .join("\n");

    expect(Object.keys(trigger)).toEqual(["workflow_dispatch"]);
    expect(trigger.workflow_dispatch.inputs.operation).toMatchObject({
      type: "choice",
      default: "PREFLIGHT",
      options: ["PREFLIGHT", "APPLY"],
    });
    expect(workflow.permissions).toEqual({ contents: "read", actions: "read" });
    expect(workflow.concurrency).toEqual({
      group: "verdant-production-migration-writer",
      "cancel-in-progress": false,
      queue: "max",
    });
    expect(apply.environment).toBe("verdant-production-solo-founder");
    for (const required of [
      "refs/heads/verdant-grow-diary",
      "knkwiiywfkbqznbxwqfh",
      "APPLY QUICKLOG REVISION IDEMPOTENT REPLAY",
      SOLO_FOUNDER_ACKNOWLEDGEMENT,
      "GITHUB_ACTOR_ID",
      "GITHUB_TRIGGERING_ACTOR",
      '[ "$GITHUB_RUN_ATTEMPT" != "1" ]',
      "72639960",
      "cheekhimself",
    ]) {
      expect(validateCommands).toContain(required);
    }
  });

  it("runs the authorization, provenance, writer and secret gates before database work", () => {
    const steps = parsed().jobs.apply.steps as Array<Record<string, any>>;
    const index = (fragment: string) =>
      steps.findIndex((step) => String(step.name ?? "").includes(fragment));
    const runner = steps.find(
      (step) => step.name === "Run the environment-gated Quick Log revision replay",
    );

    expect(index("solo-founder production authorization")).toBe(
      index("Prepare sanitized audit directory") + 1,
    );
    expect(index("solo-founder production authorization")).toBeLessThan(
      index("authenticated PREFLIGHT artifact"),
    );
    expect(index("authenticated PREFLIGHT artifact")).toBeLessThan(
      index("production migration writer to be idle"),
    );
    expect(index("production migration writer to be idle")).toBeLessThan(steps.indexOf(runner!));
    expect(index("Re-resolve current deploy branch head")).toBeLessThan(steps.indexOf(runner!));
    expect(runner?.run).toBe("node scripts/apply-quicklog-revision-idempotent-replay.mjs");
    expect(runner?.env).toEqual({
      SUPABASE_DB_URL: "${{ secrets.SUPABASE_DB_URL }}",
      SUPABASE_DB_CA_CERT_PATH: "${{ runner.temp }}/verdant-production-supabase-root.crt",
    });
    expect(
      steps.find((step) => String(step.name ?? "").includes("authenticated PREFLIGHT artifact"))
        ?.run,
    ).toContain("node scripts/verify-quicklog-revision-idempotent-replay-preflight-artifact.mjs");
  });

  it("uploads immutable evidence and fails closed when the success upload fails", () => {
    const steps = parsed().jobs.apply.steps as Array<Record<string, any>>;
    const success = steps.find(
      (step) => step.name === "Upload sanitized evidence after successful delivery",
    );
    const failure = steps.find(
      (step) => step.name === "Upload sanitized evidence after failed or cancelled delivery",
    );
    const receipt = steps.find((step) => step.name === "Upload immutable PREFLIGHT receipt");

    expect(success?.if).toBe("success()");
    expect(success).not.toHaveProperty("continue-on-error");
    expect(success?.with["if-no-files-found"]).toBe("error");
    expect(failure?.if).toBe("failure() || cancelled()");
    expect(failure?.["continue-on-error"]).toBe(true);
    expect(receipt?.with.name).toBe(
      "quicklog-revision-idempotent-replay-preflight-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}",
    );
    expect(receipt?.with.path).toBe(
      "audit/quicklog-revision-idempotent-replay/preflight-receipt.json",
    );
  });

  it("every guarded writer snapshots every production writer, including this lane", () => {
    for (const guarded of GUARDED_WRITERS) {
      const workflow = loadYaml(
        readFileSync(resolve(".github/workflows", guarded), "utf8"),
      ) as Record<string, any>;
      const guard = workflow.jobs.apply.steps.find(
        (step: Record<string, unknown>) =>
          step.name === "Require every production migration writer to be idle",
      );
      expect(guard, guarded).toBeDefined();
      expect(guard.if, guarded).toBe("inputs.operation == 'APPLY'");
      const listed = /writer_workflows=\(\n([\s\S]*?)\n\s*\)/.exec(guard.run)?.[1];
      expect(
        listed
          ?.split("\n")
          .map((line: string) => line.trim())
          .filter(Boolean),
        guarded,
      ).toEqual([...WRITERS]);
    }
  });

  it("serializes every production migration writer through one shared workflow group", () => {
    for (const writer of WRITERS) {
      const workflow = loadYaml(
        readFileSync(resolve(".github/workflows", writer), "utf8"),
      ) as Record<string, any>;
      expect(workflow.concurrency, writer).toEqual({
        group: "verdant-production-migration-writer",
        "cancel-in-progress": false,
        queue: "max",
      });
    }
  });

  it("keeps both PG15 triggers wired to the lane, its prerequisite and the shared gates", () => {
    const workflow = loadYaml(readFileSync(PG15_WORKFLOW_PATH, "utf8")) as Record<string, any>;
    const paths = workflow.on.pull_request.paths;

    expect(workflow.on.push.paths).toEqual(paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        "scripts/apply-quicklog-revision-idempotent-replay.mjs",
        "scripts/run-quicklog-revision-idempotent-replay-pg15-harness.mjs",
        "scripts/verify-quicklog-revision-idempotent-replay-preflight-artifact.mjs",
        "scripts/lib/solo-founder-production-authorization.mjs",
        "scripts/lib/productionSupabaseTls.mjs",
        "supabase/migrations/20260916111000_quicklog_revision_idempotent_replay.sql",
        "supabase/migrations/20260811090000_quicklog_corrections_retractions.sql",
        ".github/workflows/apply-quicklog-revision-idempotent-replay.yml",
        "src/test/apply-quicklog-revision-idempotent-replay.test.ts",
      ]),
    );
    expect(workflow.jobs.pg15_runtime.steps.at(-1).run).toBe(
      "node scripts/run-quicklog-revision-idempotent-replay-pg15-harness.mjs",
    );
  });

  it("documents the PREFLIGHT-first protocol, writer snapshot and deletion-free posture", () => {
    expect(existsSync(RUNBOOK_PATH)).toBe(true);
    const runbook = readFileSync(RUNBOOK_PATH, "utf8");

    for (const required of [
      "SAFE_TO_APPLY",
      "schema_live_ledger_absent",
      "already_applied_verified",
      "APPLY QUICKLOG REVISION IDEMPOTENT REPLAY",
      "20260916111000",
      "verdant-production-solo-founder",
      "verdant-production-migration-writer",
      "expected_preflight_run_attempt",
      "expected_preflight_artifact_sha256",
      "quicklog-revision-idempotent-replay-preflight-run-<RUN_ID>-attempt-1",
      "verify-full",
      SOLO_FOUNDER_ACKNOWLEDGEMENT,
      ...WRITERS,
    ]) {
      expect(runbook, required).toContain(required);
    }
    expect(runbook).toMatch(/no write freeze/i);
    expect(runbook).toMatch(/never delete/i);
  });
});
