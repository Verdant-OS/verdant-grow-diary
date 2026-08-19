import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APPLY_CONFIRMATION,
  buildApplySql,
  buildCanonicalPolicyVerificationSql,
  classifyTargetLedger,
  describeDatabaseUrlRepairProbes,
  EXIT,
  extractExpectedFunctionBodies,
  findUnsafeSqlReason,
  PINNED_PRODUCTION_MIGRATIONS,
  PINNED_SECURITY_REFERENCE_FILES,
  POSTFLIGHT_SQL,
  PREFLIGHT_SQL,
  PRODUCTION_PROJECT_REF,
  runPinnedProductionMigrations,
  validatePinnedMigrationFiles,
  validatePinnedSecurityReferenceFiles,
} from "../../scripts/apply-pinned-production-migrations.mjs";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(REPO_ROOT, "scripts", "apply-pinned-production-migrations.mjs");
const WORKFLOW_PATH = resolve(
  REPO_ROOT,
  ".github",
  "workflows",
  "apply-pinned-production-migrations.yml",
);
const MIGRATIONS_ROOT = resolve(REPO_ROOT, "supabase", "migrations");
const HEAD_SHA = "61c4b52742d0e5afd95175990d36d6c4fb577d0f";
const PASSWORD = "production-password-never-print";
const DATABASE_URL =
  `postgresql://postgres:${PASSWORD}@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres` +
  "?sslmode=verify-full&application_name=must_be_removed";

/**
 * GitHub's ubuntu checkout preserves the reviewed LF Git-blob bytes. This
 * Windows worktree uses core.autocrlf=true, so focused local tests normalize
 * only checkout CRLF back to the exact bytes the protected runner receives.
 */
function readLfCheckoutFile(path: string) {
  const raw = readFileSync(path);
  return Buffer.from(raw.toString("utf8").split("\r\n").join("\n"), "utf8");
}

const validatedFixtureMigrations = validatePinnedMigrationFiles({
  root: MIGRATIONS_ROOT,
  readFile: readLfCheckoutFile,
});
const validatedFixtureSecurityReferences = validatePinnedSecurityReferenceFiles({
  root: MIGRATIONS_ROOT,
  readFile: readLfCheckoutFile,
});
const expectedFunctionBodies = extractExpectedFunctionBodies([
  ...validatedFixtureMigrations,
  ...validatedFixtureSecurityReferences,
]);
const canonicalPolicyVerificationSql = buildCanonicalPolicyVerificationSql(
  validatedFixtureMigrations,
);

type LedgerMode = "apply" | "verify_only" | "mixed" | "collision";

type SpawnCall = {
  command: string;
  args: string[];
  options: {
    env?: Record<string, string>;
    encoding?: string;
    timeout?: number;
  };
};

const dependencyContract = Object.freeze({
  pheno_crosses: true,
  pheno_reversals: true,
  ai_credit_grants: true,
  ai_credit_spends: true,
  ai_credit_spend_results: true,
  subscriptions: true,
  grows: true,
  has_role: true,
  schema_audit_overloads_safe: true,
});

const phenoIdentity = Object.freeze({
  pheno_crosses: { row_count: 2, ids_md5: "crosses-md5" },
  pheno_reversals: { row_count: 0, ids_md5: "reversals-md5" },
});

const restrictivePolicies = Object.freeze([
  {
    table: "pheno_crosses",
    policy: "pheno_crosses_pro_required_insert",
    permissive: "RESTRICTIVE",
    cmd: "INSERT",
    roles: ["authenticated"],
    qual: null,
    with_check: "public.has_pheno_tracker_entitlement(auth.uid())",
  },
]);

