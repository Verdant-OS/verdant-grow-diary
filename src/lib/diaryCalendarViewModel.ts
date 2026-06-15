/**
 * diaryCalendarViewModel — pure helpers for the read-only diary calendar view.
 *
 * Groups watering, feeding, and diagnosis (AI Doctor review) entries by
 * calendar date for a compact mobile-first month/week list.
 *
 * Safety:
 *  - No I/O, no Supabase, no model calls, no Action Queue writes.
 *  - Unknown event kinds are ignored.
 *  - Never echoes raw_payload, service_role, tokens, or private IDs.
 *  - Only emits a small, vetted display surface (label, plant_name, note
 *    snippet) — never the raw `details` object.
 */

export type DiaryCalendarEventKind = "watering" | "feeding" | "diagnosis";

const ALLOWED_KINDS: ReadonlySet<string> = new Set([
  "watering",
  "feeding",
  "diagnosis",
  "ai_doctor_review",
]);

function normalizeKind(raw: unknown): DiaryCalendarEventKind | null {
  if (typeof raw !== "string") return null;
  const k = raw.toLowerCase();
  if (!ALLOWED_KINDS.has(k)) return null;
  if (k === "ai_doctor_review") return "diagnosis";
  return k as DiaryCalendarEventKind;
}

export const DIARY_CALENDAR_KIND_LABEL: Record<DiaryCalendarEventKind, string> = {
  watering: "Watering",
  feeding: "Feeding",
  diagnosis: "Diagnosis",
};

export const DIARY_CALENDAR_EMPTY_TITLE =
  "No watering, feeding, or diagnosis events logged for this period.";
export const DIARY_CALENDAR_EMPTY_HINT =
  "Use Quick Log to add your next plant event.";

export interface DiaryCalendarRawEntry {
  id: string;
  entry_at?: string | null;
  occurred_at?: string | null;
  /** Optional explicit kind; otherwise read from details.event_type. */
  event_type?: string | null;
  note?: string | null;
  details?: unknown;
}

export interface DiaryCalendarEvent {
  id: string;
  kind: DiaryCalendarEventKind;
  label: string;
  /** ISO timestamp of the event (entry_at preferred). */
  occurredAt: string;
  /** YYYY-MM-DD bucket key in UTC. */
  dateKey: string;
  /** Optional safe plant name pulled from a vetted field. */
  plantName: string | null;
  /** Trimmed, length-capped note snippet — never raw details. */
  noteSnippet: string | null;
}

export interface DiaryCalendarDayGroup {
  /** YYYY-MM-DD */
  dateKey: string;
  /** Newest-first events for the day. */
  events: DiaryCalendarEvent[];
  counts: Record<DiaryCalendarEventKind, number>;
}

const NOTE_MAX = 140;

function safeNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > NOTE_MAX ? `${trimmed.slice(0, NOTE_MAX - 1)}…` : trimmed;
}

function safePlantName(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const name = (details as Record<string, unknown>).plant_name;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) return trimmed ? trimmed.slice(0, 80) : null;
  return trimmed;
}

function extractKind(entry: DiaryCalendarRawEntry): DiaryCalendarEventKind | null {
  const direct = normalizeKind(entry.event_type);
  if (direct) return direct;
  if (entry.details && typeof entry.details === "object") {
    const et = (entry.details as Record<string, unknown>).event_type;
    return normalizeKind(et);
  }
  return null;
}

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function dateKeyUtc(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Build the read-only calendar view-model. Pure & deterministic.
 *
 * - Filters to watering / feeding / diagnosis only.
 * - Groups by UTC calendar date (YYYY-MM-DD).
 * - Sorts groups newest-first, events within a day newest-first,
 *   stable-tiebreaks by id.
 */
export function buildDiaryCalendarViewModel(
  rawEntries: readonly DiaryCalendarRawEntry[] | null | undefined,
): DiaryCalendarDayGroup[] {
  const list = Array.isArray(rawEntries) ? rawEntries : [];
  const events: DiaryCalendarEvent[] = [];

  for (const raw of list) {
    if (!raw || typeof raw.id !== "string" || !raw.id) continue;
    const kind = extractKind(raw);
    if (!kind) continue;
    const iso = toIso(raw.entry_at ?? raw.occurred_at ?? null);
    if (!iso) continue;

    events.push({
      id: raw.id,
      kind,
      label: DIARY_CALENDAR_KIND_LABEL[kind],
      occurredAt: iso,
      dateKey: dateKeyUtc(iso),
      plantName: safePlantName(raw.details),
      noteSnippet: safeNote(raw.note),
    });
  }

  const byDate = new Map<string, DiaryCalendarEvent[]>();
  for (const ev of events) {
    const bucket = byDate.get(ev.dateKey);
    if (bucket) bucket.push(ev);
    else byDate.set(ev.dateKey, [ev]);
  }

  const groups: DiaryCalendarDayGroup[] = [];
  for (const [dateKey, items] of byDate) {
    items.sort((a, b) => {
      const t = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
      if (t !== 0) return t;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const counts: Record<DiaryCalendarEventKind, number> = {
      watering: 0,
      feeding: 0,
      diagnosis: 0,
    };
    items.forEach((it) => {
      counts[it.kind] += 1;
    });
    groups.push({ dateKey, events: items, counts });
  }

  groups.sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0));
  return groups;
}

export interface DiaryCalendarSummary {
  totalEvents: number;
  totalDays: number;
  counts: Record<DiaryCalendarEventKind, number>;
}

export function summarizeDiaryCalendar(
  groups: readonly DiaryCalendarDayGroup[],
): DiaryCalendarSummary {
  const counts: Record<DiaryCalendarEventKind, number> = {
    watering: 0,
    feeding: 0,
    diagnosis: 0,
  };
  let total = 0;
  for (const g of groups) {
    total += g.events.length;
    counts.watering += g.counts.watering;
    counts.feeding += g.counts.feeding;
    counts.diagnosis += g.counts.diagnosis;
  }
  return { totalEvents: total, totalDays: groups.length, counts };
}
