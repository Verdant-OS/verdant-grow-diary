import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rootCertificates } from "node:tls";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { PRODUCTION_SUPABASE_CA_FILENAME } from "../../scripts/lib/productionSupabaseTls.mjs";

const RUNNER_PATH = resolve("scripts/apply-signup-acquisition-forward-repair.mjs");
const WORKFLOW_PATH = resolve(".github/workflows/apply-signup-acquisition-forward-repair.yml");
const RUNBOOK_PATH = resolve("docs/signup-attribution-outage-operator-runbook.md");
const MIGRATION_PATH = resolve(
  "supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql",
);

const EXPECTED_SHA256 = "6C002AB676218C32C27E41E7A8E90FF4F452C41D7EDB446B0FCB950B93D3DEBA";
const EXPECTED_HEAD_SHA = "a".repeat(40);
const ADVANCED_HEAD_SHA = "c".repeat(40);
const EXPECTED_ABSENT_RECEIPT_DIGEST =
  "9a5b5d0bab0fe477b6303d244f6678a3d67278c7f8a3a3fb61ea3069a9a49b3e";
const EXPECTED_LIVE_RECEIPT_DIGEST =
  "bb2ac1075e9c5c105d40955ea25b822c257ac38c39a7c4f93420389cbeef6c6b";
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const APPLY_CONFIRMATION = "APPLY SIGNUP ACQUISITION FORWARD REPAIR";
const FULL_MIGRATION_STEM = "20260813030000_signup_acquisition_forward_repair";
const EXPECTED_LEDGER_NAMES = ["signup_acquisition_forward_repair", FULL_MIGRATION_STEM];
const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
const EXPECTED_REPOSITORY_ID = "123456789";
const EXPECTED_WORKFLOW_PATH = ".github/workflows/apply-signup-acquisition-forward-repair.yml";
const EXPECTED_RUN_ID = "99887766";
const EXPECTED_RUN_ATTEMPT = "1";
const DATABASE_SECRET = "signup-repair-database-secret";
const DATABASE_URL = `postgres://postgres:${DATABASE_SECRET}@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`;
const RAW_CA_SECRET_SENTINEL = "raw-ca-secret-must-not-reach-psql";
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

const EXPECTED_SOURCES = [
  "blueprint_targets",
  "context_check",
  "csv_history",
  "founder_page",
  "founder_share",
  "grower_invite",
  "landing_page",
  "operator_outreach",
  "pricing_interest_share",
  "pricing_page",
  "vpd_calculator",
] as const;

const EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS = {
  handle_new_user: { md5: "d7a62d761a50cc4a4783242a37b039ed", bytes: 2197 },
  record_signup_acquisition_first_touch: {
    md5: "3a48b1c40e4e73177f13e5c7092fa4bf",
    bytes: 996,
  },
  signup_acquisition_operator_snapshot: {
    md5: "47ef35bbef7d59de3211f4cb6ecc383b",
    bytes: 2761,
  },
  signup_to_paid_operator_snapshot: {
    md5: "c5fd7770fb47b299d1460441777a77ed",
    bytes: 4240,
  },
} as const;

const EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS = {
  generate_referral_code: { md5: "3d8c98ed4f79632a2704e28731f2e091", bytes: 690 },
  convert_referral: { md5: "45bc9b61dd7019db6e5273914880d112", bytes: 2568 },
  has_role: { md5: "d1d3c1bab8cfb8d7aed032a1b9efa698", bytes: 300 },
} as const;

const EXPECTED_DATABASE_FINGERPRINTS = {
  source_check: { md5: "01b8bcc5e882ec68c9bf8641ec6845d0", bytes: 294 },
  signup_trigger: { md5: "786e53a33077b3a68f1ec248e238d18a", bytes: 110 },
  primary_key: { md5: "0a0db78b5fb70bf8475b3bd434e6842b" },
  foreign_key: { md5: "85d8b2f5f0c0f6b4dcb854efb61a8cb1" },
} as const;

const EXPECTED_PREREQUISITE_COLUMNS = {
  "auth.users": {
    id: "uuid",
    raw_user_meta_data: "jsonb",
    created_at: "timestamp with time zone",
    email: "character varying",
    email_confirmed_at: "timestamp with time zone",
  },
  "public.profiles": {
    user_id: "uuid",
    display_name: "text",
    marketing_opt_in: "boolean",
    marketing_opt_in_at: "timestamp with time zone",
    referral_code: "text",
    created_at: "timestamp with time zone",
  },
  "public.subscriptions": {
    user_id: "uuid",
    price_id: "text",
    created_at: "timestamp with time zone",
    environment: "text",
    status: "text",
    paddle_subscription_id: "text",
    current_period_end: "timestamp with time zone",
  },
  "public.user_roles": {
    user_id: "uuid",
    role: "public.app_role",
  },
} as const;

const LIVE_PREREQUISITES = Object.freeze({
  auth_users_contract: true,
  creation_default_acl_contract: true,
  migration_ledger_contract: true,
  profiles_contract: true,
  profiles_insert_contract: true,
  profiles_user_id_conflict_contract: true,
  profiles_referral_code_index_contract: true,
  subscriptions_contract: true,
  app_role_contract: true,
  dependency_functions_contract: true,
  dependency_security_contract: true,
  target_functions_preapply_contract: true,
  user_roles_contract: true,
  signup_trigger_contract: true,
});

const LIVE_SCHEMA = Object.freeze({
  ...LIVE_PREREQUISITES,
  table_exists: true,
  target_relation_contract: true,
  target_owner_preapply_contract: true,
  object_owner_contract: true,
  row_security_enabled: true,
  table_columns_contract: true,
  primary_key_contract: true,
  foreign_key_contract: true,
  target_constraints_preapply_contract: true,
  target_constraints_exact_contract: true,
  target_index_contract: true,
  target_triggers_rules_contract: true,
  target_existing_values_contract: true,
  target_acl_preapply_contract: true,
  target_acl_exact_contract: true,
  source_check_contract: true,
  no_policies_contract: true,
  constraint_sources: [...EXPECTED_SOURCES],
  handle_new_user_contract: true,
  first_touch_contract: true,
  acquisition_snapshot_contract: true,
  paid_snapshot_contract: true,
  retired_billing_branch_absent: true,
  client_access_contract: true,
  ledger_statements_contract: true,
});

const ABSENT_SCHEMA = Object.freeze({
  ...LIVE_PREREQUISITES,
  table_exists: false,
  target_relation_contract: false,
  target_owner_preapply_contract: false,
  object_owner_contract: false,
  row_security_enabled: false,
  table_columns_contract: false,
  primary_key_contract: false,
  foreign_key_contract: false,
  target_constraints_preapply_contract: false,
  target_constraints_exact_contract: false,
  target_index_contract: false,
  target_triggers_rules_contract: false,
  target_existing_values_contract: false,
  target_acl_preapply_contract: false,
  target_acl_exact_contract: false,
  source_check_contract: false,
  no_policies_contract: true,
  constraint_sources: [],
  handle_new_user_contract: false,
  first_touch_contract: false,
  acquisition_snapshot_contract: false,
  paid_snapshot_contract: false,
  retired_billing_branch_absent: false,
  client_access_contract: false,
  ledger_statements_contract: false,
});

function preflightStdout({
  exact = 0,
  conflicts = 0,
  exactNames = exact === 1 ? ["signup_acquisition_forward_repair"] : [],
  schema = ABSENT_SCHEMA,
}: {
  exact?: number;
  conflicts?: number;
  exactNames?: string[];
  schema?: typeof ABSENT_SCHEMA | typeof LIVE_SCHEMA | Record<string, unknown>;
} = {}) {
  return `${JSON.stringify({
    ledger_exact_count: exact,
    ledger_conflict_count: conflicts,
    ledger_exact_names: exactNames,
    ...schema,
  })}\n`;
}

const temporaryRoots: string[] = [];

function productionTlsEnv() {
  const root = mkdtempSync(join(tmpdir(), "verdant-signup-repair-tls-test-"));
  temporaryRoots.push(root);
  const caPath = join(root, PRODUCTION_SUPABASE_CA_FILENAME);
  const testCa = rootCertificates[0];
  if (!testCa) throw new Error("Node did not provide a test root certificate.");
  writeFileSync(caPath, testCa, { mode: 0o600 });
  return {
    RUNNER_TEMP: root,
    SUPABASE_DB_CA_CERT_PATH: caPath,
    SUPABASE_DB_CA_CERT_B64: RAW_CA_SECRET_SENTINEL,
  };
}

