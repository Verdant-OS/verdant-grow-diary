/**
 * diaryCalendarViewModel — pure helpers for the read-only diary calendar view.
 *
 * Groups watering, feeding, and diagnosis (AI Doctor review) entries by
 * calendar date for a compact mobile-first month/week list.
 *
 * Safety:
 *  - Pure: no I/O, no network, no model calls, no Action Queue writes.
 *  - Unknown event kinds are ignored.
 *  - Never echoes private payloads, role keys, tokens, or private IDs.
 *  - Only emits a small, vetted display surface (label, plant_name, note
 *    snippet) — never the raw details object.
 */
import {
  buildEcCompensationPreview,
  type EcCompensationPreviewModel,
} from "@/lib/ecCompensationPreviewViewModel";
import type { EcUnit } from "@/constants/units";

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

export type DiaryCalendarFilter = "all" | DiaryCalendarEventKind;

export interface DiaryCalendarFilterCount {
  filter: DiaryCalendarFilter;
  label: string;
  count: number;
}

export const DIARY_CALENDAR_FILTERS: ReadonlyArray<{
  value: DiaryCalendarFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "watering", label: "Watering" },
  { value: "feeding", label: "Feeding" },
  { value: "diagnosis", label: "Diagnosis" },
];

/**
 * Compute per-filter event counts from the full unfiltered dataset.
 * Counts reflect the complete calendar dataset before any active filter
 * is applied, and ignore unsupported event types.
 * Pure & deterministic.
 */
export function computeDiaryCalendarFilterCounts(
  groups: readonly DiaryCalendarDayGroup[],
): Record<DiaryCalendarFilter, number> {
  const counts: Record<DiaryCalendarEventKind, number> = {
    watering: 0,
    feeding: 0,
    diagnosis: 0,
  };
  for (const g of groups) {
    counts.watering += g.counts.watering;
    counts.feeding += g.counts.feeding;
    counts.diagnosis += g.counts.diagnosis;
  }
  return {
    all: counts.watering + counts.feeding + counts.diagnosis,
    watering: counts.watering,
    feeding: counts.feeding,
    diagnosis: counts.diagnosis,
  };
}


/**
 * Filter pre-built calendar day groups by event kind. Returns a new array
 * containing only days that still have at least one matching event, with
 * per-day counts recomputed against the filter. Pure & deterministic.
 */
export function filterDiaryCalendarGroups(
  groups: readonly DiaryCalendarDayGroup[],
  filter: DiaryCalendarFilter,
): DiaryCalendarDayGroup[] {
  if (filter === "all") return groups.map((g) => ({ ...g, events: [...g.events] }));
  const out: DiaryCalendarDayGroup[] = [];
  for (const g of groups) {
    const events = g.events.filter((e) => e.kind === filter);
    if (events.length === 0) continue;
    const counts: Record<DiaryCalendarEventKind, number> = {
      watering: 0,
      feeding: 0,
      diagnosis: 0,
    };
    events.forEach((e) => {
      counts[e.kind] += 1;
    });
    out.push({ dateKey: g.dateKey, events, counts });
  }
  return out;
}

const FILTER_EMPTY_COPY: Record<DiaryCalendarEventKind, string> = {
  watering: "No watering events logged for this period.",
  feeding: "No feeding events logged for this period.",
  diagnosis: "No diagnosis events logged for this period.",
};

/** Filter-aware empty title. "all" preserves the original copy. */
export function diaryCalendarEmptyTitleFor(filter: DiaryCalendarFilter): string {
  if (filter === "all") return DIARY_CALENDAR_EMPTY_TITLE;
  return FILTER_EMPTY_COPY[filter];
}

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
  /** Pre-computed, allowlisted detail lines for the expanded view. */
  details: DiaryCalendarEventDetails;
}

export interface DiaryCalendarEventDisplayField {
  label: string;
  value: string;
}

export interface DiaryCalendarEventDetails {
  /** Human-readable section heading, e.g. "Watering details". */
  sectionLabel: string;
  /** Allowlisted, vetted display fields. Never the raw details object. */
  fields: DiaryCalendarEventDisplayField[];
  /** Read-only EC @25°C preview for feeding only; never marked as stored. */
  ecPreview: EcCompensationPreviewModel | null;
  /** Calm fallback when there are no fields, no preview, and no note. */
  fallback: string | null;
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

// ---------------------------------------------------------------------------
// Expanded-detail helpers (allowlisted, presenter-safe).
// ---------------------------------------------------------------------------

const STRING_VALUE_MAX = 80;

function pickRecord(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  return details as Record<string, unknown>;
}

function pickFirstString(
  d: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t.length > STRING_VALUE_MAX ? `${t.slice(0, STRING_VALUE_MAX - 1)}…` : t;
    }
  }
  return null;
}