const soilColumns = [
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

const soilColumnShape = [
  "1|id|uuid|not_null|gen_random_uuid()|",
  "2|user_id|uuid|not_null|auth.uid()|",
  "3|grow_id|uuid|not_null||",
  "4|tent_id|uuid|not_null||",
  "5|plant_id|uuid|nullable||",
  "6|device_id|text|nullable||",
  "7|label|text|nullable||",
  "8|medium|text|nullable||",
  "9|sensor_depth_cm|numeric|nullable||",
  "10|dry_raw|numeric|not_null||",
  "11|wet_raw|numeric|not_null||",
  "12|source|text|not_null|'manual'::text|",
  "13|is_active|boolean|not_null|true|",
  "14|notes|text|nullable||",
  "15|created_at|timestamp with time zone|not_null|now()|",
  "16|updated_at|timestamp with time zone|not_null|now()|",
];

const soilConstraintNames = [
  "soil_moisture_calibrations_depth_check",
  "soil_moisture_calibrations_distinct_points_check",
  "soil_moisture_calibrations_finite_points_check",
  "soil_moisture_calibrations_grow_id_fkey",
  "soil_moisture_calibrations_pkey",
  "soil_moisture_calibrations_plant_id_fkey",
  "soil_moisture_calibrations_source_check",
  "soil_moisture_calibrations_tent_id_fkey",
];

const soilIndexNames = [
  "soil_moisture_calibrations_active_probe_uidx",
  "soil_moisture_calibrations_pkey",
  "soil_moisture_calibrations_plant_idx",
  "soil_moisture_calibrations_user_grow_tent_idx",
];

const soilPolicyShape = [
  "Users delete own soil moisture calibrations|t|d|authenticated",
  "Users insert own soil moisture calibrations|t|a|authenticated",
  "Users update own soil moisture calibrations|t|w|authenticated",
  "Users view own soil moisture calibrations|t|r|authenticated",
];

const soilConstraintDefinitions = [
  "primarykey(id)",
  "check(dry_raw<>wet_raw)",
  "check(dry_raw<>'nan'::numericandwet_raw<>'nan'::numeric)",
  "check(source=any(array['manual'::text,'csv'::text,'demo'::text]))",
  "check(sensor_depth_cmisnullorsensor_depth_cm>=0andsensor_depth_cm<=1000)",
  "foreignkey(grow_id)referencesgrows(id)ondeletecascade",
  "foreignkey(tent_id)referencestents(id)ondeletecascade",
  "foreignkey(plant_id)referencesplants(id)ondeletesetnull",
].join("");

const soilIndexDefinitions = [
  "createuniqueindexsoil_moisture_calibrations_active_probe_uidxon" +
    "soil_moisture_calibrationsusingbtree(user_id,grow_id,tent_id," +
    "coalesce(plant_id,'00000000-0000-0000-0000-000000000000'::uuid)," +
    "coalesce(device_id,''::text))whereis_active",
  "createuniqueindexsoil_moisture_calibrations_pkeyon" + "soil_moisture_calibrationsusingbtree(id)",
  "createindexsoil_moisture_calibrations_plant_idxon" +
    "soil_moisture_calibrationsusingbtree(user_id,plant_id)" +
    "where(plant_idisnotnull)",
  "createindexsoil_moisture_calibrations_user_grow_tent_idxon" +
    "soil_moisture_calibrationsusingbtree" +
    "(user_id,grow_id,tent_id,is_active,created_atdesc)",
].join("");

const soilPolicyDefinitions = [
  "auth.uid()=soil_moisture_calibrations.user_id",
  "fromgrowsg",
  "g.id=soil_moisture_calibrations.grow_id",
  "g.user_id=auth.uid()",
  "fromtentst",
  "t.id=soil_moisture_calibrations.tent_id",
  "t.user_id=auth.uid()",
  "fromplantsp",
  "p.id=soil_moisture_calibrations.plant_id",
  "p.user_id=auth.uid()",
  "t.grow_id=soil_moisture_calibrations.grow_id",
  "p.grow_id=soil_moisture_calibrations.grow_id",
  "p.tent_id=soil_moisture_calibrations.tent_id",
].join("");

const phenoColumns = [
  "id",
  "user_id",
  "hunt_id",
  "female_keeper_id",
  "male_keeper_id",
  "cross_name",
  "note",
  "crossed_at",
  "created_at",
  "updated_at",
  "cross_type",
  "channel",
  "generation",
  "recurrent_parent_id",
];

const phenoColumnShape = [
  "1|id|uuid|not_null|gen_random_uuid()|",
  "2|user_id|uuid|not_null||",
  "3|hunt_id|uuid|nullable||",
  "4|female_keeper_id|uuid|not_null||",
  "5|male_keeper_id|uuid|nullable||",
  "6|cross_name|text|nullable||",
  "7|note|text|nullable||",
  "8|crossed_at|timestamp with time zone|nullable||",
  "9|created_at|timestamp with time zone|not_null|now()|",
  "10|updated_at|timestamp with time zone|not_null|now()|",
  "11|cross_type|text|not_null|'standard_f1'::text|",
  "12|channel|text|nullable||",
  "13|generation|integer|nullable||",
  "14|recurrent_parent_id|uuid|nullable||",
];

const phenoConstraintNames = [
  "pheno_crosses_channel_check",
  "pheno_crosses_cross_type_check",
  "pheno_crosses_female_keeper_id_fkey",
  "pheno_crosses_generation_check",
  "pheno_crosses_hunt_id_fkey",
  "pheno_crosses_male_keeper_id_fkey",
  "pheno_crosses_parents_by_type",
  "pheno_crosses_pkey",
  "pheno_crosses_recurrent_parent_by_type",
  "pheno_crosses_recurrent_parent_id_fkey",
  "pheno_crosses_user_id_fkey",
];

const phenoIndexNames = [
  "pheno_crosses_cross_type_idx",
  "pheno_crosses_female_idx",
  "pheno_crosses_hunt_id_idx",
  "pheno_crosses_male_idx",
  "pheno_crosses_pkey",
  "pheno_crosses_recurrent_parent_idx",
  "pheno_crosses_user_id_idx",
];

const phenoConstraintDefinitions = [
  "primarykey(id)",
  "foreignkey(user_id)referencesauth.users(id)ondeletecascade",
  "foreignkey(hunt_id)referencespheno_hunts(id)ondeletesetnull",
  "foreignkey(female_keeper_id)referencespheno_keepers(id)ondeletecascade",
  "foreignkey(male_keeper_id)referencespheno_keepers(id)ondeletecascade",
  "foreignkey(recurrent_parent_id)referencespheno_keepers(id)ondeletesetnull",
  "'standard_f1'::text",
  "'feminized_cross'::text",
  "'selfing_s1'::text",
  "'filial'::text",
  "'ibl'::text",
  "'selfing_sn'::text",
  "'feminized_bx'::text",
  "'backcross'::text",
  "'sib_cross'::text",
  "'outcross'::text",
  "'line_cross'::text",
  "'open_pollination'::text",
  "'test_cross'::text",
  "'reciprocal_cross'::text",
  "'three_way_cross'::text",
  "'natural_male'::text",
  "'colloidal_silver'::text",
  "'rodelization'::text",
  "recurrent_parent_idisnotnull",
  "generation>=2",
  "generation>=1",
].join("");

const phenoIndexDefinitions = [
  "createindexpheno_crosses_cross_type_idxonpheno_crosses(cross_type)",
  "createindexpheno_crosses_female_idxonpheno_crosses(female_keeper_id)",
  "createindexpheno_crosses_hunt_id_idxonpheno_crosses(hunt_id)",
  "createindexpheno_crosses_male_idxonpheno_crosses(male_keeper_id)",
  "createuniqueindexpheno_crosses_pkeyonpheno_crosses(id)",
  "createindexpheno_crosses_recurrent_parent_idxon" + "pheno_crosses(recurrent_parent_id)",
  "createindexpheno_crosses_user_id_idxonpheno_crosses(user_id)",
].join("");

const fullTablePrivileges = [
  "DELETE",
  "INSERT",
  "MAINTAIN",
  "REFERENCES",
  "SELECT",
  "TRIGGER",
  "TRUNCATE",
  "UPDATE",
];

const apiPrivileges = (authenticatedPrivileges: string[]) => [
  ...authenticatedPrivileges.map((privilege) => `authenticated|${privilege}`),
  ...fullTablePrivileges.map((privilege) => `service_role|${privilege}`),
];

const phenoCrossOwnerPolicyShape = [
  "pheno_crosses_delete_own|t|d|t|f|authenticated",
  "pheno_crosses_insert_own|t|a|f|t|authenticated",
  "pheno_crosses_select_own|t|r|t|f|authenticated",
  "pheno_crosses_update_own|t|w|t|t|authenticated",
];

const phenoCrossOwnerPolicyDefinitions = [
  "auth.uid()=user_id",
  "frompheno_keepersf",
  "f.id=female_keeper_id",
  "male_keeper_idisnull",
  "frompheno_keepersm",
  "hunt_idisnull",
  "frompheno_huntsh",
  "frompheno_reversalsr",
  "recurrent_parent_idisnull",
  "channel",
  "'colloidal_silver'::text",
  "'rodelization'::text",
  "'natural_male'::text",
  "'open_pollination'::text",
].join("");

const phenoReversalOwnerPolicyShape = [
  "pheno_reversals_insert_own|t|a|f|t|authenticated",
  "pheno_reversals_select_own|t|r|t|f|authenticated",
];

const phenoReversalOwnerPolicyDefinitions = "auth.uid()=user_idfrompheno_keepersk";

const phenoReversalColumnShape = [
  "1|id|uuid|not_null|gen_random_uuid()|",
  "2|user_id|uuid|not_null||",
  "3|keeper_id|uuid|not_null||",
  "4|method|text|not_null|'sts'::text|",
  "5|note|text|nullable||",
  "6|applied_at|timestamp with time zone|nullable||",
  "7|created_at|timestamp with time zone|not_null|now()|",
];

const phenoReversalConstraintNames = [
  "pheno_reversals_keeper_id_fkey",
  "pheno_reversals_method_check",
  "pheno_reversals_pkey",
  "pheno_reversals_user_id_fkey",
];

const phenoReversalConstraintDefinitions = [
  "primarykey(id)",
  "'sts'::text",
  "'colloidal_silver'::text",
  "'ga3'::text",
  "'other'::text",
  "referencespheno_keepers(id)ondeletecascade",
  "referencesauth.users(id)ondeletecascade",
].join("");

const phenoReversalIndexNames = [
  "pheno_reversals_keeper_idx",
  "pheno_reversals_pkey",
  "pheno_reversals_user_id_idx",
];

const phenoReversalIndexDefinitions = [
  "createindexpheno_reversals_keeper_idxonpheno_reversals(keeper_id)",
  "createuniqueindexpheno_reversals_pkeyonpheno_reversals(id)",
  "createindexpheno_reversals_user_id_idxonpheno_reversals(user_id)",
].join("");

function makeTargets(mode: LedgerMode) {
  return PINNED_PRODUCTION_MIGRATIONS.map((migration, index) => {
    if (mode === "apply" || (mode === "mixed" && index > 0)) {
      return { version: migration.version, name: migration.name, matches: [] };
    }
    if (mode === "collision" && index === 0) {
      return {
        version: migration.version,
        name: migration.name,
        matches: [
          {
            version: migration.version,
            name: "different_migration_name",
          },
        ],
      };
    }
    return {
      version: migration.version,
      name: migration.name,
      matches: [{ version: migration.version, name: migration.name }],
    };
  });
}

function makePreflight(mode: LedgerMode = "apply") {
  return {
    current_user: "postgres",
    ledger_columns: {
      version: "text",
      name: "text",
      statements: "ARRAY",
    },
    ledger_ordered_columns: [
      {
        name: "version",
        data_type: "text",
        udt_name: "text",
        nullable: "NO",
      },
      {
        name: "name",
        data_type: "text",
        udt_name: "text",
        nullable: "YES",
      },
      {
        name: "statements",
        data_type: "ARRAY",
        udt_name: "_text",
        nullable: "YES",
      },
    ],
    ledger_primary_key: ["version"],
    targets: makeTargets(mode),
    dependencies: { ...dependencyContract },
    pheno_identity: phenoIdentity,
    restrictive_policies: restrictivePolicies,
  };
}

function makePostflight(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ledger_exact_count: 7,
    ledger_mismatch_count: 0,
    ledger_collision_count: 0,
    soil_exists: true,
    soil_column_names: [...soilColumns],
    soil_column_shape: [...soilColumnShape],
    soil_constraint_names: [...soilConstraintNames],
    soil_constraint_definitions: soilConstraintDefinitions,
    soil_index_names: [...soilIndexNames],
    soil_index_definitions: soilIndexDefinitions,
    soil_policy_shape: [...soilPolicyShape],
    soil_policy_definitions: soilPolicyDefinitions,
    soil_trigger_shape: [
      "soil_moisture_calibrations_set_updated_at|O|" +
        "createtriggersoil_moisture_calibrations_set_updated_at" +
        "beforeupdateonsoil_moisture_calibrationsforeachrow" +
        "executefunctionset_updated_at()",
    ],
    soil_column_count: 16,
    soil_constraint_count: 8,
    soil_index_count: 4,
    soil_policy_count: 4,
    soil_rls_contract: true,
    soil_public_or_anon_grant_count: 0,
    soil_api_privileges: apiPrivileges(["DELETE", "INSERT", "SELECT", "UPDATE"]),
    taxonomy_column_count: 3,
    pheno_cross_policy_names: [
      "pheno_crosses_delete_own",
      "pheno_crosses_insert_own",
      "pheno_crosses_select_own",
      "pheno_crosses_update_own",
    ],
    pheno_reversal_policy_names: ["pheno_reversals_insert_own", "pheno_reversals_select_own"],
    pheno_cross_owner_policy_shape: [...phenoCrossOwnerPolicyShape],
    pheno_cross_owner_policy_definitions: phenoCrossOwnerPolicyDefinitions,
    pheno_reversal_owner_policy_shape: [...phenoReversalOwnerPolicyShape],
    pheno_reversal_owner_policy_definitions: phenoReversalOwnerPolicyDefinitions,
    pheno_reversal_column_shape: [...phenoReversalColumnShape],
    pheno_reversal_constraint_names: [...phenoReversalConstraintNames],
    pheno_reversal_constraint_definitions: phenoReversalConstraintDefinitions,
    pheno_reversal_index_names: [...phenoReversalIndexNames],
    pheno_reversal_index_definitions: phenoReversalIndexDefinitions,
    pheno_cross_column_names: [...phenoColumns],
    pheno_cross_column_shape: [...phenoColumnShape],
    pheno_cross_constraint_names: [...phenoConstraintNames],
    pheno_cross_constraint_definitions: phenoConstraintDefinitions,
    pheno_cross_index_names: [...phenoIndexNames],
    pheno_cross_index_definitions: phenoIndexDefinitions,
    pheno_cross_trigger_shape: [
      "pheno_crosses_set_updated_at|O|" +
        "createtriggerpheno_crosses_set_updated_atbeforeupdateon" +
        "pheno_crossesforeachrowexecutefunctionset_updated_at()",
    ],
    pheno_cross_column_count: 14,
    pheno_cross_constraint_count: 11,
    pheno_cross_index_count: 7,
    pheno_cross_authenticated_grants: ["DELETE", "INSERT", "SELECT", "UPDATE"],
    pheno_reversal_authenticated_grants: ["INSERT", "SELECT"],
    pheno_public_or_anon_grant_count: 0,
    pheno_cross_api_privileges: apiPrivileges(["DELETE", "INSERT", "SELECT", "UPDATE"]),
    pheno_reversal_api_privileges: apiPrivileges(["INSERT", "SELECT"]),
    pheno_cross_rls_contract: true,
    pheno_reversal_rls_contract: true,
    pheno_service_role_core_grants: true,
    schema_audit_canonical_count: 1,
    schema_audit_overload_count: 1,
    schema_audit_security_definer: true,
    schema_audit_stable: true,
    schema_audit_search_path_pinned: true,
    schema_audit_role_gate_pinned: true,
    schema_audit_authenticated_can_execute: true,
    schema_audit_anon_cannot_execute: true,
    schema_audit_service_role_cannot_execute: true,
    schema_audit_prosrc: expectedFunctionBodies.schema_audit,
    credit_spend_exists: true,
    credit_refund_exists: true,
    credit_results_exists: true,
    credit_spend_security_definer: true,
    credit_spend_search_path_pinned: true,
    credit_spend_receipt_snapshot: true,
    credit_spend_prosrc: expectedFunctionBodies.credit_spend,
    credit_refund_security_definer: true,
    credit_refund_search_path_pinned: true,
    credit_refund_prosrc: expectedFunctionBodies.credit_refund,
    credit_spend_service_only: true,
    credit_refund_service_only: true,
    credit_results_service_only: true,
    credit_results_api_privileges: ["service_role|SELECT"],
    credit_legacy_spend_safe: true,
    credit_legacy_refund_safe: true,
    pheno_identity: phenoIdentity,
    restrictive_policies: restrictivePolicies,
    ...overrides,
  };
}

