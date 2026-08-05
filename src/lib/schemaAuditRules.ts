import {
  accessProfileForTable,
  type RlsAuditColumnGrants,
  type RlsAuditGrants,
  type RlsAuditInput,
  type RlsFinding,
  type RlsPolicyAudit,
} from "@/lib/rlsAuditRules";

export type MigrationMatchKind = "exact_version" | "canonical_name" | "absent" | "ambiguous";

export interface MigrationAuditRow {
  filename: string;
  version: string | null;
  applied: boolean;
  match_kind: MigrationMatchKind;
  candidate_count: number;
  matched_version: string | null;
  matched_name: string | null;
}

export interface TableAuditRow {
  table: string;
  exists: boolean;
}

export interface ColumnAuditRow {
  table: string;
  column: string;
  exists: boolean;
}

export interface RawRlsAuditRow {
  table: string;
  exists: boolean;
  rls_enabled: boolean | null;
  rls_forced: boolean | null;
  policy_count: number | null;
  grants: RlsAuditGrants | null;
  column_grants: RlsAuditColumnGrants | null;
  policies: RlsPolicyAudit[] | null;
}

export interface SchemaAuditResponse {
  migrations: MigrationAuditRow[];
  tables: TableAuditRow[];
  columns: ColumnAuditRow[];
  rls_audit: RawRlsAuditRow[];
  user_id: string;
  checked_at: string;
  snapshot_fingerprint: string;
}

export interface SchemaAuditContract {
  migrations: readonly string[];
  tables: readonly string[];
  columns: ReadonlyArray<{ table: string; column: string }>;
}

export type SchemaAuditTrustState = "loading" | "error" | "unverified" | "partial" | "ready";

export interface SchemaAuditTrustResult {
  state: SchemaAuditTrustState;
  issues: string[];
}

export interface SchemaAuditRows {
  migrations: MigrationAuditRow[];
  tables: TableAuditRow[];
  columns: ColumnAuditRow[];
  rlsAudit: RawRlsAuditRow[];
}

const MATCH_KINDS = new Set<MigrationMatchKind>([
  "exact_version",
  "canonical_name",
  "absent",
  "ambiguous",
]);

