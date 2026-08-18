import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rootCertificates } from "node:tls";
import { afterEach, describe, expect, it } from "vitest";
import { PRODUCTION_SUPABASE_CA_FILENAME } from "../../scripts/lib/productionSupabaseTls.mjs";
import {
  assertSupabaseDatabaseTargetIdentity,
  databaseTargetForEnvironment,
  parseSupabaseDatabaseUrl,
  SANDBOX_SCHEMA_VERIFIER_ROLE,
  SUPABASE_DATABASE_TARGETS,
} from "../../scripts/lib/supabaseDatabaseTargetIdentity.mjs";
import {
  EXIT,
  runRequiredCoreMigrationsApplied,
} from "../../scripts/assert-required-core-migrations-applied.mjs";
import { PREFLIGHT_SQL } from "../../scripts/apply-quicklog-corrections-retractions.mjs";
import {
  ADVISORY_SCHEMA,
  REQUIRED_CORE_MIGRATIONS,
  REQUIRED_CORE_SCHEMA,
  manifestForScope,
  schemaKey,
} from "../../scripts/required-core-migrations.mjs";

const SANDBOX_REF = "bzatgtgjvuojpoxcknaa";
const PRODUCTION_REF = "knkwiiywfkbqznbxwqfh";
const PASSWORD = "gate-test-password";
const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");
const WORKFLOW_PATH = resolve(__dirname, "../../.github/workflows/required-core-migrations.yml");
const PRODUCTION_SCHEMA_RECONCILIATION = "20260728090000_production_schema_reconciliation.sql";
const SOIL_MOISTURE_CALIBRATION_COLUMNS = [
  "id",
  "user_id",
  "grow_id",
  "tent_id",
  "plant_id",
  "device_id",
  "label",
  "medium",
  "sensor_depth_cm",
  "dry_raw",
  "wet_raw",
  "source",
  "is_active",
  "notes",
  "created_at",
  "updated_at",
];
const PHENO_CROSSES_TAXONOMY_COLUMNS = ["channel", "generation", "recurrent_parent_id"];
const QUICKLOG_CORRECTIONS_MIGRATION = "20260811090000_quicklog_corrections_retractions.sql";
const QUICKLOG_REVISION_COLUMNS = [
  "id",
  "grow_event_id",
  "diary_entry_id",
  "root_id",
  "user_id",
  "actor_id",
  "revision_no",
  "kind",
  "reason_code",
  "reason_note",
  "previous_state",
  "new_state",
  "created_at",
];
const EXPECTED_CORE_COLUMN_COUNT = 51;
const EXPECTED_ADVISORY_COLUMN_COUNT = 4;
const EXPECTED_MIGRATION_COUNT = 8;
const CANONICAL_QUICKLOG_CATALOG_CONTRACT = Object.freeze({
  authenticated_role_contract: true,
  app_role_contract: true,
  auth_uid_contract: true,
  has_role_contract: true,
  user_roles_contract: true,
  quicklog_try_parse_uuid_contract: true,
  gen_random_uuid_contract: true,
  target_table_contract: true,
  retracted_at_contract: true,
  target_constraints_contract: true,
  target_indexes_contract: true,
  diary_retracted_index_contract: true,
  target_policies_contract: true,
  target_triggers_rules_contract: true,
  target_functions_contract: true,
  target_function_overloads_contract: true,
  target_function_security_contract: true,
  manual_delegate_contract: true,
  target_acl_contract: true,
  client_access_contract: true,
});
const QUICKLOG_CATALOG_CONTRACT_KEYS = Object.keys(CANONICAL_QUICKLOG_CATALOG_CONTRACT) as Array<
  keyof typeof CANONICAL_QUICKLOG_CATALOG_CONTRACT
>;

const tempDirs: string[] = [];

function productionTlsEnv() {
  const runnerTemp = mkdtempSync(join(tmpdir(), "verdant-production-tls-test-"));
  tempDirs.push(runnerTemp);
  const caPath = join(runnerTemp, PRODUCTION_SUPABASE_CA_FILENAME);
  const testCa = rootCertificates[0];
  if (!testCa) throw new Error("Node did not provide a test root certificate.");
  writeFileSync(caPath, testCa, { mode: 0o600 });
  return {
    RUNNER_TEMP: runnerTemp,
    SUPABASE_DB_CA_CERT_PATH: caPath,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function directUrl(ref: string, port = 5432, password = PASSWORD) {
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:${port}/postgres?sslmode=require`;
}

function sharedUrl(ref: string, port = 5432, password = PASSWORD) {
  return `postgres://postgres.${ref}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:${port}/postgres?sslmode=require`;
}

function genericSharedUrl(port = 5432, password = PASSWORD, encodedUsername = "postgres") {
  return `postgres://${encodedUsername}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:${port}/postgres?sslmode=require`;
}

function captureLogger() {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      log: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
      error: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
    },
  };
}

function successfulCoreQueryResult(callNumber: number) {
  return callNumber === 1
    ? {
        status: 0,
        stdout: REQUIRED_CORE_SCHEMA.map(schemaKey).join("\n"),
        stderr: "",
      }
    : {
        status: 0,
        stdout: `${JSON.stringify(CANONICAL_QUICKLOG_CATALOG_CONTRACT)}\n`,
        stderr: "",
      };
}

function exactQuickLogCatalogKeys(sql: string) {
  const expected = new Set<string>(QUICKLOG_CATALOG_CONTRACT_KEYS);
  return [...sql.matchAll(/^ {2}'([a-z_]+)',/gm)]
    .map((match) => match[1])
    .filter((key) => expected.has(key));
}

function runQuickLogCatalogFixture(catalogStdout: string) {
  const dir = mkdtempSync(join(tmpdir(), "core-schema-quicklog-contract-"));
  tempDirs.push(dir);
  const reportPath = join(dir, "report.md");
  const auditPath = join(dir, "audit.json");
  const { logger } = captureLogger();
  let psqlCalls = 0;

  const status = runRequiredCoreMigrationsApplied({
    env: {
      ...productionTlsEnv(),
      TARGET_ENV: "production",
      SUPABASE_DB_URL: directUrl(PRODUCTION_REF),
      REPORT_PATH: reportPath,
      AUDIT_PATH: auditPath,
    },
    spawnImpl: () => {
      psqlCalls += 1;
      return psqlCalls === 1
        ? successfulCoreQueryResult(1)
        : { status: 0, stdout: catalogStdout, stderr: "" };
    },
    logger,
  });

  return {
    status,
    psqlCalls,
    report: readFileSync(reportPath, "utf8"),
    audit: JSON.parse(readFileSync(auditPath, "utf8")),
  };
}

function emittedQuickLogCatalogSql() {
  const { logger } = captureLogger();
  const calls: Array<{ args: string[] }> = [];

  const status = runRequiredCoreMigrationsApplied({
    env: {
      ...productionTlsEnv(),
      TARGET_ENV: "production",
      SUPABASE_DB_URL: directUrl(PRODUCTION_REF),
    },
    spawnImpl: (_command, args) => {
      calls.push({ args: [...args] });
      return successfulCoreQueryResult(calls.length);
    },
    logger,
  });

  expect(status).toBe(EXIT.OK);
  expect(calls).toHaveLength(2);
  return calls[1].args.at(-1) ?? "";
}

