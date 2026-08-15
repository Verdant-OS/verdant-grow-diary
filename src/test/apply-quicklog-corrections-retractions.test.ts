import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rootCertificates } from "node:tls";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { PRODUCTION_SUPABASE_CA_FILENAME } from "../../scripts/lib/productionSupabaseTls.mjs";

const RUNNER_PATH = resolve("scripts/apply-quicklog-corrections-retractions.mjs");
const WORKFLOW_PATH = resolve(".github/workflows/apply-quicklog-corrections-retractions.yml");
const MIGRATION_PATH = resolve(
  "supabase/migrations/20260811090000_quicklog_corrections_retractions.sql",
);

const EXPECTED_SHA256 = "9531CDCCB095F871FBF75145B828A73224210E31CC638A24B4019B20A8763105";
const EXPECTED_HEAD_SHA = "a".repeat(40);
const ADVANCED_HEAD_SHA = "c".repeat(40);
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const APPLY_CONFIRMATION = "APPLY QUICKLOG CORRECTIONS RETRACTIONS";
const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
const EXPECTED_WORKFLOW_PATH = ".github/workflows/apply-quicklog-corrections-retractions.yml";
const DATABASE_SECRET = "quicklog-delivery-database-secret";
const DATABASE_URL = `postgres://postgres:${DATABASE_SECRET}@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`;
const RAW_CA_SECRET_SENTINEL = "raw-ca-secret-must-not-reach-psql";

const PREREQUISITE_KEYS = [
  "migration_ledger_contract",
  "current_user_contract",
  "roles_contract",
  "authenticated_role_contract",
  "app_role_contract",
  "auth_uid_contract",
  "has_role_contract",
  "user_roles_contract",
  "quicklog_try_parse_uuid_contract",
  "gen_random_uuid_contract",
  "grow_events_contract",
  "diary_entries_contract",
  "grows_contract",
  "tents_contract",
  "plants_contract",
  "referenced_keys_contract",
  "apply_privileges_contract",
] as const;

const EFFECT_KEYS = [
  "target_table_contract",
  "retracted_at_contract",
  "target_constraints_contract",
  "target_indexes_contract",
  "diary_retracted_index_contract",
  "target_policies_contract",
  "target_triggers_rules_contract",
  "target_functions_contract",
  "target_function_overloads_contract",
  "target_function_security_contract",
  "target_acl_contract",
  "client_access_contract",
] as const;

const LIVE_PREREQUISITES = Object.freeze(
  Object.fromEntries(PREREQUISITE_KEYS.map((key) => [key, true])),
);

const ABSENT_STATE = Object.freeze({
  ledger_exact_count: 0,
  ledger_conflict_count: 0,
  ledger_exact_names: [],
  ledger_statements_contract: false,
  ...LIVE_PREREQUISITES,
  target_object_count: 0,
  target_table_exists: false,
  retracted_at_exists: false,
  ...Object.fromEntries(EFFECT_KEYS.map((key) => [key, false])),
});

const LIVE_STATE = Object.freeze({
  ...ABSENT_STATE,
  ledger_exact_count: 1,
  ledger_exact_names: ["quicklog_corrections_retractions"],
  ledger_statements_contract: true,
  target_object_count: 13,
  target_table_exists: true,
  retracted_at_exists: true,
  ...Object.fromEntries(EFFECT_KEYS.map((key) => [key, true])),
});

function preflightStdout(state: Record<string, unknown> = ABSENT_STATE) {
  return `${JSON.stringify(state)}\n`;
}

function baseEnv(extra: Record<string, string> = {}) {
  return {
    OPERATION: "APPLY",
    TARGET_ENV: "production",
    EXPECTED_HEAD_SHA,
    GITHUB_SHA: EXPECTED_HEAD_SHA,
    CURRENT_DEPLOY_HEAD_SHA: EXPECTED_HEAD_SHA,
    PREFLIGHT_RECEIPT_DIGEST: "b".repeat(64),
    CONFIRM_PROJECT_REF: PRODUCTION_PROJECT_REF,
    CONFIRM_APPLY: APPLY_CONFIRMATION,
    SUPABASE_DB_URL: DATABASE_URL,
    GITHUB_REPOSITORY: EXPECTED_REPOSITORY,
    GITHUB_REPOSITORY_ID: "123456789",
    GITHUB_WORKFLOW_REF: `${EXPECTED_REPOSITORY}/${EXPECTED_WORKFLOW_PATH}@refs/heads/verdant-grow-diary`,
    GITHUB_RUN_ID: "99887766",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF_NAME: "verdant-grow-diary",
    PATH: process.env.PATH ?? "",
    ...extra,
  };
}