function baseEnv(extra: Record<string, string> = {}) {
  return {
    OPERATION: "APPLY",
    TARGET_ENV: "production",
    EXPECTED_HEAD_SHA,
    GITHUB_SHA: EXPECTED_HEAD_SHA,
    CURRENT_DEPLOY_HEAD_SHA: EXPECTED_HEAD_SHA,
    PREFLIGHT_RECEIPT_DIGEST: EXPECTED_ABSENT_RECEIPT_DIGEST,
    CONFIRM_PROJECT_REF: PRODUCTION_PROJECT_REF,
    CONFIRM_APPLY: APPLY_CONFIRMATION,
    SUPABASE_DB_URL: DATABASE_URL,
    GITHUB_REPOSITORY: EXPECTED_REPOSITORY,
    GITHUB_REPOSITORY_ID: EXPECTED_REPOSITORY_ID,
    GITHUB_WORKFLOW_REF: `${EXPECTED_REPOSITORY}/${EXPECTED_WORKFLOW_PATH}@refs/heads/verdant-grow-diary`,
    GITHUB_RUN_ID: EXPECTED_RUN_ID,
    GITHUB_RUN_ATTEMPT: EXPECTED_RUN_ATTEMPT,
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF_NAME: "verdant-grow-diary",
    SOLO_FOUNDER_ACKNOWLEDGEMENT,
    ...SOLO_FOUNDER_AUTHORIZATION_ENV,
    PATH: process.env.PATH ?? "",
    ...productionTlsEnv(),
    ...extra,
  };
}