describe("Supabase database target identity", () => {
  it("pins the only two remote targets and their protected environments", () => {
    expect(SUPABASE_DATABASE_TARGETS).toEqual({
      sandbox: {
        projectRef: SANDBOX_REF,
        githubEnvironment: "verdant-sandbox",
      },
      production: {
        projectRef: PRODUCTION_REF,
        githubEnvironment: "verdant-production",
      },
    });
  });

  it.each([
    [directUrl(SANDBOX_REF), "direct"],
    [directUrl(SANDBOX_REF, 6543), "dedicated-pooler"],
    [sharedUrl(SANDBOX_REF), "shared-supavisor-session"],
    [sharedUrl(SANDBOX_REF, 6543), "shared-supavisor-transaction"],
    [genericSharedUrl(), "shared-supavisor-session"],
    [genericSharedUrl(6543), "shared-supavisor-transaction"],
    [directUrl(SANDBOX_REF).replace("sslmode=require", "sslmode=verify-ca"), "direct"],
    [directUrl(SANDBOX_REF).replace("sslmode=require", "sslmode=verify-full"), "direct"],
    [directUrl(SANDBOX_REF).replace("?sslmode=require", ""), "direct"],
    [directUrl(SANDBOX_REF, 6543).replace("?sslmode=require", ""), "dedicated-pooler"],
    [sharedUrl(SANDBOX_REF).replace("?sslmode=require", ""), "shared-supavisor-session"],
    [sharedUrl(SANDBOX_REF, 6543).replace("?sslmode=require", ""), "shared-supavisor-transaction"],
  ])("accepts documented sandbox URL form %#", (url, expectedMode) => {
    expect(
      assertSupabaseDatabaseTargetIdentity({
        targetEnv: "sandbox",
        databaseUrl: url,
      }),
    ).toMatchObject({
      targetEnv: "sandbox",
      projectRef: SANDBOX_REF,
      connectionMode: expectedMode,
    });
  });

  it("pins production and rebinds shared credentials instead of trusting their username", () => {
    expect(
      assertSupabaseDatabaseTargetIdentity({
        targetEnv: "production",
        databaseUrl: sharedUrl(PRODUCTION_REF, 6543),
      }).projectRef,
    ).toBe(PRODUCTION_REF);
    expect(
      assertSupabaseDatabaseTargetIdentity({
        targetEnv: "sandbox",
        databaseUrl: sharedUrl(PRODUCTION_REF, 6543),
      }),
    ).toMatchObject({
      targetEnv: "sandbox",
      projectRef: SANDBOX_REF,
      connectionMode: "shared-supavisor-transaction",
      requiresPinnedProjectBinding: true,
    });
  });

  it.each(["", "live", "prod", "Production", "sandbox ", "SANDBOX"])(
    "rejects unknown target environment %j",
    (targetEnv) => {
      expect(() => databaseTargetForEnvironment(targetEnv)).toThrow(
        /exactly sandbox or production/i,
      );
    },
  );

  it.each([
    ["wrong direct project", directUrl(PRODUCTION_REF)],
    [
      "conflicting direct username ref",
      `postgres://postgres.${PRODUCTION_REF}:${PASSWORD}@db.${SANDBOX_REF}.supabase.co:5432/postgres?sslmode=require`,
    ],
    ["duplicate sslmode", `${directUrl(SANDBOX_REF)}&sslmode=disable`],
    [
      "lookalike direct host",
      `postgres://postgres:${PASSWORD}@db.${SANDBOX_REF}.supabase.co.attacker.invalid:5432/postgres?sslmode=require`,
    ],
    [
      "lookalike pooler host",
      `postgres://postgres.${SANDBOX_REF}:${PASSWORD}@aws-0-us-east-1.pooler.supabase.com.attacker.invalid:5432/postgres?sslmode=require`,
    ],
    [
      "unsupported pooler host",
      `postgres://postgres.${SANDBOX_REF}:${PASSWORD}@attacker.pooler.supabase.com:5432/postgres?sslmode=require`,
    ],
    [
      "malformed shared username encoding",
      `postgres://post%ZZgres:${PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    ],
    [
      "wrong direct user",
      `postgres://readonly:${PASSWORD}@db.${SANDBOX_REF}.supabase.co:5432/postgres?sslmode=require`,
    ],
    [
      "missing password",
      `postgres://postgres@db.${SANDBOX_REF}.supabase.co:5432/postgres?sslmode=require`,
    ],
    [
      "wrong database",
      `postgres://postgres:${PASSWORD}@db.${SANDBOX_REF}.supabase.co:5432/app?sslmode=require`,
    ],
    [
      "unsupported port",
      `postgres://postgres:${PASSWORD}@db.${SANDBOX_REF}.supabase.co:6432/postgres?sslmode=require`,
    ],
    [
      "unsupported protocol",
      `https://postgres:${PASSWORD}@db.${SANDBOX_REF}.supabase.co:5432/postgres?sslmode=require`,
    ],
  ])("rejects %s before a database client can run", (_label, url) => {
    expect(() =>
      assertSupabaseDatabaseTargetIdentity({
        targetEnv: "sandbox",
        databaseUrl: url,
      }),
    ).toThrow();
  });

  it.each(["disable", "allow", "prefer"])("rejects downgrade-capable sslmode=%s", (sslmode) => {
    expect(() =>
      parseSupabaseDatabaseUrl(
        directUrl(SANDBOX_REF).replace("sslmode=require", `sslmode=${sslmode}`),
      ),
    ).toThrow(/sslmode=require, verify-ca, or verify-full/i);
  });

  it("accepts a query-free Dashboard URL for the caller's enforced TLS default", () => {
    expect(
      parseSupabaseDatabaseUrl(directUrl(SANDBOX_REF).replace("?sslmode=require", "")),
    ).toMatchObject({
      projectRef: SANDBOX_REF,
      connectionMode: "direct",
    });
  });

  it("derives identity only from the URL authority when query overrides are present", () => {
    expect(
      parseSupabaseDatabaseUrl(
        `${directUrl(SANDBOX_REF)}&host=db.${PRODUCTION_REF}.supabase.co&user=readonly&dbname=app`,
      ),
    ).toMatchObject({
      projectRef: SANDBOX_REF,
      connectionMode: "direct",
      hostname: `db.${SANDBOX_REF}.supabase.co`,
    });
  });

  it.each([
    ["documented username", `postgres.${PRODUCTION_REF}`],
    ["generic username", "postgres"],
    ["encoded generic username", "post%67res"],
    ["custom role", "readonly"],
    ["placeholder suffix", "postgres.%5BPROJECT_REF%5D"],
  ])("binds a %s shared-pooler credential to the selected pinned target", (_label, username) => {
    expect(
      assertSupabaseDatabaseTargetIdentity({
        targetEnv: "sandbox",
        databaseUrl: genericSharedUrl(5432, PASSWORD, username),
      }),
    ).toMatchObject({
      targetEnv: "sandbox",
      projectRef: SANDBOX_REF,
      connectionMode: "shared-supavisor-session",
      requiresPinnedProjectBinding: true,
    });
  });

  it("binds a shared-pooler credential to the pinned production target", () => {
    expect(
      assertSupabaseDatabaseTargetIdentity({
        targetEnv: "production",
        databaseUrl: genericSharedUrl(6543),
      }),
    ).toMatchObject({
      targetEnv: "production",
      projectRef: PRODUCTION_REF,
      connectionMode: "shared-supavisor-transaction",
      requiresPinnedProjectBinding: true,
    });
  });

  it("preserves only the exact sandbox read-only verifier identity", () => {
    const url = genericSharedUrl(5432, PASSWORD, `${SANDBOX_SCHEMA_VERIFIER_ROLE}.${SANDBOX_REF}`);
    let childEnv: Record<string, string | undefined> | undefined;
    let psqlCalls = 0;
    const { logger } = captureLogger();

    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: "sandbox",
        SUPABASE_DB_URL: url,
        PATH: process.env.PATH,
      },
      spawnImpl: (_command, _args, options) => {
        psqlCalls += 1;
        childEnv = { ...options.env };
        return successfulCoreQueryResult(psqlCalls);
      },
      logger,
    });

    expect(status).toBe(EXIT.OK);
    expect(childEnv?.PGUSER).toBe(`${SANDBOX_SCHEMA_VERIFIER_ROLE}.${SANDBOX_REF}`);
  });

  it.each([
    ["wrong sandbox ref", "sandbox", `${SANDBOX_SCHEMA_VERIFIER_ROLE}.${PRODUCTION_REF}`],
    ["production target", "production", `${SANDBOX_SCHEMA_VERIFIER_ROLE}.${PRODUCTION_REF}`],
  ])("rejects the sandbox verifier on %s", (_label, targetEnv, username) => {
    let psqlCalls = 0;
    const { logger } = captureLogger();
    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: targetEnv,
        SUPABASE_DB_URL: genericSharedUrl(5432, PASSWORD, username),
        PATH: process.env.PATH,
      },
      spawnImpl: () => {
        psqlCalls += 1;
        return { status: 0, stdout: "", stderr: "" };
      },
      logger,
    });

    expect(status).toBe(EXIT.TARGET_IDENTITY_INVALID);
    expect(psqlCalls).toBe(0);
  });

  it("returns only non-secret identity metadata", () => {
    const parsed = parseSupabaseDatabaseUrl(directUrl(SANDBOX_REF, 5432, "do-not-return-this"));
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("do-not-return-this");
    expect(serialized).not.toContain("postgres://");
    expect(parsed).toEqual({
      projectRef: SANDBOX_REF,
      connectionMode: "direct",
      hostname: `db.${SANDBOX_REF}.supabase.co`,
      port: 5432,
    });
  });
});