function countKeys(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function exactResponseKeys(
  label: string,
  expected: readonly string[],
  actual: readonly string[],
  issues: string[],
) {
  const expectedCounts = countKeys(expected);
  const actualCounts = countKeys(actual);

  for (const key of expectedCounts.keys()) {
    const count = actualCounts.get(key) ?? 0;
    if (count === 0) issues.push(`${label} missing from response: ${key}`);
    else if (count !== 1) issues.push(`${label} returned ${count} times: ${key}`);
  }
  for (const key of actualCounts.keys()) {
    if (!expectedCounts.has(key)) issues.push(`unexpected ${label}: ${key}`);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMigrationRow(value: unknown): value is MigrationAuditRow {
  return (
    isRecord(value) &&
    typeof value.filename === "string" &&
    (typeof value.version === "string" || value.version === null) &&
    typeof value.applied === "boolean" &&
    typeof value.match_kind === "string" &&
    typeof value.candidate_count === "number" &&
    (typeof value.matched_version === "string" || value.matched_version === null) &&
    (typeof value.matched_name === "string" || value.matched_name === null)
  );
}

function isTableRow(value: unknown): value is TableAuditRow {
  return isRecord(value) && typeof value.table === "string" && typeof value.exists === "boolean";
}

function isColumnRow(value: unknown): value is ColumnAuditRow {
  return (
    isRecord(value) &&
    typeof value.table === "string" &&
    typeof value.column === "string" &&
    typeof value.exists === "boolean"
  );
}

function isRlsRow(value: unknown): value is RawRlsAuditRow {
  return isRecord(value) && typeof value.table === "string" && typeof value.exists === "boolean";
}

export function schemaAuditRows(data: SchemaAuditResponse | null): SchemaAuditRows {
  return {
    migrations: Array.isArray(data?.migrations) ? data.migrations.filter(isMigrationRow) : [],
    tables: Array.isArray(data?.tables) ? data.tables.filter(isTableRow) : [],
    columns: Array.isArray(data?.columns) ? data.columns.filter(isColumnRow) : [],
    rlsAudit: Array.isArray(data?.rls_audit) ? data.rls_audit.filter(isRlsRow) : [],
  };
}

function metadataIsVerified(data: SchemaAuditResponse): boolean {
  return (
    isNonEmptyString(data.user_id) &&
    isNonEmptyString(data.checked_at) &&
    Number.isFinite(Date.parse(data.checked_at)) &&
    /^[a-f0-9]{32}$/i.test(data.snapshot_fingerprint ?? "")
  );
}

function migrationVersion(filename: unknown): string | null {
  if (typeof filename !== "string") return null;
  return filename.match(/^([0-9]{14})_/)?.[1] ?? null;
}

function canonicalMigrationName(filenameOrName: string): string {
  return filenameOrName.replace(/\.sql$/i, "").replace(/^[0-9]{14}_/, "");
}

function migrationMatchInvariant(row: MigrationAuditRow): boolean {
  if (!MATCH_KINDS.has(row.match_kind) || !Number.isInteger(row.candidate_count)) return false;
  if (!isNonEmptyString(row.filename)) return false;
  if (row.version !== migrationVersion(row.filename)) return false;

  switch (row.match_kind) {
    case "exact_version":
      return (
        row.applied === true &&
        row.candidate_count === 1 &&
        isNonEmptyString(row.matched_version) &&
        row.matched_version === row.version
      );
    case "canonical_name":
      return (
        row.applied === true &&
        row.candidate_count === 1 &&
        isNonEmptyString(row.matched_version) &&
        isNonEmptyString(row.matched_name) &&
        canonicalMigrationName(row.matched_name) === canonicalMigrationName(row.filename)
      );
    case "absent":
      return (
        row.applied === false &&
        row.candidate_count === 0 &&
        row.matched_version === null &&
        row.matched_name === null
      );
    case "ambiguous":
      return (
        row.applied === false &&
        row.candidate_count > 1 &&
        row.matched_version === null &&
        row.matched_name === null
      );
  }
}

export function attachAccessProfiles(rows: readonly RawRlsAuditRow[]): RlsAuditInput[] {
  return rows.map((row) => ({
    ...row,
    access_profile: accessProfileForTable(row.table),
  }));
}

export function deriveSchemaAuditTrust({
  loading,
  error,
  data,
  contract,
  rlsFindings,
}: {
  loading: boolean;
  error: string | null;
  data: SchemaAuditResponse | null;
  contract: SchemaAuditContract;
  rlsFindings: readonly RlsFinding[];
}): SchemaAuditTrustResult {
  if (loading) {
    return { state: "loading", issues: ["A fresh catalog snapshot is still loading."] };
  }
  if (error) {
    return {
      state: "error",
      issues: [
        "The latest refresh failed; any previously displayed snapshot is stale and unverified.",
      ],
    };
  }
  if (!data || !metadataIsVerified(data)) {
    return {
      state: "unverified",
      issues: [
        data
          ? "Snapshot identity, checked time, or fingerprint is missing or invalid."
          : "No catalog snapshot was returned.",
      ],
    };
  }

  const issues: string[] = [];
  if (
    !Array.isArray(data.migrations) ||
    !Array.isArray(data.tables) ||
    !Array.isArray(data.columns) ||
    !Array.isArray(data.rls_audit)
  ) {
    return {
      state: "unverified",
      issues: ["One or more catalog evidence collections are absent."],
    };
  }

  const rows = schemaAuditRows(data);
  if (
    rows.migrations.length !== data.migrations.length ||
    rows.tables.length !== data.tables.length ||
    rows.columns.length !== data.columns.length ||
    rows.rlsAudit.length !== data.rls_audit.length
  ) {
    issues.push("One or more catalog evidence rows are malformed.");
  }

  exactResponseKeys(
    "migration",
    contract.migrations,
    rows.migrations.map((row) => row.filename),
    issues,
  );
  exactResponseKeys(
    "table",
    contract.tables,
    rows.tables.map((row) => row.table),
    issues,
  );
  exactResponseKeys(
    "RLS table",
    contract.tables,
    rows.rlsAudit.map((row) => row.table),
    issues,
  );
  exactResponseKeys(
    "column",
    contract.columns.map((column) => `${column.table}.${column.column}`),
    rows.columns.map((row) => `${row.table}.${row.column}`),
    issues,
  );

  for (const row of rows.migrations) {
    if (!migrationMatchInvariant(row)) {
      issues.push(`migration match invariant failed: ${row.filename}`);
    } else if (!row.applied) {
      issues.push(`migration is ${row.match_kind}: ${row.filename}`);
    }
  }

  for (const row of rows.tables) {
    if (typeof row.exists !== "boolean") issues.push(`table evidence is malformed: ${row.table}`);
    else if (!row.exists) issues.push(`table is absent: ${row.table}`);
  }
  for (const row of rows.columns) {
    if (typeof row.exists !== "boolean") {
      issues.push(`column evidence is malformed: ${row.table}.${row.column}`);
    } else if (!row.exists) {
      issues.push(`column is absent: ${row.table}.${row.column}`);
    }
  }

  for (const finding of rlsFindings) {
    if (finding.severity !== "info") {
      issues.push(`RLS ${finding.severity}: ${finding.table}/${finding.code}`);
    }
  }

  return issues.length > 0 ? { state: "partial", issues } : { state: "ready", issues: [] };
}

export function backendReferenceFromUrl(url: string | undefined): string {
  if (!url) return "unconfigured";
  try {
    const host = new URL(url).host.toLowerCase();
    return host || "unconfigured";
  } catch {
    return "unconfigured";
  }
}

export interface SchemaAuditChecklistScope {
  user_id: string;
  backend_ref: string;
  checked_at: string;
  snapshot_fingerprint: string;
}

export function schemaAuditChecklistScope(
  data: SchemaAuditResponse | null,
  backendRef: string,
): SchemaAuditChecklistScope | null {
  if (
    !data ||
    !metadataIsVerified(data) ||
    !isNonEmptyString(backendRef) ||
    backendRef === "unconfigured"
  ) {
    return null;
  }
  return {
    user_id: data.user_id,
    backend_ref: backendRef,
    checked_at: data.checked_at,
    snapshot_fingerprint: data.snapshot_fingerprint,
  };
}

export function columnEvidenceMap(
  rows: readonly ColumnAuditRow[],
): Record<string, boolean | undefined> {
  const evidence: Record<string, boolean | undefined> = {};
  for (const row of rows) evidence[`${row.table}.${row.column}`] = row.exists;
  return evidence;
}
