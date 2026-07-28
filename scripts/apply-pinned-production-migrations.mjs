#!/usr/bin/env node
/**
 * Manual, fail-closed production runner for Verdant's three reviewed
 * reconciliation migrations.
 *
 * This is intentionally not a generic migration runner. It will only read the
 * three files listed below, only accept their reviewed LF byte hashes, and only
 * connect to the pinned production Supabase project. Raw psql execution does
 * not update Supabase's migration tracker, so the generated single transaction
 * records each current migration after its exact body succeeds.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  sanitizeSupabaseDatabaseUrlForPsql,
  SupabaseDatabaseTargetIdentityError,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";

export const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
export const APPLY_CONFIRMATION = "APPLY PINNED PRODUCTION MIGRATIONS";

export const PINNED_PRODUCTION_MIGRATIONS = Object.freeze([
  Object.freeze({
    version: "20260728090000",
    name: "production_schema_reconciliation",
    file: "20260728090000_production_schema_reconciliation.sql",
    sha256: "7E4912B4C58EFCFE6BCE208F94704B28C99A5A064FD93763DED905E232BF17ED",
  }),
  Object.freeze({
    version: "20260728090736",
    name: "ai_credit_pack_portability",
    file: "20260728090736_ai_credit_pack_portability.sql",
    sha256: "4BECC6A071FB29A068F9E595A69291029AB5C45857DE9DE71F1FC73A4FE161E2",
  }),
  Object.freeze({
    version: "20260728103000",
    name: "schema_audit_trust_hardening",
    file: "20260728103000_schema_audit_trust_hardening.sql",
    sha256: "97FBF04BE7CF320B450A7C19E5017943466D22D6977668E22AF8A40988403A9F",
  }),
]);

export const PINNED_SECURITY_REFERENCE_FILES = Object.freeze([
  Object.freeze({
    version: "20260727050000",
    name: "ai_credit_service_contract_forward_reassert",
    file: "20260727050000_ai_credit_service_contract_forward_reassert.sql",
    sha256: "5C428B5FCD4AD7AA2EF6673CCE36DDAF9B3BDB94298F6BF420A6266B7166BB78",
  }),
]);

const HISTORICAL_LEDGER_ROWS = Object.freeze([
  Object.freeze({
    version: "20260619083000",
    name: "add_soil_moisture_calibration_v1",
  }),
  Object.freeze({
    version: "20260706191500",
    name: "pheno_crosses_foundation",
  }),
  Object.freeze({
    version: "20260707120001",
    name: "pheno_reversals_and_cross_types",
  }),
  Object.freeze({
    version: "20260707210000",
    name: "pheno_crosses_full_taxonomy",
  }),
]);

const EXPECTED_SOIL_COLUMNS = Object.freeze([
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
]);

const EXPECTED_SOIL_COLUMN_SHAPE = Object.freeze([
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
]);

const EXPECTED_SOIL_CONSTRAINTS = Object.freeze([
  "soil_moisture_calibrations_depth_check",
  "soil_moisture_calibrations_distinct_points_check",
  "soil_moisture_calibrations_finite_points_check",
  "soil_moisture_calibrations_grow_id_fkey",
  "soil_moisture_calibrations_pkey",
  "soil_moisture_calibrations_plant_id_fkey",
  "soil_moisture_calibrations_source_check",
  "soil_moisture_calibrations_tent_id_fkey",
]);

const EXPECTED_SOIL_INDEXES = Object.freeze([
  "soil_moisture_calibrations_active_probe_uidx",
  "soil_moisture_calibrations_pkey",
  "soil_moisture_calibrations_plant_idx",
  "soil_moisture_calibrations_user_grow_tent_idx",
]);

const EXPECTED_SOIL_POLICIES = Object.freeze([
  "Users delete own soil moisture calibrations|t|d|authenticated",
  "Users insert own soil moisture calibrations|t|a|authenticated",
  "Users update own soil moisture calibrations|t|w|authenticated",
  "Users view own soil moisture calibrations|t|r|authenticated",
]);

const FULL_TABLE_PRIVILEGES = Object.freeze([
  "DELETE",
  "INSERT",
  "MAINTAIN",
  "REFERENCES",
  "SELECT",
  "TRIGGER",
  "TRUNCATE",
  "UPDATE",
]);

const expectedApiTablePrivileges = (authenticatedPrivileges) =>
  Object.freeze([
    ...authenticatedPrivileges.map((privilege) => `authenticated|${privilege}`),
    ...FULL_TABLE_PRIVILEGES.map((privilege) => `service_role|${privilege}`),
  ]);

const EXPECTED_SOIL_API_PRIVILEGES = expectedApiTablePrivileges([
  "DELETE",
  "INSERT",
  "SELECT",
  "UPDATE",
]);

const EXPECTED_PHENO_CROSS_API_PRIVILEGES = EXPECTED_SOIL_API_PRIVILEGES;

const EXPECTED_PHENO_REVERSAL_API_PRIVILEGES = expectedApiTablePrivileges(["INSERT", "SELECT"]);

const EXPECTED_PHENO_COLUMNS = Object.freeze([
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
]);

const EXPECTED_PHENO_COLUMN_SHAPE = Object.freeze([
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
]);

const EXPECTED_PHENO_CONSTRAINTS = Object.freeze([
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
]);

const EXPECTED_PHENO_INDEXES = Object.freeze([
  "pheno_crosses_cross_type_idx",
  "pheno_crosses_female_idx",
  "pheno_crosses_hunt_id_idx",
  "pheno_crosses_male_idx",
  "pheno_crosses_pkey",
  "pheno_crosses_recurrent_parent_idx",
  "pheno_crosses_user_id_idx",
]);

const EXPECTED_PHENO_REVERSAL_COLUMN_SHAPE = Object.freeze([
  "1|id|uuid|not_null|gen_random_uuid()|",
  "2|user_id|uuid|not_null||",
  "3|keeper_id|uuid|not_null||",
  "4|method|text|not_null|'sts'::text|",
  "5|note|text|nullable||",
  "6|applied_at|timestamp with time zone|nullable||",
  "7|created_at|timestamp with time zone|not_null|now()|",
]);

const EXPECTED_PHENO_REVERSAL_CONSTRAINTS = Object.freeze([
  "pheno_reversals_keeper_id_fkey",
  "pheno_reversals_method_check",
  "pheno_reversals_pkey",
  "pheno_reversals_user_id_fkey",
]);

const EXPECTED_PHENO_REVERSAL_INDEXES = Object.freeze([
  "pheno_reversals_keeper_idx",
  "pheno_reversals_pkey",
  "pheno_reversals_user_id_idx",
]);

const EXPECTED_PHENO_CROSS_OWNER_POLICIES = Object.freeze([
  "pheno_crosses_delete_own|t|d|t|f|authenticated",
  "pheno_crosses_insert_own|t|a|f|t|authenticated",
  "pheno_crosses_select_own|t|r|t|f|authenticated",
  "pheno_crosses_update_own|t|w|t|t|authenticated",
]);

const EXPECTED_PHENO_REVERSAL_OWNER_POLICIES = Object.freeze([
  "pheno_reversals_insert_own|t|a|f|t|authenticated",
  "pheno_reversals_select_own|t|r|t|f|authenticated",
]);

const PHENO_CROSS_OWNER_POLICY_NAMES = Object.freeze([
  "pheno_crosses_delete_own",
  "pheno_crosses_insert_own",
  "pheno_crosses_select_own",
  "pheno_crosses_update_own",
]);

const PHENO_CROSS_ENTITLED_POLICY_NAMES = Object.freeze([
  "pheno_crosses_delete_own",
  "pheno_crosses_insert_own",
  "pheno_crosses_pro_required_delete",
  "pheno_crosses_pro_required_insert",
  "pheno_crosses_pro_required_update",
  "pheno_crosses_select_own",
  "pheno_crosses_update_own",
]);

const PHENO_REVERSAL_OWNER_POLICY_NAMES = Object.freeze([
  "pheno_reversals_insert_own",
  "pheno_reversals_select_own",
]);

const PHENO_REVERSAL_ENTITLED_POLICY_NAMES = Object.freeze([
  "pheno_reversals_insert_own",
  "pheno_reversals_pro_required_delete",
  "pheno_reversals_pro_required_insert",
  "pheno_reversals_pro_required_update",
  "pheno_reversals_select_own",
]);

const EXACT_POLICY_SPECS = Object.freeze([
  Object.freeze({
    table: "soil_moisture_calibrations",
    name: "Users view own soil moisture calibrations",
    required: true,
    source: "reconciliation",
  }),
  Object.freeze({
    table: "soil_moisture_calibrations",
    name: "Users delete own soil moisture calibrations",
    required: true,
    source: "reconciliation",
  }),
  Object.freeze({
    table: "soil_moisture_calibrations",
    name: "Users insert own soil moisture calibrations",
    required: true,
    source: "reconciliation",
  }),
  Object.freeze({
    table: "soil_moisture_calibrations",
    name: "Users update own soil moisture calibrations",
    required: true,
    source: "reconciliation",
  }),
  Object.freeze({
    table: "pheno_crosses",
    name: "pheno_crosses_select_own",
    required: true,
    source: "static",
  }),
  Object.freeze({
    table: "pheno_crosses",
    name: "pheno_crosses_insert_own",
    required: true,
    source: "reconciliation",
  }),
  Object.freeze({
    table: "pheno_crosses",
    name: "pheno_crosses_update_own",
    required: true,
    source: "reconciliation",
  }),
  Object.freeze({
    table: "pheno_crosses",
    name: "pheno_crosses_delete_own",
    required: true,
    source: "static",
  }),
  Object.freeze({
    table: "pheno_reversals",
    name: "pheno_reversals_select_own",
    required: true,
    source: "static",
  }),
  Object.freeze({
    table: "pheno_reversals",
    name: "pheno_reversals_insert_own",
    required: true,
    source: "static",
  }),
  ...["pheno_crosses", "pheno_reversals"].flatMap((table) =>
    ["insert", "update", "delete"].map((command) =>
      Object.freeze({
        table,
        name: `${table}_pro_required_${command}`,
        required: false,
        source: "restrictive",
        command,
      }),
    ),
  ),
]);

const REQUIRED_EXACT_POLICY_COUNT = EXACT_POLICY_SPECS.filter(({ required }) => required).length;

const ALLOWED_ACTIVE_EXACT_POLICY_COUNTS = Object.freeze([
  REQUIRED_EXACT_POLICY_COUNT,
  REQUIRED_EXACT_POLICY_COUNT + 3,
  REQUIRED_EXACT_POLICY_COUNT + 6,
]);

const EXACT_FOREIGN_KEY_TARGETS = Object.freeze({
  soil_moisture_calibrations_grow_id_fkey: Object.freeze({
    schema: "public",
    table: "grows",
    canonicalTable: "verdant_parent_public_grows",
  }),
  soil_moisture_calibrations_tent_id_fkey: Object.freeze({
    schema: "public",
    table: "tents",
    canonicalTable: "verdant_parent_public_tents",
  }),
  soil_moisture_calibrations_plant_id_fkey: Object.freeze({
    schema: "public",
    table: "plants",
    canonicalTable: "verdant_parent_public_plants",
  }),
  pheno_crosses_user_id_fkey: Object.freeze({
    schema: "auth",
    table: "users",
    canonicalTable: "verdant_parent_auth_users",
  }),
  pheno_crosses_hunt_id_fkey: Object.freeze({
    schema: "public",
    table: "pheno_hunts",
    canonicalTable: "verdant_parent_public_pheno_hunts",
  }),
  pheno_crosses_female_keeper_id_fkey: Object.freeze({
    schema: "public",
    table: "pheno_keepers",
    canonicalTable: "verdant_parent_public_pheno_keepers",
  }),
  pheno_crosses_male_keeper_id_fkey: Object.freeze({
    schema: "public",
    table: "pheno_keepers",
    canonicalTable: "verdant_parent_public_pheno_keepers",
  }),
  pheno_crosses_recurrent_parent_id_fkey: Object.freeze({
    schema: "public",
    table: "pheno_keepers",
    canonicalTable: "verdant_parent_public_pheno_keepers",
  }),
  pheno_reversals_user_id_fkey: Object.freeze({
    schema: "auth",
    table: "users",
    canonicalTable: "verdant_parent_auth_users",
  }),
  pheno_reversals_keeper_id_fkey: Object.freeze({
    schema: "public",
    table: "pheno_keepers",
    canonicalTable: "verdant_parent_public_pheno_keepers",
  }),
});

function exactConstraintSpec(table, name) {
  const reference = EXACT_FOREIGN_KEY_TARGETS[name] ?? null;
  return Object.freeze({ table, name, reference });
}

const EXACT_CONSTRAINT_SPECS = Object.freeze([
  ...EXPECTED_SOIL_CONSTRAINTS.map((name) =>
    exactConstraintSpec("soil_moisture_calibrations", name),
  ),
  ...EXPECTED_PHENO_CONSTRAINTS.map((name) => exactConstraintSpec("pheno_crosses", name)),
  ...EXPECTED_PHENO_REVERSAL_CONSTRAINTS.map((name) =>
    exactConstraintSpec("pheno_reversals", name),
  ),
]);

const STATIC_OWNER_POLICY_STATEMENTS = Object.freeze({
  pheno_crosses_select_own: `
    CREATE POLICY "pheno_crosses_select_own"
      ON public.pheno_crosses FOR SELECT TO authenticated
      USING (auth.uid() = user_id)
  `,
  pheno_crosses_delete_own: `
    CREATE POLICY "pheno_crosses_delete_own"
      ON public.pheno_crosses FOR DELETE TO authenticated
      USING (auth.uid() = user_id)
  `,
  pheno_reversals_select_own: `
    CREATE POLICY "pheno_reversals_select_own"
      ON public.pheno_reversals FOR SELECT TO authenticated
      USING (auth.uid() = user_id)
  `,
  pheno_reversals_insert_own: `
    CREATE POLICY "pheno_reversals_insert_own"
      ON public.pheno_reversals FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.pheno_keepers k
          WHERE k.id = keeper_id AND k.user_id = auth.uid()
        )
      )
  `,
});

function restrictivePolicyStatement({ table, name, command }) {
  const upperCommand = command.toUpperCase();
  const expression = "public.has_pheno_tracker_entitlement(auth.uid())";
  const clauses =
    command === "insert"
      ? `WITH CHECK (${expression})`
      : command === "update"
        ? `USING (${expression}) WITH CHECK (${expression})`
        : `USING (${expression})`;
  return `
    CREATE POLICY "${name}"
      ON public.${table} AS RESTRICTIVE FOR ${upperCommand} TO authenticated
      ${clauses}
  `;
}

function canonicalPolicyStatement(reconciliationText, spec) {
  if (spec.source === "reconciliation") {
    return extractCreatePolicyStatement(reconciliationText, spec.name);
  }
  if (spec.source === "static") {
    const statement = STATIC_OWNER_POLICY_STATEMENTS[spec.name];
    if (!statement) throw new Error(`canonical_static_policy:${spec.name}`);
    return statement.trim();
  }
  if (spec.source === "restrictive") {
    return restrictivePolicyStatement(spec).trim();
  }
  throw new Error(`canonical_policy_source:${spec.name}`);
}

const EXACT_FUNCTION_SPECS = Object.freeze([
  Object.freeze({
    key: "credit_spend",
    migrationVersion: "20260728090736",
    name: "ai_credit_spend",
  }),
  Object.freeze({
    key: "credit_refund",
    migrationVersion: "20260727050000",
    name: "ai_credit_refund",
  }),
  Object.freeze({
    key: "schema_audit",
    migrationVersion: "20260728103000",
    name: "admin_schema_audit",
  }),
]);

export const EXIT = Object.freeze({
  OK: 0,
  INPUT_REJECTED: 2,
  NO_DATABASE_URL: 3,
  TARGET_REJECTED: 4,
  FILE_REJECTED: 5,
  PSQL_NOT_INVOCABLE: 6,
  PREFLIGHT_FAILED: 7,
  LEDGER_DRIFT: 8,
  APPLY_FAILED: 9,
  POSTFLIGHT_FAILED: 10,
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = resolve(repoRoot, "supabase", "migrations");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function stripSqlCommentsAndQuotedText(text) {
  let output = "";
  let index = 0;
  while (index < text.length) {
    const current = text[index];
    const next = text[index + 1];

    if (current === "-" && next === "-") {
      index += 2;
      while (index < text.length && text[index] !== "\n") index++;
      output += "\n";
      index++;
      continue;
    }
    if (current === "/" && next === "*") {
      let depth = 1;
      index += 2;
      while (index < text.length && depth > 0) {
        if (text[index] === "/" && text[index + 1] === "*") {
          depth++;
          index += 2;
        } else if (text[index] === "*" && text[index + 1] === "/") {
          depth--;
          index += 2;
        } else {
          if (text[index] === "\n") output += "\n";
          index++;
        }
      }
      continue;
    }
    if (current === "'" || current === '"') {
      const quote = current;
      output += " ";
      index++;
      while (index < text.length) {
        if (text[index] === quote && text[index + 1] === quote) {
          index += 2;
        } else if (text[index] === quote) {
          index++;
          break;
        } else {
          if (text[index] === "\n") output += "\n";
          index++;
        }
      }
      continue;
    }
    if (current === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index))?.[0];
      if (tag) {
        output += " ";
        index += tag.length;
        const closing = text.indexOf(tag, index);
        if (closing === -1) {
          while (index < text.length) {
            if (text[index] === "\n") output += "\n";
            index++;
          }
        } else {
          while (index < closing) {
            if (text[index] === "\n") output += "\n";
            index++;
          }
          index += tag.length;
        }
        continue;
      }
    }

    output += current;
    index++;
  }
  return output;
}

export function findUnsafeSqlReason(text) {
  const topLevel = stripSqlCommentsAndQuotedText(text);
  if (
    /^\s*(?:begin(?:\s+(?:work|transaction))?|start\s+transaction|commit(?:\s+(?:work|transaction))?|end(?:\s+(?:work|transaction))?|rollback(?:\s+(?:work|transaction))?|abort(?:\s+work)?|prepare\s+transaction|commit\s+prepared|rollback\s+prepared)\b/im.test(
      topLevel,
    )
  ) {
    return "transaction_control";
  }
  if (/^\s*\\(?:(?:i|ir|include|include_relative)\b|!)/im.test(topLevel)) {
    return "psql_external_input";
  }
  if (
    /\b(?:vacuum|create\s+database|drop\s+database|alter\s+system|create\s+tablespace|drop\s+tablespace)\b/i.test(
      topLevel,
    ) ||
    /\b(?:create\s+(?:unique\s+)?index|reindex)\b[\s\S]{0,500}\bconcurrently\b/i.test(topLevel) ||
    /\balter\s+type\b[\s\S]{0,500}\badd\s+value\b/i.test(topLevel) ||
    /\bcopy\b[\s\S]{0,500}\bprogram\b/i.test(topLevel)
  ) {
    return "transaction_forbidden_statement";
  }
  return null;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function compactError(error) {
  if (error instanceof SupabaseDatabaseTargetIdentityError) {
    return error.code;
  }
  return error instanceof Error ? error.name : "unknown_error";
}

function writeSafeFile(path, contents, logger) {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, "utf8");
  } catch {
    logger.error("Could not write a sanitized migration-runner artifact.");
  }
}

function makeArtifactWriters({ reportPath, auditPath, now, logger }) {
  const writeReport = (status, lines) => {
    writeSafeFile(
      reportPath,
      [
        "### Pinned production migration apply",
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
        "No connection string, password, query result rows, or raw database error is included.",
        "",
      ].join("\n"),
      logger,
    );
  };

  const writeAudit = (outcome, extra = {}) => {
    writeSafeFile(
      auditPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-pinned-production-migrations",
          target_env: "production",
          project_ref: PRODUCTION_PROJECT_REF,
          checked_at: now().toISOString(),
          outcome,
          expected_head_sha: extra.expectedHeadSha ?? null,
          observed_head_sha: extra.observedHeadSha ?? null,
          migration_versions: PINNED_PRODUCTION_MIGRATIONS.map(({ version }) => version),
          ...(extra.ledgerState ? { ledger_state: extra.ledgerState } : {}),
          ...(extra.note ? { note: extra.note } : {}),
        },
        null,
        2,
      )}\n`,
      logger,
    );
  };

  return { writeReport, writeAudit };
}

/**
 * Validate exact Git-blob-compatible bytes. The checked content is returned so
 * the apply batch can be assembled without reading a second, potentially
 * changed copy from disk.
 */
