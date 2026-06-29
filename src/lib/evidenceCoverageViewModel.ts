/**
 * evidenceCoverageViewModel — pure, deterministic view model for the
 * Evidence Coverage Panel v1.
 *
 * Strict safety envelope:
 *  - Pure. No I/O. No React. No Supabase. No fetch.
 *  - Read-only diagnostics. Never infers missing evidence.
 *  - Counts only. No row IDs, no raw payloads, no provider payloads,
 *    no tokens/prompts/completions, no model outputs.
 *
 * Inputs are row-like objects carrying the JSON column
 * `originating_timeline_events`. Classification is delegated to
 * {@link adaptOriginatingTimelineEventsColumn} so the panel mirrors the
 * exact rules used by EvidenceLinkageBadges.
 */
import { adaptOriginatingTimelineEventsColumn } from "@/lib/originatingTimelineEventAdapter";

export interface EvidenceCoverageRowInput {
  readonly originating_timeline_events?: unknown;
}

export interface EvidenceCoverageBucket {
  readonly total: number;
  readonly linked: number;
  readonly fallbackOnly: number;
  readonly invalidRefs: number;
  readonly linkedPct: number;
}

export interface EvidenceCoverageViewModel {
  readonly alerts: EvidenceCoverageBucket;
  readonly actions: EvidenceCoverageBucket;
  readonly overall: EvidenceCoverageBucket;
  readonly notes: readonly string[];
}

const EMPTY_BUCKET: EvidenceCoverageBucket = Object.freeze({
  total: 0,
  linked: 0,
  fallbackOnly: 0,
  invalidRefs: 0,
  linkedPct: 0,
});

/** Factual diagnostic notes. No inference, no overclaiming. */
export const EVIDENCE_COVERAGE_NOTES: readonly string[] = Object.freeze([
  "Read-only evidence coverage.",
  "Fallback-only means no safe linked evidence refs were persisted.",
  "Invalid refs are ignored by the adapter and do not render badges.",
  "This panel does not infer missing evidence.",
]);

function hasRawRefs(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  // Any non-array, non-null value is "something was persisted" but unusable.
  return true;
}

function classifyRow(row: EvidenceCoverageRowInput): {
  linked: boolean;
  fallbackOnly: boolean;
  invalidRefs: boolean;
} {
  const raw = row?.originating_timeline_events;
  const safeRefs = adaptOriginatingTimelineEventsColumn(raw);
  if (safeRefs.length > 0) {
    return { linked: true, fallbackOnly: false, invalidRefs: false };
  }
  // No safe refs: distinguish "nothing persisted" from "something persisted
  // but the adapter rejected every entry".
  if (hasRawRefs(raw)) {
    return { linked: false, fallbackOnly: true, invalidRefs: true };
  }
  return { linked: false, fallbackOnly: true, invalidRefs: false };
}

function roundPct(linked: number, total: number): number {
  if (total <= 0) return 0;
  // Deterministic rounding: half-away-from-zero on a positive ratio.
  const pct = (linked / total) * 100;
  return Math.round(pct);
}

function bucketFor(rows: readonly EvidenceCoverageRowInput[] | null | undefined): EvidenceCoverageBucket {
  if (!Array.isArray(rows) || rows.length === 0) return EMPTY_BUCKET;
  let linked = 0;
  let fallbackOnly = 0;
  let invalidRefs = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      fallbackOnly += 1;
      continue;
    }
    const c = classifyRow(row);
    if (c.linked) linked += 1;
    if (c.fallbackOnly) fallbackOnly += 1;
    if (c.invalidRefs) invalidRefs += 1;
  }
  const total = rows.length;
  return {
    total,
    linked,
    fallbackOnly,
    invalidRefs,
    linkedPct: roundPct(linked, total),
  };
}

function combine(a: EvidenceCoverageBucket, b: EvidenceCoverageBucket): EvidenceCoverageBucket {
  const total = a.total + b.total;
  const linked = a.linked + b.linked;
  const fallbackOnly = a.fallbackOnly + b.fallbackOnly;
  const invalidRefs = a.invalidRefs + b.invalidRefs;
  return {
    total,
    linked,
    fallbackOnly,
    invalidRefs,
    linkedPct: roundPct(linked, total),
  };
}

export interface BuildEvidenceCoverageInput {
  readonly alerts?: readonly EvidenceCoverageRowInput[] | null;
  readonly actions?: readonly EvidenceCoverageRowInput[] | null;
}

export function buildEvidenceCoverageViewModel(
  input: BuildEvidenceCoverageInput,
): EvidenceCoverageViewModel {
  const alerts = bucketFor(input?.alerts ?? null);
  const actions = bucketFor(input?.actions ?? null);
  const overall = combine(alerts, actions);
  return { alerts, actions, overall, notes: EVIDENCE_COVERAGE_NOTES };
}

export const EMPTY_EVIDENCE_COVERAGE_VIEW_MODEL: EvidenceCoverageViewModel = Object.freeze({
  alerts: EMPTY_BUCKET,
  actions: EMPTY_BUCKET,
  overall: EMPTY_BUCKET,
  notes: EVIDENCE_COVERAGE_NOTES,
});
