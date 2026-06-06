/**
 * orphanTentReferenceAudit — pure SQL builders + report shapers for the
 * read-only orphan tent-id audit.
 *
 * Surfaces rows whose `tent_id` is non-null but does NOT match any row in
 * `public.tents`. Diagnostic only — no DELETE, no UPDATE, no FK changes,
 * no schema changes, no RLS changes.
 *
 * Output is intentionally redacted: counts + truncated tent_id only. No
 * user_id, no row payloads, no raw_payload columns. Operator-safe.
 */

/**
 * Tables that carry `tent_id` and can therefore drift if a tent row is
 * deleted (no FK CASCADE is in place across these references).
 *
 * Ordered roughly by user-visible impact (lineage → telemetry → audit).
 */
export const ORPHAN_TENT_TABLES = [
  "plants",
  "diary_entries",
  "grow_events",
  "ai_doctor_sessions",
  "alerts",
  "action_queue",
  "sensor_readings",
  "bridge_tokens",
  "sensor_ingest_audit_log",
] as const;

export type OrphanTentTable = (typeof ORPHAN_TENT_TABLES)[number];

const TABLE_ALLOWLIST = new Set<string>(ORPHAN_TENT_TABLES);

/**
 * Build a per-table SQL statement that returns `(table, missing_tent_id, orphan_count)`
 * grouped by missing tent_id. Rejects unknown tables to keep the helper
 * SQL-injection safe — only the static allowlist is interpolated.
 */
export function buildOrphanTentAuditSql(table: OrphanTentTable): string {
  if (!TABLE_ALLOWLIST.has(table)) {
    throw new Error(`Unknown table for orphan tent audit: ${table}`);
  }
  return [
    `SELECT '${table}'::text AS table_name,`,
    `       x.tent_id::text  AS missing_tent_id,`,
    `       count(*)::bigint AS orphan_count`,
    `FROM public.${table} x`,
    `LEFT JOIN public.tents t ON t.id = x.tent_id`,
    `WHERE x.tent_id IS NOT NULL`,
    `  AND t.id IS NULL`,
    `GROUP BY x.tent_id`,
    `ORDER BY orphan_count DESC, missing_tent_id ASC`,
  ].join("\n");
}

/**
 * Union-all query across every audited table, ordered by table then count.
 * Safe to run read-only; no writes, no DDL.
 */
export function buildAllOrphanTentAuditSql(): string {
  return ORPHAN_TENT_TABLES.map(buildOrphanTentAuditSql).join("\nUNION ALL\n") +
    "\nORDER BY table_name ASC, orphan_count DESC, missing_tent_id ASC";
}

export interface OrphanTentRow {
  table_name: OrphanTentTable;
  missing_tent_id: string;
  orphan_count: number;
}

export interface OrphanTentSummary {
  table: OrphanTentTable;
  totalOrphanRows: number;
  distinctMissingTents: number;
  topMissingTentIdPreview: string | null;
}

/**
 * Redact a single tent_id to `xxxxxxxx…last4` so operator dashboards never
 * leak the raw UUID. Returns null for empty/invalid input.
 */
export function redactTentId(tentId: string | null | undefined): string | null {
  if (typeof tentId !== "string") return null;
  const trimmed = tentId.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= 8) return "********";
  return `********…${trimmed.slice(-4)}`;
}

/**
 * Collapse raw rows into per-table summaries, with the top offending tent
 * redacted. Never includes user_id (rows don't carry one — by design).
 */
export function summarizeOrphanRows(rows: readonly OrphanTentRow[]): OrphanTentSummary[] {
  const byTable = new Map<OrphanTentTable, OrphanTentRow[]>();
  for (const t of ORPHAN_TENT_TABLES) byTable.set(t, []);
  for (const r of rows) {
    if (!TABLE_ALLOWLIST.has(r.table_name)) continue;
    const n = Number(r.orphan_count);
    if (!Number.isFinite(n) || n <= 0) continue;
    byTable.get(r.table_name)!.push({ ...r, orphan_count: n });
  }
  const result: OrphanTentSummary[] = [];
  for (const table of ORPHAN_TENT_TABLES) {
    const list = byTable.get(table)!;
    const total = list.reduce((acc, r) => acc + r.orphan_count, 0);
    const top = list[0] ?? null;
    result.push({
      table,
      totalOrphanRows: total,
      distinctMissingTents: list.length,
      topMissingTentIdPreview: top ? redactTentId(top.missing_tent_id) : null,
    });
  }
  return result;
}

/** Render a deterministic operator-safe text report (counts only, redacted). */
export function renderOrphanReport(summaries: readonly OrphanTentSummary[]): string {
  const lines: string[] = [];
  lines.push("Orphan tent_id reference audit (read-only)");
  lines.push("=".repeat(48));
  let grandTotal = 0;
  for (const s of summaries) {
    grandTotal += s.totalOrphanRows;
    const top = s.topMissingTentIdPreview ?? "—";
    lines.push(
      `${s.table.padEnd(28)} orphan_rows=${String(s.totalOrphanRows).padStart(6)} ` +
        `distinct_missing_tents=${String(s.distinctMissingTents).padStart(4)}  top=${top}`,
    );
  }
  lines.push("-".repeat(48));
  lines.push(`TOTAL orphan rows across ${summaries.length} tables: ${grandTotal}`);
  return lines.join("\n");
}