describe("required core schema manifest", () => {
  it("blocks on the complete soil moisture calibration table contract", () => {
    const soilEntries = REQUIRED_CORE_SCHEMA.filter(
      (entry) => entry.table === "soil_moisture_calibrations",
    );

    expect(soilEntries.map((entry) => entry.column)).toEqual(SOIL_MOISTURE_CALIBRATION_COLUMNS);
    expect(
      soilEntries.map((entry) => ({
        column: entry.column,
        migration: entry.migration,
      })),
    ).toEqual(
      SOIL_MOISTURE_CALIBRATION_COLUMNS.map((column) => ({
        column,
        migration: PRODUCTION_SCHEMA_RECONCILIATION,
      })),
    );
    expect(soilEntries.every((entry) => entry.reason.includes("One-Tent Loop"))).toBe(true);
    expect(
      ADVISORY_SCHEMA.filter((entry) => entry.table === "soil_moisture_calibrations"),
    ).toHaveLength(0);
    expect(REQUIRED_CORE_SCHEMA).toHaveLength(EXPECTED_CORE_COLUMN_COUNT);
  });

  it("maps request_hash and plant_type to the additive forward repair", () => {
    const repair = "20260725023000_core_schema_forward_repair.sql";
    const migrationFor = (key: string) =>
      REQUIRED_CORE_SCHEMA.find((entry) => schemaKey(entry) === key)?.migration;
    expect(migrationFor("quicklog_idempotency.request_hash")).toBe(repair);
    expect(migrationFor("plants.plant_type")).toBe(repair);
  });

  it("guards the complete Quick Log audit INSERT contract", () => {
    const auditEntries = REQUIRED_CORE_SCHEMA.filter(
      (candidate) => candidate.table === "quicklog_audit_events",
    );
    expect(auditEntries.map((entry) => entry.column).sort()).toEqual(
      ["user_id", "idempotency_key", "grow_event_id", "status", "reason"].sort(),
    );
    expect(new Set(auditEntries.map((entry) => entry.migration))).toEqual(
      new Set(["20260610230856_e8544509-5a66-41bc-8beb-39c95d96dde5.sql"]),
    );
  });

  it("blocks core signoff until the complete Quick Log revision schema is present", () => {
    const revisionEntries = REQUIRED_CORE_SCHEMA.filter(
      (candidate) => candidate.table === "quicklog_entry_revisions",
    );
    expect(revisionEntries.map((entry) => entry.column)).toEqual(QUICKLOG_REVISION_COLUMNS);
    expect(new Set(revisionEntries.map((entry) => entry.migration))).toEqual(
      new Set([QUICKLOG_CORRECTIONS_MIGRATION]),
    );
    expect(
      REQUIRED_CORE_SCHEMA.find((entry) => schemaKey(entry) === "diary_entries.retracted_at"),
    ).toMatchObject({ migration: QUICKLOG_CORRECTIONS_MIGRATION });
    expect(REQUIRED_CORE_SCHEMA.map(schemaKey)).not.toContain("diary_entries.retraction_reason");
    expect(REQUIRED_CORE_SCHEMA).toHaveLength(EXPECTED_CORE_COLUMN_COUNT);
  });

  it("guards the full feeding INSERT contract, not only ALTER-added columns", () => {
    const feedingColumns = REQUIRED_CORE_SCHEMA.filter((entry) => entry.table === "feeding_events")
      .map((entry) => entry.column)
      .sort();
    expect(feedingColumns).toEqual(
      [
        "event_id",
        "user_id",
        "line_id",
        "products",
        "volume_ml",
        "ph",
        "ec_in",
        "ec_out",
        "runoff_ml",
        "runoff_ph",
        "runoff_ec",
        "water_temp_c",
      ].sort(),
    );
  });

  it("keeps Pheno candidate and cross taxonomy columns advisory-only", () => {
    const advisoryKeys = ADVISORY_SCHEMA.map(schemaKey);
    const phenoTaxonomyKeys = PHENO_CROSSES_TAXONOMY_COLUMNS.map(
      (column) => `pheno_crosses.${column}`,
    );

    expect(advisoryKeys).toEqual(["plants.candidate_number", ...phenoTaxonomyKeys]);
    for (const advisoryKey of advisoryKeys) {
      expect(REQUIRED_CORE_SCHEMA.map(schemaKey)).not.toContain(advisoryKey);
    }
    expect(ADVISORY_SCHEMA[0]).toMatchObject({
      table: "plants",
      column: "candidate_number",
      migration: "20260712010343_pheno_candidate_number_foundation.sql",
    });
    expect(
      ADVISORY_SCHEMA.filter((entry) => entry.table === "pheno_crosses").map((entry) => ({
        column: entry.column,
        migration: entry.migration,
      })),
    ).toEqual(
      PHENO_CROSSES_TAXONOMY_COLUMNS.map((column) => ({
        column,
        migration: PRODUCTION_SCHEMA_RECONCILIATION,
      })),
    );
    expect(
      ADVISORY_SCHEMA.filter((entry) => entry.table === "pheno_crosses").every((entry) =>
        entry.reason.includes("gated Pheno"),
      ),
    ).toBe(true);
    expect(ADVISORY_SCHEMA).toHaveLength(EXPECTED_ADVISORY_COLUMN_COUNT);
    expect(manifestForScope("advisory")).toBe(ADVISORY_SCHEMA);
  });

  it("rejects unknown manifest scopes and hostile identifiers", () => {
    expect(() => manifestForScope("pro")).toThrow();
    expect(() => schemaKey({ table: "plants; drop table plants", column: "id" })).toThrow();
    expect(() => schemaKey({ table: "plants", column: "x' OR true--" })).toThrow();
  });

  it("contains no duplicate requirements and names only present migration files", () => {
    const allEntries = [...REQUIRED_CORE_SCHEMA, ...ADVISORY_SCHEMA];
    const keys = allEntries.map(schemaKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of allEntries) {
      expect(entry.reason.trim().length).toBeGreaterThan(0);
      expect(
        readdirSync(MIGRATIONS_DIR).includes(entry.migration),
        `${schemaKey(entry)} -> ${entry.migration}`,
      ).toBe(true);
    }
    expect(new Set(REQUIRED_CORE_MIGRATIONS).size).toBe(REQUIRED_CORE_MIGRATIONS.length);
    expect(REQUIRED_CORE_MIGRATIONS).toHaveLength(EXPECTED_MIGRATION_COUNT);
  });
});

