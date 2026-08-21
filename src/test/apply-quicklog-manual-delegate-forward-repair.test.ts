import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rootCertificates } from "node:tls";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { PRODUCTION_SUPABASE_CA_FILENAME } from "../../scripts/lib/productionSupabaseTls.mjs";

const RUNNER_PATH = resolve("scripts/apply-quicklog-manual-delegate-forward-repair.mjs");
const WORKFLOW_PATH = resolve(
  ".github/workflows/apply-quicklog-manual-delegate-forward-repair.yml",
);
const PG15_WORKFLOW_PATH = resolve(
  ".github/workflows/quicklog-manual-delegate-forward-repair-pg15.yml",
);
const RUNBOOK_PATH = resolve("docs/quicklog-manual-delegate-forward-repair-operator-runbook.md");
const MIGRATION_PATH = resolve(
  "supabase/migrations/20260818010000_quicklog_manual_delegate_forward_repair.sql",
);

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const EXPECTED_HEAD_SHA = "a".repeat(40);
const ADVANCED_HEAD_SHA = "b".repeat(40);
const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
const EXPECTED_REPOSITORY_ID = "8675309";
const EXPECTED_RUN_ID = "24680";
const EXPECTED_RUN_ATTEMPT = "1";
const DATABASE_SECRET = "delegate-production-password-sentinel";
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

const DEFECTIVE_STATE = Object.freeze({
  ledger_exact_count: 0,
  ledger_conflict_count: 0,
  ledger_exact_names: [],
  ledger_statements_contract: false,
  migration_ledger_contract: true,
  required_roles_contract: true,
  wrapper_contract: true,
  wrapper_oid: 11001,
  wrapper_source_length: 7752,
  wrapper_source_md5: "0d3098b81787fa90898da921345c0dbc",
  wrapper_service_execute: true,
  delegate_contract: true,
  delegate_oid: 11002,
  delegate_overload_count: 1,
  delegate_source_length: 6548,
  delegate_source_md5: "e161b2e15c8de2e5ae1048edb4c72c3d",
  delegate_acl_contract: true,
  helper_functions_contract: true,
  logged_at_columns_contract: true,
  request_hash_contract: true,
  timestamp_triggers_contract: true,
});

const CANONICAL_LEDGER_ABSENT_STATE = Object.freeze({
  ...DEFECTIVE_STATE,
  delegate_source_length: 6734,
  delegate_source_md5: "7ec296e422f7f47c8b2793b051840798",
});