function validEnvironment(overrides: Record<string, string> = {}) {
  return {
    TARGET_ENV: "production",
    CONFIRM_PROJECT_REF: PRODUCTION_PROJECT_REF,
    CONFIRM_APPLY: APPLY_CONFIRMATION,
    EXPECTED_HEAD_SHA: HEAD_SHA,
    GITHUB_SHA: HEAD_SHA,
    SUPABASE_DB_URL: DATABASE_URL,
    PATH: process.env.PATH ?? "",
    ...overrides,
  };
}

function jsonResult(value: unknown) {
  return {
    status: 0,
    stdout: `${JSON.stringify(value)}\n`,
    stderr: "",
  };
}

function makeSpawnStub({
  preflight = makePreflight(),
  postflight = makePostflight(),
  exactPolicies = {
    required_policy_count: 10,
    active_policy_count: 10,
    definitions_exact: true,
    constraint_count: 23,
    constraints_exact: true,
  },
  applyStatus = 0,
}: {
  preflight?: Record<string, unknown>;
  postflight?: Record<string, unknown>;
  exactPolicies?: Record<string, unknown>;
  applyStatus?: number;
} = {}) {
  const calls: SpawnCall[] = [];
  let applySql = "";
  let applyPath = "";

  const spawnImpl = (command: string, args: string[], options: SpawnCall["options"]) => {
    calls.push({ command, args: [...args], options });
    if (args.includes("--file")) {
      applyPath = args[args.indexOf("--file") + 1] ?? "";
      applySql = readFileSync(applyPath, "utf8");
      return { status: applyStatus, stdout: "", stderr: "" };
    }

    const sql = args[args.indexOf("-c") + 1];
    if (sql === PREFLIGHT_SQL) return jsonResult(preflight);
    if (sql === POSTFLIGHT_SQL) return jsonResult(postflight);
    if (sql === canonicalPolicyVerificationSql) return jsonResult(exactPolicies);
    return { status: 1, stdout: "", stderr: "unexpected query" };
  };

  return {
    calls,
    spawnImpl,
    getApplySql: () => applySql,
    getApplyPath: () => applyPath,
  };
}

