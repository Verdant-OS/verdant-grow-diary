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
export interface TimelineEvidenceRow {
  id: string;
  note: string | null | undefined;
  stage: string | null | undefined;
  plant_id: string | null | undefined;
  tent_id: string | null | undefined;
  details?: Record<string, unknown> | null;
}

export interface TimelineEvidenceFilterInput {
  query?: string | null;
  plantId?: string | null;
  tentId?: string | null;
  /** Diary `event_type` token, e.g. "watering", "feeding", "note". */
  eventType?: string | null;
}

const SAFE_DETAIL_TEXT_KEYS = ["plant_name", "stage"] as const;

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
  if (noQuery && noPlant && noTent && noType) return [...rows];
  return rows.filter((r) => timelineEvidenceRowMatches(r, input));
}

export interface TimelineEvidenceFilterOption {
  id: string;
  label: string;
  count: number;
}

/**
 * Derive a deterministic, sorted list of distinct plant filter options
 * from the rows. Label falls back to a short id slice when no name is
 * present in `details.plant_name`. Pure.
 */
export function deriveTimelinePlantOptions(
  rows: ReadonlyArray<TimelineEvidenceRow>,
): TimelineEvidenceFilterOption[] {
  const m = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const id = typeof r.plant_id === "string" ? r.plant_id.trim() : "";
    if (id === "") continue;
    const name = (r.details ?? {})["plant_name"];
    const label =
      typeof name === "string" && name.trim() !== ""
        ? name.trim()
        : `Plant ${id.slice(0, 6)}`;
    const cur = m.get(id);
    if (cur) cur.count += 1;
    else m.set(id, { label, count: 1 });
  }
  return Array.from(m.entries())
    .map(([id, v]) => ({ id, label: v.label, count: v.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Derive distinct tent options from the rows. Label uses a short id
 * slice when no name lookup is provided. Pure.
 */
export function deriveTimelineTentOptions(
  rows: ReadonlyArray<TimelineEvidenceRow>,
  nameById?: ReadonlyMap<string, string> | null,
): TimelineEvidenceFilterOption[] {
  const m = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const id = typeof r.tent_id === "string" ? r.tent_id.trim() : "";
    if (id === "") continue;
    const name = nameById?.get(id);
    const label =
      typeof name === "string" && name.trim() !== ""
        ? name.trim()
        : `Tent ${id.slice(0, 6)}`;
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

export function isTimelineEvidenceFilterActive(
  input: TimelineEvidenceFilterInput,
): boolean {
  if (normalize(input.query) !== "") return true;
  if (input.plantId && input.plantId.trim() !== "") return true;
  if (input.tentId && input.tentId.trim() !== "") return true;
  if (input.eventType && input.eventType.trim() !== "") return true;
  return false;
}

export const TIMELINE_EVIDENCE_SEARCH_PLACEHOLDER = "Search timeline";
export const TIMELINE_EVIDENCE_EMPTY_TITLE = "No matches";
export const TIMELINE_EVIDENCE_EMPTY_DESC =
  "No timeline entries match these filters.";
