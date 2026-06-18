/**
 * harvestWatchCardEvidenceRules — pure helpers that adapt the existing
 * Harvest Watch v1.5 row + recent activity rows into:
 *   • v0 readiness state taxonomy (not_enough_evidence / too_early_to_call /
 *     watch_window / ready_for_manual_review / past_expected_window).
 *   • An explicit evidence checklist (trichome, pistil, bud maturity,
 *     window evidence, recent photos).
 *   • Grouped recent harvest-related items (photos / notes / snapshots),
 *     newest first, with safe empty handling.
 *   • A cautious next-inspection prefill suitable for the existing
 *     `verdant:open-quicklog` handoff.
 *
 * No I/O. No React. No Supabase. No AI calls. No alerts. No Action Queue
 * writes. No automation. No device control. Pure & deterministic.
 *
 * Harvest Watch remains read-only evidence tracking. The "Next inspection"
 * CTA only hands off to the existing diary/QuickLog flow — it never persists
 * data and never claims certainty.
 */

import type { HarvestWatchRowViewModel } from "@/lib/harvestWatchViewModel";
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";

// ---------------------------------------------------------------------------
// v0 readiness taxonomy
// ---------------------------------------------------------------------------

export type HarvestWatchV0ReadinessState =
  | "not_enough_evidence"
  | "too_early_to_call"
  | "watch_window"
  | "ready_for_manual_review"
  | "past_expected_window"
  | "unknown";

export const HARVEST_WATCH_V0_STATE_LABEL: Record<
  HarvestWatchV0ReadinessState,
  string
> = {
  not_enough_evidence: "Not enough evidence",
  too_early_to_call: "Too early to call",
  watch_window: "Approaching watch window",
  ready_for_manual_review: "Ready for manual review",
  past_expected_window: "Past expected window",
  unknown: "Unknown",
};

/**
 * Cautious copy per v0 state. NEVER instructs harvest action. Always defers
 * to grower judgement via direct plant inspection.
 *
 * Forbidden phrasing: "harvest now", "ready to harvest", "guaranteed",
 * "optimal", "done", "chop", "flush", "dark period", "fix immediately",
 * "plant is unhealthy" — enforced by harvest-watch-card-evidence-rules tests.
 */
export const HARVEST_WATCH_V0_STATE_CAUTION: Record<
  HarvestWatchV0ReadinessState,
  string
> = {
  not_enough_evidence:
    "Not enough harvest evidence yet. Add a trichome or flower inspection note.",
  too_early_to_call:
    "Too early to call. Keep logging plant response and flower development.",
  watch_window:
    "Approaching manual review window. Inspect trichomes, pistils, and recent plant response.",
  ready_for_manual_review:
    "Evidence supports a manual harvest review. The grower decides.",
  past_expected_window:
    "Past expected window based on available dates. Re-check trichomes, pistils, and plant condition before deciding.",
  unknown:
    "Harvest Watch cannot determine a review state from the available information.",
};

/** Universal evidence-only caution surfaced under the card title. */
export const HARVEST_WATCH_V0_UNIVERSAL_CAUTION =
  "Harvest Watch is evidence-only. Confirm with direct plant inspection before making harvest decisions.";

/** Surfaced next to the evidence checklist when one is rendered. */
export const HARVEST_WATCH_V0_CHECKLIST_CAUTION =
  "Evidence checklist — not a harvest instruction.";

export interface MapV0ReadinessInput {
  row: HarvestWatchRowViewModel;
  /** Total qualifying photo evidence points fed into the row. */
  photoEvidenceCount: number;
  /** Days into flower if known. */
  daysInFlower: number | null;
  /** Expected harvest day if known. */
  expectedHarvestDay: number | null;
  /**
   * Count of present STRONG inspection signals (trichome / pistil / bud
   * notes). Required for `ready_for_manual_review`. A single recent photo
   * MUST NOT contribute to this count.
   */
  strongEvidenceCount: number;
}

