/**
 * harvestWatchEvidenceHistoryViewModel — pure read-only classifier + grouped
 * "Harvest Evidence History" view-model.
 *
 * Reads existing diary/timeline-shaped rows (already loaded by the caller)
 * and groups them by harvest evidence category for a Plant Detail evidence
 * history panel and an optional Timeline filter.
 *
 * Hard constraints:
 *   - Pure. No I/O. No React. No Supabase. No AI calls. No alerts. No
 *     Action Queue writes. No automation. No device control.
 *   - Deterministic and null-safe. Never throws on missing/malformed input.
 *   - Generic photos NEVER classify as trichome evidence. Only explicit
 *     note vocabulary classifies trichome / pistil / bud evidence.
 *   - Never recommends harvest action. Caution copy is mandatory.
 */
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";

export type HarvestEvidenceCategory =
  | "trichome_inspection"
  | "pistil_observation"
  | "bud_maturity"
  | "recent_flower_photo"
  | "other_harvest_note";

export const HARVEST_EVIDENCE_CATEGORY_LABEL: Record<
  HarvestEvidenceCategory,
  string
> = {
  trichome_inspection: "Trichome inspection",
  pistil_observation: "Pistil / recession",
  bud_maturity: "Bud maturity",
  recent_flower_photo: "Recent flower photo",
  other_harvest_note: "Other harvest note",
};

export const HARVEST_EVIDENCE_CATEGORY_EMPTY: Record<
  HarvestEvidenceCategory,
  string
> = {
  trichome_inspection: "No trichome inspection notes yet.",
  pistil_observation: "No pistil or recession notes yet.",
  bud_maturity: "No bud maturity notes yet.",
  recent_flower_photo: "No close flower photos yet.",
  other_harvest_note: "No other harvest notes yet.",
};

/** Required caution surfaced next to the history panel and the Timeline chip. */
export const HARVEST_EVIDENCE_HISTORY_CAUTION =
  "Harvest evidence history is diary evidence only — confirm with direct inspection.";

const TRICHOME_RE = /\btrich(ome|omes|y)\b/i;
const PISTIL_RE = /\bpistil(s)?\b|\brecession\b|\bhairs?\b/i;
const BUD_RE = /\bbud(s)?\b|\bcalyx(es)?\b|\bswell(ing)?\b|\bdense\b|\bmaturity\b/i;
const CLOSE_PHOTO_RE = /\bclose[- ]?up\b|\bclose flower photo\b/i;
const OTHER_HARVEST_RE =
  /\bharvest\b|\bamber\b|\bcloudy\b|\bflower(ing|s)?\b|\bripen\w*\b/i;

export interface HarvestEvidenceClassifiableRow {
  id?: string | null;
  note?: string | null;
  notePreview?: string | null;
  hasPhoto?: boolean | null;
  eventType?: string | null;
  occurredAt?: string | null;
  occurredAtLabel?: string | null;
}

function readNote(row: HarvestEvidenceClassifiableRow): string {
  if (typeof row.note === "string" && row.note.length > 0) return row.note;
  if (typeof row.notePreview === "string") return row.notePreview;
  return "";
}

/**
 * Classify a row into a single harvest evidence category, or null if it
 * does not qualify.
 *
 * Priority (deterministic):
 *   1. Explicit trichome vocabulary → trichome_inspection.
 *   2. Explicit pistil / recession / hair vocabulary → pistil_observation.
 *   3. Explicit bud / calyx / swelling / maturity vocabulary → bud_maturity.
 *   4. Photo entries with eventType === "photo" or "close-up" phrasing
 *      → recent_flower_photo. (Generic photos never imply trichome
 *      evidence.)
 *   5. Other explicit harvest vocabulary → other_harvest_note.
 *   6. Otherwise → null.
 */
export function classifyHarvestEvidenceRow(
  row: HarvestEvidenceClassifiableRow | null | undefined,
): HarvestEvidenceCategory | null {
  if (!row || typeof row !== "object") return null;
  const note = readNote(row).trim();
  const hasPhoto = row.hasPhoto === true;
  const eventType =
    typeof row.eventType === "string" ? row.eventType.toLowerCase().trim() : "";

  if (note) {
    if (TRICHOME_RE.test(note)) return "trichome_inspection";
    if (PISTIL_RE.test(note)) return "pistil_observation";
    if (BUD_RE.test(note)) return "bud_maturity";
  }

  if (hasPhoto && (eventType === "photo" || CLOSE_PHOTO_RE.test(note))) {
    return "recent_flower_photo";
  }

  if (note && OTHER_HARVEST_RE.test(note)) return "other_harvest_note";

  return null;
}