export function validatePinnedMigrationFiles({
  root = migrationsRoot,
  readFile = readFileSync,
} = {}) {
  return PINNED_PRODUCTION_MIGRATIONS.map((migration) => {
    const path = resolve(root, migration.file);
    const raw = readFile(path);
    const text = raw.toString("utf8");
    const observedHash = sha256(raw);

    if (observedHash !== migration.sha256) {
      throw new Error(`hash_mismatch:${migration.version}`);
    }
    if (text.includes("\r")) {
      throw new Error(`crlf_not_allowed:${migration.version}`);
    }
    if (!text.endsWith("\n")) {
      throw new Error(`final_newline_missing:${migration.version}`);
    }

    const unsafeReason = findUnsafeSqlReason(text);
    if (unsafeReason === "transaction_control") {
      throw new Error(`transaction_control_not_allowed:${migration.version}`);
    }
    if (unsafeReason) {
      throw new Error(`${unsafeReason}:${migration.version}`);
    }

    return Object.freeze({ ...migration, path, text });
  });
}

export function validatePinnedSecurityReferenceFiles({
  root = migrationsRoot,
  readFile = readFileSync,
} = {}) {
  return PINNED_SECURITY_REFERENCE_FILES.map((reference) => {
    const path = resolve(root, reference.file);
    const raw = readFile(path);
    const text = raw.toString("utf8");
    const observedHash = sha256(raw);

    if (observedHash !== reference.sha256) {
      throw new Error(`security_reference_hash_mismatch:${reference.version}`);
    }
    if (text.includes("\r")) {
      throw new Error(`security_reference_crlf_not_allowed:${reference.version}`);
    }
    if (!text.endsWith("\n")) {
      throw new Error(`security_reference_final_newline_missing:${reference.version}`);
    }

    return Object.freeze({ ...reference, path, text });
  });
}

function extractCreatePolicyStatement(text, policyName) {
  const marker = `CREATE POLICY "${policyName}"`;
  const start = text.indexOf(marker);
  if (start < 0 || text.indexOf(marker, start + marker.length) >= 0) {
    throw new Error(`canonical_policy_marker:${policyName}`);
  }
  const end = text.indexOf("$policy$;", start);
  if (end < 0) {
    throw new Error(`canonical_policy_terminator:${policyName}`);
  }
  const statement = text.slice(start, end).trim();
  if (!statement.startsWith(marker) || !statement.includes(" ON public.")) {
    throw new Error(`canonical_policy_shape:${policyName}`);
  }
  return statement;
}

