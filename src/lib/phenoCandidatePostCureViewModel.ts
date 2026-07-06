/**
 * phenoCandidatePostCureViewModel
 *
 * Pure, read-only rollup of a pheno candidate's *post-harvest* progress
 * (harvest → drying → curing), derived ONLY from diary events the grower has
 * already logged. It answers "where is each keeper in the cure?" for the
 * comparison surface without inventing anything.
 *
 * Hard rules (mirrors phenoComparisonViewModel):
 *  - No I/O. No fetch. No Supabase. No AI. No writes. No automation.
 *  - Classification keys off the STRUCTURED event `kind` only — never by
 *    scraping free-text notes. Mining prose ("planning to harvest next week")
 *    would overclaim; a milestone appears only when the grower tagged the
 *    event as that kind.
 *  - Yield, weight, potency, terpene numbers are NOT produced here — that data
 *    does not exist in the schema. We summarize logged milestones and flag
 *    what is missing; we never fabricate a result.
 *  - Deterministic ordering, null-safe on every field.
 */
import type {
  PhenoCandidateInput,
  PhenoQuickLogEntryInput,
  PhenoTimelineEventInput,
} from "@/lib/phenoComparisonViewModel";

/** Ordered post-harvest phases. Rank drives "furthest milestone reached". */
export type PhenoPostCurePhase = "harvest" | "drying" | "curing";

const PHASE_RANK: Record<PhenoPostCurePhase, number> = {
  harvest: 1,
  drying: 2,
  curing: 3,
};

const PHASE_LABEL: Record<PhenoPostCurePhase, string> = {
  harvest: "Harvested",
  drying: "Drying",
  curing: "Curing",
};

/**
 * Structured event-kind keywords per phase, checked in furthest-first order so
 * an event tagged "dry-trim" classifies as drying (not harvest). Kept tight and
 * grow-domain-specific: no generic words ("cut") that collide with clone/veg
 * activity. Whole-word match against the event `kind` only.
 */
const PHASE_KEYWORDS: ReadonlyArray<{
  phase: PhenoPostCurePhase;
  keywords: readonly string[];
}> = [
  { phase: "curing", keywords: ["cure", "curing", "cured", "jar", "jarred", "burp", "burped"] },
  { phase: "drying", keywords: ["dry", "drying", "dried", "hang", "hung", "hanging"] },
  {
    phase: "harvest",
    keywords: ["harvest", "harvested", "chop", "chopped", "trim", "trimmed", "trimming"],
  },
];

/** Precompiled whole-word matchers so classification is allocation-light. */
const PHASE_MATCHERS: ReadonlyArray<{
  phase: PhenoPostCurePhase;
  keyword: string;
  re: RegExp;
}> = PHASE_KEYWORDS.flatMap(({ phase, keywords }) =>
  keywords.map((keyword) => ({ phase, keyword, re: new RegExp(`\\b${keyword}\\b`) })),
);

export type PhenoPostCureMissingCode =
  | "no_post_cure_activity"
  | "no_harvest_logged"
  | "no_cure_notes";

export interface PhenoPostCureMissingFlag {
  readonly code: PhenoPostCureMissingCode;
  readonly message: string;
}

const POST_CURE_MISSING_MESSAGES: Record<PhenoPostCureMissingCode, string> = {
  no_post_cure_activity: "No harvest, dry, or cure activity logged yet",
  no_harvest_logged: "No harvest date logged",
  no_cure_notes: "No cure notes logged yet",
};

export interface PhenoPostCureMilestone {
  readonly eventId: string;
  readonly phase: PhenoPostCurePhase;
  /** The structured kind keyword that matched (e.g. "cure"). */
  readonly matchedKeyword: string;
  /** The raw event kind as logged, for display. */
  readonly rawKind: string;
  readonly at: string | null;
  readonly summary: string | null;
  readonly source: "timeline" | "quick_log";
}

export interface PhenoPostCureRollup {
  readonly candidateId: string;
  readonly candidateLabel: string;
  /** Furthest post-harvest phase the diary evidences, or null if none. */
  readonly furthestPhase: PhenoPostCurePhase | null;
  readonly furthestPhaseLabel: string | null;
  /** Earliest logged harvest-phase date, if any. */
  readonly harvestedAt: string | null;
  /** Whole days from harvest to `asOf`, when both parse; else null. Never negative. */
  readonly daysSinceHarvest: number | null;
  readonly milestoneCount: number;
  /** Recognized milestones, newest first. */
  readonly milestones: readonly PhenoPostCureMilestone[];
  /** Newest curing-phase note/summary, if any. */
  readonly latestCureNote: string | null;
  readonly missing: readonly PhenoPostCureMissingFlag[];
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function missing(code: PhenoPostCureMissingCode): PhenoPostCureMissingFlag {
  return { code, message: POST_CURE_MISSING_MESSAGES[code] };
}

/** Classify a structured event kind into a post-harvest phase, or null. */
export function classifyPostCurePhase(
  rawKind: string | null | undefined,
): { phase: PhenoPostCurePhase; keyword: string } | null {
  const kind = cleanString(rawKind);
  if (!kind) return null;
  const hay = kind.toLowerCase();
  for (const m of PHASE_MATCHERS) {
    if (m.re.test(hay)) return { phase: m.phase, keyword: m.keyword };
  }
  return null;
}

/** ISO-ish date diff in whole days; null when either side does not parse. */
function wholeDaysBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  const days = Math.floor((to - from) / 86_400_000);
  return days < 0 ? 0 : days;
}