function makeLogger() {
  const messages: string[] = [];
  return {
    messages,
    logger: {
      log: vi.fn((message: unknown) => messages.push(String(message))),
      error: vi.fn((message: unknown) => messages.push(String(message))),
    },
  };
}

let testRoot: string;

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), "verdant-production-apply-test-"));
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe("pinned production migration manifest", () => {
  it("pins the reviewed files in timestamp order with their exact hashes", () => {
    expect(PINNED_PRODUCTION_MIGRATIONS).toEqual([
      {
        version: "20260728090000",
        name: "production_schema_reconciliation",
        file: "20260728090000_production_schema_reconciliation.sql",
        sha256: "7E4912B4C58EFCFE6BCE208F94704B28C99A5A064FD93763DED905E232BF17ED",
      },
      {
        version: "20260728090736",
        name: "ai_credit_pack_portability",
        file: "20260728090736_ai_credit_pack_portability.sql",
        sha256: "4BECC6A071FB29A068F9E595A69291029AB5C45857DE9DE71F1FC73A4FE161E2",
      },
      {
        version: "20260728103000",
        name: "schema_audit_trust_hardening",
        file: "20260728103000_schema_audit_trust_hardening.sql",
        sha256: "97FBF04BE7CF320B450A7C19E5017943466D22D6977668E22AF8A40988403A9F",
      },
    ]);

    expect(PINNED_PRODUCTION_MIGRATIONS.map(({ version }) => version)).toEqual(
      [...PINNED_PRODUCTION_MIGRATIONS].map(({ version }) => version).sort(),
    );
    expect(PINNED_SECURITY_REFERENCE_FILES).toEqual([
      {
        version: "20260727050000",
        name: "ai_credit_service_contract_forward_reassert",
        file: "20260727050000_ai_credit_service_contract_forward_reassert.sql",
        sha256: "5C428B5FCD4AD7AA2EF6673CCE36DDAF9B3BDB94298F6BF420A6266B7166BB78",
      },
    ]);
  });

  it("validates the real LF bytes, final newlines, and reviewed SHA-256 values", () => {
    const validated = validatePinnedMigrationFiles({
      root: MIGRATIONS_ROOT,
      readFile: readLfCheckoutFile,
    });

    expect(validated.map(({ version }) => version)).toEqual(
      PINNED_PRODUCTION_MIGRATIONS.map(({ version }) => version),
    );
    for (const migration of validated) {
      const bytes = readLfCheckoutFile(migration.path);
      const actualHash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
      expect(actualHash).toBe(migration.sha256);
      expect(migration.text).not.toContain("\r");
      expect(migration.text.endsWith("\n")).toBe(true);
      expect(migration.text).not.toMatch(/^\s*(?:begin|commit|rollback)\s*;/gim);
      expect(migration.text).not.toMatch(/\b(?:vacuum|create\s+database|drop\s+database)\b/i);
      expect(migration.text).not.toMatch(/\bconcurrently\b/i);
      expect(migration.text).not.toMatch(/\balter\s+type\b[\s\S]{0,200}\badd\s+value\b/i);
    }
  });

  it("rejects any byte change before database access can be considered", () => {
    const readFile = (path: string) => {
      const bytes = readFileSync(path);
      if (basename(path) === PINNED_PRODUCTION_MIGRATIONS[0].file) {
        return Buffer.concat([bytes, Buffer.from("-- changed\n")]);
      }
      return bytes;
    };

    expect(() => validatePinnedMigrationFiles({ readFile })).toThrow(
      `hash_mismatch:${PINNED_PRODUCTION_MIGRATIONS[0].version}`,
    );
  });

  it("hash-pins the read-only refund reference without adding it to the apply manifest", () => {
    const [reference] = validatePinnedSecurityReferenceFiles({
      root: MIGRATIONS_ROOT,
      readFile: readLfCheckoutFile,
    });

    expect(reference.version).toBe("20260727050000");
    expect(reference.text).toContain("CREATE OR REPLACE FUNCTION public.ai_credit_refund(");
    expect(expectedFunctionBodies.credit_refund).toContain("v_existing_refund");
    expect(buildApplySql(validatedFixtureMigrations)).not.toContain(reference.text);
    expect(buildApplySql(validatedFixtureMigrations)).not.toContain(reference.file);
  });

  it("rejects a changed read-only security reference before database access", () => {
    const readFile = (path: string) => {
      const bytes = readLfCheckoutFile(path);
      return basename(path) === PINNED_SECURITY_REFERENCE_FILES[0].file
        ? Buffer.concat([bytes, Buffer.from("-- changed\n")])
        : bytes;
    };

    expect(() => validatePinnedSecurityReferenceFiles({ readFile })).toThrow(
      `security_reference_hash_mismatch:${PINNED_SECURITY_REFERENCE_FILES[0].version}`,
    );
  });

  it("retains explicit CRLF, transaction-control, and forbidden-statement fences", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");

    expect(source).toContain('text.includes("\\r")');
    expect(source).toContain("crlf_not_allowed:");
    expect(source).toContain("transaction_control_not_allowed:");
    expect(findUnsafeSqlReason("BEGIN;")).toBe("transaction_control");
    expect(findUnsafeSqlReason("START TRANSACTION;")).toBe("transaction_control");
    expect(findUnsafeSqlReason("END;")).toBe("transaction_control");
    expect(findUnsafeSqlReason("END WORK;")).toBe("transaction_control");
    expect(findUnsafeSqlReason("END TRANSACTION;")).toBe("transaction_control");
    expect(findUnsafeSqlReason("PREPARE TRANSACTION 'x';")).toBe("transaction_control");
    expect(findUnsafeSqlReason("\\i ./another.sql")).toBe("psql_external_input");
    expect(findUnsafeSqlReason("VACUUM public.plants;")).toBe("transaction_forbidden_statement");
    expect(findUnsafeSqlReason("CREATE INDEX CONCURRENTLY plants_idx ON public.plants (id);")).toBe(
      "transaction_forbidden_statement",
    );
    expect(findUnsafeSqlReason("ALTER TYPE public.stage ADD VALUE 'unsafe';")).toBe(
      "transaction_forbidden_statement",
    );
    expect(findUnsafeSqlReason("COPY public.plants TO PROGRAM 'this must never execute';")).toBe(
      "transaction_forbidden_statement",
    );
    expect(
      findUnsafeSqlReason(`
        -- COMMIT;
        select 'VACUUM';
        do $body$ begin perform 'CREATE DATABASE'; end; $body$;
      `),
    ).toBeNull();
  });
});

