/**
 * timelineEvidenceFilterRules — pure search/filter helpers for the
 * diary Timeline page.
 *
 * Hard constraints:
 *  - Pure: no I/O, no Supabase, no React, no globals, no time.
 *  - Read-only over the rows the caller already loaded. Never invents
 *    rows. Never mutates input.
 *  - Original ordering preserved (callers sort upstream).
 *  - Keyword search runs only over render-safe display fields:
 *    note text, plant name, stage label, and the `event_type` token.
 *    Never searches secret-bearing payloads, tokens, or unknown nested
 *    detail blobs.
 *  - Case-insensitive, trimmed. Empty query returns all rows.
 */
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import {
  classifyTimelineSensorSource,
  type TimelineSensorSourceKind,
} from "@/lib/timelineSensorSourceBadgeRules";

export interface TimelineEvidenceRow {
  id: string;
  note: string | null | undefined;
  stage: string | null | undefined;
  plant_id: string | null | undefined;
  tent_id: string | null | undefined;
  entry_at?: string | null;
  details?: Record<string, unknown> | null;
}

export interface TimelineEvidenceFilterInput {
  query?: string | null;
  plantId?: string | null;
  tentId?: string | null;
  /** Diary `event_type` token, e.g. "watering", "feeding", "note". */
  eventType?: string | null;
  /**
   * When non-empty, only sensor-derived rows whose canonical source kind
   * is in the set are kept. Non-sensor entries are hidden.
   */
  sensorSources?: ReadonlyArray<TimelineSensorSourceKind> | null;
  /**
   * Inclusive ISO date bounds (YYYY-MM-DD) compared against the day of
   * `entry_at` in `timeZone` below. Malformed values are ignored as "no
   * constraint"; rows without a parseable `entry_at` are hidden while a
   * bound is active, because their day is unknowable — never guessed.
   */
  startDate?: string | null;
  endDate?: string | null;
  /**
   * IANA zone `startDate`/`endDate` are interpreted in. Defaults to
   * `"UTC"` when omitted, so existing callers that never supply a zone
   * keep their exact prior behavior. Pass the viewer's own zone (e.g.
   * from `Intl.DateTimeFormat().resolvedOptions().timeZone`) to agree
   * with a local-day query boundary built upstream — see
   * `timelineDateRangeRules.ts`.
   */
  timeZone?: string | null;
}

const TIMELINE_FILTER_STALE_MS = LIVE_CURRENT_STATE_STALE_MS;

/**
 * Returns the canonical sensor-source kind for a row's sensor snapshot,
 * or `null` if the row is not sensor-derived. Quick Log sensor snapshots
 * with no explicit source fall back to "manual" (intrinsically
 * grower-entered).
 */
export function deriveTimelineRowSensorSource(
  row: TimelineEvidenceRow,
  options: { now?: number; staleMs?: number } = {},
): TimelineSensorSourceKind | null {
  const details = (row?.details ?? {}) as Record<string, unknown>;
  const raw = details.sensor_snapshot ?? details.sensor ?? details.manual_sensor_snapshot;
  if (!raw || typeof raw !== "object") return null;
  const snap = raw as { source?: unknown; ts?: unknown };
  const rawSource = typeof snap.source === "string" ? snap.source : null;
  const capturedAt =
    typeof snap.ts === "string" && snap.ts
      ? snap.ts
      : typeof row.entry_at === "string"
        ? row.entry_at
        : null;
  return classifyTimelineSensorSource({
    rawSource,
    capturedAt,
    staleMs: options.staleMs ?? TIMELINE_FILTER_STALE_MS,
    now: options.now,
    fallback: "manual",
    context: "persisted_snapshot",
  }).kind;
}

const SAFE_DETAIL_TEXT_KEYS = ["plant_name", "stage"] as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True when `value` is a plain ISO calendar date (YYYY-MM-DD). Used for
 * URL-provided date-range filter values; anything else is treated as
 * "no constraint" rather than guessed at.
 */
export function isTimelineDateFilterValue(value: string | null | undefined): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value);
}

/**
 * The calendar day (YYYY-MM-DD) of an `entry_at` ISO timestamp in
 * `timeZone`, or null when unparseable. Uses `Intl.DateTimeFormat` with an
 * explicitly supplied zone rather than the runtime's ambient timezone, so
 * the result depends only on the two inputs — never on where the process
 * happens to run.
 */
