/**
 * phenoComparisonRealInput — pure mapper from real Supabase rows to the
 * PhenoComparisonInput consumed by buildPhenoComparisonViewModel.
 *
 * The Pheno Comparison presenter + grading engine already accept a
 * PhenoComparisonInput and are fully null-safe. This mapper builds that input
 * from a real grow's hunt candidates so the same surface can render live data
 * (Pro-gated) instead of only the labeled sample fixture.
 *
 * Hard constraints (mirrors the rest of the pheno lib):
 *   - Pure & deterministic. No I/O, no React, no Supabase, no time reads.
 *   - Null-safe: missing fields are simply omitted so the engine surfaces
 *     honest "Not recorded" / evidence-gap caveats rather than inventing data.
 *   - Structured phenotype / post-cure / timepoint records do not exist as
 *     first-class tables yet, so those fields are intentionally left unset —
 *     the comparability engine flags them as gaps, which is the truth.
 */
import type {
  PhenoCandidateInput,
  PhenoComparisonInput,
  PhenoQuickLogInput,
  PhenoTimelineEventInput,
} from "@/lib/phenoComparisonViewModel";

/** A candidate plant tagged into a pheno hunt. */
export interface RealPhenoCandidatePlant {
  id: string;
  candidate_label: string | null;
  name: string | null;
  strain: string | null;
  stage: string | null;
  grow_id: string | null;
  tent_id: string | null;
}

/** An already-shaped recent activity row for a candidate plant. */
export interface RealPhenoActivityRow {
  id: string;
  at: string | null;
  /** Event kind (watering/feeding/note/photo/…) — used for labels only. */
  kind: string | null;
  note: string | null;
}

export interface BuildRealPhenoComparisonInputArgs {
  huntName: string | null;
  growName: string | null;
  /** tent_id → display name. */
  tentNameById: Readonly<Record<string, string>>;
  candidates: readonly RealPhenoCandidatePlant[];
  /** plant_id → recent activity rows (newest-first; caller may pre-trim). */
  activityByPlant: Readonly<Record<string, readonly RealPhenoActivityRow[]>>;
  /** plant_id → already-resolved (signed) photo URL, when one exists. */
  photoUrlByPlant?: Readonly<Record<string, string | null>>;
  /** Max quick-log / timeline rows carried per candidate. Default 5. */
  maxActivityPerCandidate?: number;
}

const DEFAULT_MAX_ACTIVITY = 5;

function cleanLabel(value: string | null | undefined, fallback: string): string {
  const t = typeof value === "string" ? value.trim() : "";
  return t.length > 0 ? t : fallback;
}

function nullableText(value: string | null | undefined): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  return t.length > 0 ? t : null;
}

/**
 * Deterministic candidate order: by numeric suffix of the candidate label when
 * present ("#1" < "#2" < "#10"), then by label, then by id. Never depends on
 * input array order.
 */
function candidateSortKey(c: RealPhenoCandidatePlant): [number, string, string] {
  const label = c.candidate_label ?? "";
  const m = label.match(/(\d+)/);
  const num = m ? Number.parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  return [Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER, label, c.id];
}

function compareCandidates(
  a: RealPhenoCandidatePlant,
  b: RealPhenoCandidatePlant,
): number {
  const [an, al, ai] = candidateSortKey(a);
  const [bn, bl, bi] = candidateSortKey(b);
  if (an !== bn) return an - bn;
  if (al !== bl) return al < bl ? -1 : 1;
  return ai < bi ? -1 : ai > bi ? 1 : 0;
}

function toQuickLogs(
  rows: readonly RealPhenoActivityRow[],
  max: number,
): PhenoQuickLogInput[] {
  return rows.slice(0, max).map((r) => ({
    id: r.id,
    at: nullableText(r.at),
    kind: nullableText(r.kind) ?? "note",
    note: nullableText(r.note),
  }));
}

function toTimelineEvents(
  rows: readonly RealPhenoActivityRow[],
  max: number,
): PhenoTimelineEventInput[] {
  return rows.slice(0, max).map((r) => ({
    id: r.id,
    at: nullableText(r.at),
    kind: nullableText(r.kind) ?? "event",
  }));
}

/**
 * Build a real (non-sample) PhenoComparisonInput. `isDemo` is always false so
 * the presenter never stamps a real comparison as sample data.
 */
export function buildRealPhenoComparisonInput(
  args: BuildRealPhenoComparisonInputArgs,
): PhenoComparisonInput {
  const max = Math.max(1, args.maxActivityPerCandidate ?? DEFAULT_MAX_ACTIVITY);
  const growName = nullableText(args.growName);
  const photoByPlant = args.photoUrlByPlant ?? {};

  const ordered = [...args.candidates].sort(compareCandidates);

  const candidates: PhenoCandidateInput[] = ordered.map((c, index) => {
    const activity = args.activityByPlant[c.id] ?? [];
    const tentName = c.tent_id ? nullableText(args.tentNameById[c.tent_id]) : null;
    const photoUrl = nullableText(photoByPlant[c.id] ?? null);
    return {
      id: c.id,
      candidateLabel: cleanLabel(c.candidate_label, `#${index + 1}`),
      plantName: nullableText(c.name),
      strain: nullableText(c.strain),
      stage: nullableText(c.stage),
      growName,
      tentName,
      growId: nullableText(c.grow_id),
      tentId: nullableText(c.tent_id),
      photoUrl,
      quickLogs: toQuickLogs(activity, max),
      timelineEvents: toTimelineEvents(activity, max),
      // phenotype / postCure / dayOfFlower / replicateCount / snapshot are
      // intentionally unset — no structured store exists yet, and the engine
      // renders honest evidence-gap caveats for each.
    };
  });

  return {
    huntName: nullableText(args.huntName),
    isDemo: false,
    candidates,
  };
}
