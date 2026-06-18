/**
 * harvestEvidenceReportViewModel — pure, read-only view-model for the
 * Harvest Evidence Report.
 *
 * Summarizes which harvest evidence items have been logged across each
 * plant and inspection window. Reads ALREADY-LOADED diary/timeline rows
 * via the existing harvest evidence classifier in
 * `harvestWatchEvidenceHistoryViewModel`. No I/O. No Supabase. No AI.
 * No alerts. No Action Queue. No automation. No device control. No
 * sensor_readings reads. No raw_payload parsing.
 *
 * Hard rules:
 *   - Does not predict harvest timing, health, or readiness.
 *   - Never recommends harvest action.
 *   - Generic photos NEVER count as trichome inspection (delegated to the
 *     shared classifier).
 *   - Deterministic and null-safe. Never throws on missing input.
 *   - Sorting: plants A→Z by name, then by id; windows oldest→newest by
 *     start date, with "Unassigned inspection window" last.
 */
import {
  classifyHarvestEvidenceRow,
  HARVEST_EVIDENCE_CATEGORY_LABEL,
  type HarvestEvidenceCategory,
  type HarvestEvidenceClassifiableRow,
} from "@/lib/harvestWatchEvidenceHistoryViewModel";

/** Required caution copy. Tests assert this string verbatim. */
export const HARVEST_EVIDENCE_REPORT_CAUTION =
  "Harvest Evidence Report is diary evidence only — confirm with direct inspection before making harvest decisions.";

/** Required disclosure copy. Tests assert this string verbatim. */
export const HARVEST_EVIDENCE_REPORT_NO_ACTIONS_COPY =
  "This report summarizes logged evidence. It does not create alerts, Action Queue items, or harvest instructions.";

/** Required full-empty copy. */
export const HARVEST_EVIDENCE_REPORT_EMPTY_COPY =
  "No harvest evidence has been logged yet.";

export const HARVEST_EVIDENCE_REPORT_UNASSIGNED_WINDOW_LABEL =
  "Unassigned inspection window";

const STRONG_CATEGORIES: readonly HarvestEvidenceCategory[] = [
  "trichome_inspection",
  "pistil_observation",
  "bud_maturity",
  "recent_flower_photo",
];

export const HARVEST_EVIDENCE_REPORT_CATEGORY_EMPTY_COPY: Record<
  Exclude<HarvestEvidenceCategory, "other_harvest_note">,
  string
> = {
  trichome_inspection: "No trichome inspection logged.",
  pistil_observation: "No pistil or recession notes logged.",
  bud_maturity: "No bud maturity notes logged.",
  recent_flower_photo: "No close flower photos logged.",
};

export interface HarvestEvidenceReportPlantInput {
  plantId: string;
  plantName?: string | null;
  strain?: string | null;
  stage?: string | null;
  /** Optional explicit harvest inspection windows for this plant. */
  inspectionWindows?: ReadonlyArray<{
    id?: string | null;
    label?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
  }> | null;
  rows: readonly HarvestEvidenceClassifiableRow[] | null | undefined;
}

export type HarvestEvidenceCategoryStatus = "logged" | "missing" | "limited";

export interface HarvestEvidenceCategorySummary {
  key: HarvestEvidenceCategory;
  label: string;
  count: number;
  latestOccurredAt: string | null;
  latestOccurredAtLabel: string;
  status: HarvestEvidenceCategoryStatus;
  summary: string;
}

export interface HarvestEvidenceReportWindow {
  key: string;
  label: string;
  startsAt: string | null;
  endsAt: string | null;
  isUnassigned: boolean;
  totalCount: number;
  categories: HarvestEvidenceCategorySummary[];
  missingCategoryCount: number;
}

export interface HarvestEvidenceReportPlant {
  plantId: string;
  plantName: string;
  strain: string | null;
  stage: string | null;
  totalCount: number;
  windows: HarvestEvidenceReportWindow[];
}

export interface HarvestEvidenceReportTotals {
  plants: number;
  inspectionWindows: number;
  trichomeInspections: number;
  pistilObservations: number;
  budMaturityNotes: number;
  closeFlowerPhotos: number;
  missingEvidenceCount: number;
}

export interface HarvestEvidenceReport {
  plants: HarvestEvidenceReportPlant[];
  totals: HarvestEvidenceReportTotals;
  caution: string;
  noActionsCopy: string;
  emptyCopy: string;
  isEmpty: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface ClassifiedRow {
  category: HarvestEvidenceCategory;
  occurredAt: string | null;
  occurredAtMs: number | null;
  occurredAtLabel: string;
  note: string;
  hasPhoto: boolean;
}

function readNote(row: HarvestEvidenceClassifiableRow): string {
  if (typeof row.note === "string" && row.note.length > 0) return row.note;
  if (typeof row.notePreview === "string") return row.notePreview;
  return "";
}

function parseMs(iso: string | null | undefined): number | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function startOfIsoWeekMs(ms: number): number {
  // Group by ISO week starting Monday 00:00 UTC.
  const d = new Date(ms);
  const day = d.getUTCDay(); // 0..6, 0=Sunday
  const daysFromMonday = (day + 6) % 7;
  const monday = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysFromMonday,
  );
  return monday;
}

function formatIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function safeSummary(text: string, max = 120): string {
  const t = (text ?? "").trim();
  if (t.length === 0) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function classifyAll(
  rows: readonly HarvestEvidenceClassifiableRow[] | null | undefined,
): ClassifiedRow[] {
  const out: ClassifiedRow[] = [];
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const cat = classifyHarvestEvidenceRow(row);
    if (!cat) continue;
    const occurredAt =
      typeof row.occurredAt === "string" ? row.occurredAt : null;
    out.push({
      category: cat,
      occurredAt,
      occurredAtMs: parseMs(occurredAt),
      occurredAtLabel:
        typeof row.occurredAtLabel === "string" && row.occurredAtLabel
          ? row.occurredAtLabel
          : "",
      note: readNote(row),
      hasPhoto: row.hasPhoto === true,
    });
  }
  return out;
}

interface WindowBucket {
  key: string;
  label: string;
  startsAt: string | null;
  endsAt: string | null;
  isUnassigned: boolean;
  sortKey: number; // lower first; unassigned uses +Infinity
  rows: ClassifiedRow[];
}

function bucketIntoWindows(
  rows: ClassifiedRow[],
  explicitWindows: HarvestEvidenceReportPlantInput["inspectionWindows"],
): WindowBucket[] {
  const buckets = new Map<string, WindowBucket>();

  const explicit = Array.isArray(explicitWindows)
    ? explicitWindows.filter((w) => w && typeof w === "object")
    : [];

  if (explicit.length > 0) {
    explicit.forEach((w, idx) => {
      const startMs = parseMs(w?.startsAt ?? null);
      const endMs = parseMs(w?.endsAt ?? null);
      const id =
        typeof w?.id === "string" && w.id ? w.id : `window-${idx}`;
      buckets.set(id, {
        key: id,
        label:
          typeof w?.label === "string" && w.label
            ? w.label
            : `Inspection window ${idx + 1}`,
        startsAt: typeof w?.startsAt === "string" ? w.startsAt : null,
        endsAt: typeof w?.endsAt === "string" ? w.endsAt : null,
        isUnassigned: false,
        sortKey: startMs ?? Number.MAX_SAFE_INTEGER - (explicit.length - idx),
        rows: [],
      });
    });

    const sortedExplicit = Array.from(buckets.values())
      .map((b) => ({
        b,
        startMs: parseMs(b.startsAt),
        endMs: parseMs(b.endsAt),
      }));

    for (const row of rows) {
      if (row.occurredAtMs == null) {
        // unassigned bucket
        const u = ensureUnassigned(buckets);
        u.rows.push(row);
        continue;
      }
      let placed = false;
      for (const w of sortedExplicit) {
        const startOk = w.startMs == null || row.occurredAtMs >= w.startMs;
        const endOk = w.endMs == null || row.occurredAtMs <= w.endMs;
        if (startOk && endOk) {
          w.b.rows.push(row);
          placed = true;
          break;
        }
      }
      if (!placed) {
        const u = ensureUnassigned(buckets);
        u.rows.push(row);
      }
    }
    return Array.from(buckets.values());
  }

  // Fallback: weekly windows.
  for (const row of rows) {
    if (row.occurredAtMs == null) {
      const u = ensureUnassigned(buckets);
      u.rows.push(row);
      continue;
    }
    const weekStart = startOfIsoWeekMs(row.occurredAtMs);
    const weekEnd = weekStart + WEEK_MS - 1;
    const key = `week-${formatIsoDate(weekStart)}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: `Week of ${formatIsoDate(weekStart)}`,
        startsAt: new Date(weekStart).toISOString(),
        endsAt: new Date(weekEnd).toISOString(),
        isUnassigned: false,
        sortKey: weekStart,
        rows: [],
      };
      buckets.set(key, bucket);
    }
    bucket.rows.push(row);
  }
  return Array.from(buckets.values());
}

function ensureUnassigned(map: Map<string, WindowBucket>): WindowBucket {
  const key = "__unassigned__";
  let b = map.get(key);
  if (!b) {
    b = {
      key,
      label: HARVEST_EVIDENCE_REPORT_UNASSIGNED_WINDOW_LABEL,
      startsAt: null,
      endsAt: null,
      isUnassigned: true,
      sortKey: Number.POSITIVE_INFINITY,
      rows: [],
    };
    map.set(key, b);
  }
  return b;
}

function summarizeCategory(
  key: HarvestEvidenceCategory,
  rows: ClassifiedRow[],
): HarvestEvidenceCategorySummary {
  const matching = rows.filter((r) => r.category === key);
  const count = matching.length;
  let latest: ClassifiedRow | null = null;
  for (const r of matching) {
    if (!latest) {
      latest = r;
      continue;
    }
    const a = r.occurredAtMs ?? -Infinity;
    const b = latest.occurredAtMs ?? -Infinity;
    if (a > b) latest = r;
  }
  let status: HarvestEvidenceCategoryStatus;
  if (count === 0) status = "missing";
  else if (count === 1) status = "limited";
  else status = "logged";

  const label = HARVEST_EVIDENCE_CATEGORY_LABEL[key];
  let summary: string;
  if (count === 0) {
    summary =
      key === "other_harvest_note"
        ? "No other harvest notes logged."
        : HARVEST_EVIDENCE_REPORT_CATEGORY_EMPTY_COPY[
            key as Exclude<HarvestEvidenceCategory, "other_harvest_note">
          ];
  } else if (count === 1) {
    summary = safeSummary(latest?.note ?? "") || `${label} logged once.`;
  } else {
    summary = `${count} ${label.toLowerCase()} entries logged.`;
  }

  return {
    key,
    label,
    count,
    latestOccurredAt: latest?.occurredAt ?? null,
    latestOccurredAtLabel: latest?.occurredAtLabel ?? "",
    status,
    summary,
  };
}

function buildPlant(input: HarvestEvidenceReportPlantInput): HarvestEvidenceReportPlant {
  const classified = classifyAll(input.rows);
  const buckets = bucketIntoWindows(classified, input.inspectionWindows ?? null);

  const windows: HarvestEvidenceReportWindow[] = buckets
    .slice()
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    })
    .map((b) => {
      const categories = STRONG_CATEGORIES.map((c) =>
        summarizeCategory(c, b.rows),
      );
      const missing = categories.filter((c) => c.status === "missing").length;
      return {
        key: b.key,
        label: b.label,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        isUnassigned: b.isUnassigned,
        totalCount: b.rows.length,
        categories,
        missingCategoryCount: missing,
      };
    });

  return {
    plantId: input.plantId,
    plantName:
      typeof input.plantName === "string" && input.plantName
        ? input.plantName
        : input.plantId,
    strain:
      typeof input.strain === "string" && input.strain ? input.strain : null,
    stage:
      typeof input.stage === "string" && input.stage ? input.stage : null,
    totalCount: classified.length,
    windows,
  };
}

export function buildHarvestEvidenceReport(
  plants: readonly HarvestEvidenceReportPlantInput[] | null | undefined,
): HarvestEvidenceReport {
  const safePlants = Array.isArray(plants)
    ? plants.filter((p) => p && typeof p === "object" && typeof p.plantId === "string")
    : [];

  const built = safePlants
    .map(buildPlant)
    .sort((a, b) => {
      const an = a.plantName.toLowerCase();
      const bn = b.plantName.toLowerCase();
      if (an !== bn) return an < bn ? -1 : 1;
      return a.plantId < b.plantId ? -1 : a.plantId > b.plantId ? 1 : 0;
    });

  let trichome = 0;
  let pistil = 0;
  let bud = 0;
  let photo = 0;
  let windowsCount = 0;
  let missing = 0;
  let plantsWithEvidence = 0;

  for (const p of built) {
    if (p.totalCount > 0) plantsWithEvidence += 1;
    for (const w of p.windows) {
      windowsCount += 1;
      missing += w.missingCategoryCount;
      for (const c of w.categories) {
        if (c.key === "trichome_inspection") trichome += c.count;
        else if (c.key === "pistil_observation") pistil += c.count;
        else if (c.key === "bud_maturity") bud += c.count;
        else if (c.key === "recent_flower_photo") photo += c.count;
      }
    }
  }

  const totalEvidence = trichome + pistil + bud + photo;

  return {
    plants: built,
    totals: {
      plants: plantsWithEvidence,
      inspectionWindows: windowsCount,
      trichomeInspections: trichome,
      pistilObservations: pistil,
      budMaturityNotes: bud,
      closeFlowerPhotos: photo,
      missingEvidenceCount: missing,
    },
    caution: HARVEST_EVIDENCE_REPORT_CAUTION,
    noActionsCopy: HARVEST_EVIDENCE_REPORT_NO_ACTIONS_COPY,
    emptyCopy: HARVEST_EVIDENCE_REPORT_EMPTY_COPY,
    isEmpty: totalEvidence === 0,
  };
}