function extractFunctionBody(text, functionName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}(`;
  const start = text.indexOf(marker);
  if (start < 0 || text.indexOf(marker, start + marker.length) >= 0) {
    throw new Error(`canonical_function_marker:${functionName}`);
  }
  const bodyMarker = "AS $function$";
  const bodyStartMarker = text.indexOf(bodyMarker, start);
  if (bodyStartMarker < 0) {
    throw new Error(`canonical_function_body_marker:${functionName}`);
  }
  const bodyStart = bodyStartMarker + bodyMarker.length;
  const bodyEnd = text.indexOf("$function$;", bodyStart);
  if (bodyEnd < 0) {
    throw new Error(`canonical_function_body_terminator:${functionName}`);
  }
  return text.slice(bodyStart, bodyEnd);
}

export function extractExpectedFunctionBodies(validatedMigrations) {
  const bodies = {};
  for (const spec of EXACT_FUNCTION_SPECS) {
    const migration = validatedMigrations.find(({ version }) => version === spec.migrationVersion);
    if (!migration) throw new Error(`canonical_function_migration:${spec.migrationVersion}`);
    bodies[spec.key] = extractFunctionBody(migration.text, spec.name);
  }
  return Object.freeze(bodies);
}

const CANONICAL_PARENT_STUBS_SQL = `
create temporary table verdant_parent_auth_users (
  id uuid primary key
) on commit drop;

create temporary table verdant_parent_public_grows (
  id uuid primary key
) on commit drop;

create temporary table verdant_parent_public_tents (
  id uuid primary key
) on commit drop;

create temporary table verdant_parent_public_plants (
  id uuid primary key
) on commit drop;

create temporary table verdant_parent_public_pheno_hunts (
  id uuid primary key
) on commit drop;

create temporary table verdant_parent_public_pheno_keepers (
  id uuid primary key,
  user_id uuid
) on commit drop;
`;

function policyTableDefinition(table) {
  if (table === "soil_moisture_calibrations") {
    return `
      create temporary table soil_moisture_calibrations (
        id uuid
          constraint soil_moisture_calibrations_pkey primary key,
        user_id uuid,
        grow_id uuid
          constraint soil_moisture_calibrations_grow_id_fkey
          references pg_temp.verdant_parent_public_grows(id) on delete cascade,
        tent_id uuid
          constraint soil_moisture_calibrations_tent_id_fkey
          references pg_temp.verdant_parent_public_tents(id) on delete cascade,
        plant_id uuid
          constraint soil_moisture_calibrations_plant_id_fkey
          references pg_temp.verdant_parent_public_plants(id) on delete set null,
        device_id text,
        label text,
        medium text,
        sensor_depth_cm numeric,
        dry_raw numeric,
        wet_raw numeric,
        source text,
        is_active boolean,
        notes text,
        created_at timestamptz,
        updated_at timestamptz,
        constraint soil_moisture_calibrations_distinct_points_check
          check (dry_raw <> wet_raw),
        constraint soil_moisture_calibrations_finite_points_check
          check (dry_raw <> 'NaN'::numeric and wet_raw <> 'NaN'::numeric),
        constraint soil_moisture_calibrations_source_check
          check (source in ('manual', 'csv', 'demo')),
        constraint soil_moisture_calibrations_depth_check
          check (
            sensor_depth_cm is null
            or (sensor_depth_cm >= 0 and sensor_depth_cm <= 1000)
          )
      ) on commit drop;
    `;
  }
  if (table === "pheno_crosses") {
    return `
      create temporary table pheno_crosses (
        id uuid constraint pheno_crosses_pkey primary key,
        user_id uuid
          constraint pheno_crosses_user_id_fkey
          references pg_temp.verdant_parent_auth_users(id) on delete cascade,
        hunt_id uuid
          constraint pheno_crosses_hunt_id_fkey
          references pg_temp.verdant_parent_public_pheno_hunts(id) on delete set null,
        female_keeper_id uuid
          constraint pheno_crosses_female_keeper_id_fkey
          references pg_temp.verdant_parent_public_pheno_keepers(id) on delete cascade,
        male_keeper_id uuid
          constraint pheno_crosses_male_keeper_id_fkey
          references pg_temp.verdant_parent_public_pheno_keepers(id) on delete cascade,
        cross_name text,
        note text,
        crossed_at timestamptz,
        created_at timestamptz,
        updated_at timestamptz,
        cross_type text,
        channel text,
        generation integer,
        recurrent_parent_id uuid
          constraint pheno_crosses_recurrent_parent_id_fkey
          references pg_temp.verdant_parent_public_pheno_keepers(id) on delete cascade,
        constraint pheno_crosses_channel_check check (
          channel is null
          or channel in (
            'natural_male',
            'colloidal_silver',
            'sts',
            'ga3',
            'rodelization',
            'open_pollination'
          )
        ),
        constraint pheno_crosses_generation_check check (
          case
            when cross_type in ('filial', 'selfing_sn')
              then generation is not null and generation >= 2
            when cross_type in ('backcross', 'feminized_bx')
              then generation is not null and generation >= 1
            else generation is null
          end
        ),
        constraint pheno_crosses_cross_type_check check (
          cross_type in (
            'standard_f1', 'feminized_cross', 'selfing_s1',
            'filial', 'ibl', 'selfing_sn', 'feminized_bx', 'backcross',
            'sib_cross', 'outcross', 'line_cross', 'open_pollination',
            'test_cross', 'reciprocal_cross', 'three_way_cross'
          )
        ),
        constraint pheno_crosses_parents_by_type check (
          (cross_type in ('selfing_s1', 'selfing_sn') and male_keeper_id is null)
          or (
            cross_type = 'open_pollination'
            and (male_keeper_id is null or male_keeper_id <> female_keeper_id)
          )
          or (
            cross_type not in ('selfing_s1', 'selfing_sn', 'open_pollination')
            and male_keeper_id is not null
            and male_keeper_id <> female_keeper_id
          )
        ),
        constraint pheno_crosses_recurrent_parent_by_type check (
          (
            cross_type in ('backcross', 'feminized_bx')
            and recurrent_parent_id is not null
          )
          or (
            cross_type not in ('backcross', 'feminized_bx')
            and recurrent_parent_id is null
          )
        )
      ) on commit drop;
    `;
  }
  if (table === "pheno_reversals") {
    return `
      create temporary table pheno_reversals (
        id uuid constraint pheno_reversals_pkey primary key,
        user_id uuid
          constraint pheno_reversals_user_id_fkey
          references pg_temp.verdant_parent_auth_users(id) on delete cascade,
        keeper_id uuid
          constraint pheno_reversals_keeper_id_fkey
          references pg_temp.verdant_parent_public_pheno_keepers(id) on delete cascade,
        method text,
        note text,
        applied_at timestamptz,
        created_at timestamptz,
        constraint pheno_reversals_method_check
          check (method in ('sts', 'colloidal_silver', 'ga3', 'other'))
      ) on commit drop;
    `;
  }
  throw new Error(`canonical_policy_table:${table}`);
}

/**
 * Ask the target PostgreSQL parser to canonicalize the exact policy and
 * constraint bodies from the hash-pinned reconciliation artifact on same-named
 * temporary tables. Temporary child tables may only reference temporary
 * parents, so foreign keys are compared by exact raw catalog attributes while
 * non-foreign constraints retain raw pg_get_constraintdef comparison.
 */
export function buildCanonicalPolicyVerificationSql(validatedMigrations) {
  const reconciliation = validatedMigrations.find(({ version }) => version === "20260728090000");
  if (!reconciliation) throw new Error("canonical_policy_migration");

  const tableDefinitions = [...new Set(EXACT_POLICY_SPECS.map(({ table }) => table))]
    .map(policyTableDefinition)
    .join("\n");
  const policyStatements = EXACT_POLICY_SPECS.map((spec) =>
    canonicalPolicyStatement(reconciliation.text, spec).replace(
      `ON public.${spec.table}`,
      `ON pg_temp.${spec.table}`,
    ),
  ).join(";\n\n");
  const expectedRows = EXACT_POLICY_SPECS.map(
    ({ table, name, required }) =>
      `(${sqlLiteral(table)}, ${sqlLiteral(name)}, ${required ? "true" : "false"})`,
  ).join(", ");
  const expectedConstraintRows = EXACT_CONSTRAINT_SPECS.map(({ table, name, reference }) =>
    [
      sqlLiteral(table),
      sqlLiteral(name),
      reference ? sqlLiteral(reference.schema) : "null",
      reference ? sqlLiteral(reference.table) : "null",
      reference ? sqlLiteral(reference.canonicalTable) : "null",
    ].join(", "),
  )
    .map((row) => `(${row})`)
    .join(", ");

  return `
begin;

create temporary table verdant_expected_policies(
  table_name text not null,
  policy_name text not null,
  required boolean not null
) on commit drop;

insert into verdant_expected_policies(table_name, policy_name, required)
values ${expectedRows};

create temporary table verdant_expected_constraints(
  table_name text not null,
  constraint_name text not null,
  referenced_schema text,
  referenced_table text,
  canonical_referenced_table text
) on commit drop;

insert into verdant_expected_constraints(
  table_name,
  constraint_name,
  referenced_schema,
  referenced_table,
  canonical_referenced_table
)
values ${expectedConstraintRows};

create temporary table verdant_active_policies on commit drop as
select expected.*
from verdant_expected_policies expected
where expected.required
   or exists (
     select 1
     from pg_catalog.pg_policy policy
     where policy.polrelid = format('public.%I', expected.table_name)::regclass
       and policy.polname = expected.policy_name
   );

${CANONICAL_PARENT_STUBS_SQL}

${tableDefinitions}

create temporary table verdant_observed_policy_contract on commit drop as
select
  expected.table_name,
  expected.required,
  policy.polname::text as policy_name,
  policy.polpermissive,
  policy.polcmd,
  policy.polroles,
  coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false), '') as qual,
  coalesce(
    pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false),
    ''
  ) as with_check
from verdant_active_policies expected
left join pg_catalog.pg_policy policy
  on policy.polrelid = format('public.%I', expected.table_name)::regclass
 and policy.polname = expected.policy_name;

create temporary table verdant_observed_constraint_contract on commit drop as
select
  expected.table_name,
  constraint_row.conname::text as constraint_name,
  constraint_row.contype,
  constraint_row.condeferrable,
  constraint_row.condeferred,
  constraint_row.convalidated,
  constraint_row.connoinherit,
  case
    when constraint_row.contype = 'f' then ''
    else coalesce(pg_catalog.pg_get_constraintdef(constraint_row.oid, false), '')
  end as definition,
  coalesce((
    select jsonb_agg(attribute.attname order by key_column.ordinality)
    from unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = key_column.attnum
  ), '[]'::jsonb) as key_columns,
  case
    when constraint_row.contype = 'f' then coalesce((
      select jsonb_agg(attribute.attname order by key_column.ordinality)
      from unnest(constraint_row.confkey)
        with ordinality as key_column(attnum, ordinality)
      join pg_catalog.pg_attribute attribute
        on attribute.attrelid = constraint_row.confrelid
       and attribute.attnum = key_column.attnum
    ), '[]'::jsonb)
    else '[]'::jsonb
  end as referenced_columns,
  case when constraint_row.contype = 'f' then constraint_row.confmatchtype end
    as foreign_match_type,
  case when constraint_row.contype = 'f' then constraint_row.confupdtype end
    as foreign_update_action,
  case when constraint_row.contype = 'f' then constraint_row.confdeltype end
    as foreign_delete_action,
  case when constraint_row.contype = 'f' then referenced_namespace.nspname end
    as referenced_schema,
  case when constraint_row.contype = 'f' then referenced_relation.relname end
    as referenced_table
from verdant_expected_constraints expected
left join pg_catalog.pg_constraint constraint_row
  on constraint_row.conrelid = format('public.%I', expected.table_name)::regclass
 and constraint_row.conname = expected.constraint_name
left join pg_catalog.pg_class referenced_relation
  on referenced_relation.oid = constraint_row.confrelid
left join pg_catalog.pg_namespace referenced_namespace
  on referenced_namespace.oid = referenced_relation.relnamespace;

${policyStatements};