/**
 * Maps the existing v1.5 row + ancillary context to a single v0 state.
 *
 * Cautious & deterministic. Mapping (in priority order):
 *   1. past_expected_window — date anchor exists AND daysInFlower > end + 7.
 *   2. too_early_to_call    — date anchor exists AND daysInFlower < start - 14.
 *   3. too_early_to_call    — internal v1.5 trend === "early".
 *   4. ready_for_manual_review — trend === "holding" AND
 *                                 strongEvidenceCount >= 2.
 *   5. watch_window          — trend === "approaching" or "holding".
 *   6. unknown               — trend === "unknown" AND no evidence of any
 *                              kind (no dates, no photos, no strong notes).
 *   7. not_enough_evidence   — anything else.
 *
 * A single recent photo on its own can NEVER produce ready_for_manual_review
 * — strong inspection notes are the only path.
 */
export function mapToV0ReadinessState(
  input: MapV0ReadinessInput,
): HarvestWatchV0ReadinessState {
  const {
    row,
    photoEvidenceCount,
    daysInFlower,
    expectedHarvestDay,
    strongEvidenceCount,
  } = input;
  const trend = row.trend;
  const windowStart = row.harvestWindow?.startDay ?? null;
  const windowEnd = row.harvestWindow?.endDay ?? null;
  const hasDateAnchor =
    typeof daysInFlower === "number" && Number.isFinite(daysInFlower);
  const hasExpectedDay =
    typeof expectedHarvestDay === "number" &&
    Number.isFinite(expectedHarvestDay) &&
    expectedHarvestDay > 0;

  // 1. Past window.
  if (
    hasDateAnchor &&
    typeof windowEnd === "number" &&
    Number.isFinite(windowEnd) &&
    (daysInFlower as number) > windowEnd + 7
  ) {
    return "past_expected_window";
  }

  // 2. Too early by date.
  if (
    hasDateAnchor &&
    typeof windowStart === "number" &&
    Number.isFinite(windowStart) &&
    (daysInFlower as number) < windowStart - 14
  ) {
    return "too_early_to_call";
  }

  // 3. Too early by internal trend label.
  if (trend === "early") return "too_early_to_call";

  // 4. Ready for manual review — needs multiple STRONG inspection signals.
  if (trend === "holding" && strongEvidenceCount >= 2) {
    return "ready_for_manual_review";
  }

  // 5. Watch window.
  if (trend === "approaching" || trend === "holding") {
    return "watch_window";
  }

  // 6. Truly unknown — no evidence of any kind.
  if (
    trend === "unknown" &&
    !hasDateAnchor &&
    !hasExpectedDay &&
    photoEvidenceCount === 0 &&
    strongEvidenceCount === 0
  ) {
    return "unknown";
  }

  // 7. Default cautious fallback.
  return "not_enough_evidence";
}

// ---------------------------------------------------------------------------
// Evidence checklist
// ---------------------------------------------------------------------------

export type HarvestEvidenceKey =
  | "trichome_inspection"
  | "pistil_observation"
  | "bud_maturity_note"
  | "window_evidence"
  | "recent_photos";

export interface HarvestEvidenceChecklistItem {
  key: HarvestEvidenceKey;
  label: string;
  present: boolean;
}

const EVIDENCE_LABELS: Record<HarvestEvidenceKey, string> = {
  trichome_inspection: "Trichome inspection note",
  pistil_observation: "Pistil / recession observation",
  bud_maturity_note: "Bud maturity note",
  window_evidence: "Expected harvest window context",
  recent_photos: "Recent close-up photos",
};

const TRICHOME_RE = /\btrich(ome|omes|y)\b/i;
const PISTIL_RE = /\bpistil(s)?\b|\brecession\b|\bhairs?\b/i;
const BUD_RE = /\bbud(s)?\b|\bflower(s)?\b|\bswell(ing)?\b|\bcalyx(es)?\b|\bdense\b/i;

