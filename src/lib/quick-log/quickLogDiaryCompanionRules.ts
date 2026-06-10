/**
 * quickLogDiaryCompanionRules — pure helpers for the read path consuming
 * the companion `diary_entries` rows that `createQuickLogEvent` writes
 * alongside a primary `grow_events` row.
 *
 * The companion row carries:
 *   {
 *     sensor_snapshot: { source, captured_at, metrics } | null,
 *     photo_url: string | null,
 *     quick_log_version: 1,
 *     linked_grow_event_id: <grow_events.id>,
 *   }
 *
 * Hard rules:
 *   - Pure: no I/O, no Supabase, no React.
 *   - Never invents readings: absence is preserved as `null`.
 *   - Never relabels declared `source` as "live".
 *   - Only numeric metric values are surfaced — strings / NaN / Infinity dropped.
 */

export interface QuickLogDiaryRowLike {
  id?: string | null;
  details?: unknown;
  photo_url?: string | null;
  note?: string | null;
  entry_at?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  grow_id?: string | null;
}

export interface QuickLogCompanionSnapshot {
  source: string | null;
  capturedAt: string | null;
  metrics: Record<string, number>;
}

export interface QuickLogCompanionView {
  /** Always set on companion rows. Use to dedupe vs the grouped grow_event timeline. */
  linkedGrowEventId: string;
  photoUrl: string | null;
  /** `null` when the writer recorded no usable readings — never faked. */
  sensorSnapshot: QuickLogCompanionSnapshot | null;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function nonBlankString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function finiteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractLinkedGrowEventId(details: unknown): string | null {
  const d = asObject(details);
  if (!d) return null;
  return nonBlankString(d.linked_grow_event_id);
}

export function isQuickLogCompanionDiaryRow(
  row: QuickLogDiaryRowLike | null | undefined,
): boolean {
  if (!row) return false;
  return extractLinkedGrowEventId(row.details) !== null;
}

function normalizeMetrics(raw: unknown): Record<string, number> {
  const obj = asObject(raw);
  if (!obj) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = finiteNumber(v);
    if (n !== null) out[k] = n;
  }
  return out;
}

function normalizeSnapshot(raw: unknown): QuickLogCompanionSnapshot | null {
  const obj = asObject(raw);
  if (!obj) return null;
  const metrics = normalizeMetrics(obj.metrics);
  // No metrics → no snapshot. Never fabricate readings just because
  // a source/timestamp was recorded.
  if (Object.keys(metrics).length === 0) return null;
  return {
    source: nonBlankString(obj.source),
    capturedAt: nonBlankString(obj.captured_at) ?? nonBlankString(obj.capturedAt),
    metrics,
  };
}

/**
 * Project a raw diary row into a companion view, or `null` when the row is
 * not a Quick Log v1 companion.
 */
export function extractQuickLogCompanionView(
  row: QuickLogDiaryRowLike | null | undefined,
): QuickLogCompanionView | null {
  if (!row) return null;
  const linkedGrowEventId = extractLinkedGrowEventId(row.details);
  if (!linkedGrowEventId) return null;
  const details = asObject(row.details) ?? {};
  return {
    linkedGrowEventId,
    photoUrl:
      nonBlankString(row.photo_url) ?? nonBlankString(details.photo_url),
    sensorSnapshot: normalizeSnapshot(details.sensor_snapshot),
  };
}