with canonical_policies as (
  select
    expected.table_name,
    expected.required,
    policy.polname::text as policy_name,
    policy.polpermissive,
    policy.polcmd,
    policy.polroles,
    coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false), '') as qual,
    coalesce(
      pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false),
      ''
    ) as with_check
  from verdant_active_policies expected
  left join pg_catalog.pg_policy policy
    on policy.polrelid = format('pg_temp.%I', expected.table_name)::regclass
   and policy.polname = expected.policy_name
),
policy_differences as (
  (select * from verdant_observed_policy_contract except select * from canonical_policies)
  union all
  (select * from canonical_policies except select * from verdant_observed_policy_contract)
),
canonical_constraints as (
  select
    expected.table_name,
    constraint_row.conname::text as constraint_name,
    constraint_row.contype,
    constraint_row.condeferrable,
    constraint_row.condeferred,
    constraint_row.convalidated,
    constraint_row.connoinherit,
    case
      when constraint_row.contype = 'f' then ''
      else coalesce(pg_catalog.pg_get_constraintdef(constraint_row.oid, false), '')
    end as definition,
    coalesce((
      select jsonb_agg(attribute.attname order by key_column.ordinality)
      from unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)
      join pg_catalog.pg_attribute attribute
        on attribute.attrelid = constraint_row.conrelid
       and attribute.attnum = key_column.attnum
    ), '[]'::jsonb) as key_columns,
    case
      when constraint_row.contype = 'f' then coalesce((
        select jsonb_agg(attribute.attname order by key_column.ordinality)
        from unnest(constraint_row.confkey)
          with ordinality as key_column(attnum, ordinality)
        join pg_catalog.pg_attribute attribute
          on attribute.attrelid = constraint_row.confrelid
         and attribute.attnum = key_column.attnum
      ), '[]'::jsonb)
      else '[]'::jsonb
    end as referenced_columns,
    case when constraint_row.contype = 'f' then constraint_row.confmatchtype end
      as foreign_match_type,
    case when constraint_row.contype = 'f' then constraint_row.confupdtype end
      as foreign_update_action,
    case when constraint_row.contype = 'f' then constraint_row.confdeltype end
      as foreign_delete_action,
    case
      when constraint_row.contype <> 'f' then null
      when referenced_namespace.nspname like 'pg_temp_%'
       and referenced_relation.relname = expected.canonical_referenced_table
        then expected.referenced_schema
      else referenced_namespace.nspname
    end as referenced_schema,
    case
      when constraint_row.contype <> 'f' then null
      when referenced_namespace.nspname like 'pg_temp_%'
       and referenced_relation.relname = expected.canonical_referenced_table
        then expected.referenced_table
      else referenced_relation.relname
    end as referenced_table
  from verdant_expected_constraints expected
  left join pg_catalog.pg_constraint constraint_row
    on constraint_row.conrelid = format('pg_temp.%I', expected.table_name)::regclass
   and constraint_row.conname = expected.constraint_name
  left join pg_catalog.pg_class referenced_relation
    on referenced_relation.oid = constraint_row.confrelid
  left join pg_catalog.pg_namespace referenced_namespace
    on referenced_namespace.oid = referenced_relation.relnamespace
),
constraint_differences as (
  (
    select * from verdant_observed_constraint_contract
    except
    select * from canonical_constraints
  )
  union all
  (
    select * from canonical_constraints
    except
    select * from verdant_observed_constraint_contract
  )
)
select jsonb_build_object(
  'required_policy_count', (
    select count(*)
    from verdant_observed_policy_contract
    where required and policy_name is not null
  ),
  'active_policy_count', (
    select count(*) from verdant_observed_policy_contract where policy_name is not null
  ),
  'definitions_exact', not exists (select 1 from policy_differences),
  'constraint_count', (
    select count(*)
    from verdant_observed_constraint_contract
    where constraint_name is not null
  ),
  'constraints_exact', not exists (select 1 from constraint_differences)
)::text;