describe("target ledger classification", () => {
  it("selects apply only when all three target rows are absent", () => {
    expect(classifyTargetLedger(makeTargets("apply"))).toEqual({
      status: "apply",
    });
  });

  it("selects verify-only only when all three version/name pairs are exact", () => {
    expect(classifyTargetLedger(makeTargets("verify_only"))).toEqual({
      status: "verify_only",
    });
  });

  it("rejects partial target application", () => {
    expect(classifyTargetLedger(makeTargets("mixed"))).toEqual({
      status: "mixed",
      reason: "partial_target_application",
    });
  });

  it("rejects version or name collisions", () => {
    expect(classifyTargetLedger(makeTargets("collision"))).toEqual({
      status: "collision",
      reason: `target_collision:${PINNED_PRODUCTION_MIGRATIONS[0].version}`,
    });

    const duplicateName = makeTargets("apply");
    duplicateName[1].matches = [
      {
        version: "20200101000000",
        name: PINNED_PRODUCTION_MIGRATIONS[1].name,
      },
    ];
    expect(classifyTargetLedger(duplicateName)).toEqual({
      status: "collision",
      reason: `target_collision:${PINNED_PRODUCTION_MIGRATIONS[1].version}`,
    });
  });

  it("fails closed on malformed target results", () => {
    expect(classifyTargetLedger([])).toEqual({
      status: "invalid",
      reason: "target_count",
    });
    expect(
      classifyTargetLedger(
        makeTargets("apply").map((target, index) =>
          index === 2 ? { ...target, matches: undefined } : target,
        ),
      ),
    ).toEqual({
      status: "invalid",
      reason: `target_missing:${PINNED_PRODUCTION_MIGRATIONS[2].version}`,
    });
  });
});

describe("single-transaction SQL construction", () => {
  it("embeds exact bodies in order and records each current ledger row once after them", () => {
    const validated = validatePinnedMigrationFiles({
      root: MIGRATIONS_ROOT,
      readFile: readLfCheckoutFile,
    });
    const sql = buildApplySql(validated);
    const markerIndexes = PINNED_PRODUCTION_MIGRATIONS.map(({ file }) =>
      sql.indexOf(`-- BEGIN EXACT PINNED FILE: ${file}`),
    );

    expect(markerIndexes.every((index) => index >= 0)).toBe(true);
    expect(markerIndexes).toEqual([...markerIndexes].sort((a, b) => a - b));
    for (const migration of validated) {
      expect(sql.split(migration.text)).toHaveLength(2);
      expect(sql).toContain(`sha256=${migration.sha256}`);
    }

    const lastBodyEnd = sql.lastIndexOf("-- END EXACT PINNED FILE:");
    const ledgerTail = sql.slice(sql.indexOf("\n", lastBodyEnd));
    expect(ledgerTail.match(/insert into supabase_migrations\.schema_migrations/g)).toHaveLength(1);
    expect(ledgerTail).not.toMatch(/\bon\s+conflict\b/i);
    for (const migration of PINNED_PRODUCTION_MIGRATIONS) {
      expect(ledgerTail.match(new RegExp(`'${migration.version}'`, "g"))).toHaveLength(1);
      expect(ledgerTail).toContain(`'${migration.name}'`);
    }
  });

  it("requires the exact manifest count and order", () => {
    const validated = validatePinnedMigrationFiles({
      root: MIGRATIONS_ROOT,
      readFile: readLfCheckoutFile,
    });

    expect(() => buildApplySql(validated.slice(0, 2))).toThrow("validated_migration_count");
    expect(() => buildApplySql([validated[1], validated[0], validated[2]])).toThrow(
      `validated_migration_order:${PINNED_PRODUCTION_MIGRATIONS[0].version}`,
    );
    expect(() =>
      buildApplySql([{ ...validated[0], sha256: "0".repeat(64) }, validated[1], validated[2]]),
    ).toThrow(`validated_migration_order:${PINNED_PRODUCTION_MIGRATIONS[0].version}`);
  });

  it("builds exact policy verification from the hash-pinned policy bodies only", () => {
    expect(canonicalPolicyVerificationSql).toContain(
      "create temporary table verdant_observed_policy_contract",
    );
    expect(canonicalPolicyVerificationSql).toContain("ON pg_temp.soil_moisture_calibrations");
    expect(canonicalPolicyVerificationSql).toContain("ON pg_temp.pheno_crosses");
    expect(canonicalPolicyVerificationSql).toContain("ON pg_temp.pheno_reversals");
    expect(canonicalPolicyVerificationSql).toContain(
      'CREATE POLICY "Users insert own soil moisture calibrations"',
    );
    expect(canonicalPolicyVerificationSql).toContain('CREATE POLICY "pheno_crosses_update_own"');
    expect(canonicalPolicyVerificationSql).toContain('CREATE POLICY "pheno_reversals_insert_own"');
    expect(canonicalPolicyVerificationSql).toContain(
      'CREATE POLICY "pheno_crosses_pro_required_delete"',
    );
    expect(canonicalPolicyVerificationSql).toContain(
      "'definitions_exact', not exists (select 1 from policy_differences)",
    );
    expect(canonicalPolicyVerificationSql).toContain(
      "'constraints_exact', not exists (select 1 from constraint_differences)",
    );
    expect(canonicalPolicyVerificationSql).toContain(
      "create temporary table verdant_parent_public_grows",
    );
    expect(canonicalPolicyVerificationSql).toContain(
      "references pg_temp.verdant_parent_public_grows(id) on delete cascade",
    );
    expect(canonicalPolicyVerificationSql).toContain(
      "references pg_temp.verdant_parent_auth_users(id) on delete cascade",
    );
    expect(canonicalPolicyVerificationSql).not.toMatch(
      /constraint\s+\w+_fkey[\s\S]{0,100}references\s+(?:public|auth)\./i,
    );
    expect(canonicalPolicyVerificationSql).toContain(
      "pg_catalog.pg_get_constraintdef(constraint_row.oid, false)",
    );
    expect(canonicalPolicyVerificationSql).toContain("constraint_row.confdeltype");
    expect(canonicalPolicyVerificationSql).not.toContain("DROP POLICY");
    expect(canonicalPolicyVerificationSql).not.toMatch(/CREATE POLICY[\s\S]*ON public\./);
    expect(canonicalPolicyVerificationSql.trim().endsWith("rollback;")).toBe(true);
    expect(expectedFunctionBodies.schema_audit).toContain("RAISE EXCEPTION 'forbidden'");
    expect(expectedFunctionBodies.credit_spend).toContain("v_receipt_snapshot");
    expect(expectedFunctionBodies.credit_refund).toContain("v_existing_refund");
  });

  it("keeps read-only preflight guards for role, ledger, prerequisites, identity, and policies", () => {
    expect(PREFLIGHT_SQL).toContain("'current_user', current_user");
    expect(PREFLIGHT_SQL).toContain("'ledger_columns'");
    expect(PREFLIGHT_SQL).toContain("'ledger_ordered_columns'");
    expect(PREFLIGHT_SQL).toContain("'ledger_primary_key'");
    expect(PREFLIGHT_SQL).toContain("'dependencies'");
    expect(PREFLIGHT_SQL).toContain("to_regclass('public.pheno_crosses')");
    expect(PREFLIGHT_SQL).toContain("to_regclass('public.ai_credit_grants')");
    expect(PREFLIGHT_SQL).toContain("to_regprocedure('public.has_role(uuid,public.app_role)')");
    expect(PREFLIGHT_SQL).toContain("'schema_audit_overloads_safe'");
    expect(PREFLIGHT_SQL).toContain("'pheno_identity'");
    expect(PREFLIGHT_SQL).toContain("'restrictive_policies'");
    expect(PREFLIGHT_SQL).toContain("sm.version = e.version or sm.name = e.name");
  });
});