async function loadRunner() {
  try {
    return await import(`${pathToFileURL(RUNNER_PATH).href}?test=${Date.now()}`);
  } catch (error) {
    expect.fail(
      `signup-acquisition repair runner could not be imported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function temporaryEvidenceEnv() {
  const root = mkdtempSync(join(tmpdir(), "verdant-signup-repair-test-"));
  temporaryRoots.push(root);
  return {
    root,
    reportPath: join(root, "report.md"),
    auditPath: join(root, "audit.json"),
    preflightReceiptPath: join(root, "preflight-receipt.json"),
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("signup-acquisition forward-repair migration pin", () => {
  it("accepts only the reviewed filename, version, name, and exact LF byte hash", async () => {
    const runner = await loadRunner();
    const migration = runner.validatePinnedMigrationFile();

    expect(runner.PINNED_MIGRATION).toEqual({
      version: "20260813030000",
      name: "signup_acquisition_forward_repair",
      file: "20260813030000_signup_acquisition_forward_repair.sql",
      sha256: EXPECTED_SHA256,
    });
    expect(migration.text).toBe(readFileSync(MIGRATION_PATH, "utf8"));
    expect(migration.text.endsWith("\n")).toBe(true);
    expect(migration.text).not.toContain("\r");
  });

  it("rejects one changed migration byte before any database access", async () => {
    const runner = await loadRunner();
    const raw = readFileSync(MIGRATION_PATH);
    const changed = Buffer.from(raw);
    changed[0] ^= 1;

    expect(() => runner.validatePinnedMigrationFile({ readFile: () => changed })).toThrow(
      /hash_mismatch:20260813030000/,
    );
  });

  it("builds one transaction-owned unit containing the exact migration and exact ledger row", async () => {
    const runner = await loadRunner();
    const migration = runner.validatePinnedMigrationFile();
    const sql = runner.buildApplySql(migration);

    expect(sql).toContain(migration.text);
    expect(sql).toContain("set transaction isolation level read committed;");
    expect(sql).toContain("set local search_path = pg_catalog, public, pg_temp;");
    expect(sql.indexOf("set local search_path = pg_catalog, public, pg_temp;")).toBeLessThan(
      sql.indexOf("lock table supabase_migrations.schema_migrations"),
    );
    expect(sql).not.toContain("set local search_path = public, pg_catalog;");
    expect(sql).toContain("lock table supabase_migrations.schema_migrations");
    expect(sql).toContain("lock table auth.users in share row exclusive mode;");
    expect(sql).toContain("lock table public.profiles in share row exclusive mode;");
    expect(sql.indexOf("lock table auth.users in share row exclusive mode;")).toBeLessThan(
      sql.indexOf(`-- BEGIN EXACT PINNED FILE: ${runner.PINNED_MIGRATION.file}`),
    );
    expect(sql).toContain("where sm.version = '20260813030000'");
    expect(sql).toContain("or sm.name = 'signup_acquisition_forward_repair'");
    expect(sql).toContain(`or sm.name = '${FULL_MIGRATION_STEM}'`);
    expect(sql).toMatch(/set local lock_timeout = '[1-9][0-9]*s';/);
    expect(sql).toMatch(/set local statement_timeout = '[1-9][0-9]*s';/);
    expect(sql).toContain("insert into supabase_migrations.schema_migrations");
    expect(sql).toContain("'20260813030000', 'signup_acquisition_forward_repair'");
    expect(sql).toContain(EXPECTED_SHA256);
    expect(runner.findUnsafeSqlReason(sql)).toBeNull();
    const migrationEnd = sql.indexOf(`-- END EXACT PINNED FILE: ${runner.PINNED_MIGRATION.file}`);
    const aclNormalization = sql.indexOf(
      "revoke all on table public.signup_acquisition_attributions from service_role;",
    );
    const aclPostcondition = sql.indexOf("$signup_acquisition_locked_acl_postcondition$");
    const ledgerInsert = sql.indexOf("insert into supabase_migrations.schema_migrations");
    expect(migrationEnd).toBeLessThan(aclNormalization);
    expect(aclNormalization).toBeLessThan(aclPostcondition);
    expect(aclPostcondition).toBeLessThan(ledgerInsert);
    expect(sql).toContain(
      "revoke all on function public.record_signup_acquisition_first_touch(text) from service_role;",
    );
    expect(sql).toContain(
      "revoke all on function public.signup_acquisition_operator_snapshot() from service_role;",
    );
    expect(sql).toContain(
      "revoke all on function public.signup_to_paid_operator_snapshot() from service_role;",
    );
    expect(sql).toContain("revoke all on function public.handle_new_user() from service_role;");
    expect(sql).toContain("acl-normalization=v1;service_role=revoked");
  });

  it("pins the four isolated-Postgres pg_get_functiondef fingerprints exactly", async () => {
    const runner = await loadRunner();

    expect(runner.EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS).toEqual(
      EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS,
    );
  });

  it("pins the three security-relevant dependency definitions for PostgreSQL 15 ratification", async () => {
    const runner = await loadRunner();

    expect(runner.EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS).toEqual(
      EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS,
    );
  });

  it("pins the measured CHECK, trigger, primary-key, and foreign-key definitions", async () => {
    const runner = await loadRunner();

    expect(runner.EXPECTED_DATABASE_FINGERPRINTS).toEqual(EXPECTED_DATABASE_FINGERPRINTS);
  });

  it("treats the bare slug and full migration stem as exact name-bound ledger identities", async () => {
    const runner = await loadRunner();

    expect(runner.ACCEPTED_LEDGER_NAMES).toEqual(EXPECTED_LEDGER_NAMES);
  });

  it("pins every prerequisite relation column and type used by the migration", async () => {
    const runner = await loadRunner();

    expect(runner.REQUIRED_PREREQUISITE_COLUMNS).toEqual(EXPECTED_PREREQUISITE_COLUMNS);
  });

  it("enumerates every target index so an unexpected plain index cannot bypass preflight", async () => {
    const runner = await loadRunner();

    expect(runner.PREFLIGHT_SQL).toContain("target_index_rows as (");
    expect(runner.PREFLIGHT_SQL).not.toMatch(
      /target_index_rows as \([\s\S]*?where idx\.indisunique or idx\.indisexclusion[\s\S]*?\),/i,
    );
  });
});

describe("signup-acquisition forward-repair read-only preflight", () => {
  it("classifies an absent exact ledger target and absent target table as apply", async () => {
    const runner = await loadRunner();
    const parsed = runner.parsePreflightStdout(preflightStdout());

    expect(runner.classifyPreflight(parsed)).toEqual({ status: "apply" });
  });

  it("allows only a structurally compatible partial target table before apply", async () => {
    const runner = await loadRunner();
    const compatiblePartial = {
      ...ABSENT_SCHEMA,
      table_exists: true,
      target_relation_contract: true,
      target_owner_preapply_contract: true,
      table_columns_contract: true,
      primary_key_contract: true,
      foreign_key_contract: true,
      target_constraints_preapply_contract: true,
      target_index_contract: true,
      target_triggers_rules_contract: true,
      target_existing_values_contract: true,
      target_acl_preapply_contract: true,
      no_policies_contract: true,
    };

    expect(
      runner.classifyPreflight(
        runner.parsePreflightStdout(preflightStdout({ schema: compatiblePartial })),
      ),
    ).toEqual({ status: "apply" });

    for (const contract of [
      "table_columns_contract",
      "target_relation_contract",
      "target_owner_preapply_contract",
      "primary_key_contract",
      "foreign_key_contract",
      "target_constraints_preapply_contract",
      "target_index_contract",
      "target_triggers_rules_contract",
      "target_existing_values_contract",
      "target_acl_preapply_contract",
      "no_policies_contract",
    ] as const) {
      const incompatible = { ...compatiblePartial, [contract]: false };
      expect(
        runner.classifyPreflight(
          runner.parsePreflightStdout(preflightStdout({ schema: incompatible })),
        ),
      ).toEqual({
        status: "prerequisite_drift",
        reason: "target_table_incompatible",
      });
    }
  });

  it("fails closed for every non-repairable partial-target hazard", async () => {
    const runner = await loadRunner();
    const compatiblePartial = {
      ...ABSENT_SCHEMA,
      table_exists: true,
      target_relation_contract: true,
      target_owner_preapply_contract: true,
      table_columns_contract: true,
      primary_key_contract: true,
      foreign_key_contract: true,
      target_constraints_preapply_contract: true,
      target_index_contract: true,
      target_triggers_rules_contract: true,
      target_existing_values_contract: true,
      target_acl_preapply_contract: true,
      no_policies_contract: true,
    };

    for (const contract of [
      "target_relation_contract", // FORCE RLS, partitioned, or unlogged
      "target_owner_preapply_contract",
      "target_constraints_preapply_contract", // CHECK(false), UNIQUE, FK, or EXCLUDE
      "target_index_contract", // standalone UNIQUE(source)
      "target_triggers_rules_contract",
      "target_existing_values_contract", // CHECK replacement must not encounter bad rows
      "target_acl_preapply_contract",
    ] as const) {
      expect(
        runner.classifyPreflight(
          runner.parsePreflightStdout(
            preflightStdout({ schema: { ...compatiblePartial, [contract]: false } }),
          ),
        ),
      ).toEqual({ status: "prerequisite_drift", reason: "target_table_incompatible" });
    }
  });

  it("classifies one exact ledger row plus the full schema contract as verify-only", async () => {
    const runner = await loadRunner();
    const parsed = runner.parsePreflightStdout(preflightStdout({ exact: 1, schema: LIVE_SCHEMA }));

    expect(runner.classifyPreflight(parsed)).toEqual({ status: "verify_only" });
  });

  it("refuses a version or name collision rather than applying", async () => {
    const runner = await loadRunner();
    const parsed = runner.parsePreflightStdout(preflightStdout({ conflicts: 1 }));

    expect(runner.classifyPreflight(parsed)).toEqual({
      status: "ledger_drift",
      reason: "target_collision",
    });
  });

  it("refuses an exact ledger row whose schema effect has drifted", async () => {
    const runner = await loadRunner();
    const parsed = runner.parsePreflightStdout(
      preflightStdout({ exact: 1, schema: { ...LIVE_SCHEMA, paid_snapshot_contract: false } }),
    );

    expect(runner.classifyPreflight(parsed)).toEqual({
      status: "schema_drift",
      reason: "recorded_effect_mismatch",
    });
  });

  it("refuses apply when any required table, column, role, dependency, or trigger is absent", async () => {
    const runner = await loadRunner();

    for (const prerequisite of Object.keys(LIVE_PREREQUISITES)) {
      const parsed = runner.parsePreflightStdout(
        preflightStdout({
          schema: { ...ABSENT_SCHEMA, [prerequisite]: false },
        }),
      );
      expect(runner.classifyPreflight(parsed)).toEqual({
        status: "prerequisite_drift",
        reason: prerequisite,
      });
    }
  });

  it("requires usable exact profiles.user_id conflict support and pinned dependency security", async () => {
    const runner = await loadRunner();

    for (const prerequisite of [
      "profiles_user_id_conflict_contract",
      "profiles_referral_code_index_contract",
      "dependency_security_contract",
    ] as const) {
      const parsed = runner.parsePreflightStdout(
        preflightStdout({ schema: { ...ABSENT_SCHEMA, [prerequisite]: false } }),
      );
      expect(runner.classifyPreflight(parsed)).toEqual({
        status: "prerequisite_drift",
        reason: prerequisite,
      });
    }

    for (const { md5, bytes } of Object.values(EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS)) {
      expect(runner.PREFLIGHT_SQL).toContain(md5);
      expect(runner.PREFLIGHT_SQL).toContain(String(bytes));
    }
  });

  it("blocks an omitted required profile column and a missing has_role relation dependency", async () => {
    const runner = await loadRunner();

    expect(
      runner.classifyPreflight(
        runner.parsePreflightStdout(
          preflightStdout({ schema: { ...ABSENT_SCHEMA, profiles_insert_contract: false } }),
        ),
      ),
    ).toEqual({ status: "prerequisite_drift", reason: "profiles_insert_contract" });
    expect(
      runner.classifyPreflight(
        runner.parsePreflightStdout(
          preflightStdout({ schema: { ...ABSENT_SCHEMA, user_roles_contract: false } }),
        ),
      ),
    ).toEqual({ status: "prerequisite_drift", reason: "user_roles_contract" });
    expect(runner.PREFLIGHT_SQL).toContain("a.attnotnull and not a.atthasdef");
    expect(runner.PREFLIGHT_SQL).toContain("public.user_roles");
  });

  it("pins every insert-affecting profiles surface instead of accepting type-only compatibility", async () => {
    const runner = await loadRunner();
    const sql = runner.PREFLIGHT_SQL;

    expect(sql).toContain("profiles_supplied_columns_contract");
    expect(sql).toContain("profiles_insert_constraints_contract");
    expect(sql).toContain("profiles_insert_indexes_contract");
    expect(sql).toContain("array_agg(index_class.relname::text order by index_class.relname)");
    expect(sql).toContain("profiles_insert_triggers_rules_contract");
    expect(sql).toContain("marketing_opt_in_at|timestamp with time zone|f|||");
    expect(sql).toContain("marketing_opt_in|boolean|t|false||");
    expect(sql).toContain("created_at|timestamp with time zone|t|now()||");
    expect(sql).toContain("nugs_total|bigint|t|0||");
    expect(sql).toContain("updated_at|timestamp with time zone|t|now()||");
    expect(sql).toContain("tier|text|t|''seedling''::text||");
    expect(sql).toContain("contype in ('c','u','x','f')");
    expect(sql).toContain("not con.convalidated");
    expect(sql).toContain("profiles_referral_code_uq");
    expect(sql).toContain("profiles_pkey");
    expect(sql).toContain("(tg.tgtype & 4) = 4");
    expect(sql).toContain("rw.ev_type = '3'");
  });

  it("requires an exact safe migration-ledger surface before either read classification or apply", async () => {
    const runner = await loadRunner();
    const parsed = runner.parsePreflightStdout(
      preflightStdout({ schema: { ...ABSENT_SCHEMA, migration_ledger_contract: false } }),
    );

    expect(runner.classifyPreflight(parsed)).toEqual({
      status: "prerequisite_drift",
      reason: "migration_ledger_contract",
    });
    expect(runner.PREFLIGHT_SQL).toContain("migration_ledger_contract");
    expect(runner.PREFLIGHT_SQL).toContain("supabase_migrations.schema_migrations");
    expect(runner.PREFLIGHT_SQL).toContain("schema_migrations_pkey");
    expect(runner.PREFLIGHT_SQL).toContain("1|version|text|t|||");
    expect(runner.PREFLIGHT_SQL).toContain("2|name|text|f|||");
    expect(runner.PREFLIGHT_SQL).toContain("3|statements|text[]|f|||");
    expect(runner.PREFLIGHT_SQL).toContain("acldefault('r', ledger.relowner)");
    expect(runner.PREFLIGHT_SQL).toContain("not ledger.relrowsecurity");
    expect(runner.PREFLIGHT_SQL).toContain("not ledger.relforcerowsecurity");
    const applySql = runner.buildApplySql(runner.validatePinnedMigrationFile());
    expect(applySql).toContain("$signup_acquisition_locked_prerequisite_guard$");
    expect(applySql).toContain("$signup_acquisition_locked_profiles_guard$");
    expect(applySql).toContain("idx.indexrelid = pk.conindid");
    expect(applySql).toContain("user_id_attribute.attname = 'user_id'");
    expect(applySql).toContain("referral_code_attribute.attname = 'referral_code'");
  });

  it("binds creation defaults and wrapper normalization into the receipt state", async () => {
    const runner = await loadRunner();

    expect(runner.PREFLIGHT_SQL).toContain("creation_default_acl_contract");
    expect(runner.PREFLIGHT_SQL).toContain("pg_default_acl");
    expect(runner.PREFLIGHT_SQL).toContain("ledger_statements_contract");
    expect(
      runner.classifyPreflight(
        runner.parsePreflightStdout(
          preflightStdout({
            schema: { ...ABSENT_SCHEMA, creation_default_acl_contract: false },
          }),
        ),
      ),
    ).toEqual({ status: "prerequisite_drift", reason: "creation_default_acl_contract" });
    expect(
      runner.classifyPreflight(
        runner.parsePreflightStdout(
          preflightStdout({
            exact: 1,
            schema: { ...LIVE_SCHEMA, ledger_statements_contract: false },
          }),
        ),
      ),
    ).toEqual({ status: "schema_drift", reason: "recorded_effect_mismatch" });
  });

  it("blocks replaceable-function owner or ACL state the migration cannot normalize", async () => {
    const runner = await loadRunner();
    const parsed = runner.parsePreflightStdout(
      preflightStdout({
        schema: { ...ABSENT_SCHEMA, target_functions_preapply_contract: false },
      }),
    );

    expect(runner.classifyPreflight(parsed)).toEqual({
      status: "prerequisite_drift",
      reason: "target_functions_preapply_contract",
    });
    expect(runner.PREFLIGHT_SQL).toContain("target_functions_preapply_contract");
    expect(runner.PREFLIGHT_SQL).toContain("aclexplode");
    const functionPreapply = runner.PREFLIGHT_SQL.slice(
      runner.PREFLIGHT_SQL.indexOf("'target_functions_preapply_contract'"),
      runner.PREFLIGHT_SQL.indexOf("'dependency_security_contract'"),
    );
    expect(functionPreapply).toContain("'service_role'");
    expect(functionPreapply).toContain("acl.privilege_type <> 'EXECUTE'");
    expect(functionPreapply).toContain("grantor.rolname <> 'postgres'");
  });

  it("makes every exact function-definition fingerprint part of the live contract", async () => {
    const runner = await loadRunner();
    const fingerprintContracts = [
      "handle_new_user_contract",
      "first_touch_contract",
      "acquisition_snapshot_contract",
      "paid_snapshot_contract",
    ] as const;

    for (const contract of fingerprintContracts) {
      const parsed = runner.parsePreflightStdout(
        preflightStdout({ exact: 1, schema: { ...LIVE_SCHEMA, [contract]: false } }),
      );
      expect(runner.classifyPreflight(parsed)).toEqual({
        status: "schema_drift",
        reason: "recorded_effect_mismatch",
      });
    }

    for (const { md5, bytes } of Object.values(EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS)) {
      expect(runner.PREFLIGHT_SQL).toContain(md5);
      expect(runner.PREFLIGHT_SQL).toContain(String(bytes));
    }
    expect(runner.PREFLIGHT_SQL).toContain("md5(pg_get_functiondef");
    expect(runner.PREFLIGHT_SQL).toContain("octet_length(pg_get_functiondef");
  });

  it("rejects any table, constraint, retired-branch, or client-access contract drift", async () => {
    const runner = await loadRunner();
    const contracts = [
      "row_security_enabled",
      "target_relation_contract",
      "object_owner_contract",
      "table_columns_contract",
      "primary_key_contract",
      "foreign_key_contract",
      "target_constraints_exact_contract",
      "target_index_contract",
      "target_triggers_rules_contract",
      "target_existing_values_contract",
      "target_acl_exact_contract",
      "source_check_contract",
      "no_policies_contract",
      "retired_billing_branch_absent",
      "client_access_contract",
    ] as const;

    for (const contract of contracts) {
      const parsed = runner.parsePreflightStdout(
        preflightStdout({ exact: 1, schema: { ...LIVE_SCHEMA, [contract]: false } }),
      );
      expect(runner.classifyPreflight(parsed)).toEqual({
        status: "schema_drift",
        reason: "recorded_effect_mismatch",
      });
    }

    for (const fingerprint of Object.values(EXPECTED_DATABASE_FINGERPRINTS)) {
      expect(runner.PREFLIGHT_SQL).toContain(fingerprint.md5);
      if ("bytes" in fingerprint) {
        expect(runner.PREFLIGHT_SQL).toContain(String(fingerprint.bytes));
      }
    }
  });

  it("requires exactly one complete JSON result row and exact schema field types", async () => {
    const runner = await loadRunner();

    expect(() => runner.parsePreflightStdout("{}\n{}\n")).toThrow(/preflight_row_count/);
    expect(() =>
      runner.parsePreflightStdout(
        preflightStdout({
          schema: { ...LIVE_SCHEMA, row_security_enabled: "true" },
        }),
      ),
    ).toThrow(/preflight_result_shape/);
  });

  it("defines a transaction-enforced read-only query with no DML", async () => {
    const runner = await loadRunner();
    const sql = runner.PREFLIGHT_SQL;

    expect(sql).toMatch(/set\s+transaction\s+read\s+only/i);
    expect(sql).toMatch(/set local search_path = pg_catalog, public, pg_temp;/i);
    expect(sql).not.toMatch(/set local search_path = public, pg_catalog/i);
    expect(sql).toContain("supabase_migrations.schema_migrations");
    expect(sql).toContain("signup_acquisition_attributions");
    expect(sql).toContain("signup_acquisition_forward_repair");
    expect(sql).toContain(FULL_MIGRATION_STEM);
    expect(sql).toMatch(/set local lock_timeout = '[1-9][0-9]*s';/i);
    expect(sql).toMatch(/set local statement_timeout = '[1-9][0-9]*s';/i);
    expect(sql).toContain("auth.users");
    expect(sql).toContain("public.profiles");
    expect(sql).toContain("public.subscriptions");
    expect(sql).toContain("public.app_role");
    expect(sql).toContain("public.generate_referral_code()");
    expect(sql).toContain("public.convert_referral(uuid,uuid,text,text,boolean)");
    expect(sql).toContain("public.has_role(uuid,public.app_role)");
    expect(sql).toContain("on_auth_user_created");
    expect(sql).not.toMatch(
      /(?:^|;)\s*(?:insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/im,
    );
  });
});

describe("signup-acquisition forward-repair execution", () => {
  it("derives a deterministic receipt bound to project, SHA, migration, and exact database state", async () => {
    const runner = await loadRunner();
    const state = runner.parsePreflightStdout(preflightStdout());
    const first = runner.buildPreflightReceipt({ state, headSha: EXPECTED_HEAD_SHA });
    const repeated = runner.buildPreflightReceipt({ state, headSha: EXPECTED_HEAD_SHA });
    const changedState = runner.buildPreflightReceipt({
      state: runner.parsePreflightStdout(
        preflightStdout({ schema: { ...ABSENT_SCHEMA, table_exists: true } }),
      ),
      headSha: EXPECTED_HEAD_SHA,
    });
    const changedSha = runner.buildPreflightReceipt({ state, headSha: ADVANCED_HEAD_SHA });
    const changedLedgerAlias = runner.buildPreflightReceipt({
      state: runner.parsePreflightStdout(
        preflightStdout({ exact: 1, exactNames: [FULL_MIGRATION_STEM], schema: LIVE_SCHEMA }),
      ),
      headSha: EXPECTED_HEAD_SHA,
    });
    const bareLedgerAlias = runner.buildPreflightReceipt({
      state: runner.parsePreflightStdout(preflightStdout({ exact: 1, schema: LIVE_SCHEMA })),
      headSha: EXPECTED_HEAD_SHA,
    });

    expect(first).toEqual(repeated);
    expect(first).toMatchObject({
      project_ref: PRODUCTION_PROJECT_REF,
      head_sha: EXPECTED_HEAD_SHA,
      migration_version: "20260813030000",
      migration_sha256: EXPECTED_SHA256,
      digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(first.digest).toBe(EXPECTED_ABSENT_RECEIPT_DIGEST);
    expect(changedState.digest).not.toBe(first.digest);
    expect(changedSha.digest).not.toBe(first.digest);
    expect(changedLedgerAlias.digest).not.toBe(bareLedgerAlias.digest);
    expect(bareLedgerAlias.digest).toBe(EXPECTED_LIVE_RECEIPT_DIGEST);
  });

  it("runs PREFLIGHT as one read-only call and reports SAFE_TO_APPLY without an apply phrase", async () => {
    const runner = await loadRunner();
    const evidence = temporaryEvidenceEnv();
    const calls: string[][] = [];
    const spawnImpl = (_command: string, args: string[]) => {
      calls.push(args);
      return { status: 0, stdout: preflightStdout(), stderr: "" };
    };

    const exitCode = runner.runSignupAcquisitionForwardRepair({
      env: baseEnv({
        OPERATION: "PREFLIGHT",
        CONFIRM_APPLY: "",
        REPORT_PATH: evidence.reportPath,
        AUDIT_PATH: evidence.auditPath,
        PREFLIGHT_RECEIPT_PATH: evidence.preflightReceiptPath,
      }),
      spawnImpl,
      logger: { log: () => {}, error: () => {} },
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    });

    expect(exitCode).toBe(runner.EXIT.OK);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("-c");
    expect(calls[0]).not.toContain("--file");
    expect(readFileSync(evidence.reportPath, "utf8")).toContain("SAFE_TO_APPLY");
    expect(JSON.parse(readFileSync(evidence.auditPath, "utf8"))).toMatchObject({
      operation: "PREFLIGHT",
      outcome: "safe_to_apply",
      safe_to_apply: true,
      repository: EXPECTED_REPOSITORY,
      repository_id: EXPECTED_REPOSITORY_ID,
      workflow_path: EXPECTED_WORKFLOW_PATH,
      run_id: EXPECTED_RUN_ID,
      run_attempt: Number(EXPECTED_RUN_ATTEMPT),
      receipt_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      ...SOLO_FOUNDER_AUTHORIZATION_RECEIPT,
    });
    expect(JSON.parse(readFileSync(evidence.preflightReceiptPath, "utf8"))).toEqual({
      schema_version: 1,
      tool: "apply-signup-acquisition-forward-repair",
      operation: "PREFLIGHT",
      outcome: "safe_to_apply",
      safe_to_apply: true,
      repository: EXPECTED_REPOSITORY,
      repository_id: EXPECTED_REPOSITORY_ID,
      workflow_path: EXPECTED_WORKFLOW_PATH,
      run_id: EXPECTED_RUN_ID,
      run_attempt: Number(EXPECTED_RUN_ATTEMPT),
      event: "workflow_dispatch",
      branch: "verdant-grow-diary",
      head_sha: EXPECTED_HEAD_SHA,
      project_ref: PRODUCTION_PROJECT_REF,
      migration_version: "20260813030000",
      migration_name: "signup_acquisition_forward_repair",
      migration_sha256: EXPECTED_SHA256,
      state_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      ...SOLO_FOUNDER_AUTHORIZATION_RECEIPT,
    });
  });

  it("suppresses psql command tags so the read-only JSON result stays machine-readable", async () => {
    const runner = await loadRunner();
    let observedArgs: string[] = [];
    const spawnImpl = (_command: string, args: string[]) => {
      observedArgs = args;
      return {
        status: 0,
        stdout: args.includes("-q")
          ? preflightStdout({ exact: 1, schema: LIVE_SCHEMA })
          : `SET\nSET\nSET\nSET\n${preflightStdout({ exact: 1, schema: LIVE_SCHEMA })}`,
        stderr: "",
      };
    };

    expect(
      runner.runSignupAcquisitionForwardRepair({
        env: baseEnv({ OPERATION: "PREFLIGHT", CONFIRM_APPLY: "" }),
        spawnImpl,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(runner.EXIT.OK);
    expect(observedArgs).toEqual(runner.buildReadOnlyPsqlArgs());
  });

  it("runs PREFLIGHT as read-only verification when the repair is already applied", async () => {
    const runner = await loadRunner();
    const evidence = temporaryEvidenceEnv();
    const calls: string[][] = [];
    const spawnImpl = (_command: string, args: string[]) => {
      calls.push(args);
      return {
        status: 0,
        stdout: preflightStdout({ exact: 1, schema: LIVE_SCHEMA }),
        stderr: "",
      };
    };

    expect(
      runner.runSignupAcquisitionForwardRepair({
        env: baseEnv({
          OPERATION: "PREFLIGHT",
          CONFIRM_APPLY: "",
          REPORT_PATH: evidence.reportPath,
          AUDIT_PATH: evidence.auditPath,
          PREFLIGHT_RECEIPT_PATH: evidence.preflightReceiptPath,
        }),
        spawnImpl,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(runner.EXIT.OK);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("--file");
    expect(JSON.parse(readFileSync(evidence.auditPath, "utf8"))).toMatchObject({
      operation: "PREFLIGHT",
      outcome: "already_applied_verified",
      safe_to_apply: false,
    });
    expect(existsSync(evidence.preflightReceiptPath)).toBe(false);
  });

  it("requires the exact apply phrase only for APPLY and rejects an unknown operation", async () => {
    const runner = await loadRunner();
    let calls = 0;
    const spawnImpl = () => {
      calls += 1;
      return { status: 0, stdout: preflightStdout(), stderr: "" };
    };

    for (const env of [
      baseEnv({ OPERATION: "APPLY", CONFIRM_APPLY: "" }),
      baseEnv({ OPERATION: "apply" }),
      baseEnv({ OPERATION: "UNKNOWN" }),
    ]) {
      expect(
        runner.runSignupAcquisitionForwardRepair({
          env,
          spawnImpl,
          logger: { log: () => {}, error: () => {} },
        }),
      ).toBe(runner.EXIT.INPUT_REJECTED);
    }
    expect(calls).toBe(0);
  });

  it("rejects every missing or altered solo-founder authorization value before psql", async () => {
    const runner = await loadRunner();
    const protectedValues = {
      GITHUB_RUN_ATTEMPT: EXPECTED_RUN_ATTEMPT,
      SOLO_FOUNDER_ACKNOWLEDGEMENT,
      ...SOLO_FOUNDER_AUTHORIZATION_ENV,
    };
    const cases = Object.entries(protectedValues).flatMap(([key, value]) => [
      { key, value: undefined },
      { key, value: value === "true" ? "false" : `${value}-altered` },
    ]);

    for (const { key, value } of cases) {
      const evidence = temporaryEvidenceEnv();
      const logs: string[] = [];
      let calls = 0;
      const env = baseEnv({
        REPORT_PATH: evidence.reportPath,
        AUDIT_PATH: evidence.auditPath,
        PREFLIGHT_RECEIPT_PATH: evidence.preflightReceiptPath,
        SUPABASE_DB_URL: `postgres://attacker:${DATABASE_SECRET}@attacker.invalid/db`,
      });
      if (value === undefined) delete (env as Record<string, string | undefined>)[key];
      else (env as Record<string, string | undefined>)[key] = value;
      const exitCode = runner.runSignupAcquisitionForwardRepair({
        env,
        spawnImpl: () => {
          calls += 1;
          return { status: 0, stdout: preflightStdout(), stderr: "" };
        },
        logger: {
          log: (line: string) => logs.push(line),
          error: (line: string) => logs.push(line),
        },
      });

      expect(exitCode, key).toBe(runner.EXIT.INPUT_REJECTED);
      expect(calls, key).toBe(0);
      const surfaces = [
        logs.join("\n"),
        readFileSync(evidence.reportPath, "utf8"),
        readFileSync(evidence.auditPath, "utf8"),
      ].join("\n");
      expect(surfaces, key).toContain("solo_founder_authorization_rejected");
      expect(surfaces, key).not.toContain(DATABASE_SECRET);
      expect(surfaces, key).not.toContain("attacker.invalid");
      expect(existsSync(evidence.preflightReceiptPath), key).toBe(false);
    }
  });

  it("rejects APPLY before database access when the deploy branch advanced during review", async () => {
    const runner = await loadRunner();
    let calls = 0;
    const spawnImpl = () => {
      calls += 1;
      return { status: 0, stdout: preflightStdout(), stderr: "" };
    };

    expect(
      runner.runSignupAcquisitionForwardRepair({
        env: baseEnv({ CURRENT_DEPLOY_HEAD_SHA: ADVANCED_HEAD_SHA }),
        spawnImpl,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(runner.EXIT.DEPLOY_HEAD_ADVANCED);
    expect(calls).toBe(0);
  });

  it("rejects APPLY when the reviewed preflight receipt does not match the rerun state", async () => {
    const runner = await loadRunner();
    const calls: string[][] = [];
    const spawnImpl = (_command: string, args: string[]) => {
      calls.push(args);
      return { status: 0, stdout: preflightStdout(), stderr: "" };
    };

    expect(
      runner.runSignupAcquisitionForwardRepair({
        env: baseEnv({ PREFLIGHT_RECEIPT_DIGEST: "d".repeat(64) }),
        spawnImpl,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(runner.EXIT.RECEIPT_MISMATCH);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("--file");
  });

  it("rejects a wrong SHA, target, or confirmation before spawning psql", async () => {
    const runner = await loadRunner();
    let calls = 0;
    const spawnImpl = () => {
      calls += 1;
      return { status: 0, stdout: "", stderr: "" };
    };

    for (const env of [
      baseEnv({ EXPECTED_HEAD_SHA: "b".repeat(40) }),
      baseEnv({ CONFIRM_PROJECT_REF: "bzatgtgjvuojpoxcknaa" }),
      baseEnv({ CONFIRM_APPLY: "yes" }),
      baseEnv({ TARGET_ENV: "sandbox" }),
    ]) {
      expect(
        runner.runSignupAcquisitionForwardRepair({
          env,
          spawnImpl,
          logger: { log: () => {}, error: () => {} },
        }),
      ).toBe(runner.EXIT.INPUT_REJECTED);
    }
    expect(calls).toBe(0);
  });

  it("rejects an absent secret or a database URL for the wrong Supabase project", async () => {
    const runner = await loadRunner();
    let calls = 0;
    const spawnImpl = () => {
      calls += 1;
      return { status: 0, stdout: "", stderr: "" };
    };

    expect(
      runner.runSignupAcquisitionForwardRepair({
        env: baseEnv({ SUPABASE_DB_URL: "" }),
        spawnImpl,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(runner.EXIT.NO_DATABASE_URL);
    expect(
      runner.runSignupAcquisitionForwardRepair({
        env: baseEnv({
          SUPABASE_DB_URL:
            "postgres://postgres:wrong@db.bzatgtgjvuojpoxcknaa.supabase.co:5432/postgres?sslmode=require",
        }),
        spawnImpl,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(runner.EXIT.TARGET_REJECTED);
    expect(calls).toBe(0);
  });

  it("runs preflight, exact migration plus ledger in one transaction, then postflight", async () => {
    const runner = await loadRunner();
    const evidence = temporaryEvidenceEnv();
    const calls: Array<{ command: string; args: string[]; env: Record<string, string> }> = [];
    let queryCount = 0;
    let applySql = "";
    const spawnImpl = (
      command: string,
      args: string[],
      options: { env: Record<string, string> },
    ) => {
      calls.push({ command, args, env: options.env });
      if (args.includes("--file")) {
        applySql = readFileSync(args[args.indexOf("--file") + 1], "utf8");
        return { status: 0, stdout: "", stderr: "" };
      }
      queryCount += 1;
      return {
        status: 0,
        stdout:
          queryCount === 1 ? preflightStdout() : preflightStdout({ exact: 1, schema: LIVE_SCHEMA }),
        stderr: "",
      };
    };

    const exitCode = runner.runSignupAcquisitionForwardRepair({
      env: baseEnv({ REPORT_PATH: evidence.reportPath, AUDIT_PATH: evidence.auditPath }),
      spawnImpl,
      logger: { log: () => {}, error: () => {} },
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    });

    expect(exitCode).toBe(runner.EXIT.OK);
    expect(calls).toHaveLength(3);
    expect(calls[0].args).toContain("--single-transaction");
    expect(calls[0].args).toContain("-c");
    expect(calls[1].args).toContain("--single-transaction");
    expect(calls[1].args).toContain("--file");
    expect(calls[2].args).toContain("--single-transaction");
    expect(applySql).toContain(readFileSync(MIGRATION_PATH, "utf8"));
    expect(applySql).toContain("insert into supabase_migrations.schema_migrations");

    const audit = JSON.parse(readFileSync(evidence.auditPath, "utf8"));
    expect(audit).toMatchObject({
      schema_version: 1,
      tool: "apply-signup-acquisition-forward-repair",
      target_env: "production",
      project_ref: PRODUCTION_PROJECT_REF,
      outcome: "applied_verified",
      migration_version: "20260813030000",
      expected_head_sha: EXPECTED_HEAD_SHA,
      observed_head_sha: EXPECTED_HEAD_SHA,
      ...SOLO_FOUNDER_AUTHORIZATION_RECEIPT,
    });
    const evidenceText = `${readFileSync(evidence.reportPath, "utf8")}\n${readFileSync(evidence.auditPath, "utf8")}`;
    expect(evidenceText).not.toContain(DATABASE_SECRET);
    expect(evidenceText).not.toContain(DATABASE_URL);
  });

  it("performs no persistent write when the exact ledger row and schema contract already exist", async () => {
    const runner = await loadRunner();
    const calls: string[][] = [];
    const spawnImpl = (_command: string, args: string[]) => {
      calls.push(args);
      return {
        status: 0,
        stdout: preflightStdout({ exact: 1, schema: LIVE_SCHEMA }),
        stderr: "",
      };
    };

    const exitCode = runner.runSignupAcquisitionForwardRepair({
      env: baseEnv({ PREFLIGHT_RECEIPT_DIGEST: EXPECTED_LIVE_RECEIPT_DIGEST }),
      spawnImpl,
      logger: { log: () => {}, error: () => {} },
    });

    expect(exitCode).toBe(runner.EXIT.OK);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("--file");
  });

  it("never submits the migration after a ledger collision or recorded schema drift", async () => {
    const runner = await loadRunner();
    for (const stdout of [
      preflightStdout({ conflicts: 1 }),
      preflightStdout({ exact: 1, schema: { ...LIVE_SCHEMA, client_access_contract: false } }),
    ]) {
      let calls = 0;
      const spawnImpl = () => {
        calls += 1;
        return { status: 0, stdout, stderr: "" };
      };
      const exitCode = runner.runSignupAcquisitionForwardRepair({
        env: baseEnv(),
        spawnImpl,
        logger: { log: () => {}, error: () => {} },
      });
      expect(exitCode).toBe(
        stdout.includes('"ledger_conflict_count":1')
          ? runner.EXIT.LEDGER_DRIFT
          : runner.EXIT.SCHEMA_DRIFT,
      );
      expect(calls).toBe(1);
    }
  });

  it("keeps secret, token, URL, and PII-shaped database output out of every failure surface", async () => {
    const runner = await loadRunner();
    const leaks = [
      DATABASE_SECRET,
      DATABASE_URL,
      "service-role-token-leak",
      "grower-private@example.com",
      "eyJhbGciOiJIUzI1NiJ9.private.signature",
    ];
    const leakedOutput = `fatal ${leaks.join(" ")}`;
    const receiptDigest = runner.buildPreflightReceipt({
      state: runner.parsePreflightStdout(preflightStdout()),
      headSha: EXPECTED_HEAD_SHA,
    }).digest;

    for (const scenario of ["preflight", "apply", "postflight"] as const) {
      const evidence = temporaryEvidenceEnv();
      const logs: string[] = [];
      let queryCount = 0;
      const spawnImpl = (_command: string, args: string[]) => {
        if (args.includes("--file")) {
          return scenario === "apply"
            ? { status: 1, stdout: leakedOutput, stderr: leakedOutput }
            : { status: 0, stdout: "", stderr: "" };
        }
        queryCount += 1;
        if (queryCount === 1) {
          return scenario === "preflight"
            ? { status: 1, stdout: leakedOutput, stderr: leakedOutput }
            : { status: 0, stdout: preflightStdout(), stderr: "" };
        }
        return scenario === "postflight"
          ? { status: 1, stdout: leakedOutput, stderr: leakedOutput }
          : { status: 0, stdout: preflightStdout({ exact: 1, schema: LIVE_SCHEMA }), stderr: "" };
      };

      const exitCode = runner.runSignupAcquisitionForwardRepair({
        env: baseEnv({
          PREFLIGHT_RECEIPT_DIGEST: receiptDigest,
          REPORT_PATH: evidence.reportPath,
          AUDIT_PATH: evidence.auditPath,
        }),
        spawnImpl,
        logger: {
          log: (line: string) => logs.push(line),
          error: (line: string) => logs.push(line),
        },
      });
      expect(exitCode).toBe(
        scenario === "preflight"
          ? runner.EXIT.PREFLIGHT_FAILED
          : scenario === "apply"
            ? runner.EXIT.APPLY_FAILED
            : runner.EXIT.POSTFLIGHT_FAILED,
      );
      const surfaces = [
        logs.join("\n"),
        readFileSync(evidence.reportPath, "utf8"),
        readFileSync(evidence.auditPath, "utf8"),
      ].join("\n");
      for (const leak of leaks) expect(surfaces).not.toContain(leak);
    }
  });

  it("allows only typed, enumerated fields into the audit extras", async () => {
    const runner = await loadRunner();

    expect(
      runner.sanitizeAuditExtras({
        operation: "APPLY",
        safe_to_apply: true,
        receipt_digest: "e".repeat(64),
        ledger_state: "apply",
        schema_effect_live: false,
        prerequisites_live: true,
        reason_code: "receipt_mismatch",
        note: "grower-private@example.com",
        raw_stdout: DATABASE_URL,
        token: "service-role-token-leak",
      }),
    ).toEqual({
      operation: "APPLY",
      safe_to_apply: true,
      receipt_digest: "e".repeat(64),
      ledger_state: "apply",
      schema_effect_live: false,
      prerequisites_live: true,
      reason_code: "receipt_mismatch",
    });
  });

  it("fails when postflight cannot prove both the exact ledger row and full schema contract", async () => {
    const runner = await loadRunner();
    let queryCount = 0;
    const spawnImpl = (_command: string, args: string[]) => {
      if (args.includes("--file")) return { status: 0, stdout: "", stderr: "" };
      queryCount += 1;
      return {
        status: 0,
        stdout:
          queryCount === 1
            ? preflightStdout()
            : preflightStdout({
                exact: 1,
                schema: { ...LIVE_SCHEMA, constraint_sources: [...EXPECTED_SOURCES, "unexpected"] },
              }),
        stderr: "",
      };
    };

    expect(
      runner.runSignupAcquisitionForwardRepair({
        env: baseEnv(),
        spawnImpl,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(runner.EXIT.POSTFLIGHT_CONTRACT_FAILED);
  });

  it.each(["PREFLIGHT", "APPLY"] as const)(
    "forces authenticated TLS and an allowlisted psql environment for %s",
    async (operation) => {
      const runner = await loadRunner();
      let childEnv: Record<string, string> | undefined;
      const spawnImpl = (
        _command: string,
        _args: string[],
        options: { env: Record<string, string> },
      ) => {
        childEnv = options.env;
        return {
          status: 0,
          stdout: preflightStdout({ exact: 1, schema: LIVE_SCHEMA }),
          stderr: "",
        };
      };

      const tls = productionTlsEnv();
      expect(
        runner.runSignupAcquisitionForwardRepair({
          env: baseEnv({
            ...tls,
            OPERATION: operation,
            CONFIRM_APPLY: operation === "APPLY" ? APPLY_CONFIRMATION : "",
            PREFLIGHT_RECEIPT_DIGEST: EXPECTED_LIVE_RECEIPT_DIGEST,
            DATABASE_URL: "postgres://wrong-target",
            PGHOST: "wrong-host",
            SUPABASE_SERVICE_ROLE_KEY: "service-role-token-leak",
            BRIDGE_TOKEN: "bridge-token-leak",
          }),
          spawnImpl,
          logger: { log: () => {}, error: () => {} },
        }),
      ).toBe(runner.EXIT.OK);
      expect(childEnv).toMatchObject({
        PGHOST: `db.${PRODUCTION_PROJECT_REF}.supabase.co`,
        PGUSER: "postgres",
        PGDATABASE: "postgres",
        PGSSLMODE: "verify-full",
        PGSSLROOTCERT: tls.SUPABASE_DB_CA_CERT_PATH,
        PGGSSENCMODE: "disable",
      });
      expect(childEnv).not.toHaveProperty("DATABASE_URL");
      expect(childEnv).not.toHaveProperty("SUPABASE_DB_URL");
      expect(childEnv).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
      expect(childEnv).not.toHaveProperty("BRIDGE_TOKEN");
      expect(childEnv).not.toHaveProperty("SUPABASE_DB_CA_CERT_B64");
    },
  );

  it("rejects missing, displaced, or malformed production CA material before psql", async () => {
    const runner = await loadRunner();
    const malformedTls = productionTlsEnv();
    writeFileSync(malformedTls.SUPABASE_DB_CA_CERT_PATH, "not a certificate", { mode: 0o600 });
    const displacedTls = productionTlsEnv();
    const scenarios = [
      { RUNNER_TEMP: "", SUPABASE_DB_CA_CERT_PATH: "" },
      {
        ...displacedTls,
        SUPABASE_DB_CA_CERT_PATH: join(displacedTls.RUNNER_TEMP, "attacker-root.crt"),
      },
      malformedTls,
    ];

    for (const tls of scenarios) {
      let calls = 0;
      const exitCode = runner.runSignupAcquisitionForwardRepair({
        env: baseEnv(tls),
        spawnImpl: () => {
          calls += 1;
          return { status: 0, stdout: preflightStdout(), stderr: "" };
        },
        logger: { log: () => {}, error: () => {} },
      });

      expect(exitCode).toBe(runner.EXIT.TLS_TRUST_REJECTED);
      expect(calls).toBe(0);
    }
  });
});

describe("signup-acquisition forward-repair protected workflow", () => {
  it("resolves to a dispatch-only, branch/SHA-gated, environment-gated apply job", () => {
    expect(existsSync(WORKFLOW_PATH), "dedicated workflow must exist").toBe(true);
    const workflow = loadYaml(readFileSync(WORKFLOW_PATH, "utf8")) as Record<string, any>;

    expect(workflow.on).toEqual({
      workflow_dispatch: {
        inputs: {
          operation: expect.objectContaining({
            required: true,
            type: "choice",
            default: "PREFLIGHT",
            options: ["PREFLIGHT", "APPLY"],
          }),
          expected_head_sha: expect.objectContaining({ required: true, type: "string" }),
          confirm_project_ref: expect.objectContaining({ required: true, type: "string" }),
          confirm_apply: expect.objectContaining({ required: false, type: "string", default: "" }),
          preflight_run_id: expect.objectContaining({
            required: false,
            type: "string",
            default: "",
          }),
          expected_preflight_run_attempt: expect.objectContaining({
            required: false,
            type: "string",
            default: "",
          }),
          expected_preflight_artifact_sha256: expect.objectContaining({
            required: false,
            type: "string",
            default: "",
          }),
          solo_founder_acknowledgement: expect.objectContaining({
            required: true,
            type: "string",
          }),
        },
      },
    });
    expect(workflow.on.workflow_dispatch.inputs.solo_founder_acknowledgement).not.toHaveProperty(
      "default",
    );
    expect(workflow.permissions).toEqual({ contents: "read", actions: "read" });
    expect(workflow.concurrency).toEqual({
      group: "verdant-production-migration-writer",
      "cancel-in-progress": false,
      queue: "max",
    });

    const validate = workflow.jobs.validate;
    expect(validate.environment).toBeUndefined();
    const validateCommands = validate.steps.map((step: any) => step.run ?? "").join("\n");
    expect(validateCommands).toContain("refs/heads/verdant-grow-diary");
    expect(validateCommands).toContain(PRODUCTION_PROJECT_REF);
    expect(validateCommands).toContain(APPLY_CONFIRMATION);
    expect(validateCommands).toContain("EXPECTED_HEAD_SHA");
    expect(validateCommands).toContain("OBSERVED_SHA");
    expect(validateCommands).toContain("OPERATION");
    expect(validateCommands).toContain('"APPLY"');
    expect(validateCommands).toContain('"PREFLIGHT"');
    expect(validateCommands).toContain("PREFLIGHT_RUN_ID");
    expect(validateCommands).toContain("EXPECTED_PREFLIGHT_RUN_ATTEMPT");
    expect(validateCommands).toContain("EXPECTED_PREFLIGHT_ARTIFACT_SHA256");
    expect(validateCommands).toContain(SOLO_FOUNDER_ACKNOWLEDGEMENT);
    expect(validateCommands).toContain("GITHUB_ACTOR_ID");
    expect(validateCommands).toContain("GITHUB_ACTOR");
    expect(validateCommands).toContain("GITHUB_TRIGGERING_ACTOR");
    expect(validateCommands).toContain("GITHUB_RUN_ATTEMPT");
    expect(validateCommands).toContain("72639960");
    expect(validateCommands).toContain("cheekhimself");
    expect(validateCommands).toMatch(/PREFLIGHT[\s\S]*PREFLIGHT_RUN_ID[\s\S]*-n/);
    expect(validateCommands).toMatch(/APPLY[\s\S]*PREFLIGHT_RUN_ID/);

    const apply = workflow.jobs.apply;
    expect(apply.needs).toBe("validate");
    expect(apply.environment).toBe("verdant-production-solo-founder");
    expect(apply.env).toMatchObject({
      OPERATION: "${{ inputs.operation }}",
      TARGET_ENV: "production",
      EXPECTED_HEAD_SHA: "${{ inputs.expected_head_sha }}",
      CONFIRM_PROJECT_REF: "${{ inputs.confirm_project_ref }}",
      CONFIRM_APPLY: "${{ inputs.confirm_apply }}",
      PREFLIGHT_RUN_ID: "${{ inputs.preflight_run_id }}",
      EXPECTED_PREFLIGHT_RUN_ATTEMPT: "${{ inputs.expected_preflight_run_attempt }}",
      EXPECTED_PREFLIGHT_ARTIFACT_SHA256: "${{ inputs.expected_preflight_artifact_sha256 }}",
      SOLO_FOUNDER_ACKNOWLEDGEMENT: "${{ inputs.solo_founder_acknowledgement }}",
    });
    const auditDirectoryIndex = apply.steps.findIndex((step: any) =>
      String(step.name ?? "").includes("Prepare sanitized audit directory"),
    );
    const authorizationIndex = apply.steps.findIndex((step: any) =>
      String(step.name ?? "").includes("solo-founder production authorization"),
    );
    const headResolutionIndex = apply.steps.findIndex((step: any) =>
      String(step.name ?? "").includes("current deploy branch head"),
    );
    const secretGuardIndex = apply.steps.findIndex(
      (step: any) => step.uses === "./.github/actions/require-ci-secret",
    );
    const runnerIndex = apply.steps.findIndex(
      (step: any) => step.run === "node scripts/apply-signup-acquisition-forward-repair.mjs",
    );
    expect(headResolutionIndex).toBeGreaterThan(-1);
    const postgresInstallIndex = apply.steps.findIndex((step: any) =>
      String(step.name ?? "").includes("Install PostgreSQL client"),
    );
    const provenanceIndex = apply.steps.findIndex((step: any) =>
      String(step.name ?? "").includes("authenticated PREFLIGHT artifact"),
    );
    expect(authorizationIndex).toBe(auditDirectoryIndex + 1);
    const authorizationStep = apply.steps[authorizationIndex];
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
    expect(authorizationStep.run.match(/\bgh api\b/g) ?? []).toHaveLength(4);
    expect(authorizationStep.run.match(/--jq/g) ?? []).toHaveLength(4);
    expect(authorizationStep.run).toContain(
      "node scripts/verify-solo-founder-production-authorization.mjs",
    );
    expect(authorizationStep.run).toContain('"outcome":"authorization_rejected"');
    expect(authorizationStep.run).toContain('"reason_code":"solo_founder_authorization_rejected"');
    expect(provenanceIndex).toBeGreaterThan(-1);
    expect(apply.steps[provenanceIndex].run).toContain("$AUDIT_PATH");
    expect(apply.steps[provenanceIndex].run).toContain('"outcome":"artifact_rejected"');
    expect(apply.steps[provenanceIndex].run).toContain('"reason_code":"artifact_rejected"');
    expect(apply.steps[provenanceIndex].run).not.toContain('"reason_code":"receipt_missing"');
    expect(authorizationIndex).toBeLessThan(provenanceIndex);
    expect(authorizationIndex).toBeLessThan(secretGuardIndex);
    expect(authorizationIndex).toBeLessThan(postgresInstallIndex);
    expect(provenanceIndex).toBeLessThan(headResolutionIndex);
    expect(secretGuardIndex).toBeLessThan(headResolutionIndex);
    expect(postgresInstallIndex).toBeLessThan(headResolutionIndex);
    expect(headResolutionIndex + 1).toBe(runnerIndex);
    expect(apply.steps[headResolutionIndex].if).toContain("inputs.operation == 'APPLY'");
    expect(apply.steps[headResolutionIndex].run).toContain("refs/heads/verdant-grow-diary");
    expect(apply.steps[headResolutionIndex].run).toContain("CURRENT_DEPLOY_HEAD_SHA");
    expect(apply.steps[headResolutionIndex].run).not.toMatch(/exit\s+1/);
    expect(apply.steps[headResolutionIndex].run).toContain("unresolved");
    const checkout = apply.steps.find((step: any) =>
      String(step.uses ?? "").startsWith("actions/checkout@"),
    );
    expect(checkout.with).toMatchObject({ ref: "${{ github.sha }}", "persist-credentials": false });
    const checkoutIndex = apply.steps.indexOf(checkout);
    const setupNodeIndex = apply.steps.findIndex(
      (step: any) => step.uses === "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
    );
    expect(setupNodeIndex).toBe(checkoutIndex + 1);
    expect(apply.steps[setupNodeIndex].with).toEqual({ "node-version": "22" });
    expect(setupNodeIndex).toBeLessThan(provenanceIndex);
    expect(
      apply.steps.some((step: any) => step.uses === "./.github/actions/require-ci-secret"),
    ).toBe(true);
    expect(
      apply.steps.some(
        (step: any) => step.run === "node scripts/apply-signup-acquisition-forward-repair.mjs",
      ),
    ).toBe(true);
    const receiptUpload = apply.steps.find((step: any) =>
      String(step.name ?? "").includes("immutable PREFLIGHT receipt"),
    );
    expect(receiptUpload.if).toContain("inputs.operation == 'PREFLIGHT'");
    expect(receiptUpload.with.name).toContain("${{ github.run_id }}");
    expect(receiptUpload.with.name).toContain("${{ github.run_attempt }}");
    expect(receiptUpload.with.path).toContain("preflight-receipt.json");
    const upload = apply.steps.find(
      (step: any) =>
        String(step.uses ?? "").startsWith("actions/upload-artifact@") &&
        String(step.name ?? "").includes("sanitized evidence"),
    );
    expect(upload.if).toBe("always()");
    expect(upload["continue-on-error"]).toBe(true);
    expect(upload.with["if-no-files-found"]).toBe("error");
  });

  it("documents the exact solo-founder ceremony without authorizing browser/account E2E", () => {
    const runbook = readFileSync(RUNBOOK_PATH, "utf8");

    for (const required of [
      "verdant-production-solo-founder",
      "cheekhimself",
      "72639960",
      "Prevent self-review OFF",
      "administrator bypass OFF",
      "verdant-grow-diary",
      SOLO_FOUNDER_ACKNOWLEDGEMENT,
      "15 minutes",
      "24 hours",
      "expected_preflight_run_attempt",
      "expected_preflight_artifact_sha256",
      "fresh dispatch",
      "This proves founder identity, intent, provenance, and elapsed time; it is not independent human review.",
    ]) {
      expect(runbook).toContain(required);
    }
    expect(runbook).toMatch(/founder self-review/i);
    expect(runbook).toMatch(/exactly one required reviewer/i);
    expect(runbook).toMatch(/fresh (?:Verdant )?account or browser E2E[^\n]*(?:separate|outside)/i);
    expect(runbook).not.toContain("reviewer (who is not the dispatcher)");
    expect(runbook).not.toContain("prevent-self-review enabled");
  });
});
