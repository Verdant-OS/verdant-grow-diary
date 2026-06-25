/**
 * growTentRestoreVerification — pure helpers for the read-only grow/tent
 * restore verification pack. SELECT-only. Never inserts, updates, deletes,
 * or fabricates rows. Used both pre-restore (to capture current loss) and
 * post-restore (to verify real data returned) around Supabase PITR/backup
 * restoration of the grow/tent incident.
 *
 * See docs/grow-tent-restore-verification.md and
 * docs/database-integrity-incident-runbook.md.
 */

/**
 * Tables whose row counts are reported in the verification snapshot.
 * Counts are integrity signal only — no payloads, no user_id, no UUIDs.
 */
export const VERIFICATION_COUNT_TABLES = [
  "grows",
  "tents",
  "plants",
  "diary_entries",
  "sensor_readings",
  "alerts",
  "action_queue",
] as const;

export type VerificationCountTable = (typeof VERIFICATION_COUNT_TABLES)[number];

/**
 * Tables that carry a `grow_id` column and can therefore drift if a
 * `grows` row is deleted. Keep this list aligned with the orphan tent
 * audit (`src/lib/orphanTentReferenceAudit.ts`).
 */
export const GROW_ID_REFERENCING_TABLES = [
  "tents",
  "plants",
  "grow_targets",
  "diary_entries",
  "grow_events",
  "ai_doctor_sessions",
  "alerts",
  "alert_events",
  "action_queue",
  "action_queue_events",
  "harvests",
] as const;

export type GrowIdReferencingTable = (typeof GROW_ID_REFERENCING_TABLES)[number];

/**
 * Tables that carry a `tent_id` column. Mirrors
 * ORPHAN_TENT_TABLES in orphanTentReferenceAudit, kept here so this
 * module is self-contained for the verification report.
 */
export const TENT_ID_REFERENCING_TABLES = [
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

export type TentIdReferencingTable = (typeof TENT_ID_REFERENCING_TABLES)[number];

const GROW_TABLE_SET = new Set<string>(GROW_ID_REFERENCING_TABLES);
const TENT_TABLE_SET = new Set<string>(TENT_ID_REFERENCING_TABLES);
const COUNT_TABLE_SET = new Set<string>(VERIFICATION_COUNT_TABLES);

/**
 * SELECT-only count query for the verification snapshot. Whitelisted
 * tables only — rejects anything else to keep SQL-injection safe.
 */
export function buildCountSql(table: VerificationCountTable): string {
  if (!COUNT_TABLE_SET.has(table)) {
    throw new Error(`Unknown count table: ${table}`);
  }
  return `SELECT '${table}'::text AS table_name, count(*)::bigint AS row_count FROM public.${table}`;
}

/** SELECT-only orphan check by grow_id. Whitelisted table names only. */
export function buildOrphanGrowSql(table: GrowIdReferencingTable): string {
  if (!GROW_TABLE_SET.has(table)) {
    throw new Error(`Unknown grow-referencing table: ${table}`);
  }
  return [
    `SELECT '${table}'::text AS table_name, count(*)::bigint AS orphan_count`,
    `FROM public.${table} x`,
    `LEFT JOIN public.grows g ON g.id = x.grow_id`,
    `WHERE x.grow_id IS NOT NULL AND g.id IS NULL`,
  ].join("\n");
}

/** SELECT-only orphan check by tent_id. Whitelisted table names only. */
export function buildOrphanTentSql(table: TentIdReferencingTable): string {
  if (!TENT_TABLE_SET.has(table)) {
    throw new Error(`Unknown tent-referencing table: ${table}`);
  }
  return [
    `SELECT '${table}'::text AS table_name, count(*)::bigint AS orphan_count`,
    `FROM public.${table} x`,
    `LEFT JOIN public.tents t ON t.id = x.tent_id`,
    `WHERE x.tent_id IS NOT NULL AND t.id IS NULL`,
  ].join("\n");
}

export type VerificationVerdict =
  | "ok"
  | "blocked_empty_core_tables"
  | "blocked_orphans_found"
  | "needs_review";

export interface VerificationInput {
  environment?: string | null;
  generatedAt?: string;
  counts: Partial<Record<VerificationCountTable, number>>;
  orphanGrowReferences?: Partial<Record<GrowIdReferencingTable, number>>;
  orphanTentReferences?: Partial<Record<TentIdReferencingTable, number>>;
  /** Tables whose count query failed (treated as needs_review). */
  errors?: string[];
}

export interface VerificationReport {
  environment: string;
  generated_at: string;
  counts: Record<VerificationCountTable, number>;
  grow_id_referencing_tables: GrowIdReferencingTable[];
  tent_id_referencing_tables: TentIdReferencingTable[];
  orphan_grow_references: Record<GrowIdReferencingTable, number>;
  orphan_tent_references: Record<TentIdReferencingTable, number>;
  total_orphan_grow_references: number;
  total_orphan_tent_references: number;
  grows_empty: boolean;
  tents_empty: boolean;
  errors: string[];
  verdict: VerificationVerdict;
}

function fillCounts<T extends string>(
  keys: readonly T[],
  src: Partial<Record<T, number>> | undefined,
): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const k of keys) {
    const n = Number(src?.[k] ?? 0);
    out[k] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}

/**
 * Pure classifier. Given counts + orphan tallies, produces the JSON-safe
 * verification report and a verdict. Never reads from the database; safe
 * to call in tests.
 */
export function buildVerificationReport(input: VerificationInput): VerificationReport {
  const env = (input.environment ?? "").trim() || "unknown";
  const generated_at = input.generatedAt ?? new Date().toISOString();
  const counts = fillCounts(VERIFICATION_COUNT_TABLES, input.counts);
  const orphan_grow_references = fillCounts(GROW_ID_REFERENCING_TABLES, input.orphanGrowReferences);
  const orphan_tent_references = fillCounts(TENT_ID_REFERENCING_TABLES, input.orphanTentReferences);
  const total_orphan_grow_references = Object.values(orphan_grow_references).reduce((a, b) => a + b, 0);
  const total_orphan_tent_references = Object.values(orphan_tent_references).reduce((a, b) => a + b, 0);
  const grows_empty = counts.grows === 0;
  const tents_empty = counts.tents === 0;
  const errors = (input.errors ?? []).filter((e) => typeof e === "string" && e.trim().length > 0);

  let verdict: VerificationVerdict;
  if (grows_empty || tents_empty) {
    verdict = "blocked_empty_core_tables";
  } else if (total_orphan_grow_references > 0 || total_orphan_tent_references > 0) {
    verdict = "blocked_orphans_found";
  } else if (errors.length > 0) {
    verdict = "needs_review";
  } else {
    verdict = "ok";
  }

  return {
    environment: env,
    generated_at,
    counts,
    grow_id_referencing_tables: [...GROW_ID_REFERENCING_TABLES],
    tent_id_referencing_tables: [...TENT_ID_REFERENCING_TABLES],
    orphan_grow_references,
    orphan_tent_references,
    total_orphan_grow_references,
    total_orphan_tent_references,
    grows_empty,
    tents_empty,
    errors,
    verdict,
  };
}
