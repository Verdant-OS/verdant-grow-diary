/**
 * Schema objects required by Verdant's core write paths.
 *
 * The remote gate checks the actual pg_catalog contract, not migration tracker
 * rows. Migration filenames are retained as operator remediation guidance and
 * are independently checked for presence on disk.
 */

const FEEDING_BASE_MIGRATION = "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql";
const FEEDING_EXTENSION_MIGRATION = "20260612212323_568c55c7-3cd0-46f6-aef7-301e61e61362.sql";
const QUICKLOG_AUDIT_MIGRATION = "20260610230856_e8544509-5a66-41bc-8beb-39c95d96dde5.sql";
const CORE_SCHEMA_FORWARD_REPAIR = "20260725023000_core_schema_forward_repair.sql";
const PRODUCTION_SCHEMA_RECONCILIATION = "20260728090000_production_schema_reconciliation.sql";

const feedingColumn = (column, migration) => ({
  table: "feeding_events",
  column,
  migration,
  reason:
    `quicklog_save_event names feeding_events.${column} in every structured feeding ` +
    "INSERT. A missing column aborts the entire save with 42703.",
});

const quicklogAuditColumn = (column) => ({
  table: "quicklog_audit_events",
  column,
  migration: QUICKLOG_AUDIT_MIGRATION,
  reason:
    `The current Quick Log RPC writes quicklog_audit_events.${column} while ` +
    "recording save and validation outcomes. A partial audit table aborts the save path.",
});

const soilMoistureCalibrationColumn = (column) => ({
  table: "soil_moisture_calibrations",
  column,
  migration: PRODUCTION_SCHEMA_RECONCILIATION,
  reason:
    `The One-Tent Loop soil-calibration surface reads and writes ` +
    `soil_moisture_calibrations.${column}. A partial table breaks sensor calibration.`,
});

const phenoCrossTaxonomyColumn = (column) => ({
  table: "pheno_crosses",
  column,
  migration: PRODUCTION_SCHEMA_RECONCILIATION,
  reason:
    `The gated Pheno cross surface reads and writes pheno_crosses.${column}. ` +
    "Missing taxonomy columns break that paid surface but do not block the One-Tent Loop.",
});

export const REQUIRED_CORE_SCHEMA = Object.freeze([
  {
    table: "tents",
    column: "grow_id",
    migration: "20260520154245_5ceda703-6134-459a-87a6-6285cd859ca0.sql",
    reason: "Grow-scoped tent reads and starter-tent creation require tents.grow_id.",
  },
  {
    table: "plants",
    column: "grow_id",
    migration: "20260520154245_5ceda703-6134-459a-87a6-6285cd859ca0.sql",
    reason: "Grow-scoped plant reads require plants.grow_id.",
  },

  // Complete CREATE TABLE contract used by the Sensors calibration read/write
  // path. A one-column sentinel would miss a partially or manually applied
  // table and allow a false-green production signoff.
  ...[
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
  ].map(soilMoistureCalibrationColumn),

  // Complete column list named by the current quicklog_save_event feeding
  // INSERT. Keeping only ALTER-added columns would let a partial/manual table
  // definition produce a false green.
  ...["event_id", "user_id", "volume_ml", "ph"].map((column) =>
    feedingColumn(column, FEEDING_BASE_MIGRATION),
  ),
  ...[
    "line_id",
    "products",
    "ec_in",
    "ec_out",
    "runoff_ml",
    "runoff_ph",
    "runoff_ec",
    "water_temp_c",
  ].map((column) => feedingColumn(column, FEEDING_EXTENSION_MIGRATION)),

  ...["user_id", "idempotency_key", "grow_event_id", "status", "reason"].map(quicklogAuditColumn),
  {
    table: "quicklog_idempotency",
    column: "request_hash",
    migration: CORE_SCHEMA_FORWARD_REPAIR,
    reason:
      "The current Quick Log replay/conflict guard reads and updates request_hash on every event save.",
  },
  {
    table: "plants",
    column: "plant_type",
    migration: CORE_SCHEMA_FORWARD_REPAIR,
    reason:
      "Create and edit plant payloads always write plant_type; its production absence caused PGRST204 failures.",
  },
]);

export const ADVISORY_SCHEMA = Object.freeze([
  {
    table: "plants",
    column: "candidate_number",
    migration: "20260712010343_pheno_candidate_number_foundation.sql",
    reason:
      "Pheno Hunt candidate ordering depends on candidate_number, but the surface is entitlement-gated.",
  },
  ...["channel", "generation", "recurrent_parent_id"].map(phenoCrossTaxonomyColumn),
]);

export function manifestForScope(scope) {
  if (!scope || scope === "core") return REQUIRED_CORE_SCHEMA;
  if (scope === "advisory") return ADVISORY_SCHEMA;
  throw new Error(
    `Unknown MANIFEST_SCOPE: ${JSON.stringify(scope)} (expected "core" or "advisory")`,
  );
}

export const REQUIRED_CORE_MIGRATIONS = Object.freeze([
  ...new Set([...REQUIRED_CORE_SCHEMA, ...ADVISORY_SCHEMA].map((entry) => entry.migration)),
]);

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function schemaKey(entry) {
  const table = entry?.table;
  const column = entry?.column;
  if (typeof table !== "string" || !IDENTIFIER.test(table)) {
    throw new Error(`Malformed table identifier: ${JSON.stringify(table)}`);
  }
  if (typeof column !== "string" || !IDENTIFIER.test(column)) {
    throw new Error(`Malformed column identifier: ${JSON.stringify(column)}`);
  }
  return `${table}.${column}`;
}

export function coreMigrationVersion(filename) {
  const match = /^(\d{14})_/.exec(filename);
  if (!match) throw new Error(`Malformed migration filename: ${filename}`);
  return match[1];
}