describe("production runner", () => {
  it("rejects confirmation or commit mismatches before file or database access", () => {
    const spawnImpl = vi.fn();
    const readFile = vi.fn(() => {
      throw new Error("must not read");
    });
    const { logger } = makeLogger();

    const result = runPinnedProductionMigrations({
      env: validEnvironment({ CONFIRM_APPLY: "yes" }),
      spawnImpl,
      readFile,
      logger,
    });

    expect(result).toBe(EXIT.INPUT_REJECTED);
    expect(readFile).not.toHaveBeenCalled();
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("rejects a missing secret and a different Supabase project before psql", () => {
    const spawnImpl = vi.fn();
    const { logger } = makeLogger();

    expect(
      runPinnedProductionMigrations({
        env: validEnvironment({ SUPABASE_DB_URL: "" }),
        spawnImpl,
        logger,
      }),
    ).toBe(EXIT.NO_DATABASE_URL);

    expect(
      runPinnedProductionMigrations({
        env: validEnvironment({
          SUPABASE_DB_URL:
            "postgresql://postgres:secret@db.bzatgtgjvuojpoxcknaa.supabase.co:5432/postgres",
        }),
        spawnImpl,
        logger,
      }),
    ).toBe(EXIT.TARGET_REJECTED);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("repair probes disclose only booleans — never credential-derived measurements", () => {
    const productionUrl = DATABASE_URL;
    const quoteWrapped = `"${productionUrl}"`;
    const bomPrefixed = "﻿" + productionUrl;
    const bomAndQuotes = "﻿" + quoteWrapped;
    const barePassword = "just-a-secret-password-value";

    expect(describeDatabaseUrlRepairProbes(quoteWrapped)).toEqual({
      starts_with_postgres_scheme: false,
      pins_production_after_unquote: true,
      pins_production_after_bom_strip: false,
      pins_production_after_bom_strip_and_unquote: false,
    });
    expect(describeDatabaseUrlRepairProbes(bomPrefixed).pins_production_after_bom_strip).toBe(true);
    expect(
      describeDatabaseUrlRepairProbes(bomAndQuotes).pins_production_after_bom_strip_and_unquote,
    ).toBe(true);

    // A mis-set bare password yields only four booleans, all false-ish facts:
    // no length, no character codes, no counts, no string fragments.
    const passwordProbes = describeDatabaseUrlRepairProbes(barePassword);
    expect(passwordProbes).toEqual({
      starts_with_postgres_scheme: false,
      pins_production_after_unquote: false,
      pins_production_after_bom_strip: false,
      pins_production_after_bom_strip_and_unquote: false,
    });
    for (const value of Object.values(passwordProbes)) {
      expect(typeof value).toBe("boolean");
    }
  });

  it("records only repair-probe booleans in the artifacts on target rejection", () => {
    const spawnImpl = vi.fn();
    const { logger } = makeLogger();
    const reportPath = join(testRoot, "probes", "report.md");
    const auditPath = join(testRoot, "probes", "audit.json");
    const badUrl = `"${DATABASE_URL}"`;

    expect(
      runPinnedProductionMigrations({
        env: validEnvironment({
          SUPABASE_DB_URL: badUrl,
          REPORT_PATH: reportPath,
          AUDIT_PATH: auditPath,
        }),
        spawnImpl,
        logger,
      }),
    ).toBe(EXIT.TARGET_REJECTED);

    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    expect(audit.outcome).toBe("target_rejected");
    expect(audit.url_repair_probes).toEqual({
      starts_with_postgres_scheme: false,
      pins_production_after_unquote: true,
      pins_production_after_bom_strip: false,
      pins_production_after_bom_strip_and_unquote: false,
    });
    // No value material anywhere: not the URL, not the password, no lengths
    // or character codes.
    for (const artifact of [readFileSync(auditPath, "utf8"), readFileSync(reportPath, "utf8")]) {
      expect(artifact).not.toContain(DATABASE_URL);
      expect(artifact).not.toContain(PASSWORD);
      expect(artifact).not.toMatch(/first_char|last_char|length|_count/);
    }
    expect(readFileSync(reportPath, "utf8")).toContain("Repair probes:");
  });

  it("rejects a changed migration before invoking psql", () => {
    const spawnImpl = vi.fn();
    const { logger } = makeLogger();
    const readFile = (path: string) => {
      const bytes = readFileSync(path);
      return basename(path) === PINNED_PRODUCTION_MIGRATIONS[0].file
        ? Buffer.concat([bytes, Buffer.from(" ")])
        : bytes;
    };

    const result = runPinnedProductionMigrations({
      env: validEnvironment(),
      spawnImpl,
      readFile,
      logger,
    });

    expect(result).toBe(EXIT.FILE_REJECTED);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("rejects a changed refund reference before invoking psql", () => {
    const spawnImpl = vi.fn();
    const { logger } = makeLogger();
    const readFile = (path: string) => {
      const bytes = readLfCheckoutFile(path);
      return basename(path) === PINNED_SECURITY_REFERENCE_FILES[0].file
        ? Buffer.concat([bytes, Buffer.from(" ")])
        : bytes;
    };

    const result = runPinnedProductionMigrations({
      env: validEnvironment(),
      spawnImpl,
      readFile,
      logger,
    });

    expect(result).toBe(EXIT.FILE_REJECTED);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("rejects an unexpected preflight role or missing prerequisite without applying", () => {
    const wrongRole = makePreflight("apply");
    wrongRole.current_user = "authenticated";
    const baseline = makePreflight("apply");
    const missingDependency = {
      ...baseline,
      dependencies: {
        ...baseline.dependencies,
        pheno_crosses: false,
      },
    };

    for (const preflight of [wrongRole, missingDependency]) {
      const stub = makeSpawnStub({ preflight });
      const { logger } = makeLogger();

      const result = runPinnedProductionMigrations({
        env: validEnvironment(),
        spawnImpl: stub.spawnImpl,
        readFile: readLfCheckoutFile,
        logger,
      });

      expect(result).toBe(EXIT.PREFLIGHT_FAILED);
      expect(stub.calls).toHaveLength(1);
      expect(stub.calls.some(({ args }) => args.includes("--file"))).toBe(false);
    }
  });

  it("applies all three files through psql single-transaction and verifies postflight", () => {
    const stub = makeSpawnStub();
    const { logger, messages } = makeLogger();

    const result = runPinnedProductionMigrations({
      env: validEnvironment(),
      spawnImpl: stub.spawnImpl,
      readFile: readLfCheckoutFile,
      logger,
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    });

    expect(result, messages.join("\n")).toBe(EXIT.OK);
    expect(stub.calls).toHaveLength(4);
    const applyCall = stub.calls.find(({ args }) => args.includes("--file"));
    expect(applyCall?.command).toBe("psql");
    expect(applyCall?.args).toEqual(
      expect.arrayContaining([
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "--single-transaction",
        "--file",
      ]),
    );
    expect(applyCall?.options.env?.PGSSLMODE).toBe("verify-full");
    expect(applyCall?.options.env?.PGDATABASE).not.toContain("application_name");
    expect(stub.getApplySql()).toContain(
      `-- BEGIN EXACT PINNED FILE: ${PINNED_PRODUCTION_MIGRATIONS[0].file}`,
    );
    expect(stub.getApplySql()).not.toContain(PINNED_SECURITY_REFERENCE_FILES[0].file);
    expect(stub.getApplyPath()).not.toBe("");
    expect(existsSync(stub.getApplyPath())).toBe(false);
  });

  it("performs no persistent migration write when all exact ledger rows already exist", () => {
    const reportPath = join(testRoot, "verify-only", "report.md");
    const auditPath = join(testRoot, "verify-only", "audit.json");
    const stub = makeSpawnStub({
      preflight: makePreflight("verify_only"),
    });
    const { logger, messages } = makeLogger();

    const result = runPinnedProductionMigrations({
      env: validEnvironment({ REPORT_PATH: reportPath, AUDIT_PATH: auditPath }),
      spawnImpl: stub.spawnImpl,
      readFile: readLfCheckoutFile,
      logger,
    });

    expect(result).toBe(EXIT.OK);
    expect(stub.calls).toHaveLength(3);
    expect(stub.calls.some(({ args }) => args.includes("--file"))).toBe(false);
    expect(messages.join("\n")).toContain("already applied and are verified");
    expect(readFileSync(reportPath, "utf8")).toContain(
      "no persistent production migration write was attempted",
    );
  });

  it("fails a weakened verify-only catalog contract without submitting an apply file", () => {
    const stub = makeSpawnStub({
      preflight: makePreflight("verify_only"),
      exactPolicies: {
        required_policy_count: 10,
        active_policy_count: 10,
        definitions_exact: true,
        constraint_count: 23,
        constraints_exact: false,
      },
    });
    const { logger } = makeLogger();

    const result = runPinnedProductionMigrations({
      env: validEnvironment(),
      spawnImpl: stub.spawnImpl,
      readFile: readLfCheckoutFile,
      logger,
    });

    expect(result).toBe(EXIT.POSTFLIGHT_FAILED);
    expect(stub.calls).toHaveLength(3);
    expect(stub.calls.some(({ args }) => args.includes("--file"))).toBe(false);
  });

  it("rejects a historical same-name ledger collision during verify-only", () => {
    const stub = makeSpawnStub({
      preflight: makePreflight("verify_only"),
      postflight: makePostflight({ ledger_collision_count: 1 }),
    });
    const { logger } = makeLogger();

    const result = runPinnedProductionMigrations({
      env: validEnvironment(),
      spawnImpl: stub.spawnImpl,
      readFile: readLfCheckoutFile,
      logger,
    });

    expect(result).toBe(EXIT.POSTFLIGHT_FAILED);
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls.some(({ args }) => args.includes("--file"))).toBe(false);
    expect(POSTFLIGHT_SQL).toContain(
      "collision.version = collision_expected.version\n        or collision.name = collision_expected.name",
    );
  });

  it("blocks mixed ledger state without applying or postflight verification", () => {
    const stub = makeSpawnStub({ preflight: makePreflight("mixed") });
    const { logger } = makeLogger();

    const result = runPinnedProductionMigrations({
      env: validEnvironment(),
      spawnImpl: stub.spawnImpl,
      readFile: readLfCheckoutFile,
      logger,
    });

    expect(result).toBe(EXIT.LEDGER_DRIFT);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls.some(({ args }) => args.includes("--file"))).toBe(false);
  });

  it("reports a failed apply as rolled back and does not run postflight", () => {
    const stub = makeSpawnStub({ applyStatus: 1 });
    const { logger, messages } = makeLogger();

    const result = runPinnedProductionMigrations({
      env: validEnvironment(),
      spawnImpl: stub.spawnImpl,
      readFile: readLfCheckoutFile,
      logger,
    });

    expect(result).toBe(EXIT.APPLY_FAILED);
    expect(stub.calls).toHaveLength(2);
    expect(messages.join("\n")).toContain("failed and was rolled back");
  });

  it("allows concurrent pheno inserts between unlocked preflight and postflight snapshots", () => {
    const stub = makeSpawnStub({
      postflight: makePostflight({
        pheno_identity: {
          ...phenoIdentity,
          pheno_crosses: { row_count: 3, ids_md5: "concurrent-insert" },
        },
      }),
    });
    const { logger, messages } = makeLogger();

    const result = runPinnedProductionMigrations({
      env: validEnvironment(),
      spawnImpl: stub.spawnImpl,
      readFile: readLfCheckoutFile,
      logger,
    });

    expect(result, messages.join("\n")).toBe(EXIT.OK);
    expect(stub.calls).toHaveLength(4);
  });

  it("fails closed when postflight schema or policy preservation checks differ", () => {
    for (const postflight of [
      makePostflight({ ledger_collision_count: 1 }),
      makePostflight({ soil_column_count: 15 }),
      makePostflight({ restrictive_policies: [] }),
    ]) {
      const stub = makeSpawnStub({ postflight });
      const { logger } = makeLogger();
      expect(
        runPinnedProductionMigrations({
          env: validEnvironment(),
          spawnImpl: stub.spawnImpl,
          readFile: readLfCheckoutFile,
          logger,
        }),
      ).toBe(EXIT.POSTFLIGHT_FAILED);
    }
  });

  it("rejects weakened catalog definitions and changed canonical function bodies", () => {
    const cases = [
      makeSpawnStub({
        exactPolicies: {
          required_policy_count: 10,
          active_policy_count: 10,
          definitions_exact: false,
          constraint_count: 23,
          constraints_exact: true,
        },
      }),
      makeSpawnStub({
        exactPolicies: {
          required_policy_count: 10,
          active_policy_count: 10,
          definitions_exact: true,
          constraint_count: 23,
          constraints_exact: false,
        },
      }),
      makeSpawnStub({
        postflight: makePostflight({
          schema_audit_prosrc: `${expectedFunctionBodies.schema_audit}\n-- weakened`,
        }),
      }),
      makeSpawnStub({
        postflight: makePostflight({
          credit_spend_prosrc: `${expectedFunctionBodies.credit_spend}\n-- changed`,
        }),
      }),
      makeSpawnStub({
        postflight: makePostflight({
          credit_refund_prosrc: `${expectedFunctionBodies.credit_refund}\n-- changed`,
        }),
      }),
    ];

    for (const stub of cases) {
      const { logger } = makeLogger();
      const result = runPinnedProductionMigrations({
        env: validEnvironment(),
        spawnImpl: stub.spawnImpl,
        readFile: readLfCheckoutFile,
        logger,
      });

      expect(result).toBe(EXIT.POSTFLIGHT_FAILED);
      expect(stub.calls).toHaveLength(4);
    }
  });

  it.each([
    {
      risk: "swapped named schema objects",
      postflight: makePostflight({
        soil_index_names: [soilIndexNames[1], soilIndexNames[0], ...soilIndexNames.slice(2)],
      }),
    },
    {
      risk: "changed column shape",
      postflight: makePostflight({
        soil_column_shape: soilColumnShape.map((shape, index) =>
          index === 8 ? shape.replace("numeric", "text") : shape,
        ),
      }),
    },
    {
      risk: "wrong constraint definition",
      postflight: makePostflight({
        pheno_cross_constraint_definitions: phenoConstraintDefinitions.replace(
          "referencesauth.users(id)ondeletecascade",
          "referencesauth.users(id)ondeletesetnull",
        ),
      }),
    },
    {
      risk: "renamed policy",
      postflight: makePostflight({
        soil_policy_shape: soilPolicyShape.map((shape, index) =>
          index === 0 ? shape.replace("Users delete", "Growers delete") : shape,
        ),
      }),
    },
    {
      risk: "renamed trigger",
      postflight: makePostflight({
        pheno_cross_trigger_shape: [
          "unexpected_trigger|O|" +
            "createtriggerunexpected_triggerbeforeupdateon" +
            "pheno_crossesforeachrowexecutefunctionset_updated_at()",
        ],
      }),
    },
    {
      risk: "RLS disabled",
      postflight: makePostflight({ pheno_cross_rls_contract: false }),
    },
    {
      risk: "browser write grant on credit receipts",
      postflight: makePostflight({
        credit_results_api_privileges: ["authenticated|INSERT", "service_role|SELECT"],
      }),
    },
    {
      risk: "refund function without SECURITY DEFINER",
      postflight: makePostflight({ credit_refund_security_definer: false }),
    },
    {
      risk: "refund function with a changed search path",
      postflight: makePostflight({ credit_refund_search_path_pinned: false }),
    },
    {
      risk: "legacy credit overload remains callable",
      postflight: makePostflight({ credit_legacy_spend_safe: false }),
    },
    {
      risk: "Schema Audit role gate missing",
      postflight: makePostflight({ schema_audit_role_gate_pinned: false }),
    },
  ])("rejects $risk even when aggregate counts remain correct", ({ postflight }) => {
    const stub = makeSpawnStub({ postflight });
    const { logger } = makeLogger();

    const result = runPinnedProductionMigrations({
      env: validEnvironment(),
      spawnImpl: stub.spawnImpl,
      readFile: readLfCheckoutFile,
      logger,
    });

    expect(result).toBe(EXIT.POSTFLIGHT_FAILED);
    expect(stub.calls).toHaveLength(4);
  });

  it("never writes the password or raw database URL to logs or artifacts", () => {
    const reportPath = join(testRoot, "evidence", "report.md");
    const auditPath = join(testRoot, "evidence", "audit.json");
    const stub = makeSpawnStub();
    const { logger, messages } = makeLogger();

    const result = runPinnedProductionMigrations({
      env: validEnvironment({ REPORT_PATH: reportPath, AUDIT_PATH: auditPath }),
      spawnImpl: stub.spawnImpl,
      readFile: readLfCheckoutFile,
      logger,
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    });

    expect(result).toBe(EXIT.OK);
    const userVisibleEvidence = [
      ...messages,
      readFileSync(reportPath, "utf8"),
      readFileSync(auditPath, "utf8"),
    ].join("\n");
    expect(userVisibleEvidence).not.toContain(PASSWORD);
    expect(userVisibleEvidence).not.toContain(DATABASE_URL);
    expect(userVisibleEvidence).not.toContain("PGDATABASE");
    expect(JSON.parse(readFileSync(auditPath, "utf8"))).toMatchObject({
      outcome: "applied_verified",
      target_env: "production",
      project_ref: PRODUCTION_PROJECT_REF,
      expected_head_sha: HEAD_SHA,
      observed_head_sha: HEAD_SHA,
      ledger_state: "apply",
    });
  });
});

describe("manual workflow safety contract", () => {
  it("is manual-only, least-privilege, environment-gated, and branch/SHA pinned", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toMatch(/\bon:\s*\r?\n\s+workflow_dispatch:/);
    expect(workflow).not.toMatch(/^\s+(?:push|pull_request|schedule):/m);
    expect(workflow).toMatch(/permissions:\s*\r?\n\s+contents:\s+read/);
    expect(workflow).toContain("environment: verdant-production");
    expect(workflow).toContain('if [ "$OBSERVED_REF" != "refs/heads/verdant-grow-diary" ]');
    expect(workflow).toContain("EXPECTED_HEAD_SHA: ${{ inputs.expected_head_sha }}");
    expect(workflow).toContain("CONFIRM_PROJECT_REF: ${{ inputs.confirm_project_ref }}");
    expect(workflow).toContain("CONFIRM_APPLY: ${{ inputs.confirm_apply }}");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("OBSERVED_REF: ${{ github.ref }}");
    expect(workflow).toContain("OBSERVED_SHA: ${{ github.sha }}");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("queue: max");
    expect(workflow).toMatch(
      /name: Upload sanitized evidence[\s\S]*if-no-files-found: error[\s\S]*retention-days: 30/,
    );
  });

  it("validates confirmations without secrets before opening the protected apply job", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const validateStart = workflow.indexOf("\n  validate:");
    const applyStart = workflow.indexOf("\n  apply:");
    const validateJob = workflow.slice(validateStart, applyStart);
    const applyJob = workflow.slice(applyStart);
    const applyJobEnv = applyJob.slice(
      applyJob.indexOf("\n    env:"),
      applyJob.indexOf("\n    steps:"),
    );

    expect(validateStart).toBeGreaterThan(0);
    expect(applyStart).toBeGreaterThan(validateStart);
    expect(validateJob).toContain("name: Validate the production dispatch");
    expect(validateJob).toContain('if [ "$OBSERVED_REF" != "refs/heads/verdant-grow-diary" ]');
    expect(validateJob).toContain('if [ "$CONFIRM_PROJECT_REF" != "knkwiiywfkbqznbxwqfh" ]');
    expect(validateJob).toContain(
      'if [ "$CONFIRM_APPLY" != "APPLY PINNED PRODUCTION MIGRATIONS" ]',
    );
    expect(validateJob).not.toContain("environment: verdant-production");
    expect(validateJob).not.toContain("SUPABASE_DB_URL");
    expect(validateJob).not.toContain("secrets.");

    expect(applyJob).toContain("needs: validate");
    expect(applyJob).toContain("environment: verdant-production");
    expect(applyJobEnv).not.toContain("SUPABASE_DB_URL");
    expect(
      workflow.match(/^\s+SUPABASE_DB_URL:\s+\$\{\{\s*secrets\.SUPABASE_DB_URL\s*\}\}$/gm),
    ).toHaveLength(1);
    expect([...workflow.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)]).toEqual([
      expect.arrayContaining(["SUPABASE_DB_URL"]),
      expect.arrayContaining(["SUPABASE_DB_URL"]),
    ]);
    expect(applyJob).toMatch(
      /- name: Apply only the three reviewed migrations\s+env:\s+SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/,
    );
  });

  it("uses pinned actions and invokes only the narrow runner, never generic migration commands", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const externalActions = [...workflow.matchAll(/uses:\s+([^#\s]+)(?:\s+#.*)?$/gm)]
      .map((match) => match[1])
      .filter((action) => !action.startsWith("./"));

    expect(externalActions.length).toBeGreaterThan(0);
    for (const action of externalActions) {
      expect(action).toMatch(/@[0-9a-f]{40}$/);
    }
    expect(workflow).toContain("node scripts/apply-pinned-production-migrations.mjs");
    expect(workflow).not.toMatch(/\bsupabase\s+db\s+push\b/i);
    expect(workflow).not.toMatch(/\bmigration\s+repair\b/i);
    expect(workflow).not.toContain("SERVICE_ROLE");
    expect(workflow).not.toContain("workflow_run:");
  });
});