/**
 * Builds the v0 evidence checklist from existing recent activity rows and
 * row context. NEVER infers trichome / pistil evidence from a generic photo
 * — only explicit note text counts. If a note signal is absent, the item is
 * reported as missing.
 */
export function buildEvidenceChecklist(input: {
  recentRows: readonly PlantRecentActivityRow[];
  photoEvidenceCount: number;
  daysInFlower: number | null;
  expectedHarvestDay: number | null;
}): HarvestEvidenceChecklistItem[] {
  const notes = input.recentRows
    .map((r) => (typeof r.notePreview === "string" ? r.notePreview : ""))
    .filter((s) => s.length > 0);

  const hasTrichome = notes.some((n) => TRICHOME_RE.test(n));
  const hasPistil = notes.some((n) => PISTIL_RE.test(n));
  const hasBud = notes.some((n) => BUD_RE.test(n));

  const hasWindow =
    (typeof input.daysInFlower === "number" &&
      Number.isFinite(input.daysInFlower)) ||
    (typeof input.expectedHarvestDay === "number" &&
      Number.isFinite(input.expectedHarvestDay) &&
      input.expectedHarvestDay > 0);

  const hasRecentPhotos = input.photoEvidenceCount > 0;

  const items: HarvestEvidenceChecklistItem[] = [
    { key: "trichome_inspection", label: EVIDENCE_LABELS.trichome_inspection, present: hasTrichome },
    { key: "pistil_observation", label: EVIDENCE_LABELS.pistil_observation, present: hasPistil },
    { key: "bud_maturity_note", label: EVIDENCE_LABELS.bud_maturity_note, present: hasBud },
    { key: "window_evidence", label: EVIDENCE_LABELS.window_evidence, present: hasWindow },
    { key: "recent_photos", label: EVIDENCE_LABELS.recent_photos, present: hasRecentPhotos },
  ];
  return items;
}

// ---------------------------------------------------------------------------
// Grouped recent harvest-related items
// ---------------------------------------------------------------------------

export interface HarvestRecentItem {
  id: string;
  occurredAt: string | null;
  occurredAtLabel: string;
  notePreview: string;
  hasPhoto: boolean;
  hasSnapshot: boolean;
}

export interface HarvestRecentGroup {
  key: "photos" | "notes" | "snapshots";
  label: string;
  emptyCopy: string;
  items: HarvestRecentItem[];
}

function toRecentItem(r: PlantRecentActivityRow): HarvestRecentItem {
  return {
    id: r.id,
    occurredAt: r.occurredAt,
    occurredAtLabel: r.occurredAtLabel,
    notePreview: r.notePreview,
    hasPhoto: r.hasPhoto,
    hasSnapshot: r.hasSnapshot,
  };
}