function rowLocalDay(row: TimelineEvidenceRow, timeZone: string): string | null {
  const at = row.entry_at;
  if (typeof at !== "string" || at.length < 10) return null;
  const parsed = new Date(at);
  if (!Number.isFinite(parsed.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(parsed);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!year || !month || !day) return null;
    const result = `${year}-${month}-${day}`;
    return ISO_DATE_RE.test(result) ? result : null;
  } catch {
    return null;
  }
}

function normalize(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function safeRowText(row: TimelineEvidenceRow): string {
  const parts: string[] = [];
  if (typeof row.note === "string") parts.push(row.note);
  if (typeof row.stage === "string") parts.push(row.stage);
  const details = (row.details ?? {}) as Record<string, unknown>;
  for (const key of SAFE_DETAIL_TEXT_KEYS) {
    const v = details[key];
    if (typeof v === "string") parts.push(v);
  }
  const eventType = details["event_type"];
  if (typeof eventType === "string") parts.push(eventType);
  return parts.join(" \u0001 ").toLowerCase();
}

function rowEventType(row: TimelineEvidenceRow): string | null {
  const v = (row.details ?? {})["event_type"];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Returns true if `row` matches every supplied filter dimension.
 * Missing/blank inputs are treated as "no constraint".
 */
export function timelineEvidenceRowMatches(
  row: TimelineEvidenceRow,
  input: TimelineEvidenceFilterInput,
): boolean {
  if (!row) return false;

  const q = normalize(input.query);
  if (q !== "") {
    if (!safeRowText(row).includes(q)) return false;
  }

  if (input.plantId && input.plantId.trim() !== "") {
    if ((row.plant_id ?? "") !== input.plantId.trim()) return false;
  }

  if (input.tentId && input.tentId.trim() !== "") {
    if ((row.tent_id ?? "") !== input.tentId.trim()) return false;
  }

  if (input.eventType && input.eventType.trim() !== "") {
    const want = input.eventType.trim().toLowerCase();
    const got = (rowEventType(row) ?? "").toLowerCase();
    if (got !== want) return false;
  }

  if (Array.isArray(input.sensorSources) && input.sensorSources.length > 0) {
    const kind = deriveTimelineRowSensorSource(row);
    if (kind === null) return false;
    if (!input.sensorSources.includes(kind)) return false;
  }

  const start = isTimelineDateFilterValue(input.startDate) ? input.startDate : null;
  const end = isTimelineDateFilterValue(input.endDate) ? input.endDate : null;
  if (start !== null || end !== null) {
    const timeZone =
      typeof input.timeZone === "string" && input.timeZone.trim() !== "" ? input.timeZone : "UTC";
    const day = rowLocalDay(row, timeZone);
    if (day === null) return false;
    if (start !== null && day < start) return false;
    if (end !== null && day > end) return false;
  }

  return true;
}

/**
 * Filter timeline rows. Preserves caller-supplied ordering.
 */
export function filterTimelineEvidenceRows<T extends TimelineEvidenceRow>(
  rows: ReadonlyArray<T>,
  input: TimelineEvidenceFilterInput,
): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const noQuery = normalize(input.query) === "";
  const noPlant = !input.plantId || input.plantId.trim() === "";
  const noTent = !input.tentId || input.tentId.trim() === "";
  const noType = !input.eventType || input.eventType.trim() === "";
  const noSrc = !Array.isArray(input.sensorSources) || input.sensorSources.length === 0;
  const noDates =
    !isTimelineDateFilterValue(input.startDate) && !isTimelineDateFilterValue(input.endDate);
  if (noQuery && noPlant && noTent && noType && noSrc && noDates) return [...rows];
  return rows.filter((r) => timelineEvidenceRowMatches(r, input));
}

export interface TimelineEvidenceFilterOption {
  id: string;
  label: string;
  count: number;
}

/**
 * Build an id → name lookup from raw `plants`/`tents` directory rows.
 *
 * The caller is expected to load the directory WITHOUT an `is_archived`
 * filter: archived/merged rows still carry their names, and the whole
 * point of the lookup is that archived-plant diary history keeps its
 * real labels. Returns `null` (lookup unavailable) when `rows` is not
 * an array, so callers can tell a failed read from an empty directory.
 * Malformed rows are skipped; the first name seen for an id wins. Pure.
 */
export function buildTimelineNameLookup(rows: unknown): ReadonlyMap<string, string> | null {
  if (!Array.isArray(rows)) return null;
  const m = new Map<string, string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { id, name } = row as { id?: unknown; name?: unknown };
    if (typeof id !== "string" || id.trim() === "") continue;
    if (typeof name !== "string" || name.trim() === "") continue;
    if (!m.has(id.trim())) m.set(id.trim(), name.trim());
  }
  return m;
}