function pickFirstFiniteNumber(
  d: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function normalizeEcUnit(raw: unknown): EcUnit | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (k === "ms/cm" || k === "mscm") return "mS/cm";
  if (k === "us/cm" || k === "uscm" || k === "µs/cm" || k === "μs/cm") return "µS/cm";
  return null;
}

function buildWateringFields(d: Record<string, unknown>): DiaryCalendarEventDisplayField[] {
  const fields: DiaryCalendarEventDisplayField[] = [];
  const ml = pickFirstFiniteNumber(d, [
    "watering_amount_ml",
    "wateringAmountMl",
    "volume_ml",
    "amount_ml",
  ]);
  const l = pickFirstFiniteNumber(d, ["watering_amount_l", "wateringAmountL", "amount_l"]);
  if (ml != null) fields.push({ label: "Amount", value: `${ml} ml` });
  else if (l != null) fields.push({ label: "Amount", value: `${l} L` });

  const method = pickFirstString(d, ["method", "watering_method", "wateringMethod"]);
  if (method) fields.push({ label: "Method", value: method });

  const ph = pickFirstFiniteNumber(d, ["ph", "ph_value", "runoff_ph"]);
  if (ph != null) fields.push({ label: "pH", value: ph.toFixed(2) });

  return fields;
}

function buildFeedingFields(d: Record<string, unknown>): DiaryCalendarEventDisplayField[] {
  const fields: DiaryCalendarEventDisplayField[] = [];

  const recipe = pickFirstString(d, ["nutrients", "recipe", "nutrient_line", "nutrientLine"]);
  if (recipe) fields.push({ label: "Nutrients", value: recipe });

  const brand = pickFirstString(d, ["nutrient_brand", "nutrientBrand", "brand"]);
  if (brand) fields.push({ label: "Brand", value: brand });

  const ph = pickFirstFiniteNumber(d, ["ph", "ph_value"]);
  if (ph != null) fields.push({ label: "pH", value: ph.toFixed(2) });

  const ec = pickFirstFiniteNumber(d, ["ec", "ec_value", "ecValue"]);
  const ecUnit = normalizeEcUnit(d.ec_unit ?? d.ecUnit) ?? "mS/cm";
  if (ec != null) fields.push({ label: "EC", value: `${ec} ${ecUnit}` });

  const waterTempC = pickFirstFiniteNumber(d, ["water_temp_c", "waterTempC"]);
  if (waterTempC != null) {
    fields.push({ label: "Water temp", value: `${waterTempC.toFixed(1)}°C` });
  }

  return fields;
}

const DIAGNOSIS_SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  moderate: "Medium",
  high: "High",
  critical: "Critical",
  info: "Info",
};

function buildDiagnosisFields(d: Record<string, unknown>): DiaryCalendarEventDisplayField[] {
  const fields: DiaryCalendarEventDisplayField[] = [];

  const summary = pickFirstString(d, ["summary", "title", "headline"]);
  if (summary) fields.push({ label: "Summary", value: summary });

  const issue = pickFirstString(d, ["likely_issue", "likelyIssue", "issue"]);
  if (issue) fields.push({ label: "Likely issue", value: issue });

  const confidence = pickFirstFiniteNumber(d, ["confidence", "confidence_score"]);
  if (confidence != null) {
    const pct = confidence > 1 ? Math.round(confidence) : Math.round(confidence * 100);
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      fields.push({ label: "Confidence", value: `${pct}%` });
    }
  }

  const severityRaw = pickFirstString(d, ["severity", "risk_level", "riskLevel"]);
  if (severityRaw) {
    const lbl = DIAGNOSIS_SEVERITY_LABELS[severityRaw.toLowerCase()] ?? null;
    if (lbl) fields.push({ label: "Severity", value: lbl });
  }

  return fields;
}

const DETAIL_SECTION_LABEL: Record<DiaryCalendarEventKind, string> = {
  watering: "Watering details",
  feeding: "Feeding details",
  diagnosis: "Diagnosis details",
};