describe("remote applied-schema runner safety", () => {
  it("verifies the canonical Quick Log catalog contract before core signoff", () => {
    const dir = mkdtempSync(join(tmpdir(), "core-schema-quicklog-contract-"));
    tempDirs.push(dir);
    const reportPath = join(dir, "report.md");
    const auditPath = join(dir, "audit.json");
    const { logger } = captureLogger();
    let psqlCalls = 0;

    const status = runRequiredCoreMigrationsApplied({
      env: {
        ...productionTlsEnv(),
        TARGET_ENV: "production",
        SUPABASE_DB_URL: directUrl(PRODUCTION_REF),
        REPORT_PATH: reportPath,
        AUDIT_PATH: auditPath,
      },
      spawnImpl: () => {
        psqlCalls += 1;
        return psqlCalls === 1
          ? {
              status: 0,
              stdout: REQUIRED_CORE_SCHEMA.map(schemaKey).join("\n"),
              stderr: "",
            }
          : {
              status: 0,
              stdout: `${JSON.stringify(CANONICAL_QUICKLOG_CATALOG_CONTRACT)}\n`,
              stderr: "",
            };
      },
      logger,
    });

    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    expect(status).toBe(EXIT.OK);
    expect(psqlCalls).toBe(2);
    expect(readFileSync(reportPath, "utf8")).toContain("exact Quick Log catalog contract");
    expect(readFileSync(reportPath, "utf8")).toContain("Migration ledger: `NOT_MEASURED`");
    expect(audit).toMatchObject({
      outcome: "verified",
      schema_verified: true,
      quicklog_catalog_contract_verified: true,
      quicklog_catalog_contract_failures: [],
      migration_ledger_status: "not_measured",
    });
  });

  it("keeps pg_catalog ahead of public so shadow objects cannot forge the verdict", () => {
    const catalogSql = emittedQuickLogCatalogSql();
    expect(catalogSql).toMatch(/set local search_path\s*=\s*pg_catalog,\s*public;/i);
    expect(catalogSql).not.toMatch(/set local search_path\s*=\s*public,\s*pg_catalog;/i);
  });

  it("attests the user_roles authorization chain used by the operator read policy", () => {
    const catalogSql = emittedQuickLogCatalogSql();
    expect(catalogSql).toContain("'user_roles_contract'");
  });

  it("rejects inherited descendants of user_roles and the Quick Log revision ledger", () => {
    const catalogSql = emittedQuickLogCatalogSql();
    const userRolesContract = catalogSql.slice(
      catalogSql.indexOf("'user_roles_contract'"),
      catalogSql.indexOf("'quicklog_try_parse_uuid_contract'"),
    );
    const targetTableContract = catalogSql.slice(
      catalogSql.indexOf("'target_table_contract'"),
      catalogSql.indexOf("'retracted_at_contract'"),
    );

    for (const contract of [userRolesContract, targetTableContract]) {
      expect(contract).toContain("not t.relhassubclass");
      expect(contract).toMatch(
        /not exists\s*\(select 1 from pg_inherits i where i\.inhparent\s*=\s*t\.oid\)/,
      );
    }
  });

  it("rejects an authenticated role that can bypass row-level security", () => {
    const catalogSql = emittedQuickLogCatalogSql();
    expect(catalogSql).toContain("'authenticated_role_contract'");
    expect(catalogSql).toContain("rolbypassrls");
  });

  it("compares exact function ACLs so an unexpected grantee cannot call a definer", () => {
    const catalogSql = emittedQuickLogCatalogSql();
    expect(catalogSql).toContain("proacl");
  });

  it("attests the exact Quick Log wrapper and repaired internal manual delegate", () => {
    const catalogSql = emittedQuickLogCatalogSql();
    const delegateContract = catalogSql.slice(
      catalogSql.indexOf("'manual_delegate_contract'"),
      catalogSql.indexOf("'target_acl_contract'"),
    );

    expect(delegateContract).toContain("quicklog_save_manual_pre_logged_at");
    expect(delegateContract).toContain("quicklog_save_manual(text,uuid,text,numeric");
    expect(delegateContract).toContain("0d3098b81787fa90898da921345c0dbc");
    expect(delegateContract).toContain("7ec296e422f7f47c8b2793b051840798");
    expect(delegateContract).toContain("search_path=public, pg_temp");
    expect(delegateContract).toContain("quicklog_idempotency");
    expect(delegateContract).toContain("request_hash");
    expect(delegateContract.match(/not\s+a\.attnotnull/gi) ?? []).toHaveLength(2);
    expect(delegateContract.match(/a\.atttypmod\s*=\s*-1/gi) ?? []).toHaveLength(2);
    expect(delegateContract.match(/a\.attgenerated\s*=\s*''/gi) ?? []).toHaveLength(2);
    expect(delegateContract.match(/a\.attidentity\s*=\s*''/gi) ?? []).toHaveLength(2);
    expect(delegateContract.match(/pg_attrdef/gi) ?? []).toHaveLength(2);
    expect(catalogSql).toContain("77f1aa70a70a9714057ef226b6996149");
    expect(catalogSql).toContain("a34d120aad5c37a33ac05fd9597624f4");
    expect(catalogSql).toContain("d9df46d36eb5d7aac767a3c87e53e92f");
    expect(delegateContract).toContain("trg_quicklog_stamp_grow_event_logged_at");
    expect(delegateContract).toContain("trg_quicklog_stamp_diary_logged_at");
    expect(delegateContract).toContain("proisstrict");
    expect(delegateContract).toContain("tgqual");
    expect(delegateContract).toContain("tgnargs");
    expect(delegateContract).toContain("tgargs");
    expect(delegateContract).toContain("tgparentid");
    expect(delegateContract).toContain("aclexplode");
    expect(delegateContract).toContain("pg_get_function_arguments");
    expect(delegateContract).toMatch(
      /select\s+count\(\*\)\s*=\s*1[\s\S]*p\.proname\s*=\s*'quicklog_save_manual'/i,
    );
    expect(delegateContract).toMatch(/select\s+count\(\*\)\s*=\s*4[\s\S]*p\.proname\s+in/i);
    expect(delegateContract).toMatch(/has_function_privilege\(\s*'anon'/);
    expect(delegateContract).toMatch(/has_function_privilege\(\s*'authenticated'/);
    expect(delegateContract).toMatch(/has_function_privilege\(\s*'service_role'/);
  });

  it("requires every pinned index to be valid, ready, and live", () => {
    const catalogSql = emittedQuickLogCatalogSql();
    expect(catalogSql).toContain("indisvalid");
    expect(catalogSql).toContain("indisready");
    expect(catalogSql).toContain("indislive");
  });

  it.each([
    ["RLS is disabled", { target_table_contract: false }, ["target_table_contract"]],
    [
      "an owner policy is missing",
      { target_policies_contract: false },
      ["target_policies_contract"],
    ],
    [
      "authenticated SELECT is broadened beyond the exact owner/operator policies",
      { target_policies_contract: false },
      ["target_policies_contract"],
    ],
    [
      "authenticated receives broad table access",
      { target_acl_contract: false, client_access_contract: false },
      ["target_acl_contract", "client_access_contract"],
    ],
    [
      "the operator-policy has_role dependency drifts permissive",
      { has_role_contract: false },
      ["has_role_contract"],
    ],
    [
      "authenticated can bypass row-level security",
      { authenticated_role_contract: false },
      ["authenticated_role_contract"],
    ],
    [
      "the user_roles authorization chain permits self-grant",
      { user_roles_contract: false },
      ["user_roles_contract"],
    ],
    [
      "a ledger constraint is missing",
      { target_constraints_contract: false },
      ["target_constraints_contract"],
    ],
    ["an index is missing", { target_indexes_contract: false }, ["target_indexes_contract"]],
    [
      "an exact-named index is invalid or not ready for writes",
      { target_indexes_contract: false },
      ["target_indexes_contract"],
    ],
    [
      "one of the five functions is missing",
      { target_functions_contract: false, target_function_overloads_contract: false },
      ["target_functions_contract", "target_function_overloads_contract"],
    ],
    [
      "an unexpected role can execute a Quick Log function",
      { target_function_security_contract: false },
      ["target_function_security_contract"],
    ],
  ])("blocks an all-columns core signoff when %s", (_label, overrides, expectedFailures) => {
    const secretSentinel = "QUICKLOG-CONTRACT-SECRET-SENTINEL";
    const databaseUrl = directUrl(PRODUCTION_REF, 5432, secretSentinel);
    const dir = mkdtempSync(join(tmpdir(), "core-schema-quicklog-contract-"));
    tempDirs.push(dir);
    const reportPath = join(dir, "report.md");
    const auditPath = join(dir, "audit.json");
    const { logger, lines } = captureLogger();
    let psqlCalls = 0;

    const status = runRequiredCoreMigrationsApplied({
      env: {
        ...productionTlsEnv(),
        TARGET_ENV: "production",
        SUPABASE_DB_URL: databaseUrl,
        REPORT_PATH: reportPath,
        AUDIT_PATH: auditPath,
      },
      spawnImpl: () => {
        psqlCalls += 1;
        return psqlCalls === 1
          ? {
              status: 0,
              stdout: REQUIRED_CORE_SCHEMA.map(schemaKey).join("\n"),
              stderr: "",
            }
          : {
              status: 0,
              stdout: `${JSON.stringify({
                ...CANONICAL_QUICKLOG_CATALOG_CONTRACT,
                ...overrides,
              })}\n`,
              stderr: "",
            };
      },
      logger,
    });

    const report = readFileSync(reportPath, "utf8");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    const observable = [...lines, report, JSON.stringify(audit)].join("\n");

    expect(status).toBe(EXIT.QUICKLOG_CATALOG_CONTRACT_FAILED);
    expect(psqlCalls).toBe(2);
    expect(report).not.toContain("**Status:** PASSED");
    expect(report).toContain("Migration ledger: `NOT_MEASURED`");
    expect(audit).toMatchObject({
      outcome: "quicklog_catalog_contract_failed",
      schema_verified: false,
      quicklog_catalog_contract_verified: false,
      quicklog_catalog_contract_failures: expectedFailures,
      migration_ledger_status: "not_measured",
    });
    expect(observable).not.toContain(secretSentinel);
    expect(observable).not.toContain(databaseUrl);
  });

  it.each(QUICKLOG_CATALOG_CONTRACT_KEYS)(
    "fails closed when exact Quick Log catalog postcondition %s is false",
    (contractKey) => {
      const result = runQuickLogCatalogFixture(
        `${JSON.stringify({
          ...CANONICAL_QUICKLOG_CATALOG_CONTRACT,
          [contractKey]: false,
        })}\n`,
      );

      expect(result.status).toBe(EXIT.QUICKLOG_CATALOG_CONTRACT_FAILED);
      expect(result.psqlCalls).toBe(2);
      expect(result.report).not.toContain("**Status:** PASSED");
      expect(result.audit).toMatchObject({
        outcome: "quicklog_catalog_contract_failed",
        quicklog_catalog_contract_verified: false,
        quicklog_catalog_contract_failures: [contractKey],
        migration_ledger_status: "not_measured",
      });
    },
  );

  it.each(QUICKLOG_CATALOG_CONTRACT_KEYS)(
    "rejects exact Quick Log catalog output when postcondition %s is missing",
    (contractKey) => {
      const incompleteContract = { ...CANONICAL_QUICKLOG_CATALOG_CONTRACT } as Record<
        string,
        boolean
      >;
      delete incompleteContract[contractKey];
      const result = runQuickLogCatalogFixture(`${JSON.stringify(incompleteContract)}\n`);

      expect(result.status).toBe(EXIT.QUICKLOG_CATALOG_CONTRACT_FAILED);
      expect(result.psqlCalls).toBe(2);
      expect(result.report).not.toContain("**Status:** PASSED");
      expect(result.audit).toMatchObject({
        outcome: "quicklog_catalog_contract_failed",
        quicklog_catalog_contract_verified: false,
        quicklog_catalog_contract_failures: ["catalog_result_malformed"],
        migration_ledger_status: "not_measured",
      });
    },
  );

  it("rejects malformed Quick Log catalog output without persisting raw database text", () => {
    const secretSentinel = "MALFORMED-QUICKLOG-CONTRACT-SECRET";
    const databaseUrl = directUrl(PRODUCTION_REF, 5432, secretSentinel);
    const dir = mkdtempSync(join(tmpdir(), "core-schema-quicklog-contract-"));
    tempDirs.push(dir);
    const reportPath = join(dir, "report.md");
    const auditPath = join(dir, "audit.json");
    const { logger, lines } = captureLogger();
    let psqlCalls = 0;

    const status = runRequiredCoreMigrationsApplied({
      env: {
        ...productionTlsEnv(),
        TARGET_ENV: "production",
        SUPABASE_DB_URL: databaseUrl,
        REPORT_PATH: reportPath,
        AUDIT_PATH: auditPath,
      },
      spawnImpl: () => {
        psqlCalls += 1;
        return psqlCalls === 1
          ? successfulCoreQueryResult(1)
          : {
              status: 0,
              stdout: `not-json:${secretSentinel}\n`,
              stderr: "",
            };
      },
      logger,
    });

    const report = readFileSync(reportPath, "utf8");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    const observable = [...lines, report, JSON.stringify(audit)].join("\n");

    expect(status).toBe(EXIT.QUICKLOG_CATALOG_CONTRACT_FAILED);
    expect(psqlCalls).toBe(2);
    expect(audit).toMatchObject({
      outcome: "quicklog_catalog_contract_failed",
      quicklog_catalog_contract_verified: false,
      quicklog_catalog_contract_failures: ["catalog_result_malformed"],
      migration_ledger_status: "not_measured",
    });
    expect(observable).not.toContain(secretSentinel);
    expect(observable).not.toContain(databaseUrl);
    expect(observable).not.toContain("not-json");
  });

  it("blocks core signoff when the soil calibration contract is absent", () => {
    const secretSentinel = "SOIL-GATE-SECRET-SENTINEL";
    const soilKeys = new Set(
      SOIL_MOISTURE_CALIBRATION_COLUMNS.map((column) => `soil_moisture_calibrations.${column}`),
    );
    const presentEntries = REQUIRED_CORE_SCHEMA.filter((entry) => !soilKeys.has(schemaKey(entry)));
    const dir = mkdtempSync(join(tmpdir(), "core-schema-soil-gate-"));
    tempDirs.push(dir);
    const reportPath = join(dir, "report.md");
    const auditPath = join(dir, "audit.json");
    const { logger, lines } = captureLogger();
    let psqlCalls = 0;

    const status = runRequiredCoreMigrationsApplied({
      env: {
        ...productionTlsEnv(),
        TARGET_ENV: "production",
        SUPABASE_DB_URL: directUrl(PRODUCTION_REF, 5432, secretSentinel),
        REPORT_PATH: reportPath,
        AUDIT_PATH: auditPath,
      },
      spawnImpl: () => {
        psqlCalls += 1;
        if (psqlCalls === 1) {
          return {
            status: 0,
            stdout: presentEntries.map(schemaKey).join("\n"),
            stderr: "",
          };
        }
        return {
          status: 0,
          stdout: [...new Set(presentEntries.map((entry) => entry.table))].join("\n"),
          stderr: "",
        };
      },
      logger,
    });

    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    const observable = [...lines, readFileSync(reportPath, "utf8"), JSON.stringify(audit)].join(
      "\n",
    );

    expect(status).toBe(EXIT.MISSING_COLUMNS);
    expect(psqlCalls).toBe(2);
    expect(lines).toContain(
      `16 of ${EXPECTED_CORE_COLUMN_COUNT} required core column(s) are missing.`,
    );
    expect(audit).toMatchObject({
      outcome: "missing_columns",
      schema_verified: false,
      expected_count: EXPECTED_CORE_COLUMN_COUNT,
      present_count: EXPECTED_CORE_COLUMN_COUNT - SOIL_MOISTURE_CALIBRATION_COLUMNS.length,
      missing_count: SOIL_MOISTURE_CALIBRATION_COLUMNS.length,
      note: "Required tables absent: soil_moisture_calibrations.",
    });
    expect(
      audit.expected
        .filter((entry: { present: boolean }) => entry.present === false)
        .map((entry: { key: string }) => entry.key),
    ).toEqual([...soilKeys]);
    expect(observable).not.toContain(secretSentinel);
  });

  it("reports missing Pheno taxonomy as advisory drift only", () => {
    const missingKeys = new Set(
      PHENO_CROSSES_TAXONOMY_COLUMNS.map((column) => `pheno_crosses.${column}`),
    );
    const presentEntries = ADVISORY_SCHEMA.filter((entry) => !missingKeys.has(schemaKey(entry)));
    const dir = mkdtempSync(join(tmpdir(), "core-schema-pheno-gate-"));
    tempDirs.push(dir);
    const auditPath = join(dir, "audit.json");
    const { logger, lines } = captureLogger();
    let psqlCalls = 0;

    const status = runRequiredCoreMigrationsApplied({
      env: {
        ...productionTlsEnv(),
        TARGET_ENV: "production",
        MANIFEST_SCOPE: "advisory",
        SUPABASE_DB_URL: directUrl(PRODUCTION_REF),
        AUDIT_PATH: auditPath,
      },
      spawnImpl: () => {
        psqlCalls += 1;
        if (psqlCalls === 1) {
          return {
            status: 0,
            stdout: presentEntries.map(schemaKey).join("\n"),
            stderr: "",
          };
        }
        return {
          status: 0,
          stdout: "plants\npheno_crosses",
          stderr: "",
        };
      },
      logger,
    });

    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    expect(status).toBe(EXIT.MISSING_COLUMNS);
    expect(psqlCalls).toBe(2);
    expect(lines).toContain(
      `3 of ${EXPECTED_ADVISORY_COLUMN_COUNT} required advisory column(s) are missing.`,
    );
    expect(audit).toMatchObject({
      outcome: "missing_columns",
      schema_verified: false,
      expected_count: EXPECTED_ADVISORY_COLUMN_COUNT,
      present_count: 1,
      missing_count: PHENO_CROSSES_TAXONOMY_COLUMNS.length,
      note: "Required tables absent: (none).",
    });
    expect(
      audit.expected
        .filter((entry: { present: boolean }) => entry.present === false)
        .map((entry: { key: string }) => entry.key),
    ).toEqual([...missingKeys]);
  });

  it("does not invoke psql when target identity validation fails", () => {
    let psqlCalls = 0;
    const { logger } = captureLogger();
    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: "sandbox",
        SUPABASE_DB_URL: directUrl(PRODUCTION_REF),
      },
      spawnImpl: () => {
        psqlCalls += 1;
        return { status: 0, stdout: "" };
      },
      logger,
    });
    expect(status).toBe(EXIT.TARGET_IDENTITY_INVALID);
    expect(psqlCalls).toBe(0);
  });

  it("does not accept PGHOST or DATABASE_URL as a connection fallback", () => {
    let psqlCalls = 0;
    const { logger } = captureLogger();
    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: "sandbox",
        PGHOST: `db.${SANDBOX_REF}.supabase.co`,
        PGUSER: "postgres",
        DATABASE_URL: directUrl(SANDBOX_REF),
      },
      spawnImpl: () => {
        psqlCalls += 1;
        return { status: 0, stdout: "" };
      },
      logger,
    });
    expect(status).toBe(EXIT.NO_DB_CONNECTION);
    expect(psqlCalls).toBe(0);
  });

  it("rejects missing or malformed production CA material before psql", () => {
    for (const scenario of ["missing", "malformed"] as const) {
      const tls = productionTlsEnv();
      const reportPath = join(tls.RUNNER_TEMP, `tls-${scenario}-report.md`);
      const auditPath = join(tls.RUNNER_TEMP, `tls-${scenario}-audit.json`);
      const malformedSentinel = "MALFORMED-PRODUCTION-CA-SENTINEL";
      if (scenario === "missing") {
        rmSync(tls.SUPABASE_DB_CA_CERT_PATH, { force: true });
      } else {
        writeFileSync(tls.SUPABASE_DB_CA_CERT_PATH, malformedSentinel, { mode: 0o600 });
      }
      const { logger, lines } = captureLogger();
      let psqlCalls = 0;

      const status = runRequiredCoreMigrationsApplied({
        env: {
          ...tls,
          TARGET_ENV: "production",
          SUPABASE_DB_URL: directUrl(PRODUCTION_REF, 5432, "tls-db-secret-sentinel"),
          SUPABASE_DB_CA_CERT_B64: "raw-ca-secret-sentinel",
          REPORT_PATH: reportPath,
          AUDIT_PATH: auditPath,
        },
        spawnImpl: () => {
          psqlCalls += 1;
          return successfulCoreQueryResult(psqlCalls);
        },
        logger,
      });

      const observable = [
        ...lines,
        readFileSync(reportPath, "utf8"),
        readFileSync(auditPath, "utf8"),
      ].join("\n");
      expect(status).toBe(EXIT.TLS_TRUST_REJECTED);
      expect(psqlCalls).toBe(0);
      expect(observable).toContain("production TLS trust rejected");
      expect(observable).not.toContain(malformedSentinel);
      expect(observable).not.toContain("raw-ca-secret-sentinel");
      expect(observable).not.toContain("tls-db-secret-sentinel");
    }
  });

  it("forces verify-full for production while forwarding only the fixed CA path", () => {
    const tls = productionTlsEnv();
    const childEnvs: Array<Record<string, string | undefined>> = [];
    const args: string[][] = [];
    const { logger } = captureLogger();

    const status = runRequiredCoreMigrationsApplied({
      env: {
        ...tls,
        TARGET_ENV: "production",
        SUPABASE_DB_URL: directUrl(PRODUCTION_REF, 5432, "production-db-secret-sentinel"),
        SUPABASE_DB_CA_CERT_B64: "raw-ca-secret-sentinel",
        PGSSLMODE: "disable",
        PGSSLROOTCERT: "C:\\attacker\\root.crt",
        PATH: process.env.PATH,
      },
      spawnImpl: (_command, nextArgs, options) => {
        args.push([...nextArgs]);
        childEnvs.push({ ...options.env });
        return successfulCoreQueryResult(childEnvs.length);
      },
      logger,
    });

    expect(status).toBe(EXIT.OK);
    expect(childEnvs).toHaveLength(2);
    for (const childEnv of childEnvs) {
      expect(childEnv.PGSSLMODE).toBe("verify-full");
      expect(childEnv.PGSSLROOTCERT).toBe(tls.SUPABASE_DB_CA_CERT_PATH);
      expect(childEnv).not.toHaveProperty("SUPABASE_DB_CA_CERT_B64");
      expect(JSON.stringify(childEnv)).not.toContain("raw-ca-secret-sentinel");
    }
    expect(JSON.stringify(args)).not.toContain("production-db-secret-sentinel");
    expect(JSON.stringify(args)).not.toContain(tls.SUPABASE_DB_CA_CERT_PATH);
  });

  it("canonicalizes the child URL, strips routing options and ambient env, and queries only tables", () => {
    const canonicalUrl = directUrl(SANDBOX_REF, 5432, "argv-secret-sentinel").replace(
      "?sslmode=require",
      "",
    );
    const url =
      `${canonicalUrl}?sslmode=require&connect_timeout=10` +
      `&host=db.${PRODUCTION_REF}.supabase.co&user=readonly&dbname=app`;
    const calls: Array<{
      command: string;
      args: string[];
      env: Record<string, string | undefined>;
    }> = [];
    const { logger } = captureLogger();

    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: "sandbox",
        SUPABASE_DB_URL: url,
        DATABASE_URL: "postgres://must-not-survive",
        PGHOST: "attacker.invalid",
        PGPASSWORD: "ambient-secret",
        PGSSLMODE: "disable",
        OTHER_PROTECTED_SECRET: "must-not-reach-psql",
        PATH: process.env.PATH,
      },
      spawnImpl: (command, args, options) => {
        calls.push({
          command,
          args: [...args],
          env: { ...options.env },
        });
        return successfulCoreQueryResult(calls.length);
      },
      logger,
    });

    expect(status).toBe(EXIT.OK);
    expect(calls).toHaveLength(2);
    expect(calls[0].command).toBe("psql");
    expect(calls[0].args.join(" ")).not.toContain(url);
    expect(calls[0].args.join(" ")).not.toContain("argv-secret-sentinel");
    expect(calls[0].env.PGDATABASE).toBe("postgres");
    expect(calls[0].env.PGHOST).toBe(`db.${SANDBOX_REF}.supabase.co`);
    expect(calls[0].env.PGPORT).toBe("5432");
    expect(calls[0].env.PGUSER).toBe("postgres");
    expect(calls[0].env.PGPASSWORD).toBe("argv-secret-sentinel");
    expect(calls[0].env.PGSSLMODE).toBe("require");
    expect(calls[0].env.PGGSSENCMODE).toBe("disable");
    expect(calls[0].env.PGDATABASE).not.toContain("?");
    expect(calls[0].env.PGHOST).not.toContain(PRODUCTION_REF);
    expect(calls[0].env.DATABASE_URL).toBeUndefined();
    expect(calls[0].env.OTHER_PROTECTED_SECRET).toBeUndefined();
    const sql = calls[0].args.at(-1) ?? "";
    expect(sql).toContain("c.relkind IN ('r','p')");
    expect(sql).not.toMatch(/c\.relkind IN \([^)]*['"]v['"]/);
    expect(sql).not.toMatch(/c\.relkind IN \([^)]*['"]m['"]/);
    expect(sql).not.toMatch(/c\.relkind IN \([^)]*['"]f['"]/);
    expect(calls[1].args).toContain("--single-transaction");
    expect(calls[1].args.join(" ")).not.toContain(url);
    const catalogSql = calls[1].args.at(-1) ?? "";
    expect(catalogSql).toContain("set transaction read only");
    expect(catalogSql).toContain("pg_get_expr(p.polwithcheck,p.polrelid)");
    expect(catalogSql).not.toContain("p.polwithcheck is null");
    expect(catalogSql).toContain("d1d3c1bab8cfb8d7aed032a1b9efa698");
    expect(exactQuickLogCatalogKeys(PREFLIGHT_SQL)).toEqual(
      QUICKLOG_CATALOG_CONTRACT_KEYS.filter((key) => key !== "manual_delegate_contract"),
    );
    expect(exactQuickLogCatalogKeys(catalogSql)).toEqual(QUICKLOG_CATALOG_CONTRACT_KEYS);
    expect(calls[1].env).toEqual(calls[0].env);
  });

  it("preserves the strongest validated TLS mode while stripping every URL option", () => {
    const canonicalUrl = directUrl(SANDBOX_REF).replace("?sslmode=require", "");
    const url =
      `${canonicalUrl}?sslmode=require&sslmode=verify-full` +
      "&sslmode=verify-ca&application_name=verdant-gate";
    let childEnv: Record<string, string | undefined> | undefined;
    let psqlCalls = 0;
    const { logger } = captureLogger();

    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: "sandbox",
        SUPABASE_DB_URL: url,
        PATH: process.env.PATH,
      },
      spawnImpl: (_command, _args, options) => {
        psqlCalls += 1;
        childEnv = { ...options.env };
        return successfulCoreQueryResult(psqlCalls);
      },
      logger,
    });

    expect(status).toBe(EXIT.OK);
    expect(childEnv?.PGDATABASE).toBe("postgres");
    expect(childEnv?.PGHOST).toBe(`db.${SANDBOX_REF}.supabase.co`);
    expect(childEnv?.PGSSLMODE).toBe("verify-full");
    expect(childEnv?.PGGSSENCMODE).toBe("disable");
  });

  it.each([
    {
      label: "generic sandbox username",
      targetEnv: "sandbox",
      projectRef: SANDBOX_REF,
      port: 5432,
      encodedUsername: "postgres",
    },
    {
      label: "encoded generic production username",
      targetEnv: "production",
      projectRef: PRODUCTION_REF,
      port: 6543,
      encodedUsername: "post%67res",
    },
    {
      label: "wrong-project username rebound to sandbox",
      targetEnv: "sandbox",
      projectRef: SANDBOX_REF,
      port: 5432,
      encodedUsername: `postgres.${PRODUCTION_REF}`,
    },
    {
      label: "custom role rebound to sandbox",
      targetEnv: "sandbox",
      projectRef: SANDBOX_REF,
      port: 6543,
      encodedUsername: "readonly",
    },
    {
      label: "placeholder suffix rebound to production",
      targetEnv: "production",
      projectRef: PRODUCTION_REF,
      port: 5432,
      encodedUsername: "postgres.%5BPROJECT_REF%5D",
    },
  ])(
    "binds $label to $targetEnv on port $port",
    ({ targetEnv, projectRef, port, encodedUsername }) => {
      const sentinel = "shared/secret?# sentinel";
      const url =
        `${genericSharedUrl(port, sentinel, encodedUsername)}` +
        "&host=attacker.invalid&sslmode=verify-full";
      let childEnv: Record<string, string | undefined> | undefined;
      let psqlCalls = 0;
      const { logger, lines } = captureLogger();

      const status = runRequiredCoreMigrationsApplied({
        env: {
          ...(targetEnv === "production" ? productionTlsEnv() : {}),
          TARGET_ENV: targetEnv,
          SUPABASE_DB_URL: url,
          PATH: process.env.PATH,
        },
        spawnImpl: (_command, args, options) => {
          psqlCalls += 1;
          expect(args.join(" ")).not.toContain("shared/secret");
          childEnv = { ...options.env };
          return successfulCoreQueryResult(psqlCalls);
        },
        logger,
      });

      expect(status).toBe(EXIT.OK);
      expect(childEnv?.PGHOST).toBe("aws-0-us-east-1.pooler.supabase.com");
      expect(childEnv?.PGPORT).toBe(String(port));
      expect(childEnv?.PGUSER).toBe(`postgres.${projectRef}`);
      expect(childEnv?.PGPASSWORD).toBe(sentinel);
      expect(childEnv?.PGDATABASE).toBe("postgres");
      expect(childEnv?.PGDATABASE).not.toContain("?");
      expect(childEnv?.PGDATABASE).not.toContain("attacker.invalid");
      expect(childEnv?.PGSSLMODE).toBe("verify-full");
      expect(lines.join("\n")).not.toContain("shared/secret");
    },
  );

  it("suppresses raw psql stderr and secret sentinels from logs and artifacts", () => {
    const sentinel = "RAW-PSQL-SECRET-SENTINEL";
    const url = directUrl(SANDBOX_REF, 5432, sentinel);
    const dir = mkdtempSync(join(tmpdir(), "core-schema-gate-"));
    tempDirs.push(dir);
    const reportPath = join(dir, "report.md");
    const auditPath = join(dir, "audit.json");
    const { logger, lines } = captureLogger();

    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: "sandbox",
        SUPABASE_DB_URL: url,
        REPORT_PATH: reportPath,
        AUDIT_PATH: auditPath,
      },
      spawnImpl: () => ({
        status: 1,
        stdout: "",
        stderr: `psql: could not connect using ${url}`,
      }),
      logger,
    });

    expect(status).toBe(EXIT.SCHEMA_QUERY_FAILED);
    const observable = [
      ...lines,
      readFileSync(reportPath, "utf8"),
      readFileSync(auditPath, "utf8"),
    ].join("\n");
    expect(observable).not.toContain(sentinel);
    expect(observable).not.toContain(url);
    expect(observable).not.toContain("could not connect using");
    expect(observable).toContain("stderr was suppressed");
  });

  /**
   * Suppressing stderr is correct, but it left the report saying only "the
   * target schema remains unknown" for BOTH a rejected query and a database
   * the runner could never reach. The sandbox gate burned six red pushes on
   * exactly that ambiguity. psql's exit status is a small integer with no
   * credential content, so publishing it — and only it — restores the
   * diagnosis without weakening the secret boundary.
   */
  describe("publishes psql's exit status so a dead connection is diagnosable", () => {
    function runWithPsqlStatus(psqlStatus: number) {
      const sentinel = "STATUS-PROBE-SECRET-SENTINEL";
      const url = directUrl(SANDBOX_REF, 5432, sentinel);
      const dir = mkdtempSync(join(tmpdir(), "core-schema-gate-"));
      tempDirs.push(dir);
      const reportPath = join(dir, "report.md");
      const auditPath = join(dir, "audit.json");
      const { logger, lines } = captureLogger();

      const status = runRequiredCoreMigrationsApplied({
        env: {
          TARGET_ENV: "sandbox",
          SUPABASE_DB_URL: url,
          REPORT_PATH: reportPath,
          AUDIT_PATH: auditPath,
        },
        spawnImpl: () => ({
          status: psqlStatus,
          stdout: "",
          // A hostile or merely careless psql can echo the whole URI here.
          stderr: `psql: connection to ${url} failed: FATAL: password authentication failed`,
        }),
        logger,
      });

      return {
        status,
        report: readFileSync(reportPath, "utf8"),
        audit: readFileSync(auditPath, "utf8"),
        observable: [
          ...lines,
          readFileSync(reportPath, "utf8"),
          readFileSync(auditPath, "utf8"),
        ].join("\n"),
        sentinel,
        url,
      };
    }

    it("names status 2 as a bad connection, not schema drift", () => {
      const { status, report } = runWithPsqlStatus(2);
      expect(status).toBe(EXIT.SCHEMA_QUERY_FAILED);
      expect(report).toContain("psql exit status: 2.");
      expect(report).toMatch(/CONNECTION to the server went bad/);
      // The whole point: stop the operator from chasing migrations that are fine.
      expect(report).toMatch(/rather than schema drift/i);
    });

    /**
     * psql returns 2 both when the connection was never established AND when an
     * established session dropped mid-query — the exit code cannot tell them
     * apart. An earlier draft of this hint asserted "the query never ran", which
     * would send an operator to host/port config for what may have been a
     * server-side termination. The copy must stay agnostic.
     */
    it("does not claim the query never ran at status 2", () => {
      const { report } = runWithPsqlStatus(2);
      expect(report).not.toMatch(/never ran|never executed|did not run|never began/i);
      // It must still say the gate has no verdict — agnostic, not silent.
      expect(report).toMatch(/no verdict/i);
      // And it must name both possibilities rather than only the first.
      expect(report).toMatch(/never established/i);
      expect(report).toMatch(/session was lost/i);
    });

    it("names status 3 as a rejected query on a live connection", () => {
      const { status, report } = runWithPsqlStatus(3);
      expect(status).toBe(EXIT.SCHEMA_QUERY_FAILED);
      expect(report).toContain("psql exit status: 3.");
      expect(report).toMatch(/connection itself succeeded/);
    });

    it("records the status in the audit trail too", () => {
      const { audit } = runWithPsqlStatus(2);
      expect(audit).toContain("schema_query_failed");
      expect(audit).toContain("(2)");
    });

    it("still leaks nothing from stderr at any status", () => {
      for (const psqlStatus of [1, 2, 3, 127]) {
        const { observable, sentinel, url } = runWithPsqlStatus(psqlStatus);
        expect(observable, `status ${psqlStatus}`).not.toContain(sentinel);
        expect(observable, `status ${psqlStatus}`).not.toContain(url);
        expect(observable, `status ${psqlStatus}`).not.toContain("password authentication failed");
        expect(observable, `status ${psqlStatus}`).toContain("stderr was suppressed");
      }
    });
  });
});