/** Convenience predicate for Timeline filter classification. */
export function isHarvestEvidenceDiaryItem(
  row: HarvestEvidenceClassifiableRow | null | undefined,
): boolean {
  return classifyHarvestEvidenceRow(row) !== null;
}

export interface HarvestEvidenceHistoryItem {
  id: string;
  category: HarvestEvidenceCategory;
  occurredAt: string | null;
  occurredAtLabel: string;
  eventType: string;
  summary: string;
  hasPhoto: boolean;
}

export interface HarvestEvidenceHistoryGroup {
  key: HarvestEvidenceCategory;
  label: string;
  emptyCopy: string;
  items: HarvestEvidenceHistoryItem[];
}

export interface HarvestEvidenceHistory {
  groups: HarvestEvidenceHistoryGroup[];
  caution: string;
  totalCount: number;
}

const SUMMARY_MAX = 140;

function safeSummary(note: string, hasPhoto: boolean): string {
  const trimmed = (note ?? "").trim();
  if (trimmed.length === 0) return hasPhoto ? "Photo logged" : "";
  if (trimmed.length <= SUMMARY_MAX) return trimmed;
  return trimmed.slice(0, SUMMARY_MAX - 1).trimEnd() + "…";
}

function compareNewestFirst(
  a: HarvestEvidenceHistoryItem,
  b: HarvestEvidenceHistoryItem,
): number {
  const aHas = typeof a.occurredAt === "string";
  const bHas = typeof b.occurredAt === "string";
  if (aHas && bHas) {
    const da = Date.parse(a.occurredAt as string);
    const db = Date.parse(b.occurredAt as string);
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return db - da;
  }
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const CATEGORY_ORDER: readonly HarvestEvidenceCategory[] = [
  "trichome_inspection",
  "pistil_observation",
  "bud_maturity",
  "recent_flower_photo",
  "other_harvest_note",
];

/**
 * Group diary/timeline rows into harvest evidence categories, newest first.
 */
export function buildHarvestEvidenceHistory(
  rows:
    | readonly (PlantRecentActivityRow | HarvestEvidenceClassifiableRow)[]
    | null
    | undefined,
  opts?: { perGroupLimit?: number },
): HarvestEvidenceHistory {
  const limit = Math.max(1, opts?.perGroupLimit ?? 10);
  const safeRows = Array.isArray(rows) ? rows : [];
  const buckets = new Map<HarvestEvidenceCategory, HarvestEvidenceHistoryItem[]>();
  for (const cat of CATEGORY_ORDER) buckets.set(cat, []);

  let total = 0;
  for (let i = 0; i < safeRows.length; i += 1) {
    const r = safeRows[i] as HarvestEvidenceClassifiableRow;
    if (!r || typeof r !== "object") continue;
    const cat = classifyHarvestEvidenceRow(r);
    if (!cat) continue;
    const id = typeof r.id === "string" && r.id ? r.id : `row-${i}`;
    const noteRaw = readNote(r);
    const item: HarvestEvidenceHistoryItem = {
      id,
      category: cat,
      occurredAt: typeof r.occurredAt === "string" ? r.occurredAt : null,
      occurredAtLabel:
        typeof r.occurredAtLabel === "string" && r.occurredAtLabel
          ? r.occurredAtLabel
          : "",
      eventType:
        typeof r.eventType === "string" && r.eventType ? r.eventType : "note",
      summary: safeSummary(noteRaw, r.hasPhoto === true),
      hasPhoto: r.hasPhoto === true,
    };
    buckets.get(cat)!.push(item);
    total += 1;
  }

  const groups: HarvestEvidenceHistoryGroup[] = CATEGORY_ORDER.map((cat) => {
    const items = (buckets.get(cat) ?? [])
      .slice()
      .sort(compareNewestFirst)
      .slice(0, limit);
    return {
      key: cat,
      label: HARVEST_EVIDENCE_CATEGORY_LABEL[cat],
      emptyCopy: HARVEST_EVIDENCE_CATEGORY_EMPTY[cat],
      items,
    };
  });

  return {
    groups,
    caution: HARVEST_EVIDENCE_HISTORY_CAUTION,
    totalCount: total,
  };
}