const DIARY_CALENDAR_EMPTY_DETAILS_FALLBACK =
  "No extra details saved for this entry.";

export const DIARY_CALENDAR_DETAILS_EMPTY = DIARY_CALENDAR_EMPTY_DETAILS_FALLBACK;

function buildEventDetails(
  kind: DiaryCalendarEventKind,
  rawDetails: unknown,
  noteSnippet: string | null,
): DiaryCalendarEventDetails {
  const d = pickRecord(rawDetails);
  let fields: DiaryCalendarEventDisplayField[] = [];
  let ecPreview: EcCompensationPreviewModel | null = null;

  if (d) {
    if (kind === "watering") fields = buildWateringFields(d);
    else if (kind === "feeding") {
      fields = buildFeedingFields(d);
      const ec = pickFirstFiniteNumber(d, ["ec", "ec_value", "ecValue"]);
      const ecUnit = normalizeEcUnit(d.ec_unit ?? d.ecUnit) ?? "mS/cm";
      const waterTempC = pickFirstFiniteNumber(d, ["water_temp_c", "waterTempC"]);
      if (ec != null && waterTempC != null) {
        const preview = buildEcCompensationPreview({
          ec,
          ecUnit,
          waterTempC,
          sourceLabel: "manual",
        });
        if (preview.visible) ecPreview = preview;
      }
    } else if (kind === "diagnosis") fields = buildDiagnosisFields(d);
  }

  const hasContent = fields.length > 0 || ecPreview !== null || !!noteSnippet;
  return {
    sectionLabel: DETAIL_SECTION_LABEL[kind],
    fields,
    ecPreview,
    fallback: hasContent ? null : DIARY_CALENDAR_EMPTY_DETAILS_FALLBACK,
  };
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

    const noteSnippet = safeNote(raw.note);
    events.push({
      id: raw.id,
      kind,
      label: DIARY_CALENDAR_KIND_LABEL[kind],
      occurredAt: iso,
      dateKey: dateKeyUtc(iso),
      plantName: safePlantName(raw.details),
      noteSnippet,
      details: buildEventDetails(kind, raw.details, noteSnippet),
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

// ---------------------------------------------------------------------------
// Month navigation helpers (pure & deterministic).
// ---------------------------------------------------------------------------

/** Month key (YYYY-MM) for a YYYY-MM-DD date key. */
export function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Unique month keys present in groups, sorted newest-first. */
export function listDiaryCalendarMonthKeys(
  groups: readonly DiaryCalendarDayGroup[],
): string[] {
  const set = new Set<string>();
  for (const g of groups) set.add(monthKeyFromDateKey(g.dateKey));
  return [...set].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));

}

/**
 * Default visible month: newest month containing at least one event under
 * the active filter. Falls back to newest month in the full dataset, then
 * null if there are no groups.
 */
export function defaultDiaryCalendarMonth(
  groups: readonly DiaryCalendarDayGroup[],
  filter: DiaryCalendarFilter,
): string | null {
  const filtered = filterDiaryCalendarGroups(groups, filter);
  if (filtered.length > 0) return monthKeyFromDateKey(filtered[0].dateKey);
  if (groups.length > 0) return monthKeyFromDateKey(groups[0].dateKey);
  return null;
}

/** Filter groups to a single visible month. Pure. */
export function filterDiaryCalendarGroupsByMonth(
  groups: readonly DiaryCalendarDayGroup[],
  monthKey: string | null,
): DiaryCalendarDayGroup[] {
  if (!monthKey) return groups.map((g) => ({ ...g, events: [...g.events] }));
  return groups
    .filter((g) => monthKeyFromDateKey(g.dateKey) === monthKey)
    .map((g) => ({ ...g, events: [...g.events] }));
}

/** Shift a month key by delta months (UTC-safe). */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

/** Human-readable month label, e.g. "June 2026". */
export function formatDiaryCalendarMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Empty-state title that names the visible month and active filter. */
export function diaryCalendarMonthEmptyTitle(
  monthKey: string | null,
  filter: DiaryCalendarFilter,
): string {
  if (!monthKey) return diaryCalendarEmptyTitleFor(filter);
  const label = formatDiaryCalendarMonthLabel(monthKey);
  if (filter === "all") {
    return `No watering, feeding, or diagnosis events logged for ${label}.`;
  }
  return `No ${filter} events logged for ${label}.`;
}