rollback;
`;
}

export function classifyTargetLedger(targets) {
  if (!Array.isArray(targets) || targets.length !== PINNED_PRODUCTION_MIGRATIONS.length) {
    return { status: "invalid", reason: "target_count" };
  }

  let absent = 0;
  let exact = 0;
  for (const expected of PINNED_PRODUCTION_MIGRATIONS) {
    const row = targets.find((candidate) => candidate?.version === expected.version);
    if (!row || !Array.isArray(row.matches)) {
      return { status: "invalid", reason: `target_missing:${expected.version}` };
    }
    if (row.matches.length === 0) {
      absent++;
      continue;
    }
    if (
      row.matches.length === 1 &&
      row.matches[0]?.version === expected.version &&
      row.matches[0]?.name === expected.name
    ) {
      exact++;
      continue;
    }
    return { status: "collision", reason: `target_collision:${expected.version}` };
  }

  if (absent === PINNED_PRODUCTION_MIGRATIONS.length) return { status: "apply" };
  if (exact === PINNED_PRODUCTION_MIGRATIONS.length) return { status: "verify_only" };
  return { status: "mixed", reason: "partial_target_application" };
}

export function buildApplySql(validatedMigrations) {
  if (
    !Array.isArray(validatedMigrations) ||
    validatedMigrations.length !== PINNED_PRODUCTION_MIGRATIONS.length
  ) {
    throw new Error("validated_migration_count");
  }
  for (let index = 0; index < PINNED_PRODUCTION_MIGRATIONS.length; index++) {
    const expected = PINNED_PRODUCTION_MIGRATIONS[index];
    const observed = validatedMigrations[index];
    if (
      observed.version !== expected.version ||
      observed.name !== expected.name ||
      observed.sha256 !== expected.sha256 ||
      typeof observed.text !== "string"
    ) {
      throw new Error(`validated_migration_order:${expected.version}`);
    }
  }

  const collisionValues = PINNED_PRODUCTION_MIGRATIONS.map(
    ({ version, name }) => `(${sqlLiteral(version)}, ${sqlLiteral(name)})`,
  ).join(",\n      ");
  const ledgerValues = PINNED_PRODUCTION_MIGRATIONS.map(
    ({ version, name, sha256 }) =>
      `(${sqlLiteral(version)}, ${sqlLiteral(name)}, ` +
      `array[${sqlLiteral(
        `-- applied verbatim by protected GitHub workflow; sha256=${sha256}`,
      )}]::text[])`,
  ).join(",\n  ");

  const bodies = validatedMigrations
    .map(
      ({ file, text }) =>
        `\n-- BEGIN EXACT PINNED FILE: ${file}\n${text}-- END EXACT PINNED FILE: ${file}\n`,
    )
    .join("");

  return [
    "\\set ON_ERROR_STOP on",
    "set local lock_timeout = '4s';",
    "lock table supabase_migrations.schema_migrations in share row exclusive mode;",
    "",
    "do $pinned_apply_guard$",
    "declare",
    "  v_collision_count integer;",
    "begin",
    "  with expected(version, name) as (",
    "    values",
    `      ${collisionValues}`,
    "  )",
    "  select count(*)",
    "    into v_collision_count",
    "  from expected e",
    "  join supabase_migrations.schema_migrations sm",
    "    on sm.version = e.version or sm.name = e.name;",
    "",
    "  if v_collision_count <> 0 then",
    "    raise exception using",
    "      errcode = '55000',",
    "      message = 'pinned production migration apply refused a concurrent ledger collision';",
    "  end if;",
    "end",
    "$pinned_apply_guard$;",
    bodies,
    "insert into supabase_migrations.schema_migrations (version, name, statements)",
    "values",
    `  ${ledgerValues};`,
    "",
  ].join("\n");
}

function buildPsqlEnvironment(sourceEnv, databaseUrl) {
  const childEnv = {};
  const pathValue = sourceEnv.PATH ?? sourceEnv.Path;
  if (typeof pathValue === "string") childEnv.PATH = pathValue;
  for (const key of [
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ]) {
    if (typeof sourceEnv[key] === "string") childEnv[key] = sourceEnv[key];
  }
  const connection = sanitizeSupabaseDatabaseUrlForPsql(databaseUrl, "production");
  childEnv.PGDATABASE = connection.databaseUrl;
  childEnv.PGSSLMODE = connection.sslMode;
  return childEnv;
}

const TARGET_VALUES_SQL = PINNED_PRODUCTION_MIGRATIONS.map(
  ({ version, name }) => `(${sqlLiteral(version)}, ${sqlLiteral(name)})`,
).join(",");

export const PREFLIGHT_SQL = `
with expected(version, name) as (
  values ${TARGET_VALUES_SQL}
),
target_rows as (
  select
    e.version,
    e.name,
    coalesce(
      jsonb_agg(
        jsonb_build_object('version', sm.version, 'name', sm.name)
        order by sm.version
      ) filter (where sm.version is not null),
      '[]'::jsonb
    ) as matches
  from expected e
  left join supabase_migrations.schema_migrations sm
    on sm.version = e.version or sm.name = e.name
  group by e.version, e.name
),
ledger_shape as (
  select
    jsonb_object_agg(column_name, data_type) as columns,
    jsonb_agg(
      jsonb_build_object(
        'name', column_name,
        'data_type', data_type,
        'udt_name', udt_name,
        'nullable', is_nullable
      )
      order by ordinal_position
    ) as ordered_columns
  from information_schema.columns
  where table_schema = 'supabase_migrations'
    and table_name = 'schema_migrations'
),
ledger_primary_key as (
  select coalesce(
    jsonb_agg(a.attname order by key_column.ordinality),
    '[]'::jsonb
  ) as columns
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral unnest(con.conkey) with ordinality as key_column(attnum, ordinality)
  join pg_catalog.pg_attribute a
    on a.attrelid = c.oid and a.attnum = key_column.attnum
  where n.nspname = 'supabase_migrations'
    and c.relname = 'schema_migrations'
    and con.contype = 'p'
),
pheno_identity as (
  select jsonb_object_agg(relation_name, jsonb_build_object('row_count', row_count, 'ids_md5', ids_md5)) as value
  from (
    select
      'pheno_crosses'::text as relation_name,
      count(*)::bigint as row_count,
      md5(coalesce(string_agg(id::text, ',' order by id), '')) as ids_md5
    from public.pheno_crosses
    union all
    select
      'pheno_reversals'::text,
      count(*)::bigint,
      md5(coalesce(string_agg(id::text, ',' order by id), ''))
    from public.pheno_reversals
  ) rows
),
restrictive_policies as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'table', tablename,
        'policy', policyname,
        'permissive', permissive,
        'cmd', cmd,
        'roles', roles,
        'qual', qual,
        'with_check', with_check
      )
      order by tablename, policyname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in ('pheno_crosses', 'pheno_reversals')
    and policyname like '%\\_pro\\_required\\_%' escape '\\'
)
select jsonb_build_object(
  'current_user', current_user,
  'ledger_columns', (select columns from ledger_shape),
  'ledger_ordered_columns', (select ordered_columns from ledger_shape),
  'ledger_primary_key', (select columns from ledger_primary_key),
  'targets', (select jsonb_agg(to_jsonb(target_rows) order by version) from target_rows),
  'dependencies', jsonb_build_object(
    'pheno_crosses', to_regclass('public.pheno_crosses') is not null,
    'pheno_reversals', to_regclass('public.pheno_reversals') is not null,
    'ai_credit_grants', to_regclass('public.ai_credit_grants') is not null,
    'ai_credit_spends', to_regclass('public.ai_credit_spends') is not null,
    'ai_credit_spend_results', to_regclass('public.ai_credit_spend_results') is not null,
    'subscriptions', to_regclass('public.subscriptions') is not null,
    'grows', to_regclass('public.grows') is not null,
    'has_role', to_regprocedure('public.has_role(uuid,public.app_role)') is not null,
    'schema_audit_overloads_safe', not exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'admin_schema_audit'
        and p.oid not in (
          coalesce(
            to_regprocedure('public.admin_schema_audit(text[],text[])')::oid,
            0::oid
          ),
          coalesce(
            to_regprocedure('public.admin_schema_audit(text[],text[],jsonb)')::oid,
            0::oid
          )
        )
    )
  ),
  'pheno_identity', (select value from pheno_identity),
  'restrictive_policies', (select value from restrictive_policies)
)::text;
`;

const ALL_LEDGER_VALUES_SQL = [...HISTORICAL_LEDGER_ROWS, ...PINNED_PRODUCTION_MIGRATIONS]
  .map(({ version, name }) => `(${sqlLiteral(version)}, ${sqlLiteral(name)})`)
  .join(",");

export const POSTFLIGHT_SQL = `
with expected(version, name) as (
  values ${ALL_LEDGER_VALUES_SQL}
),
ledger as (
  select
    count(*) filter (where sm.version is not null) as exact_count,
    count(*) filter (
      where sm.version is null or sm.version <> e.version or coalesce(sm.name, '') <> e.name
    ) as mismatch_count,
    (
      select count(*)
      from expected collision_expected
      join supabase_migrations.schema_migrations collision
        on collision.version = collision_expected.version
        or collision.name = collision_expected.name
      where collision.version <> collision_expected.version
        or coalesce(collision.name, '') <> collision_expected.name
    ) as collision_count
  from expected e
  left join supabase_migrations.schema_migrations sm
    on sm.version = e.version and sm.name = e.name
),
pheno_identity as (
  select jsonb_object_agg(relation_name, jsonb_build_object('row_count', row_count, 'ids_md5', ids_md5)) as value
  from (
    select
      'pheno_crosses'::text as relation_name,
      count(*)::bigint as row_count,
      md5(coalesce(string_agg(id::text, ',' order by id), '')) as ids_md5
    from public.pheno_crosses
    union all
    select
      'pheno_reversals'::text,
      count(*)::bigint,
      md5(coalesce(string_agg(id::text, ',' order by id), ''))
    from public.pheno_reversals
  ) rows
),
restrictive_policies as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'table', tablename,
        'policy', policyname,
        'permissive', permissive,
        'cmd', cmd,
        'roles', roles,
        'qual', qual,
        'with_check', with_check
      )
      order by tablename, policyname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in ('pheno_crosses', 'pheno_reversals')
    and policyname like '%\\_pro\\_required\\_%' escape '\\'
),
taxonomy as (
  select count(*) as present_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'pheno_crosses'
    and column_name in ('channel', 'generation', 'recurrent_parent_id')
),
soil_contract as (
  select
    (
      select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb)
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.soil_moisture_calibrations'::regclass
        and a.attnum > 0
        and not a.attisdropped
    ) as column_names,
    (
      select coalesce(
        jsonb_agg(
          format(
            '%s|%s|%s|%s|%s|%s',
            a.attnum,
            a.attname,
            pg_catalog.format_type(a.atttypid, a.atttypmod),
            case when a.attnotnull then 'not_null' else 'nullable' end,
            coalesce(
              regexp_replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '\\s+', '', 'g'),
              ''
            ),
            a.attidentity::text || a.attgenerated::text
          )
          order by a.attnum
        ),
        '[]'::jsonb
      )
      from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d
        on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'public.soil_moisture_calibrations'::regclass
        and a.attnum > 0
        and not a.attisdropped
    ) as column_shape,
    (
      select coalesce(jsonb_agg(con.conname order by con.conname), '[]'::jsonb)
      from pg_catalog.pg_constraint con
      where con.conrelid = 'public.soil_moisture_calibrations'::regclass
        and con.contype <> 'n'
    ) as constraint_names,
    (
      select lower(
        regexp_replace(
          string_agg(pg_catalog.pg_get_constraintdef(con.oid, true), ' ' order by con.conname),
          '\\s+',
          '',
          'g'
        )
      )
      from pg_catalog.pg_constraint con
      where con.conrelid = 'public.soil_moisture_calibrations'::regclass
        and con.contype <> 'n'
    ) as constraint_definitions,
    (
      select coalesce(jsonb_agg(ci.relname order by ci.relname), '[]'::jsonb)
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ci on ci.oid = i.indexrelid
      where i.indrelid = 'public.soil_moisture_calibrations'::regclass
    ) as index_names,
    (
      select lower(
        regexp_replace(
          string_agg(pg_catalog.pg_get_indexdef(i.indexrelid), ' ' order by ci.relname),
          '\\s+',
          '',
          'g'
        )
      )
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ci on ci.oid = i.indexrelid
      where i.indrelid = 'public.soil_moisture_calibrations'::regclass
    ) as index_definitions,
    (
      select coalesce(
        jsonb_agg(
          format(
            '%s|%s|%s|%s',
            p.polname,
            p.polpermissive,
            p.polcmd,
            (
              select string_agg(r.rolname, ',' order by r.rolname)
              from unnest(p.polroles) as policy_role(role_oid)
              join pg_catalog.pg_roles r on r.oid = policy_role.role_oid
            )
          )
          order by p.polname
        ),
        '[]'::jsonb
      )
      from pg_catalog.pg_policy p
      where p.polrelid = 'public.soil_moisture_calibrations'::regclass
    ) as policy_shape,
    (
      select lower(
        regexp_replace(
          string_agg(
            p.polname || '|' ||
            coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') || '|' ||
            coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
            ' '
            order by p.polname
          ),
          '\\s+',
          '',
          'g'
        )
      )
      from pg_catalog.pg_policy p
      where p.polrelid = 'public.soil_moisture_calibrations'::regclass
    ) as policy_definitions,
    (
      select coalesce(
        jsonb_agg(
          format(
            '%s|%s|%s',
            t.tgname,
            t.tgenabled,
            replace(
              lower(regexp_replace(pg_catalog.pg_get_triggerdef(t.oid, true), '\\s+', '', 'g')),
              'public.',
              ''
            )
          )
          order by t.tgname
        ),
        '[]'::jsonb
      )
      from pg_catalog.pg_trigger t
      where t.tgrelid = 'public.soil_moisture_calibrations'::regclass
        and not t.tgisinternal
    ) as trigger_shape,
    (
      select count(*)
      from information_schema.columns
      where table_schema = 'public' and table_name = 'soil_moisture_calibrations'
    ) as column_count,
    (
      select count(*)
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class r on r.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = 'soil_moisture_calibrations'
    ) as constraint_count,
    (
      select count(*)
      from pg_catalog.pg_indexes
      where schemaname = 'public' and tablename = 'soil_moisture_calibrations'
    ) as index_count,
    (
      select count(*)
      from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'soil_moisture_calibrations'
    ) as policy_count,
    (
      select c.relrowsecurity and not c.relforcerowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'soil_moisture_calibrations'
    ) as rls_contract,
    (
      select count(*)
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'soil_moisture_calibrations'
        and grantee in ('PUBLIC', 'anon')
    ) as public_or_anon_grant_count,
    (
      select coalesce(
        jsonb_agg(grantee || '|' || privilege_type order by grantee, privilege_type),
        '[]'::jsonb
      )
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'soil_moisture_calibrations'
        and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
    ) as api_privileges
),
pheno_contract as (
  select
    (
      select coalesce(jsonb_agg(p.polname order by p.polname), '[]'::jsonb)
      from pg_catalog.pg_policy p
      where p.polrelid = 'public.pheno_crosses'::regclass
    ) as cross_policy_names,
    (
      select coalesce(jsonb_agg(p.polname order by p.polname), '[]'::jsonb)
      from pg_catalog.pg_policy p
      where p.polrelid = 'public.pheno_reversals'::regclass
    ) as reversal_policy_names,
    (
      select coalesce(
        jsonb_agg(
          format(
            '%s|%s|%s|%s|%s|%s',
            p.polname,
            p.polpermissive,
            p.polcmd,
            p.polqual is not null,
            p.polwithcheck is not null,
            (
              select string_agg(r.rolname, ',' order by r.rolname)
              from unnest(p.polroles) as policy_role(role_oid)
              join pg_catalog.pg_roles r on r.oid = policy_role.role_oid
            )
          )
          order by p.polname
        ),
        '[]'::jsonb
      )
      from pg_catalog.pg_policy p
      where p.polrelid = 'public.pheno_crosses'::regclass
        and p.polname in (
          'pheno_crosses_delete_own',
          'pheno_crosses_insert_own',
          'pheno_crosses_select_own',
          'pheno_crosses_update_own'
        )
    ) as cross_owner_policy_shape,
    (
      select lower(
        regexp_replace(
          string_agg(
            p.polname || '|' ||
            coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') || '|' ||
            coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
            ' '
            order by p.polname
          ),
          '\\s+',
          '',
          'g'
        )
      )
      from pg_catalog.pg_policy p
      where p.polrelid = 'public.pheno_crosses'::regclass
        and p.polname in (
          'pheno_crosses_delete_own',
          'pheno_crosses_insert_own',
          'pheno_crosses_select_own',
          'pheno_crosses_update_own'
        )
    ) as cross_owner_policy_definitions,
    (
      select coalesce(
        jsonb_agg(
          format(
            '%s|%s|%s|%s|%s|%s',
            p.polname,
            p.polpermissive,
            p.polcmd,
            p.polqual is not null,
            p.polwithcheck is not null,
            (
              select string_agg(r.rolname, ',' order by r.rolname)
              from unnest(p.polroles) as policy_role(role_oid)
              join pg_catalog.pg_roles r on r.oid = policy_role.role_oid
            )
          )
          order by p.polname
        ),
        '[]'::jsonb
      )
      from pg_catalog.pg_policy p
      where p.polrelid = 'public.pheno_reversals'::regclass
        and p.polname in ('pheno_reversals_insert_own', 'pheno_reversals_select_own')
    ) as reversal_owner_policy_shape,
    (
      select lower(
        regexp_replace(
          string_agg(
            p.polname || '|' ||
            coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') || '|' ||
            coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
            ' '
            order by p.polname
          ),
          '\\s+',
          '',
          'g'
        )
      )
      from pg_catalog.pg_policy p
      where p.polrelid = 'public.pheno_reversals'::regclass
        and p.polname in ('pheno_reversals_insert_own', 'pheno_reversals_select_own')
    ) as reversal_owner_policy_definitions,
    (
      select coalesce(
        jsonb_agg(
          format(
            '%s|%s|%s|%s|%s|%s',
            a.attnum,
            a.attname,
            pg_catalog.format_type(a.atttypid, a.atttypmod),
            case when a.attnotnull then 'not_null' else 'nullable' end,
            coalesce(
              regexp_replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '\\s+', '', 'g'),
              ''
            ),
            a.attidentity::text || a.attgenerated::text
          )
          order by a.attnum
        ),
        '[]'::jsonb
      )
      from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d
        on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'public.pheno_reversals'::regclass
        and a.attnum > 0
        and not a.attisdropped
    ) as reversal_column_shape,
    (
      select coalesce(jsonb_agg(con.conname order by con.conname), '[]'::jsonb)
      from pg_catalog.pg_constraint con
      where con.conrelid = 'public.pheno_reversals'::regclass
        and con.contype <> 'n'
    ) as reversal_constraint_names,
    (
      select lower(
        regexp_replace(
          string_agg(pg_catalog.pg_get_constraintdef(con.oid, true), ' ' order by con.conname),
          '\\s+',
          '',
          'g'
        )
      )
      from pg_catalog.pg_constraint con
      where con.conrelid = 'public.pheno_reversals'::regclass
        and con.contype <> 'n'
    ) as reversal_constraint_definitions,
    (
      select coalesce(jsonb_agg(ci.relname order by ci.relname), '[]'::jsonb)
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ci on ci.oid = i.indexrelid
      where i.indrelid = 'public.pheno_reversals'::regclass
    ) as reversal_index_names,
    (
      select lower(
        regexp_replace(
          string_agg(pg_catalog.pg_get_indexdef(i.indexrelid), ' ' order by ci.relname),
          '\\s+',
          '',
          'g'
        )
      )
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ci on ci.oid = i.indexrelid
      where i.indrelid = 'public.pheno_reversals'::regclass
    ) as reversal_index_definitions,
    (
      select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb)
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.pheno_crosses'::regclass
        and a.attnum > 0
        and not a.attisdropped
    ) as cross_column_names,
    (
      select coalesce(
        jsonb_agg(
          format(
            '%s|%s|%s|%s|%s|%s',
            a.attnum,
            a.attname,
            pg_catalog.format_type(a.atttypid, a.atttypmod),
            case when a.attnotnull then 'not_null' else 'nullable' end,
            coalesce(
              regexp_replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '\\s+', '', 'g'),
              ''
            ),
            a.attidentity::text || a.attgenerated::text
          )
          order by a.attnum
        ),
        '[]'::jsonb
      )
      from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d
        on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'public.pheno_crosses'::regclass
        and a.attnum > 0
        and not a.attisdropped
    ) as cross_column_shape,
    (
      select coalesce(jsonb_agg(con.conname order by con.conname), '[]'::jsonb)
      from pg_catalog.pg_constraint con
      where con.conrelid = 'public.pheno_crosses'::regclass
        and con.contype <> 'n'
    ) as cross_constraint_names,
    (
      select lower(
        regexp_replace(
          string_agg(pg_catalog.pg_get_constraintdef(con.oid, true), ' ' order by con.conname),
          '\\s+',
          '',
          'g'
        )
      )
      from pg_catalog.pg_constraint con
      where con.conrelid = 'public.pheno_crosses'::regclass
        and con.contype <> 'n'
    ) as cross_constraint_definitions,
    (
      select coalesce(jsonb_agg(ci.relname order by ci.relname), '[]'::jsonb)
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ci on ci.oid = i.indexrelid
      where i.indrelid = 'public.pheno_crosses'::regclass
    ) as cross_index_names,
    (
      select lower(
        regexp_replace(
          string_agg(pg_catalog.pg_get_indexdef(i.indexrelid), ' ' order by ci.relname),
          '\\s+',
          '',
          'g'
        )
      )
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ci on ci.oid = i.indexrelid
      where i.indrelid = 'public.pheno_crosses'::regclass
    ) as cross_index_definitions,
    (
      select coalesce(
        jsonb_agg(
          format(
            '%s|%s|%s',
            t.tgname,
            t.tgenabled,
            replace(
              lower(regexp_replace(pg_catalog.pg_get_triggerdef(t.oid, true), '\\s+', '', 'g')),
              'public.',
              ''
            )
          )
          order by t.tgname
        ),
        '[]'::jsonb
      )
      from pg_catalog.pg_trigger t
      where t.tgrelid = 'public.pheno_crosses'::regclass
        and not t.tgisinternal
    ) as cross_trigger_shape,
    (
      select count(*)
      from information_schema.columns
      where table_schema = 'public' and table_name = 'pheno_crosses'
    ) as cross_column_count,
    (
      select count(*)
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class r on r.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = 'pheno_crosses'
    ) as cross_constraint_count,
    (
      select count(*)
      from pg_catalog.pg_indexes
      where schemaname = 'public' and tablename = 'pheno_crosses'
    ) as cross_index_count,
    (
      select coalesce(
        array_agg(privilege_type::text order by privilege_type::text)
          filter (where table_name = 'pheno_crosses' and grantee = 'authenticated'),
        array[]::text[]
      )
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name in ('pheno_crosses', 'pheno_reversals')
        and grantee in ('authenticated', 'anon', 'PUBLIC')
    ) as cross_authenticated_grants,
    (
      select coalesce(
        array_agg(privilege_type::text order by privilege_type::text)
          filter (where table_name = 'pheno_reversals' and grantee = 'authenticated'),
        array[]::text[]
      )
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name in ('pheno_crosses', 'pheno_reversals')
        and grantee in ('authenticated', 'anon', 'PUBLIC')
    ) as reversal_authenticated_grants,
    (
      select count(*)
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name in ('pheno_crosses', 'pheno_reversals')
        and grantee in ('anon', 'PUBLIC')
    ) as public_or_anon_grant_count,
    (
      select coalesce(
        jsonb_agg(grantee || '|' || privilege_type order by grantee, privilege_type),
        '[]'::jsonb
      )
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'pheno_crosses'
        and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
    ) as cross_api_privileges,
    (
      select coalesce(
        jsonb_agg(grantee || '|' || privilege_type order by grantee, privilege_type),
        '[]'::jsonb
      )
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'pheno_reversals'
        and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
    ) as reversal_api_privileges,
    (
      select c.relrowsecurity and not c.relforcerowsecurity
      from pg_catalog.pg_class c
      where c.oid = 'public.pheno_crosses'::regclass
    ) as cross_rls_contract,
    (
      select c.relrowsecurity and not c.relforcerowsecurity
      from pg_catalog.pg_class c
      where c.oid = 'public.pheno_reversals'::regclass
    ) as reversal_rls_contract,
    has_table_privilege(
      'service_role',
      'public.pheno_crosses',
      'SELECT,INSERT,UPDATE,DELETE'
    ) and has_table_privilege(
      'service_role',
      'public.pheno_reversals',
      'SELECT,INSERT,UPDATE,DELETE'
    ) as service_role_core_grants
),
schema_audit as (
  select
    count(*) filter (
      where p.oid = to_regprocedure('public.admin_schema_audit(text[],text[],jsonb)')
    ) as canonical_count,
    count(*) as overload_count,
    bool_and(p.prosecdef) as all_security_definer,
    bool_and(p.provolatile = 's') as all_stable,
    bool_and(p.proconfig = array['search_path=pg_catalog']::text[])
      as all_search_path_pinned,
    bool_and(
      position('auth.uid()' in pg_get_functiondef(p.oid)) > 0
      and position(
        'public.has_role(_uid, ''operator''::public.app_role)'
        in pg_get_functiondef(p.oid)
      ) > 0
      and position(
        'public.has_role(_uid, ''staff''::public.app_role)'
        in pg_get_functiondef(p.oid)
      ) > 0
      and position('RAISE EXCEPTION ''forbidden''' in pg_get_functiondef(p.oid)) > 0
    ) as all_role_gate_pinned,
    bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      as authenticated_can_execute,
    bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
      as anon_cannot_execute,
    bool_and(not has_function_privilege('service_role', p.oid, 'EXECUTE'))
      as service_role_cannot_execute,
    min(p.prosrc) filter (
      where p.oid = to_regprocedure('public.admin_schema_audit(text[],text[],jsonb)')
    ) as canonical_prosrc
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_schema_audit'
),
credit as (
  select
    spend.oid is not null as spend_exists,
    refund.oid is not null as refund_exists,
    to_regclass('public.ai_credit_spend_results') is not null as results_exists,
    spend.prosecdef as spend_security_definer,
    spend.proconfig = array['search_path=public, pg_temp']::text[]
      as spend_search_path_pinned,
    position('receipt_snapshot' in pg_get_functiondef(spend.oid)) > 0 as spend_receipt_snapshot,
    spend.prosrc as spend_prosrc,
    refund.prosecdef as refund_security_definer,
    refund.proconfig = array['search_path=public, pg_temp']::text[]
      as refund_search_path_pinned,
    refund.prosrc as refund_prosrc,
    has_function_privilege('service_role', spend.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', spend.oid, 'EXECUTE')
      and not has_function_privilege('anon', spend.oid, 'EXECUTE')
      and not exists (
        select 1
        from aclexplode(coalesce(spend.proacl, acldefault('f', spend.proowner))) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
      )
      as spend_service_only,
    has_function_privilege('service_role', refund.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', refund.oid, 'EXECUTE')
      and not has_function_privilege('anon', refund.oid, 'EXECUTE')
      and not exists (
        select 1
        from aclexplode(coalesce(refund.proacl, acldefault('f', refund.proowner))) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
      )
      as refund_service_only,
    has_table_privilege('service_role', 'public.ai_credit_spend_results', 'SELECT')
      and not has_table_privilege('authenticated', 'public.ai_credit_spend_results', 'SELECT')
      and not has_table_privilege('anon', 'public.ai_credit_spend_results', 'SELECT')
      as results_service_only,
    (
      select coalesce(
        jsonb_agg(grantee || '|' || privilege_type order by grantee, privilege_type),
        '[]'::jsonb
      )
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'ai_credit_spend_results'
        and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
    ) as results_api_privileges,
    (
      select case
        when legacy.oid is null then true
        else
          not has_function_privilege('service_role', legacy.oid, 'EXECUTE')
          and not has_function_privilege('authenticated', legacy.oid, 'EXECUTE')
          and not has_function_privilege('anon', legacy.oid, 'EXECUTE')
          and not exists (
            select 1
            from pg_catalog.pg_proc legacy_proc
            cross join lateral aclexplode(
              coalesce(legacy_proc.proacl, acldefault('f', legacy_proc.proowner))
            ) acl
            where legacy_proc.oid = legacy.oid
              and acl.grantee = 0
              and acl.privilege_type = 'EXECUTE'
          )
      end
      from (
        select to_regprocedure(
          'public.ai_credit_spend(text,uuid,text,text,jsonb)'
        ) as oid
      ) legacy
    ) as legacy_spend_safe,
    (
      select case
        when legacy.oid is null then true
        else
          not has_function_privilege('service_role', legacy.oid, 'EXECUTE')
          and not has_function_privilege('authenticated', legacy.oid, 'EXECUTE')
          and not has_function_privilege('anon', legacy.oid, 'EXECUTE')
          and not exists (
            select 1
            from pg_catalog.pg_proc legacy_proc
            cross join lateral aclexplode(
              coalesce(legacy_proc.proacl, acldefault('f', legacy_proc.proowner))
            ) acl
            where legacy_proc.oid = legacy.oid
              and acl.grantee = 0
              and acl.privilege_type = 'EXECUTE'
          )
      end
      from (
        select to_regprocedure('public.ai_credit_refund(uuid,text,text)') as oid
      ) legacy
    ) as legacy_refund_safe
  from pg_catalog.pg_proc spend
  cross join pg_catalog.pg_proc refund
  where spend.oid = to_regprocedure(
    'public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)'
  )
    and refund.oid = to_regprocedure('public.ai_credit_refund(uuid,uuid,text,text)')
)
select jsonb_build_object(
  'ledger_exact_count', (select exact_count from ledger),
  'ledger_mismatch_count', (select mismatch_count from ledger),
  'ledger_collision_count', (select collision_count from ledger),
  'soil_exists', to_regclass('public.soil_moisture_calibrations') is not null,
  'soil_column_names', (select column_names from soil_contract),
  'soil_column_shape', (select column_shape from soil_contract),
  'soil_constraint_names', (select constraint_names from soil_contract),
  'soil_constraint_definitions', (select constraint_definitions from soil_contract),
  'soil_index_names', (select index_names from soil_contract),
  'soil_index_definitions', (select index_definitions from soil_contract),
  'soil_policy_shape', (select policy_shape from soil_contract),
  'soil_policy_definitions', (select policy_definitions from soil_contract),
  'soil_trigger_shape', (select trigger_shape from soil_contract),
  'soil_column_count', (select column_count from soil_contract),
  'soil_constraint_count', (select constraint_count from soil_contract),
  'soil_index_count', (select index_count from soil_contract),
  'soil_policy_count', (select policy_count from soil_contract),
  'soil_rls_contract', (select rls_contract from soil_contract),
  'soil_public_or_anon_grant_count', (select public_or_anon_grant_count from soil_contract),
  'soil_api_privileges', (select api_privileges from soil_contract),
  'taxonomy_column_count', (select present_count from taxonomy),
  'pheno_cross_policy_names', (select cross_policy_names from pheno_contract),
  'pheno_reversal_policy_names', (select reversal_policy_names from pheno_contract),
  'pheno_cross_owner_policy_shape', (select cross_owner_policy_shape from pheno_contract),
  'pheno_cross_owner_policy_definitions', (select cross_owner_policy_definitions from pheno_contract),
  'pheno_reversal_owner_policy_shape', (select reversal_owner_policy_shape from pheno_contract),
  'pheno_reversal_owner_policy_definitions', (select reversal_owner_policy_definitions from pheno_contract),
  'pheno_reversal_column_shape', (select reversal_column_shape from pheno_contract),
  'pheno_reversal_constraint_names', (select reversal_constraint_names from pheno_contract),
  'pheno_reversal_constraint_definitions', (select reversal_constraint_definitions from pheno_contract),
  'pheno_reversal_index_names', (select reversal_index_names from pheno_contract),
  'pheno_reversal_index_definitions', (select reversal_index_definitions from pheno_contract),
  'pheno_cross_column_names', (select cross_column_names from pheno_contract),
  'pheno_cross_column_shape', (select cross_column_shape from pheno_contract),
  'pheno_cross_constraint_names', (select cross_constraint_names from pheno_contract),
  'pheno_cross_constraint_definitions', (select cross_constraint_definitions from pheno_contract),
  'pheno_cross_index_names', (select cross_index_names from pheno_contract),
  'pheno_cross_index_definitions', (select cross_index_definitions from pheno_contract),
  'pheno_cross_trigger_shape', (select cross_trigger_shape from pheno_contract),
  'pheno_cross_column_count', (select cross_column_count from pheno_contract),
  'pheno_cross_constraint_count', (select cross_constraint_count from pheno_contract),
  'pheno_cross_index_count', (select cross_index_count from pheno_contract),
  'pheno_cross_authenticated_grants', (select cross_authenticated_grants from pheno_contract),
  'pheno_reversal_authenticated_grants', (select reversal_authenticated_grants from pheno_contract),
  'pheno_public_or_anon_grant_count', (select public_or_anon_grant_count from pheno_contract),
  'pheno_cross_api_privileges', (select cross_api_privileges from pheno_contract),
  'pheno_reversal_api_privileges', (select reversal_api_privileges from pheno_contract),
  'pheno_cross_rls_contract', (select cross_rls_contract from pheno_contract),
  'pheno_reversal_rls_contract', (select reversal_rls_contract from pheno_contract),
  'pheno_service_role_core_grants', (select service_role_core_grants from pheno_contract),
  'schema_audit_canonical_count', (select canonical_count from schema_audit),
  'schema_audit_overload_count', (select overload_count from schema_audit),
  'schema_audit_security_definer', (select all_security_definer from schema_audit),
  'schema_audit_stable', (select all_stable from schema_audit),
  'schema_audit_search_path_pinned', (select all_search_path_pinned from schema_audit),
  'schema_audit_role_gate_pinned', (select all_role_gate_pinned from schema_audit),
  'schema_audit_authenticated_can_execute', (select authenticated_can_execute from schema_audit),
  'schema_audit_anon_cannot_execute', (select anon_cannot_execute from schema_audit),
  'schema_audit_service_role_cannot_execute', (select service_role_cannot_execute from schema_audit),
  'schema_audit_prosrc', (select canonical_prosrc from schema_audit),
  'credit_spend_exists', (select spend_exists from credit),
  'credit_refund_exists', (select refund_exists from credit),
  'credit_results_exists', (select results_exists from credit),
  'credit_spend_security_definer', (select spend_security_definer from credit),
  'credit_spend_search_path_pinned', (select spend_search_path_pinned from credit),
  'credit_spend_receipt_snapshot', (select spend_receipt_snapshot from credit),
  'credit_spend_prosrc', (select spend_prosrc from credit),
  'credit_refund_security_definer', (select refund_security_definer from credit),
  'credit_refund_search_path_pinned', (select refund_search_path_pinned from credit),
  'credit_refund_prosrc', (select refund_prosrc from credit),
  'credit_spend_service_only', (select spend_service_only from credit),
  'credit_refund_service_only', (select refund_service_only from credit),
  'credit_results_service_only', (select results_service_only from credit),
  'credit_results_api_privileges', (select results_api_privileges from credit),
  'credit_legacy_spend_safe', (select legacy_spend_safe from credit),
  'credit_legacy_refund_safe', (select legacy_refund_safe from credit),
  'pheno_identity', (select value from pheno_identity),
  'restrictive_policies', (select value from restrictive_policies)
)::text;
`;

function runPsqlQuery({ sql, childEnv, spawnImpl }) {
  const result = spawnImpl("psql", ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: childEnv,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
  if (result.error?.code === "ENOENT") {
    return { ok: false, kind: "not_invocable" };
  }
  if (result.error || result.status !== 0) {
    return { ok: false, kind: "query_failed" };
  }
  const output = String(result.stdout ?? "").trim();
  try {
    return { ok: true, value: JSON.parse(output) };
  } catch {
    return { ok: false, kind: "invalid_json" };
  }
}

function runPsqlFile({ path, childEnv, spawnImpl }) {
  const result = spawnImpl(
    "psql",
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "--file", path],
    {
      env: childEnv,
      encoding: "utf8",
      windowsHide: true,
      timeout: 300_000,
    },
  );
  if (result.error?.code === "ENOENT") return { ok: false, kind: "not_invocable" };
  if (result.error || result.status !== 0) return { ok: false, kind: "apply_failed" };
  return { ok: true };
}

function validatePreflight(preflight) {
  if (preflight?.current_user !== "postgres") {
    throw new Error("unexpected_database_role");
  }
  const columns = preflight?.ledger_columns;
  if (
    !columns ||
    columns.version !== "text" ||
    columns.name !== "text" ||
    columns.statements !== "ARRAY"
  ) {
    throw new Error("unexpected_ledger_shape");
  }
  const expectedLedgerColumns = [
    { name: "version", data_type: "text", udt_name: "text", nullable: "NO" },
    { name: "name", data_type: "text", udt_name: "text", nullable: "YES" },
    { name: "statements", data_type: "ARRAY", udt_name: "_text", nullable: "YES" },
  ];
  const observedLedgerColumns = preflight?.ledger_ordered_columns;
  if (
    !Array.isArray(observedLedgerColumns) ||
    observedLedgerColumns.length !== expectedLedgerColumns.length ||
    observedLedgerColumns.some((observed, index) =>
      Object.entries(expectedLedgerColumns[index]).some(
        ([key, expected]) => observed?.[key] !== expected,
      ),
    ) ||
    JSON.stringify(preflight?.ledger_primary_key) !== JSON.stringify(["version"])
  ) {
    throw new Error("unexpected_ledger_contract");
  }
  const requiredDependencies = [
    "pheno_crosses",
    "pheno_reversals",
    "ai_credit_grants",
    "ai_credit_spends",
    "ai_credit_spend_results",
    "subscriptions",
    "grows",
    "has_role",
    "schema_audit_overloads_safe",
  ];
  const dependencies = preflight?.dependencies;
  if (!dependencies || typeof dependencies !== "object") {
    throw new Error("missing_dependencies");
  }
  for (const name of requiredDependencies) {
    if (dependencies[name] !== true) throw new Error(`missing_dependency:${name}`);
  }
  return classifyTargetLedger(preflight.targets);
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJson(child)]),
  );
}

function includesEvery(value, fragments) {
  return typeof value === "string" && fragments.every((fragment) => value.includes(fragment));
}

function matchesEvery(value, patterns) {
  return typeof value === "string" && patterns.every((pattern) => pattern.test(value));
}

function validatePostflightLedger(after) {
  if (
    after?.ledger_exact_count !== 7 ||
    after?.ledger_mismatch_count !== 0 ||
    after?.ledger_collision_count !== 0
  ) {
    throw new Error("ledger_postcondition");
  }
}

function validatePostflight({ before, after, exactPolicies, expectedFunctionBodies }) {
  validatePostflightLedger(after);
  if (
    exactPolicies?.required_policy_count !== REQUIRED_EXACT_POLICY_COUNT ||
    !ALLOWED_ACTIVE_EXACT_POLICY_COUNTS.includes(exactPolicies?.active_policy_count) ||
    exactPolicies?.definitions_exact !== true ||
    exactPolicies?.constraint_count !== EXACT_CONSTRAINT_SPECS.length ||
    exactPolicies?.constraints_exact !== true
  ) {
    throw new Error("catalog_definition_postcondition");
  }
  if (
    typeof expectedFunctionBodies?.schema_audit !== "string" ||
    typeof expectedFunctionBodies?.credit_spend !== "string" ||
    typeof expectedFunctionBodies?.credit_refund !== "string" ||
    typeof after?.schema_audit_prosrc !== "string" ||
    typeof after?.credit_spend_prosrc !== "string" ||
    typeof after?.credit_refund_prosrc !== "string" ||
    sha256(Buffer.from(after.schema_audit_prosrc, "utf8")) !==
      sha256(Buffer.from(expectedFunctionBodies.schema_audit, "utf8")) ||
    sha256(Buffer.from(after.credit_spend_prosrc, "utf8")) !==
      sha256(Buffer.from(expectedFunctionBodies.credit_spend, "utf8")) ||
    sha256(Buffer.from(after.credit_refund_prosrc, "utf8")) !==
      sha256(Buffer.from(expectedFunctionBodies.credit_refund, "utf8"))
  ) {
    throw new Error("function_definition_postcondition");
  }
  const exactArray = (observed, expected) => JSON.stringify(observed) === JSON.stringify(expected);
  const exactArrayIsOneOf = (observed, expectedOptions) =>
    expectedOptions.some((expected) => exactArray(observed, expected));
  if (
    after?.soil_exists !== true ||
    !exactArray(after?.soil_column_names, EXPECTED_SOIL_COLUMNS) ||
    !exactArray(after?.soil_column_shape, EXPECTED_SOIL_COLUMN_SHAPE) ||
    !exactArray(after?.soil_constraint_names, EXPECTED_SOIL_CONSTRAINTS) ||
    !includesEvery(after?.soil_constraint_definitions?.replaceAll("public.", ""), [
      "primarykey(id)",
      "dry_raw<>wet_raw",
      "dry_raw<>'nan'::numeric",
      "wet_raw<>'nan'::numeric",
      "'manual'::text",
      "'csv'::text",
      "'demo'::text",
      "sensor_depth_cmisnull",
      "referencesgrows(id)ondeletecascade",
      "referencestents(id)ondeletecascade",
      "referencesplants(id)ondeletesetnull",
    ]) ||
    !matchesEvery(after?.soil_constraint_definitions, [
      /sensor_depth_cm>=\(?0/,
      /sensor_depth_cm<=\(?1000/,
    ]) ||
    !exactArray(after?.soil_index_names, EXPECTED_SOIL_INDEXES) ||
    !includesEvery(after?.soil_index_definitions, [
      "(user_id,grow_id,tent_id,is_active,created_atdesc)",
      "(user_id,plant_id)",
      "where(plant_idisnotnull)",
      "uniqueindexsoil_moisture_calibrations_active_probe_uidx",
      "coalesce(plant_id,'00000000-0000-0000-0000-000000000000'::uuid)",
      "whereis_active",
    ]) ||
    !exactArray(after?.soil_policy_shape, EXPECTED_SOIL_POLICIES) ||
    !includesEvery(after?.soil_policy_definitions, [
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
    ]) ||
    !exactArray(
      after?.soil_trigger_shape?.map((shape) => shape.split("|", 2).join("|")),
      ["soil_moisture_calibrations_set_updated_at|O"],
    ) ||
    !includesEvery(after?.soil_trigger_shape?.[0], [
      "beforeupdateonsoil_moisture_calibrationsforeachrowexecutefunctionset_updated_at()",
    ]) ||
    after?.soil_column_count !== 16 ||
    after?.soil_constraint_count !== 8 ||
    after?.soil_index_count !== 4 ||
    after?.soil_policy_count !== 4 ||
    after?.soil_rls_contract !== true ||
    after?.soil_public_or_anon_grant_count !== 0 ||
    !exactArray(after?.soil_api_privileges, EXPECTED_SOIL_API_PRIVILEGES) ||
    after?.taxonomy_column_count !== 3 ||
    !exactArrayIsOneOf(after?.pheno_cross_policy_names, [
      PHENO_CROSS_OWNER_POLICY_NAMES,
      PHENO_CROSS_ENTITLED_POLICY_NAMES,
    ]) ||
    !exactArrayIsOneOf(after?.pheno_reversal_policy_names, [
      PHENO_REVERSAL_OWNER_POLICY_NAMES,
      PHENO_REVERSAL_ENTITLED_POLICY_NAMES,
    ]) ||
    !exactArray(after?.pheno_cross_owner_policy_shape, EXPECTED_PHENO_CROSS_OWNER_POLICIES) ||
    !includesEvery(after?.pheno_cross_owner_policy_definitions?.replaceAll("pheno_crosses.", ""), [
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
    ]) ||
    !exactArray(after?.pheno_reversal_owner_policy_shape, EXPECTED_PHENO_REVERSAL_OWNER_POLICIES) ||
    !includesEvery(after?.pheno_reversal_owner_policy_definitions, [
      "auth.uid()=user_id",
      "frompheno_keepersk",
    ]) ||
    !exactArray(after?.pheno_reversal_column_shape, EXPECTED_PHENO_REVERSAL_COLUMN_SHAPE) ||
    !exactArray(after?.pheno_reversal_constraint_names, EXPECTED_PHENO_REVERSAL_CONSTRAINTS) ||
    !includesEvery(after?.pheno_reversal_constraint_definitions?.replaceAll("public.", ""), [
      "primarykey(id)",
      "'sts'::text",
      "'colloidal_silver'::text",
      "'ga3'::text",
      "'other'::text",
      "referencespheno_keepers(id)ondeletecascade",
      "referencesauth.users(id)ondeletecascade",
    ]) ||
    !exactArray(after?.pheno_reversal_index_names, EXPECTED_PHENO_REVERSAL_INDEXES) ||
    !includesEvery(after?.pheno_reversal_index_definitions, [
      "pheno_reversals_keeper_idx",
      "(keeper_id)",
      "pheno_reversals_pkey",
      "(id)",
      "pheno_reversals_user_id_idx",
      "(user_id)",
    ]) ||
    !exactArray(after?.pheno_cross_column_names, EXPECTED_PHENO_COLUMNS) ||
    !exactArray(after?.pheno_cross_column_shape, EXPECTED_PHENO_COLUMN_SHAPE) ||
    !exactArray(after?.pheno_cross_constraint_names, EXPECTED_PHENO_CONSTRAINTS) ||
    !includesEvery(after?.pheno_cross_constraint_definitions?.replaceAll("public.", ""), [
      "primarykey(id)",
      "referencesauth.users(id)ondeletecascade",
      "referencespheno_hunts(id)ondeletesetnull",
      "referencespheno_keepers(id)ondeletecascade",
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
    ]) ||
    !matchesEvery(after?.pheno_cross_constraint_definitions, [
      /generation>=\(?2/,
      /generation>=\(?1/,
    ]) ||
    !exactArray(after?.pheno_cross_index_names, EXPECTED_PHENO_INDEXES) ||
    !includesEvery(after?.pheno_cross_index_definitions, [
      "pheno_crosses_cross_type_idx",
      "(cross_type)",
      "pheno_crosses_female_idx",
      "(female_keeper_id)",
      "pheno_crosses_hunt_id_idx",
      "(hunt_id)",
      "pheno_crosses_male_idx",
      "(male_keeper_id)",
      "pheno_crosses_pkey",
      "(id)",
      "pheno_crosses_recurrent_parent_idx",
      "(recurrent_parent_id)",
      "pheno_crosses_user_id_idx",
      "(user_id)",
    ]) ||
    !exactArray(
      after?.pheno_cross_trigger_shape?.map((shape) => shape.split("|", 2).join("|")),
      ["pheno_crosses_set_updated_at|O"],
    ) ||
    !includesEvery(after?.pheno_cross_trigger_shape?.[0], [
      "beforeupdateonpheno_crossesforeachrowexecutefunctionset_updated_at()",
    ]) ||
    after?.pheno_cross_column_count !== 14 ||
    after?.pheno_cross_constraint_count !== 11 ||
    after?.pheno_cross_index_count !== 7 ||
    JSON.stringify(after?.pheno_cross_authenticated_grants) !==
      JSON.stringify(["DELETE", "INSERT", "SELECT", "UPDATE"]) ||
    JSON.stringify(after?.pheno_reversal_authenticated_grants) !==
      JSON.stringify(["INSERT", "SELECT"]) ||
    after?.pheno_public_or_anon_grant_count !== 0 ||
    !exactArray(after?.pheno_cross_api_privileges, EXPECTED_PHENO_CROSS_API_PRIVILEGES) ||
    !exactArray(after?.pheno_reversal_api_privileges, EXPECTED_PHENO_REVERSAL_API_PRIVILEGES) ||
    after?.pheno_cross_rls_contract !== true ||
    after?.pheno_reversal_rls_contract !== true ||
    after?.pheno_service_role_core_grants !== true ||
    after?.schema_audit_canonical_count !== 1 ||
    after?.schema_audit_overload_count !== 1 ||
    after?.schema_audit_security_definer !== true ||
    after?.schema_audit_stable !== true ||
    after?.schema_audit_search_path_pinned !== true ||
    after?.schema_audit_role_gate_pinned !== true ||
    after?.schema_audit_authenticated_can_execute !== true ||
    after?.schema_audit_anon_cannot_execute !== true ||
    after?.schema_audit_service_role_cannot_execute !== true ||
    after?.credit_spend_exists !== true ||
    after?.credit_refund_exists !== true ||
    after?.credit_results_exists !== true ||
    after?.credit_spend_security_definer !== true ||
    after?.credit_spend_search_path_pinned !== true ||
    after?.credit_spend_receipt_snapshot !== true ||
    after?.credit_refund_security_definer !== true ||
    after?.credit_refund_search_path_pinned !== true ||
    after?.credit_spend_service_only !== true ||
    after?.credit_refund_service_only !== true ||
    after?.credit_results_service_only !== true ||
    !exactArray(after?.credit_results_api_privileges, ["service_role|SELECT"]) ||
    after?.credit_legacy_spend_safe !== true ||
    after?.credit_legacy_refund_safe !== true
  ) {
    throw new Error("schema_postcondition");
  }
  if (
    JSON.stringify(stableJson(after?.pheno_identity)) !==
    JSON.stringify(stableJson(before?.pheno_identity))
  ) {
    throw new Error("pheno_identity_changed");
  }
  if (
    JSON.stringify(stableJson(after?.restrictive_policies)) !==
    JSON.stringify(stableJson(before?.restrictive_policies))
  ) {
    throw new Error("pheno_entitlement_policy_changed");
  }
}

export function runPinnedProductionMigrations({
  env = process.env,
  spawnImpl = spawnSync,
  readFile = readFileSync,
  logger = console,
  now = () => new Date(),
} = {}) {
  const expectedHeadSha = String(env.EXPECTED_HEAD_SHA ?? "").trim();
  const observedHeadSha = String(env.GITHUB_SHA ?? "").trim();
  const reportPath = env.REPORT_PATH ?? "";
  const auditPath = env.AUDIT_PATH ?? "";
  const { writeReport, writeAudit } = makeArtifactWriters({
    reportPath,
    auditPath,
    now,
    logger,
  });
  const auditBase = { expectedHeadSha, observedHeadSha };

  if (
    env.TARGET_ENV !== "production" ||
    env.CONFIRM_PROJECT_REF !== PRODUCTION_PROJECT_REF ||
    env.CONFIRM_APPLY !== APPLY_CONFIRMATION ||
    !/^[0-9a-f]{40}$/.test(expectedHeadSha) ||
    expectedHeadSha !== observedHeadSha
  ) {
    logger.error("Pinned production inputs were rejected before database access.");
    writeReport("BLOCKED - confirmation rejected", [
      "The target ref, confirmation phrase, or expected commit did not match the checked-out deploy commit.",
    ]);
    writeAudit("input_rejected", auditBase);
    return EXIT.INPUT_REJECTED;
  }

  const databaseUrl = env.SUPABASE_DB_URL ?? "";
  if (!databaseUrl) {
    logger.error("The protected production database URL is not configured.");
    writeReport("BLOCKED - database secret missing", [
      "Configure the environment-scoped production database URL before dispatching this workflow.",
    ]);
    writeAudit("no_database_url", auditBase);
    return EXIT.NO_DATABASE_URL;
  }

  let childEnv;
  try {
    childEnv = buildPsqlEnvironment(env, databaseUrl);
  } catch (error) {
    const reason = compactError(error);
    logger.error(`Production database identity was rejected (${reason}).`);
    writeReport("BLOCKED - target identity rejected", [
      "The protected URL did not prove the pinned Verdant production project.",
    ]);
    writeAudit("target_rejected", { ...auditBase, note: reason });
    return EXIT.TARGET_REJECTED;
  }

  let validatedMigrations;
  let validatedSecurityReferences;
  let expectedFunctionBodies;
  let canonicalPolicyVerificationSql;
  try {
    validatedMigrations = validatePinnedMigrationFiles({ readFile });
    validatedSecurityReferences = validatePinnedSecurityReferenceFiles({ readFile });
    expectedFunctionBodies = extractExpectedFunctionBodies([
      ...validatedMigrations,
      ...validatedSecurityReferences,
    ]);
    canonicalPolicyVerificationSql = buildCanonicalPolicyVerificationSql(validatedMigrations);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "file_validation_failed";
    logger.error(`Pinned migration file validation failed (${reason}).`);
    writeReport("BLOCKED - migration artifact rejected", [
      "At least one migration or read-only security-reference path, byte hash, newline rule, order, or transaction-safety fence failed.",
    ]);
    writeAudit("file_rejected", { ...auditBase, note: reason });
    return EXIT.FILE_REJECTED;
  }

  const preflightResult = runPsqlQuery({
    sql: PREFLIGHT_SQL,
    childEnv,
    spawnImpl,
  });
  if (!preflightResult.ok) {
    const code =
      preflightResult.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.PREFLIGHT_FAILED;
    logger.error("Read-only production preflight did not complete.");
    writeReport("BLOCKED - production preflight failed", [
      "No migration SQL was submitted. Inspect the protected workflow run and database connectivity.",
    ]);
    writeAudit("preflight_failed", {
      ...auditBase,
      note: preflightResult.kind,
    });
    return code;
  }

  let ledger;
  try {
    ledger = validatePreflight(preflightResult.value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "preflight_contract_failed";
    logger.error(`Production preflight rejected the observed contract (${reason}).`);
    writeReport("BLOCKED - production contract unexpected", [
      "No migration SQL was submitted because the trusted role, ledger shape, or prerequisite contract differed.",
    ]);
    writeAudit("preflight_contract_rejected", { ...auditBase, note: reason });
    return EXIT.PREFLIGHT_FAILED;
  }

  if (ledger.status === "collision" || ledger.status === "mixed" || ledger.status === "invalid") {
    logger.error(`Production ledger state is not safely actionable (${ledger.status}).`);
    writeReport("BLOCKED - migration ledger drift", [
      "The three pinned versions were partially applied or collided by version/name. Nothing was written.",
    ]);
    writeAudit("ledger_drift", {
      ...auditBase,
      ledgerState: ledger.status,
      note: ledger.reason,
    });
    return EXIT.LEDGER_DRIFT;
  }

  if (ledger.status === "apply") {
    const temporaryRoot = mkdtempSync(
      join(env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(), "verdant-pinned-migrations-"),
    );
    const applyPath = join(temporaryRoot, "apply.sql");
    try {
      writeFileSync(applyPath, buildApplySql(validatedMigrations), {
        encoding: "utf8",
        mode: 0o600,
      });
      const applyResult = runPsqlFile({
        path: applyPath,
        childEnv,
        spawnImpl,
      });
      if (!applyResult.ok) {
        logger.error("The pinned production transaction failed and was rolled back.");
        writeReport("FAILED - transaction rolled back", [
          "psql returned a failure while running the exact single transaction. No partial success is accepted.",
        ]);
        writeAudit("apply_failed", {
          ...auditBase,
          ledgerState: ledger.status,
          note: applyResult.kind,
        });
        return applyResult.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.APPLY_FAILED;
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }

  const postflightResult = runPsqlQuery({
    sql: POSTFLIGHT_SQL,
    childEnv,
    spawnImpl,
  });
  if (!postflightResult.ok) {
    logger.error("Postflight verification did not complete.");
    writeReport("FAILED - postflight unavailable", [
      "The workflow cannot prove the final production contract. Treat the deployment as unverified.",
    ]);
    writeAudit("postflight_failed", {
      ...auditBase,
      ledgerState: ledger.status,
      note: postflightResult.kind,
    });
    return EXIT.POSTFLIGHT_FAILED;
  }

  try {
    validatePostflightLedger(postflightResult.value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "postflight_contract_failed";
    logger.error(`Postflight contract verification failed (${reason}).`);
    writeReport("FAILED - postflight contract mismatch", [
      "The database responded, but the exact migration ledger contract did not match.",
    ]);
    writeAudit("postflight_contract_failed", {
      ...auditBase,
      ledgerState: ledger.status,
      note: reason,
    });
    return EXIT.POSTFLIGHT_FAILED;
  }

  const exactPolicyResult = runPsqlQuery({
    sql: canonicalPolicyVerificationSql,
    childEnv,
    spawnImpl,
  });
  if (!exactPolicyResult.ok) {
    logger.error("Exact policy and constraint verification did not complete.");
    writeReport("FAILED - exact catalog verification unavailable", [
      "The workflow cannot prove that the live policy and constraint definitions exactly match the pinned contract.",
    ]);
    writeAudit("postflight_failed", {
      ...auditBase,
      ledgerState: ledger.status,
      note: exactPolicyResult.kind,
    });
    return EXIT.POSTFLIGHT_FAILED;
  }

  try {
    validatePostflight({
      before: preflightResult.value,
      after: postflightResult.value,
      exactPolicies: exactPolicyResult.value,
      expectedFunctionBodies,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "postflight_contract_failed";
    logger.error(`Postflight contract verification failed (${reason}).`);
    writeReport("FAILED - postflight contract mismatch", [
      "The database responded, but one or more pinned safety postconditions did not match.",
    ]);
    writeAudit("postflight_contract_failed", {
      ...auditBase,
      ledgerState: ledger.status,
      note: reason,
    });
    return EXIT.POSTFLIGHT_FAILED;
  }

  const outcome = ledger.status === "verify_only" ? "already_applied_verified" : "applied_verified";
  logger.log(
    ledger.status === "verify_only"
      ? "Pinned production migrations were already applied and are verified."
      : "Pinned production migrations applied and verified.",
  );
  writeReport("PASS", [
    ledger.status === "verify_only"
      ? "All three exact target ledger rows already existed; no persistent production migration write was attempted."
      : "All three exact migrations committed in one transaction and their own ledger rows were recorded.",
    "Historical reconciliation markers and key schema, Pheno, AI-credit, and Schema Audit postconditions passed.",
  ]);
  writeAudit(outcome, { ...auditBase, ledgerState: ledger.status });
  return EXIT.OK;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectInvocation) {
  process.exitCode = runPinnedProductionMigrations();
}