async function loadRunner() {
  try {
    return await import(`${pathToFileURL(RUNNER_PATH).href}?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    expect.fail(
      `Quick Log delivery runner could not be imported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const temporaryRoots: string[] = [];

function temporaryEvidenceEnv() {
  const root = mkdtempSync(join(tmpdir(), "verdant-quicklog-delivery-test-"));
  temporaryRoots.push(root);
  const caPath = join(root, PRODUCTION_SUPABASE_CA_FILENAME);
  const testCa = rootCertificates[0];
  if (!testCa) throw new Error("Node did not provide a test root certificate.");
  writeFileSync(caPath, testCa, { mode: 0o600 });
  return {
    REPORT_PATH: join(root, "report.md"),
    AUDIT_PATH: join(root, "audit.json"),
    PREFLIGHT_RECEIPT_PATH: join(root, "preflight-receipt.json"),
    RUNNER_TEMP: root,
    SUPABASE_DB_CA_CERT_PATH: caPath,
    SUPABASE_DB_CA_CERT_B64: RAW_CA_SECRET_SENTINEL,
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Quick Log corrections/retractions migration delivery", () => {
  it("pins the immutable LF migration and rejects a one-byte mutation", async () => {
    const runner = await loadRunner();
    const migration = runner.validatePinnedMigrationFile();
    const raw = readFileSync(MIGRATION_PATH);

    expect(runner.PINNED_MIGRATION).toEqual({
      version: "20260811090000",
      name: "quicklog_corrections_retractions",
      file: "20260811090000_quicklog_corrections_retractions.sql",
      sha256: EXPECTED_SHA256,
    });
    expect(createHash("sha256").update(raw).digest("hex").toUpperCase()).toBe(EXPECTED_SHA256);
    expect(raw.includes(13)).toBe(false);
    expect(raw.at(-1)).toBe(10);
    expect(migration.text).toContain("CREATE TABLE public.quicklog_entry_revisions");
    expect(() =>
      runner.validatePinnedMigrationFile({
        readFile: () => Buffer.concat([raw, Buffer.from(" ")]),
      }),
    ).toThrow("hash_mismatch:20260811090000");
  });

  it("builds one atomic migration-plus-ledger file with schema reload and no device control", async () => {
    const runner = await loadRunner();
    const sql = runner.buildApplySql(runner.validatePinnedMigrationFile());

    expect(runner.ACCEPTED_LEDGER_NAMES).toEqual([
      "quicklog_corrections_retractions",
      "20260811090000_quicklog_corrections_retractions",
    ]);
    expect(sql).toContain(
      "-- BEGIN EXACT PINNED FILE: 20260811090000_quicklog_corrections_retractions.sql",
    );
    expect(sql).toContain("notify pgrst, 'reload schema';");
    expect(sql).toContain("insert into supabase_migrations.schema_migrations");
    expect(sql).toContain(EXPECTED_SHA256);
    expect(sql).not.toMatch(/mqtt|device_command|publish\s*\(/i);

    const aclNormalization = sql.indexOf(
      "revoke all on public.quicklog_entry_revisions from authenticated;",
    );
    const aclPostcondition = sql.indexOf("quicklog delivery refused noncanonical target acl");
    const prerequisiteRecheck = sql.indexOf(
      "quicklog delivery refused prerequisite drift under lock",
    );
    const functionAclNormalization = sql.indexOf(
      "revoke all on function public.quicklog_correct_entry(text, jsonb, uuid, uuid, text)",
    );
    const exactCatalogPostcondition = sql.indexOf(
      "quicklog delivery refused noncanonical target catalog",
    );
    const ledgerInsert = sql.indexOf("insert into supabase_migrations.schema_migrations");
    expect(aclNormalization).toBeGreaterThan(
      sql.indexOf("-- END EXACT PINNED FILE: 20260811090000_quicklog_corrections_retractions.sql"),
    );
    expect(aclPostcondition).toBeGreaterThan(aclNormalization);
    expect(prerequisiteRecheck).toBeGreaterThan(
      sql.indexOf("lock table public.user_roles in share row exclusive mode;"),
    );
    expect(prerequisiteRecheck).toBeLessThan(
      sql.indexOf(
        "-- BEGIN EXACT PINNED FILE: 20260811090000_quicklog_corrections_retractions.sql",
      ),
    );
    expect(functionAclNormalization).toBeGreaterThan(
      sql.indexOf("-- END EXACT PINNED FILE: 20260811090000_quicklog_corrections_retractions.sql"),
    );
    for (const signature of [
      "public.quicklog_revision_resolve_root(uuid, uuid, uuid)",
      "public.quicklog_revision_sibling_env_ids(uuid, public.grow_events)",
      "public.quicklog_revision_rebase_captured_at(jsonb, timestamptz, timestamptz)",
      "public.quicklog_retract_entry(text, uuid, uuid, text)",
      "public.quicklog_correct_entry(text, jsonb, uuid, uuid, text)",
    ]) {
      expect(sql).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role;`,
      );
    }
    expect(sql.match(/with target_ledger as \(/g)).toHaveLength(2);
    expect(exactCatalogPostcondition).toBeGreaterThan(functionAclNormalization);
    expect(ledgerInsert).toBeGreaterThan(exactCatalogPostcondition);
    expect(sql).toContain("set local search_path = pg_catalog, public, pg_temp;");
    expect(sql).toContain("'target_object_count')::integer, -1) <> 13");
  });

  it("pins trusted dependencies, role and user_roles trust, exact function ACLs, and live indexes", async () => {
    const runner = await loadRunner();
    const sql = runner.PREFLIGHT_SQL as string;
    const dependencySql = runner.QUICKLOG_DEPENDENCY_CATALOG_EXPRESSIONS_SQL as string;

    expect(runner.QUICKLOG_CATALOG_SEARCH_PATH_SQL).toBe("pg_catalog, public");
    expect(sql).toContain("set local search_path = pg_catalog, public;");
    expect(sql).not.toContain("set local search_path = public, pg_catalog;");

    expect(sql).toContain("'authenticated_role_contract'");
    expect(sql).toContain("not authenticated_role.rolinherit");
    expect(sql).toContain("not authenticated_role.rolcanlogin");
    expect(sql).toContain("not authenticated_role.rolbypassrls");
    expect(sql).toContain("'user_roles_contract'");
    expect(sql).toContain("t.relrowsecurity and not t.relforcerowsecurity");
    expect(sql).toContain("Operators manage roles|*|t|authenticated");
    expect(sql).toContain(
      "not has_table_privilege('authenticated',t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",
    );

    expect(sql).toContain("owner_role.rolname='postgres'");
    expect(sql).toContain("'authenticated|EXECUTE|f|postgres'");
    expect(sql).toContain("'service_role|EXECUTE|f|postgres'");
    expect(sql).toContain("to_regprocedure('gen_random_uuid()')=p.oid");
    expect(sql).toContain("n.nspname='pg_catalog'");
    expect(sql).not.toContain(
      "p.oid=to_regprocedure('public.gen_random_uuid()')\n       or p.oid=to_regprocedure('pg_catalog.gen_random_uuid()')",
    );
    const platformAuthContract = dependencySql.slice(
      dependencySql.indexOf("'auth_uid_contract'"),
      dependencySql.indexOf("'has_role_contract'"),
    );
    const platformUuidContract = dependencySql.slice(
      dependencySql.indexOf("'gen_random_uuid_contract'"),
    );
    expect(platformAuthContract).not.toContain("owner_role");
    expect(platformUuidContract).not.toContain("owner_role");

    expect(sql).toContain("acl.is_grantable");
    expect(sql).toContain("postgres|EXECUTE|f|postgres");
    expect(sql).toContain("i.indisvalid,i.indisready,i.indislive");
    expect(sql).toContain("i.indisvalid and i.indisready and i.indislive");
  });

  it("rejects inheritance descendants for the user_roles prerequisite and revision ledger", async () => {
    const runner = await loadRunner();
    const sql = runner.PREFLIGHT_SQL as string;
    const userRolesContract = sql.slice(
      sql.indexOf("'user_roles_contract'"),
      sql.indexOf("'quicklog_try_parse_uuid_contract'"),
    );
    const targetTableContract = sql.slice(
      sql.indexOf("'target_table_contract'"),
      sql.indexOf("'retracted_at_contract'"),
    );

    for (const contract of [userRolesContract, targetTableContract]) {
      expect(contract).toContain("not t.relhassubclass");
      expect(contract).toMatch(
        /not exists\s*\(select 1 from pg_inherits i where i\.inhparent\s*=\s*t\.oid\)/,
      );
    }
  });

  it("classifies only pristine absence as apply and exact recorded effect as verify-only", async () => {
    const runner = await loadRunner();

    expect(runner.classifyPreflight(ABSENT_STATE)).toEqual({ status: "apply" });
    expect(runner.classifyPreflight(LIVE_STATE)).toEqual({ status: "verify_only" });
    expect(
      runner.classifyPreflight({
        ...ABSENT_STATE,
        target_object_count: 1,
        retracted_at_exists: true,
      }),
    ).toEqual({ status: "partial_target_drift", reason: "target_objects_present" });
    expect(runner.classifyPreflight({ ...LIVE_STATE, target_functions_contract: false })).toEqual({
      status: "schema_drift",
      reason: "recorded_effect_mismatch",
    });
    expect(runner.classifyPreflight({ ...LIVE_STATE, target_object_count: 12 })).toEqual({
      status: "schema_drift",
      reason: "recorded_effect_mismatch",
    });
    expect(runner.classifyPreflight({ ...ABSENT_STATE, ledger_conflict_count: 1 })).toEqual({
      status: "ledger_drift",
      reason: "target_collision",
    });
    expect(runner.classifyPreflight({ ...ABSENT_STATE, tents_contract: false })).toEqual({
      status: "prerequisite_drift",
      reason: "tents_contract",
    });
  });

  it("accepts exactly one complete typed JSON row and enforces read-only preflight SQL", async () => {
    const runner = await loadRunner();
    expect(runner.parsePreflightStdout(preflightStdout())).toEqual(ABSENT_STATE);
    expect(() => runner.parsePreflightStdout("{}\n")).toThrow("preflight_result_shape");
    expect(() => runner.parsePreflightStdout(`${preflightStdout()}${preflightStdout()}`)).toThrow(
      "preflight_row_count:2",
    );
    expect(runner.PREFLIGHT_SQL).toMatch(/set transaction read only;/i);
    expect(runner.PREFLIGHT_SQL).not.toMatch(
      /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|notify)\b/im,
    );
    expect(runner.PREFLIGHT_SQL).toContain("pg_get_expr(p.polwithcheck,p.polrelid)");
    expect(runner.PREFLIGHT_SQL).not.toContain("p.polwithcheck is null");
  });

  it("derives a deterministic state receipt bound to project, SHA, and migration bytes", async () => {
    const runner = await loadRunner();
    const first = runner.buildPreflightReceipt({ state: ABSENT_STATE, headSha: EXPECTED_HEAD_SHA });
    const second = runner.buildPreflightReceipt({
      state: ABSENT_STATE,
      headSha: EXPECTED_HEAD_SHA,
    });
    const changed = runner.buildPreflightReceipt({
      state: { ...ABSENT_STATE, target_object_count: 1 },
      headSha: EXPECTED_HEAD_SHA,
    });

    expect(first).toEqual(second);
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(first.project_ref).toBe(PRODUCTION_PROJECT_REF);
    expect(first.migration_version).toBe("20260811090000");
    expect(first.migration_sha256).toBe(EXPECTED_SHA256);
    expect(changed.digest).not.toBe(first.digest);
  });

  it("rejects wrong branch, SHA, target, missing secret, and advanced deploy head before psql", async () => {
    const runner = await loadRunner();
    const scenarios: Array<Record<string, string>> = [
      { GITHUB_REF_NAME: "main" },
      { GITHUB_SHA: "d".repeat(40) },
      { CONFIRM_PROJECT_REF: "bzatgtgjvuojpoxcknaa" },
      { SUPABASE_DB_URL: "" },
      { CURRENT_DEPLOY_HEAD_SHA: ADVANCED_HEAD_SHA },
    ];

    for (const scenario of scenarios) {
      let calls = 0;
      const status = runner.runQuickLogCorrectionsRetractionsDelivery({
        env: baseEnv({ ...temporaryEvidenceEnv(), ...scenario }),
        spawnImpl: () => {
          calls += 1;
          return { status: 0, stdout: "", stderr: "" };
        },
        logger: { log() {}, error() {} },
      });
      expect(status).not.toBe(runner.EXIT.OK);
      expect(calls).toBe(0);
    }
  });

  it("rejects missing, displaced, or malformed production CA material before psql", async () => {
    const runner = await loadRunner();

    for (const scenario of ["missing", "wrong-path", "malformed"] as const) {
      const evidence = temporaryEvidenceEnv();
      const malformedSentinel = "MALFORMED-CA-CONTENT-SENTINEL";
      if (scenario === "missing") {
        rmSync(evidence.SUPABASE_DB_CA_CERT_PATH, { force: true });
      } else if (scenario === "wrong-path") {
        evidence.SUPABASE_DB_CA_CERT_PATH = join(evidence.RUNNER_TEMP, "attacker-root.crt");
      } else {
        writeFileSync(evidence.SUPABASE_DB_CA_CERT_PATH, malformedSentinel, { mode: 0o600 });
      }

      let calls = 0;
      const lines: string[] = [];
      const status = runner.runQuickLogCorrectionsRetractionsDelivery({
        env: baseEnv(evidence),
        spawnImpl: () => {
          calls += 1;
          return { status: 0, stdout: "", stderr: "" };
        },
        logger: {
          log: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
          error: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
        },
      });

      const report = readFileSync(evidence.REPORT_PATH, "utf8");
      const audit = readFileSync(evidence.AUDIT_PATH, "utf8");
      const observable = [...lines, report, audit].join("\n");
      expect(status).toBe(runner.EXIT.TLS_TRUST_REJECTED);
      expect(calls).toBe(0);
      expect(report).toContain("BLOCKED - production TLS trust rejected");
      expect(audit).toContain('"reason_code": "tls_trust_rejected"');
      expect(observable).not.toContain(malformedSentinel);
      expect(observable).not.toContain(RAW_CA_SECRET_SENTINEL);
      expect(observable).not.toContain(DATABASE_SECRET);
    }
  });

  it("forces verify-full with only the fixed CA path in the psql child", async () => {
    const runner = await loadRunner();
    const evidence = temporaryEvidenceEnv();
    let childEnv: Record<string, string | undefined> | undefined;
    let args: string[] = [];

    const status = runner.runQuickLogCorrectionsRetractionsDelivery({
      env: baseEnv({
        ...evidence,
        OPERATION: "PREFLIGHT",
        CONFIRM_APPLY: "",
        PREFLIGHT_RECEIPT_DIGEST: "",
        PGSSLMODE: "disable",
        PGSSLROOTCERT: "C:\\attacker\\root.crt",
      }),
      spawnImpl: (_command: string, nextArgs: string[], options: { env: object }) => {
        args = [...nextArgs];
        childEnv = { ...options.env };
        return { status: 0, stdout: preflightStdout(), stderr: "" };
      },
      logger: { log() {}, error() {} },
    });

    expect(status).toBe(runner.EXIT.OK);
    expect(childEnv?.PGSSLMODE).toBe("verify-full");
    expect(childEnv?.PGSSLROOTCERT).toBe(evidence.SUPABASE_DB_CA_CERT_PATH);
    expect(childEnv).not.toHaveProperty("SUPABASE_DB_CA_CERT_B64");
    expect(JSON.stringify(childEnv)).not.toContain(RAW_CA_SECRET_SENTINEL);
    expect(args.join(" ")).not.toContain(DATABASE_SECRET);
    expect(args.join(" ")).not.toContain(evidence.SUPABASE_DB_CA_CERT_PATH);
  });

  it("runs PREFLIGHT once, emits a sanitized immutable receipt, and never requires APPLY wording", async () => {
    const runner = await loadRunner();
    const evidence = temporaryEvidenceEnv();
    const status = runner.runQuickLogCorrectionsRetractionsDelivery({
      env: baseEnv({
        ...evidence,
        OPERATION: "PREFLIGHT",
        CONFIRM_APPLY: "",
        PREFLIGHT_RECEIPT_DIGEST: "",
      }),
      spawnImpl: (_command: string, args: string[]) => {
        expect(args).toContain("--single-transaction");
        expect(args).toContain("-c");
        return { status: 0, stdout: preflightStdout(), stderr: "" };
      },
      logger: { log() {}, error() {} },
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    });

    expect(status).toBe(runner.EXIT.OK);
    const receipt = JSON.parse(readFileSync(evidence.PREFLIGHT_RECEIPT_PATH, "utf8"));
    expect(receipt).toMatchObject({
      tool: "apply-quicklog-corrections-retractions",
      operation: "PREFLIGHT",
      outcome: "safe_to_apply",
      safe_to_apply: true,
      head_sha: EXPECTED_HEAD_SHA,
      migration_sha256: EXPECTED_SHA256,
    });
    expect(JSON.stringify(receipt)).not.toContain(DATABASE_SECRET);
  });

  it("suppresses psql command tags before parsing the one-row preflight result", async () => {
    const runner = await loadRunner();
    const evidence = temporaryEvidenceEnv();
    const calls: string[][] = [];
    const status = runner.runQuickLogCorrectionsRetractionsDelivery({
      env: baseEnv({
        ...evidence,
        OPERATION: "PREFLIGHT",
        CONFIRM_APPLY: "",
        PREFLIGHT_RECEIPT_DIGEST: "",
      }),
      spawnImpl: (_command: string, args: string[]) => {
        calls.push(args);
        return {
          status: 0,
          stdout: args.includes("-q")
            ? preflightStdout()
            : `SET\nSET\nSET\nSET\n${preflightStdout()}`,
          stderr: "",
        };
      },
      logger: { log() {}, error() {} },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("-q");
    expect(status).toBe(runner.EXIT.OK);
  });

  it("reruns state, applies once, and requires exact postflight before success", async () => {
    const runner = await loadRunner();
    const evidence = temporaryEvidenceEnv();
    const receipt = runner.buildPreflightReceipt({
      state: ABSENT_STATE,
      headSha: EXPECTED_HEAD_SHA,
    });
    const calls: string[][] = [];
    const status = runner.runQuickLogCorrectionsRetractionsDelivery({
      env: baseEnv({ ...evidence, PREFLIGHT_RECEIPT_DIGEST: receipt.digest }),
      spawnImpl: (_command: string, args: string[]) => {
        calls.push(args);
        if (args.includes("-c")) {
          return {
            status: 0,
            stdout:
              calls.filter((candidate) => candidate.includes("-c")).length === 1
                ? preflightStdout()
                : preflightStdout(LIVE_STATE),
            stderr: "",
          };
        }
        expect(args).toContain("--file");
        return { status: 0, stdout: "", stderr: "" };
      },
      logger: { log() {}, error() {} },
    });

    expect(status).toBe(runner.EXIT.OK);
    expect(calls).toHaveLength(3);
    expect(calls.filter((args) => args.includes("--file"))).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain(DATABASE_SECRET);
  });

  it("uses a manual dispatch, exact deploy branch, protected environment, and authenticated receipt verifier", () => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
    const workflowSource = readFileSync(WORKFLOW_PATH, "utf8");
    const workflow = loadYaml(workflowSource) as Record<string, any>;
    const trigger = workflow.on ?? workflow.true;

    expect(Object.keys(trigger)).toEqual(["workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "read", actions: "read" });
    expect(workflow.jobs.apply.environment).toBe("verdant-production");
    expect(workflowSource).toContain("refs/heads/verdant-grow-diary");
    expect(workflowSource).toContain("verify-quicklog-corrections-preflight-artifact.mjs");
    expect(workflowSource).toContain(
      "Re-resolve current deploy branch head before database access",
    );
    expect(workflowSource).toContain("retention-days: 30");
    expect(workflowSource).not.toContain("continue-on-error");
  });
});