const RECORDED_CANONICAL_STATE = Object.freeze({
  ...CANONICAL_LEDGER_ABSENT_STATE,
  ledger_exact_count: 1,
  ledger_exact_names: ["quicklog_manual_delegate_forward_repair"],
  ledger_statements_contract: true,
});

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
    GITHUB_REPOSITORY_ID: EXPECTED_REPOSITORY_ID,
    GITHUB_RUN_ID: EXPECTED_RUN_ID,
    GITHUB_RUN_ATTEMPT: EXPECTED_RUN_ATTEMPT,
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF:
      "Verdant-OS/verdant-grow-diary/.github/workflows/apply-quicklog-manual-delegate-forward-repair.yml@refs/heads/verdant-grow-diary",
    CONFIRM_PROJECT_REF: PROJECT_REF,
    CONFIRM_APPLY: "APPLY QUICKLOG MANUAL DELEGATE FORWARD REPAIR",
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
      `Quick Log delegate delivery runner could not be imported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const temporaryRoots: string[] = [];

function evidenceEnv() {
  const root = mkdtempSync(join(tmpdir(), "verdant-quicklog-delegate-delivery-test-"));
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

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Quick Log manual delegate production delivery", () => {
  it("pins the exact LF migration bytes and preserves its own BEGIN/COMMIT boundary", async () => {
    const runner = await loadRunner();
    const raw = readFileSync(MIGRATION_PATH);
    const observed = createHash("sha256").update(raw).digest("hex").toUpperCase();
    const migration = runner.validatePinnedMigrationFile();

    expect(runner.PINNED_MIGRATION).toEqual({
      version: "20260818010000",
      name: "quicklog_manual_delegate_forward_repair",
      file: "20260818010000_quicklog_manual_delegate_forward_repair.sql",
      sha256: observed,
    });
    expect(raw.includes(13)).toBe(false);
    expect(raw.at(-1)).toBe(10);
    expect(migration.text).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*NOTIFY pgrst/m);
    expect(() =>
      runner.validatePinnedMigrationFile({
        readFile: () => Buffer.concat([raw, Buffer.from(" ")]),
      }),
    ).toThrow("hash_mismatch:20260818010000");
  });

  it("classifies only defective+absent, canonical+absent, and canonical+exact as recoverable", async () => {
    const runner = await loadRunner();

    expect(runner.classifyPreflight(DEFECTIVE_STATE)).toEqual({ status: "apply" });
    expect(runner.classifyPreflight(CANONICAL_LEDGER_ABSENT_STATE)).toEqual({
      status: "schema_live_ledger_absent",
    });
    expect(runner.classifyPreflight(RECORDED_CANONICAL_STATE)).toEqual({
      status: "verify_only",
    });
    expect(runner.classifyPreflight({ ...DEFECTIVE_STATE, ledger_conflict_count: 1 })).toEqual({
      status: "ledger_drift",
      reason: "target_collision",
    });
    expect(
      runner.classifyPreflight({ ...DEFECTIVE_STATE, wrapper_service_execute: false }),
    ).toEqual({ status: "prerequisite_drift", reason: "wrapper_contract" });
    expect(
      runner.classifyPreflight({
        ...DEFECTIVE_STATE,
        delegate_source_md5: "0".repeat(32),
      }),
    ).toEqual({ status: "schema_drift", reason: "delegate_fingerprint" });
    expect(
      runner.classifyPreflight({
        ...RECORDED_CANONICAL_STATE,
        ledger_statements_contract: false,
      }),
    ).toEqual({ status: "schema_drift", reason: "recorded_effect_mismatch" });
  });

  it("uses one exact typed read-only catalog row and pins every P1 catalog fence", async () => {
    const runner = await loadRunner();
    const sql = runner.PREFLIGHT_SQL as string;

    expect(runner.parsePreflightStdout(stdout(DEFECTIVE_STATE))).toEqual(DEFECTIVE_STATE);
    expect(() => runner.parsePreflightStdout("{}\n")).toThrow("preflight_result_shape");
    expect(() =>
      runner.parsePreflightStdout(`${stdout(DEFECTIVE_STATE)}${stdout(DEFECTIVE_STATE)}`),
    ).toThrow("preflight_row_count:2");
    expect(sql).toMatch(/set transaction read only/i);
    expect(sql).toContain("set local search_path = pg_catalog, public, pg_temp;");
    expect(sql).not.toMatch(
      /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|notify)\b/im,
    );
    expect(sql).toContain("not p.proisstrict");
    expect(sql).toContain("owner_role.rolname = 'postgres'");
    expect(sql).toContain("wrapper_service_execute");
    expect(sql).toContain("'service_role|EXECUTE|f|postgres'");
    expect(sql).toContain("delegate_acl_contract");
    expect(sql).toContain("'postgres|EXECUTE|f|postgres'");
    expect(sql).toContain("quicklog_try_parse_logged_at(text)");
    expect(sql).toContain("quicklog_try_parse_uuid(text)");
    expect(sql).toContain("quicklog_stamp_diary_logged_at()");
    expect(sql).toContain("quicklog_stamp_grow_event_logged_at()");
    expect(sql).toContain("md5(replace(p.prosrc, E'\\r', ''))");
    expect(sql).toContain("tg.tgqual is null");
    expect(sql).toContain("tg.tgnargs = 0");
    expect(sql).toContain("octet_length(tg.tgargs) = 0");
    expect(sql).toContain("tg.tgparentid = 0");
    expect(sql).toContain("tg.tgenabled in ('O', 'A')");
    expect(sql).toContain("a.atttypmod = -1");
    expect(sql).toContain("not a.attnotnull");
    expect(sql).toContain("a.attgenerated = ''");
    expect(sql).toContain("a.attidentity = ''");
    expect(sql).toContain("from pg_attrdef d");
    expect(sql).toContain("proname='quicklog_save_manual'");
    expect(sql).toContain("count(*)=4 and bool_and(overload_count=1)");
    expect(sql).toContain("supabase_migrations.schema_migrations");
  });

  it("pins wrapper and delegate parallelism plus the exact helper ABI and fingerprint rules", async () => {
    const runner = await loadRunner();
    const sql = runner.CATALOG_STATE_QUERY_SQL as string;

    expect(sql.match(/p\.proparallel = 'u'/g) ?? []).toHaveLength(3);
    expect(sql).toContain("p.pronargs = e.argument_count");
    expect(sql).toContain("p.pronargdefaults = 0");
    expect(sql).toContain("p.proargmodes is null");
    expect(sql).toContain("p.proallargtypes is null");
    expect(sql).toContain("p.proargnames is not distinct from e.argument_names");
    expect(sql).toMatch(
      /case e\.function_name\s+when 'quicklog_try_parse_uuid' then p\.prosrc\s+else replace\(p\.prosrc, E'\\r', ''\)\s+end/g,
    );
    expect(sql.match(/when 'quicklog_try_parse_uuid' then p\.prosrc/g) ?? []).toHaveLength(2);
    expect(runner.EXPECTED_FUNCTION_FINGERPRINTS.tryParseUuid).toEqual({
      bytes: 289,
      md5: "a34d120aad5c37a33ac05fd9597624f4",
    });
    expect(runner.EXPECTED_FUNCTION_FINGERPRINTS.tryParseUuidFreshReplay).toEqual({
      bytes: 290,
      md5: "4b132ee2034f8e2887da1af582295ad8",
    });
    expect(sql).toContain("a34d120aad5c37a33ac05fd9597624f4");
    expect(sql).toContain("4b132ee2034f8e2887da1af582295ad8");
    expect(sql).toMatch(/when rolname='service_role' then[\s\S]*?and rolbypassrls/);
    expect(sql).toMatch(/else[\s\S]*?and not rolbypassrls end/);
    expect(sql).toContain("a.attgenerated,a.attidentity,d.oid is null");
    expect(sql).toContain("left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum");
    expect(sql).toContain("1|version|text|t|||t");
    expect(sql).toContain("2|name|text|f|||t");
    expect(sql).toContain("3|statements|text[]|f|||t");
  });

  it("builds an insert-only collision-guarded ledger transaction with no app-table lock", async () => {
    const runner = await loadRunner();
    const sql = runner.buildLedgerInsertSql();

    expect(sql).toMatch(/^\\set ON_ERROR_STOP on\nbegin;/i);
    expect(sql).toMatch(/\ncommit;\s*$/i);
    expect(sql).toContain("pg_advisory_xact_lock(20260818, 10000)");
    expect(sql).toContain("lock table supabase_migrations.schema_migrations");
    expect(sql).toContain("quicklog manual delegate ledger collision");
    expect(sql).toContain("insert into supabase_migrations.schema_migrations");
    expect(sql).toContain(runner.PINNED_MIGRATION.sha256);
    expect(sql).not.toMatch(/lock table public\./i);
    expect(sql).not.toMatch(/\b(create|alter|drop|grant|revoke|update|delete|truncate)\b/i);
    expect(sql.match(/^\s*insert\s+into/gim)).toHaveLength(1);
    expect(sql).not.toContain(readFileSync(MIGRATION_PATH, "utf8"));
  });

  it.each([
    [DEFECTIVE_STATE, "safe_to_apply"],
    [CANONICAL_LEDGER_ABSENT_STATE, "schema_live_ledger_absent"],
  ])("emits an immutable recoverable PREFLIGHT receipt for %s", async (state, outcome) => {
    const runner = await loadRunner();
    const evidence = evidenceEnv();
    const status = runner.runQuickLogManualDelegateForwardRepair({
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
      now: () => new Date("2026-08-17T12:00:00.000Z"),
    });

    expect(status).toBe(runner.EXIT.OK);
    expect(JSON.parse(readFileSync(evidence.PREFLIGHT_RECEIPT_PATH, "utf8"))).toMatchObject({
      schema_version: 1,
      tool: "apply-quicklog-manual-delegate-forward-repair",
      operation: "PREFLIGHT",
      outcome,
      safe_to_apply: true,
      workflow_path: ".github/workflows/apply-quicklog-manual-delegate-forward-repair.yml",
      head_sha: EXPECTED_HEAD_SHA,
      project_ref: PROJECT_REF,
      migration_version: "20260818010000",
      migration_sha256: runner.PINNED_MIGRATION.sha256,
      state_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      ...SOLO_FOUNDER_AUTHORIZATION_RECEIPT,
    });
    expect(JSON.parse(readFileSync(evidence.AUDIT_PATH, "utf8"))).toMatchObject({
      outcome,
      ...SOLO_FOUNDER_AUTHORIZATION_RECEIPT,
    });
  });

  it("runs the exact self-transactional migration without --single-transaction, postflights, then records the ledger separately", async () => {
    const runner = await loadRunner();
    const evidence = evidenceEnv();
    const receipt = runner.buildPreflightReceipt({
      state: DEFECTIVE_STATE,
      headSha: EXPECTED_HEAD_SHA,
    });
    const calls: Array<{ args: string[]; fileText?: string }> = [];
    let query = 0;
    const status = runner.runQuickLogManualDelegateForwardRepair({
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
                ? stdout(DEFECTIVE_STATE)
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
    expect(calls[3].args).not.toContain("--single-transaction");
    expect(calls[3].fileText).toContain("insert into supabase_migrations.schema_migrations");
    expect(calls[4].args).toContain("-c");
    expect(JSON.parse(readFileSync(evidence.AUDIT_PATH, "utf8"))).toMatchObject({
      outcome: "applied_verified",
      recovery_path: "migration_then_ledger",
      migration_version: "20260818010000",
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
    const status = runner.runQuickLogManualDelegateForwardRepair({
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
    expect(calls.filter((args) => args.includes("-c"))).toHaveLength(3);
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
    const status = runner.runQuickLogManualDelegateForwardRepair({
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
    ];

    for (const scenario of scenarios) {
      const evidence = evidenceEnv();
      let calls = 0;
      const status = runner.runQuickLogManualDelegateForwardRepair({
        env: baseEnv({ ...evidence, ...scenario }),
        spawnImpl: () => {
          calls += 1;
          return { status: 0, stdout: stdout(DEFECTIVE_STATE), stderr: "" };
        },
        logger: { log() {}, error() {} },
      });
      if (scenario.PREFLIGHT_RECEIPT_DIGEST) {
        expect(calls).toBe(1);
        expect(status).toBe(runner.EXIT.RECEIPT_MISMATCH);
      } else {
        expect(calls).toBe(0);
        expect(status).not.toBe(runner.EXIT.OK);
      }
    }
  });

  it("rejects every missing or altered solo-founder authorization value before psql", async () => {
    const runner = await loadRunner();
    const protectedValues = {
      GITHUB_RUN_ATTEMPT: EXPECTED_RUN_ATTEMPT,
      SOLO_FOUNDER_ACKNOWLEDGEMENT,
      ...SOLO_FOUNDER_AUTHORIZATION_ENV,
    };
    const attackerValue = "attacker authorization comment https://attacker.invalid/secret";
    const cases = Object.keys(protectedValues).flatMap((key) => [
      { key, value: undefined },
      { key, value: attackerValue },
    ]);

    for (const { key, value } of cases) {
      const evidence = evidenceEnv();
      const lines: string[] = [];
      let calls = 0;
      const env = baseEnv({
        ...evidence,
        SUPABASE_DB_URL: `postgresql://attacker:${DATABASE_SECRET}@attacker.invalid/db`,
      });
      if (value === undefined) delete (env as Record<string, string | undefined>)[key];
      else (env as Record<string, string | undefined>)[key] = value;

      const status = runner.runQuickLogManualDelegateForwardRepair({
        env,
        spawnImpl: () => {
          calls += 1;
          return { status: 0, stdout: stdout(DEFECTIVE_STATE), stderr: "" };
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
      expect(surfaces, key).not.toContain("attacker.invalid");
      expect(existsSync(evidence.PREFLIGHT_RECEIPT_PATH), key).toBe(false);
    }
  });

  it('rejects GITHUB_RUN_ATTEMPT="2" with fixed authorization evidence before psql', async () => {
    const runner = await loadRunner();
    const evidence = evidenceEnv();
    const lines: string[] = [];
    let calls = 0;

    const status = runner.runQuickLogManualDelegateForwardRepair({
      env: baseEnv({ ...evidence, GITHUB_RUN_ATTEMPT: "2" }),
      spawnImpl: () => {
        calls += 1;
        return { status: 0, stdout: stdout(DEFECTIVE_STATE), stderr: "" };
      },
      logger: {
        log: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
        error: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
      },
    });

    expect(status).toBe(runner.EXIT.INPUT_REJECTED);
    expect(calls).toBe(0);
    expect(lines).toEqual(["solo_founder_authorization_rejected"]);
    expect(readFileSync(evidence.REPORT_PATH, "utf8")).toContain(
      "Reason code: solo_founder_authorization_rejected",
    );
    expect(JSON.parse(readFileSync(evidence.AUDIT_PATH, "utf8"))).toMatchObject({
      schema_version: 1,
      tool: "apply-quicklog-manual-delegate-forward-repair",
      outcome: "authorization_rejected",
      reason_code: "solo_founder_authorization_rejected",
    });
    expect(existsSync(evidence.PREFLIGHT_RECEIPT_PATH)).toBe(false);
  });

  it("never records the ledger after migration or canonical-postflight failure", async () => {
    const runner = await loadRunner();
    const receipt = runner.buildPreflightReceipt({
      state: DEFECTIVE_STATE,
      headSha: EXPECTED_HEAD_SHA,
    });

    for (const failure of ["migration", "postflight"] as const) {
      const evidence = evidenceEnv();
      const calls: string[][] = [];
      let query = 0;
      const status = runner.runQuickLogManualDelegateForwardRepair({
        env: baseEnv({ ...evidence, PREFLIGHT_RECEIPT_DIGEST: receipt.digest }),
        spawnImpl: (_command: string, args: string[]) => {
          calls.push([...args]);
          if (args.includes("-c")) {
            query += 1;
            return {
              status: 0,
              stdout:
                query === 1
                  ? stdout(DEFECTIVE_STATE)
                  : failure === "postflight"
                    ? stdout(DEFECTIVE_STATE)
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

      expect(status).not.toBe(runner.EXIT.OK);
      expect(calls.filter((args) => args.includes("--file"))).toHaveLength(1);
    }
  });

  it("keeps credentials, CA material, and database output out of evidence", async () => {
    const runner = await loadRunner();
    const evidence = evidenceEnv();
    const lines: string[] = [];
    const status = runner.runQuickLogManualDelegateForwardRepair({
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

  it("uses the exact solo-founder workflow gate before provenance, writer, secret, or database work", () => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
    const source = readFileSync(WORKFLOW_PATH, "utf8");
    const parsed = loadYaml(source) as Record<string, any>;
    const trigger = parsed.on ?? parsed.true;
    const apply = parsed.jobs.apply;
    const inputs = trigger.workflow_dispatch.inputs;

    expect(Object.keys(trigger)).toEqual(["workflow_dispatch"]);
    expect(inputs.solo_founder_acknowledgement).toMatchObject({
      required: true,
      type: "string",
    });
    expect(inputs.solo_founder_acknowledgement).not.toHaveProperty("default");
    expect(parsed.permissions).toEqual({ contents: "read", actions: "read" });
    expect(parsed.concurrency).toEqual({
      group: "verdant-production-migration-writer",
      "cancel-in-progress": false,
      queue: "max",
    });
    expect(apply.environment).toBe("verdant-production-solo-founder");
    expect(parsed.jobs.validate.env.SOLO_FOUNDER_ACKNOWLEDGEMENT).toBe(
      "${{ inputs.solo_founder_acknowledgement }}",
    );
    const validateCommands = parsed.jobs.validate.steps
      .map((step: Record<string, string>) => step.run ?? "")
      .join("\n");
    for (const required of [
      SOLO_FOUNDER_ACKNOWLEDGEMENT,
      "GITHUB_ACTOR_ID",
      "GITHUB_ACTOR",
      "GITHUB_TRIGGERING_ACTOR",
      "GITHUB_RUN_ATTEMPT",
      "72639960",
      "cheekhimself",
    ]) {
      expect(validateCommands).toContain(required);
    }
    expect(apply.env.SOLO_FOUNDER_ACKNOWLEDGEMENT).toBe(
      "${{ inputs.solo_founder_acknowledgement }}",
    );
    const auditDirectoryIndex = apply.steps.findIndex((step: Record<string, string>) =>
      String(step.name ?? "").includes("Prepare sanitized audit directory"),
    );
    const authorizationIndex = apply.steps.findIndex((step: Record<string, string>) =>
      String(step.name ?? "").includes("solo-founder production authorization"),
    );
    const artifactIndex = apply.steps.findIndex((step: Record<string, string>) =>
      String(step.name ?? "").includes("authenticated PREFLIGHT artifact"),
    );
    const writerIndex = apply.steps.findIndex((step: Record<string, string>) =>
      String(step.name ?? "").includes("production migration writer to be idle"),
    );
    const secretIndex = apply.steps.findIndex(
      (step: Record<string, string>) => step.uses === "./.github/actions/require-ci-secret",
    );
    const installIndex = apply.steps.findIndex((step: Record<string, string>) =>
      String(step.name ?? "").includes("Install PostgreSQL client"),
    );
    const authorizationStep = apply.steps[authorizationIndex];
    expect(authorizationIndex).toBe(auditDirectoryIndex + 1);
    expect(authorizationIndex).toBeLessThan(artifactIndex);
    expect(authorizationIndex).toBeLessThan(writerIndex);
    expect(authorizationIndex).toBeLessThan(secretIndex);
    expect(authorizationIndex).toBeLessThan(installIndex);
    expect(authorizationStep.run.match(/\bgh api\b/g) ?? []).toHaveLength(4);
    expect(authorizationStep.run.match(/--jq/g) ?? []).toHaveLength(4);
    expect(authorizationStep.run).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"',
    );
    expect(authorizationStep.run).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/approvals"',
    );
    expect(authorizationStep.run).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/environments/verdant-production-solo-founder"',
    );
    expect(authorizationStep.run).toContain("deployment-branch-policies?per_page=100");
    expect(authorizationStep.run).toContain(
      "node scripts/verify-solo-founder-production-authorization.mjs",
    );
    expect(authorizationStep.run).toContain('"outcome":"authorization_rejected"');
    expect(authorizationStep.run).toContain('"reason_code":"solo_founder_authorization_rejected"');
    expect(source).toContain("refs/heads/verdant-grow-diary");
    expect(source).toContain("APPLY QUICKLOG MANUAL DELEGATE FORWARD REPAIR");
    expect(source).toContain(
      "verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs",
    );
    expect(source).toContain("Re-resolve current deploy branch head before database access");
    expect(source).toContain("SUPABASE_DB_CA_CERT_B64");
    expect(source).toContain("retention-days: 30");
  });

  it("fails a successful delivery closed when its immutable evidence upload fails", () => {
    const parsed = loadYaml(readFileSync(WORKFLOW_PATH, "utf8")) as Record<string, any>;
    const apply = parsed.jobs.apply;
    const successUpload = apply.steps.find(
      (step: Record<string, string>) =>
        step.name === "Upload sanitized evidence after successful delivery",
    );

    expect(successUpload).toBeDefined();
    expect(successUpload.if).toBe("success()");
    expect(successUpload).not.toHaveProperty("continue-on-error");
    expect(successUpload.uses).toBe(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );
    expect(successUpload.with.name).toBe(
      "quicklog-manual-delegate-forward-repair-evidence-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    expect(successUpload.with.path).toContain(
      "audit/quicklog-manual-delegate-forward-repair/report.md",
    );
    expect(successUpload.with.path).toContain(
      "audit/quicklog-manual-delegate-forward-repair/audit.json",
    );
    expect(successUpload.with["if-no-files-found"]).toBe("error");
    expect(successUpload.with["retention-days"]).toBe(30);
  });

  it("keeps failed or cancelled evidence publication best-effort without masking the failure", () => {
    const parsed = loadYaml(readFileSync(WORKFLOW_PATH, "utf8")) as Record<string, any>;
    const apply = parsed.jobs.apply;
    const summary = apply.steps.find(
      (step: Record<string, string>) => step.name === "Publish sanitized summary",
    );
    const failureUpload = apply.steps.find(
      (step: Record<string, string>) =>
        step.name === "Upload sanitized evidence after failed or cancelled delivery",
    );
    const cleanupIndex = apply.steps.findIndex(
      (step: Record<string, string>) => step.name === "Remove Supabase production CA",
    );
    const failureUploadIndex = apply.steps.indexOf(failureUpload);

    expect(summary.if).toContain("always()");
    expect(summary["continue-on-error"]).toBe(true);
    expect(failureUpload).toBeDefined();
    expect(failureUpload.if).toBe("failure() || cancelled()");
    expect(failureUpload["continue-on-error"]).toBe(true);
    expect(failureUpload.uses).toBe(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );
    expect(failureUpload.with.name).toBe(
      "quicklog-manual-delegate-forward-repair-evidence-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    expect(failureUpload.with["if-no-files-found"]).toBe("error");
    expect(failureUpload.with["retention-days"]).toBe(30);
    expect(failureUploadIndex).toBeLessThan(cleanupIndex);
    expect(apply.steps[cleanupIndex].if).toBe("always()");
  });

  it("requires exact founder self-review policy and an idle snapshot of every production writer", () => {
    const source = readFileSync(WORKFLOW_PATH, "utf8");
    const parsed = loadYaml(source) as Record<string, any>;
    const guard = parsed.jobs.apply.steps.find(
      (step: Record<string, unknown>) =>
        step.name === "Require every production migration writer to be idle",
    );
    const runbook = readFileSync(RUNBOOK_PATH, "utf8");
    const writers = [
      "apply-candidate-number-maintenance-migrations.yml",
      "apply-pinned-breeding-reconciliation.yml",
      "apply-pinned-production-migrations.yml",
      "apply-quicklog-corrections-retractions.yml",
      "apply-signup-acquisition-forward-repair.yml",
      "apply-quicklog-manual-delegate-forward-repair.yml",
      "apply-action-queue-transition-forward-repair.yml",
    ];

    expect(guard).toBeDefined();
    expect(guard.if).toBe("inputs.operation == 'APPLY'");
    expect(guard.env).toEqual({ GH_TOKEN: "${{ github.token }}" });
    expect(guard.run).toContain("gh api");
    for (const writer of writers) {
      expect(guard.run).toContain(writer);
      expect(runbook).toContain(writer);
    }
    for (const status of ["queued", "in_progress", "waiting", "pending", "requested"]) {
      expect(guard.run).toContain(status);
      expect(runbook).toContain(status);
    }
    expect(runbook).toContain("verdant-production-solo-founder");
    expect(runbook).toContain("cheekhimself");
    expect(runbook).toContain("72639960");
    expect(runbook).toContain("Prevent self-review OFF");
    expect(runbook).toContain("administrator bypass OFF");
    expect(runbook).toMatch(/exactly one required reviewer/i);
    expect(runbook).toMatch(/founder self-review/i);
    expect(runbook).toContain(SOLO_FOUNDER_ACKNOWLEDGEMENT);
    expect(runbook).toContain("15 minutes");
    expect(runbook).toContain("24 hours");
    expect(runbook).toMatch(/fresh dispatch/i);
    expect(runbook).toContain(
      "This proves founder identity, intent, provenance, and elapsed time; it is not independent human review.",
    );
    expect(runbook).not.toContain("Prevent self-review enabled");
    expect(runbook).not.toMatch(/distinct GitHub identities/i);
    expect(runbook).toMatch(/no other migration dispatch/i);
    expect(runbook).toMatch(/until APPLY is terminal/i);
    expect(runbook).toContain("gh api");
    expect(runbook).toMatch(/repeat the active-writer check/i);
  });

  it("serializes every production migration writer through one shared workflow group", () => {
    const writers = [
      "apply-candidate-number-maintenance-migrations.yml",
      "apply-pinned-breeding-reconciliation.yml",
      "apply-pinned-production-migrations.yml",
      "apply-quicklog-corrections-retractions.yml",
      "apply-signup-acquisition-forward-repair.yml",
      "apply-quicklog-manual-delegate-forward-repair.yml",
      "apply-action-queue-transition-forward-repair.yml",
    ];

    for (const writer of writers) {
      const workflow = loadYaml(
        readFileSync(resolve(".github/workflows", writer), "utf8"),
      ) as Record<string, any>;
      expect(workflow.concurrency, writer).toEqual({
        group: "verdant-production-migration-writer",
        "cancel-in-progress": false,
        queue: "max",
      });
    }

    const runbook = readFileSync(RUNBOOK_PATH, "utf8");
    expect(runbook).toContain("verdant-production-migration-writer");
    expect(runbook).toMatch(/cancel-in-progress[^\n]*false/i);
    expect(runbook).toMatch(/queue[^\n]*max/i);
    expect(runbook).toMatch(/defen[cs]e in depth/i);
  });

  it("requires APPLY to pin the reviewed PREFLIGHT attempt and artifact digest", () => {
    const source = readFileSync(WORKFLOW_PATH, "utf8");
    const parsed = loadYaml(source) as Record<string, any>;
    const trigger = parsed.on ?? parsed.true;
    const inputs = trigger.workflow_dispatch.inputs;
    const validate = parsed.jobs.validate;
    const apply = parsed.jobs.apply;
    const runbook = readFileSync(RUNBOOK_PATH, "utf8");

    expect(inputs.expected_preflight_run_attempt).toMatchObject({
      required: false,
      type: "string",
      default: "",
    });
    expect(inputs.expected_preflight_artifact_sha256).toMatchObject({
      required: false,
      type: "string",
      default: "",
    });
    expect(validate.env.EXPECTED_PREFLIGHT_RUN_ATTEMPT).toBe(
      "${{ inputs.expected_preflight_run_attempt }}",
    );
    expect(validate.env.EXPECTED_PREFLIGHT_ARTIFACT_SHA256).toBe(
      "${{ inputs.expected_preflight_artifact_sha256 }}",
    );
    expect(validate.steps[1].run).toContain(
      '[[ "$EXPECTED_PREFLIGHT_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]]',
    );
    expect(validate.steps[1].run).toContain(
      '[[ "$EXPECTED_PREFLIGHT_ARTIFACT_SHA256" =~ ^[0-9a-f]{64}$ ]]',
    );
    expect(apply.env.EXPECTED_PREFLIGHT_RUN_ATTEMPT).toBe(
      "${{ inputs.expected_preflight_run_attempt }}",
    );
    expect(apply.env.EXPECTED_PREFLIGHT_ARTIFACT_SHA256).toBe(
      "${{ inputs.expected_preflight_artifact_sha256 }}",
    );
    expect(runbook).toContain("expected_preflight_run_attempt");
    expect(runbook).toContain("expected_preflight_artifact_sha256");
    expect(runbook).toContain(
      "quicklog-manual-delegate-forward-repair-preflight-run-<RUN_ID>-attempt-1",
    );
    expect(runbook).toMatch(
      /never use[\s\S]{0,100}quicklog-manual-delegate-forward-repair-evidence/i,
    );
    expect(runbook).toMatch(/record.*run attempt/i);
    expect(runbook).toMatch(/record[\s\S]{0,100}artifact SHA-256/i);
  });

  it("keeps both PG15 triggers wired to the shared solo-founder gate and its tests", () => {
    const workflow = loadYaml(readFileSync(PG15_WORKFLOW_PATH, "utf8")) as Record<string, any>;
    const paths = workflow.on.pull_request.paths;

    expect(workflow.on.push.paths).toEqual(paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        "scripts/lib/solo-founder-production-authorization.mjs",
        "scripts/verify-solo-founder-production-authorization.mjs",
        "src/test/solo-founder-production-authorization.test.ts",
        "scripts/apply-quicklog-manual-delegate-forward-repair.mjs",
        "scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs",
      ]),
    );
  });

  it("documents the no-freeze recovery protocol and exact deletion-free rollback posture", () => {
    expect(existsSync(RUNBOOK_PATH)).toBe(true);
    const runbook = readFileSync(RUNBOOK_PATH, "utf8");

    expect(runbook).toContain("SAFE_TO_APPLY");
    expect(runbook).toContain("schema_live_ledger_absent");
    expect(runbook).toContain("already_applied_verified");
    expect(runbook).toContain("APPLY QUICKLOG MANUAL DELEGATE FORWARD REPAIR");
    expect(runbook).toContain("20260818010000");
    expect(runbook).toContain("verdant-production");
    expect(runbook).toMatch(/do not freeze|no write freeze/i);
    expect(runbook).toMatch(/do not delete|never delete/i);
    expect(runbook).toContain("verify-full");
  });
});