function sortNewestFirst(a: HarvestRecentItem, b: HarvestRecentItem): number {
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

const HARVEST_RELEVANT_RE =
  /\b(trich\w*|pistil\w*|hair\w*|bud\w*|flower\w*|swell\w*|calyx\w*|dense\w*|harvest\w*|amber\w*|cloudy\w*|clear|recession)\b/i;

/**
 * Groups recent activity rows into photos / notes / snapshots buckets for the
 * Harvest Watch card. Each bucket is filtered to "harvest-related" items
 * (photo entries with harvest-relevant note text, notes mentioning harvest
 * vocabulary, and snapshots that occurred alongside harvest-relevant notes),
 * sorted newest first, with safe empty copy when no items qualify.
 */
export function groupHarvestRecentItems(
  recentRows: readonly PlantRecentActivityRow[] | null | undefined,
  opts?: { perGroupLimit?: number },
): HarvestRecentGroup[] {
  const limit = Math.max(1, opts?.perGroupLimit ?? 5);
  const rows = Array.isArray(recentRows) ? recentRows : [];

  const harvestRelevant = (r: PlantRecentActivityRow): boolean =>
    typeof r.notePreview === "string" && HARVEST_RELEVANT_RE.test(r.notePreview);

  // Photos: ANY recent photo qualifies (visual evidence is harvest-relevant
  // when paired with a close-up note; we don't infer trichome from photos).
  const photoItems = rows
    .filter((r) => r.hasPhoto)
    .map(toRecentItem)
    .sort(sortNewestFirst)
    .slice(0, limit);

  const noteItems = rows
    .filter((r) => harvestRelevant(r))
    .map(toRecentItem)
    .sort(sortNewestFirst)
    .slice(0, limit);

  const snapshotItems = rows
    .filter((r) => r.hasSnapshot && harvestRelevant(r))
    .map(toRecentItem)
    .sort(sortNewestFirst)
    .slice(0, limit);

  return [
    {
      key: "photos",
      label: "Recent photos",
      emptyCopy: "No recent photos logged.",
      items: photoItems,
    },
    {
      key: "notes",
      label: "Harvest-related notes",
      emptyCopy:
        "No harvest-related notes yet. Add a trichome, pistil, or bud maturity note.",
      items: noteItems,
    },
    {
      key: "snapshots",
      label: "Snapshots near harvest notes",
      emptyCopy: "No sensor snapshots captured alongside harvest notes.",
      items: snapshotItems,
    },
  ];
}

// ---------------------------------------------------------------------------
// Next-inspection prefill
// ---------------------------------------------------------------------------

export type NextInspectionKind =
  | "trichome_inspection"
  | "pistil_observation"
  | "bud_maturity_note"
  | "close_flower_photo"
  | "general_observation";

export interface NextInspectionPrefill {
  kind: NextInspectionKind;
  label: string;
  /** Prefill body for the diary note. Never an instruction to harvest. */
  notePrefill: string;
  /**
   * The HyperLog/QuickLog action to preselect. v0 routes inspection notes
   * to the diary "note" action — there is no schema-level trichome action.
   */
  suggestedAction: "note";
  /**
   * The diary event type to associate with the entry. Mirrors the existing
   * PlantQuickLogPrefill payload — downstream consumers may ignore unknown
   * hint fields safely.
   */
  eventType: "observation";
}

const PREFILL: Record<NextInspectionKind, { label: string; notePrefill: string }> = {
  trichome_inspection: {
    label: "Add trichome inspection note",
    notePrefill: "Trichome check (clear / cloudy / amber %, area inspected):",
  },
  pistil_observation: {
    label: "Add pistil / recession observation",
    notePrefill: "Pistil observation (color, recession %, area):",
  },
  bud_maturity_note: {
    label: "Add bud maturity note",
    notePrefill: "Bud maturity (swelling, calyx density, observed area):",
  },
  close_flower_photo: {
    label: "Add a close-up flower photo",
    notePrefill: "Close-up flower photo note (area, lighting, distance):",
  },
  general_observation: {
    label: "Log a harvest-context observation",
    notePrefill: "Harvest-context observation:",
  },
};

/**
 * Picks the most useful next inspection based on which evidence is missing.
 * Order: trichome → pistil → bud → photo → general. Never recommends
 * destructive actions (no chop / flush / dark period / heavy defoliation).
 */
export function pickNextInspection(
  checklist: readonly HarvestEvidenceChecklistItem[],
): NextInspectionPrefill {
  const missing = new Set(
    checklist.filter((c) => !c.present).map((c) => c.key),
  );

  let kind: NextInspectionKind;
  if (missing.has("trichome_inspection")) kind = "trichome_inspection";
  else if (missing.has("pistil_observation")) kind = "pistil_observation";
  else if (missing.has("bud_maturity_note")) kind = "bud_maturity_note";
  else if (missing.has("recent_photos")) kind = "close_flower_photo";
  else kind = "general_observation";

  const { label, notePrefill } = PREFILL[kind];
  return {
    kind,
    label,
    notePrefill,
    suggestedAction: "note",
    eventType: "observation",
  };
}