interface KindedEvent {
  readonly id: string;
  readonly kind: string | null;
  readonly at: string | null;
  readonly summary: string | null;
  readonly source: "timeline" | "quick_log";
}

function fromTimeline(e: PhenoTimelineEventInput): KindedEvent {
  return {
    id: e.id,
    kind: cleanString(e.kind),
    at: cleanString(e.at),
    summary: cleanString(e.summary),
    source: "timeline",
  };
}

function fromQuickLog(e: PhenoQuickLogEntryInput): KindedEvent {
  return {
    id: e.id,
    kind: cleanString(e.kind),
    at: cleanString(e.at),
    summary: cleanString(e.note),
    source: "quick_log",
  };
}

/**
 * Build the post-cure rollup for one candidate.
 * @param asOf ISO timestamp used only to compute daysSinceHarvest. Optional so
 *   the function stays pure/deterministic; the caller passes "now".
 */
export function buildPhenoCandidatePostCureRollup(
  input: PhenoCandidateInput,
  asOf?: string | null,
): PhenoPostCureRollup {
  const candidateId = input.candidateId;
  const candidateLabel = cleanString(input.candidateLabel) ?? candidateId;

  const events: KindedEvent[] = [
    ...(input.timelineEvents ?? []).map(fromTimeline),
    ...(input.quickLogEntries ?? []).map(fromQuickLog),
  ];

  const milestones: PhenoPostCureMilestone[] = [];
  for (const e of events) {
    if (!e.id) continue;
    const match = classifyPostCurePhase(e.kind);
    if (!match) continue;
    milestones.push({
      eventId: e.id,
      phase: match.phase,
      matchedKeyword: match.keyword,
      rawKind: e.kind as string,
      at: e.at,
      summary: e.summary,
      source: e.source,
    });
  }

  // Newest first; events without a date sort last (deterministic tiebreak on id).
  milestones.sort((a, b) => {
    const at = (b.at ?? "").localeCompare(a.at ?? "");
    if (at !== 0) return at;
    return a.eventId.localeCompare(b.eventId);
  });

  let furthestPhase: PhenoPostCurePhase | null = null;
  for (const m of milestones) {
    if (furthestPhase === null || PHASE_RANK[m.phase] > PHASE_RANK[furthestPhase]) {
      furthestPhase = m.phase;
    }
  }

  const harvestDates = milestones
    .filter((m) => m.phase === "harvest" && m.at)
    .map((m) => m.at as string)
    .sort((a, b) => a.localeCompare(b));
  const harvestedAt = harvestDates.length > 0 ? harvestDates[0] : null;

  const latestCureNote = milestones.find((m) => m.phase === "curing" && m.summary)?.summary ?? null;

  const missingFlags: PhenoPostCureMissingFlag[] = [];
  if (milestones.length === 0) {
    missingFlags.push(missing("no_post_cure_activity"));
  } else {
    if (harvestedAt === null) missingFlags.push(missing("no_harvest_logged"));
    if (!milestones.some((m) => m.phase === "curing")) {
      missingFlags.push(missing("no_cure_notes"));
    }
  }

  return {
    candidateId,
    candidateLabel,
    furthestPhase,
    furthestPhaseLabel: furthestPhase ? PHASE_LABEL[furthestPhase] : null,
    harvestedAt,
    daysSinceHarvest: wholeDaysBetween(harvestedAt, cleanString(asOf)),
    milestoneCount: milestones.length,
    milestones,
    latestCureNote,
    missing: missingFlags,
  };
}

/** Build post-cure rollups for a set of candidates, preserving caller order. */
export function buildPhenoPostCureRollups(
  inputs: readonly PhenoCandidateInput[] | null | undefined,
  asOf?: string | null,
): PhenoPostCureRollup[] {
  const list = Array.isArray(inputs) ? inputs : [];
  return list
    .filter((c) => c && typeof c.candidateId === "string" && c.candidateId.length > 0)
    .map((c) => buildPhenoCandidatePostCureRollup(c, asOf));
}