/**
 * Resolve one option label. Order: directory name (current truth,
 * includes archived/merged rows) → row-embedded snapshot name →
 * neutral fragment fallback.
 *
 * The fallback never asserts an archival state: an id absent from a
 * loaded directory is NOT necessarily archived — archived rows resolve
 * normally, while hard-deleted tents (deleteTent preserves logs) and
 * entities created after the directory snapshot both come through here.
 */
function resolveOptionLabel(
  id: string,
  noun: "Plant" | "Tent",
  nameById: ReadonlyMap<string, string> | null | undefined,
  snapshotName: unknown,
): string {
  const directoryName = nameById?.get(id);
  if (typeof directoryName === "string" && directoryName.trim() !== "") {
    return directoryName.trim();
  }
  if (typeof snapshotName === "string" && snapshotName.trim() !== "") {
    return snapshotName.trim();
  }
  return `${noun} ${id.slice(0, 6)}`;
}

/**
 * Derive a deterministic, sorted list of distinct plant filter options
 * from the rows. Names resolve via the optional directory lookup (which
 * should include archived/merged plants), then `details.plant_name`,
 * then a fragment fallback. Pure.
 */
export function deriveTimelinePlantOptions(
  rows: ReadonlyArray<TimelineEvidenceRow>,
  nameById?: ReadonlyMap<string, string> | null,
): TimelineEvidenceFilterOption[] {
  const m = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const id = typeof r.plant_id === "string" ? r.plant_id.trim() : "";
    if (id === "") continue;
    const label = resolveOptionLabel(id, "Plant", nameById, (r.details ?? {})["plant_name"]);
    const cur = m.get(id);
    if (cur) cur.count += 1;
    else m.set(id, { label, count: 1 });
  }
  return Array.from(m.entries())
    .map(([id, v]) => ({ id, label: v.label, count: v.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Derive distinct tent options from the rows. Names resolve via the
 * optional directory lookup (which should include archived tents), with
 * a fragment fallback when no lookup resolves the id. Pure.
 */
export function deriveTimelineTentOptions(
  rows: ReadonlyArray<TimelineEvidenceRow>,
  nameById?: ReadonlyMap<string, string> | null,
): TimelineEvidenceFilterOption[] {
  const m = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const id = typeof r.tent_id === "string" ? r.tent_id.trim() : "";
    if (id === "") continue;
    const label = resolveOptionLabel(id, "Tent", nameById, null);
    const cur = m.get(id);
    if (cur) cur.count += 1;
    else m.set(id, { label, count: 1 });
  }
  return Array.from(m.entries())
    .map(([id, v]) => ({ id, label: v.label, count: v.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Derive distinct event-type options from the rows (already lower-cased
 * tokens such as "watering", "feeding", "note").
 */
export function deriveTimelineEventTypeOptions(
  rows: ReadonlyArray<TimelineEvidenceRow>,
): TimelineEvidenceFilterOption[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const t = rowEventType(r);
    if (!t) continue;
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([id, count]) => ({ id, label: id, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function isTimelineEvidenceFilterActive(input: TimelineEvidenceFilterInput): boolean {
  if (normalize(input.query) !== "") return true;
  if (input.plantId && input.plantId.trim() !== "") return true;
  if (input.tentId && input.tentId.trim() !== "") return true;
  if (input.eventType && input.eventType.trim() !== "") return true;
  if (Array.isArray(input.sensorSources) && input.sensorSources.length > 0) return true;
  if (isTimelineDateFilterValue(input.startDate)) return true;
  if (isTimelineDateFilterValue(input.endDate)) return true;
  return false;
}

export const TIMELINE_EVIDENCE_SEARCH_PLACEHOLDER = "Search timeline";
export const TIMELINE_EVIDENCE_EMPTY_TITLE = "No matches";
export const TIMELINE_EVIDENCE_EMPTY_DESC = "No timeline entries match these filters.";