describe("required-core-migrations workflow trust boundary", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  const manifestStart = workflow.indexOf("  manifest-and-files:");
  const sandboxStart = workflow.indexOf("  verify-sandbox:");
  const productionStart = workflow.indexOf("  verify-production:");
  const manifestBlock = workflow.slice(manifestStart, sandboxStart);
  const sandboxBlock = workflow.slice(sandboxStart, productionStart);
  const productionBlock = workflow.slice(productionStart);

  it("reruns when any transitive Quick Log catalog dependency changes", () => {
    for (const path of [
      "scripts/apply-quicklog-corrections-retractions.mjs",
      "scripts/apply-pinned-production-migrations.mjs",
      "scripts/lib/candidateNumberToolRuntime.mjs",
    ]) {
      expect(workflow).toContain(`- "${path}"`);
    }
  });

  it("gives pull requests one offline job with no remote secret or environment", () => {
    expect(workflow).toMatch(/\n {2}pull_request:\s*\n/);
    expect(manifestStart).toBeGreaterThan(0);
    expect(sandboxStart).toBeGreaterThan(manifestStart);
    expect(manifestBlock).not.toContain("secrets.");
    expect(manifestBlock).not.toMatch(/\n {4}environment:/);
    expect(manifestBlock).toContain("src/test/required-core-migrations-gate.test.ts");
  });

  it("allows sandbox remote access only on the deploy branch or manual dispatch", () => {
    expect(sandboxBlock).toContain(
      "github.event_name == 'push' && github.ref == 'refs/heads/verdant-grow-diary'",
    );
    expect(sandboxBlock).toContain(
      "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/verdant-grow-diary' && inputs.target_env == 'sandbox'",
    );
    expect(sandboxBlock).not.toContain("pull_request");
    expect(sandboxBlock).toContain("environment: verdant-sandbox");
    expect(sandboxBlock.match(/secrets\.SUPABASE_DB_URL_SANDBOX/g)).toHaveLength(2);
    expect(sandboxBlock).not.toMatch(/SUPABASE_DB_URL:\s*\$\{\{\s*secrets\.SUPABASE_DB_URL\s*\}\}/);
  });

  it("allows production remote access only by manual dispatch from the deploy branch", () => {
    expect(productionBlock).toContain("github.ref == 'refs/heads/verdant-grow-diary'");
    expect(productionBlock).toContain(
      "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/verdant-grow-diary' && inputs.target_env == 'production'",
    );
    expect(productionBlock).not.toContain("github.event_name == 'push'");
    expect(productionBlock).not.toContain("pull_request");
    expect(productionBlock).toContain("environment: verdant-production");
    expect(productionBlock).toContain("secrets.SUPABASE_DB_URL");
  });

  it("keeps advisory drift warning-only without weakening either blocking core step", () => {
    for (const remoteBlock of [sandboxBlock, productionBlock]) {
      const blockingStart = remoteBlock.indexOf("- name: Verify blocking core schema");
      const advisoryStart = remoteBlock.indexOf("- name: Verify advisory schema");
      const publishStart = remoteBlock.indexOf("- name: Publish sanitized reports");
      const blockingStep = remoteBlock.slice(blockingStart, advisoryStart);
      const advisoryStep = remoteBlock.slice(advisoryStart, publishStart);

      expect(blockingStart).toBeGreaterThan(0);
      expect(advisoryStart).toBeGreaterThan(blockingStart);
      expect(publishStart).toBeGreaterThan(advisoryStart);
      expect(blockingStep).not.toContain("continue-on-error");
      expect(blockingStep).not.toContain("MANIFEST_SCOPE");
      expect(advisoryStep).toContain("continue-on-error: true");
      expect(advisoryStep).toContain("MANIFEST_SCOPE: advisory");
    }
  });

  it("never references the retired live repository secret", () => {
    expect(workflow).not.toContain("SUPABASE_DB_URL_LIVE");
  });
});
