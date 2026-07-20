/**
 * Screening evidence honesty rules.
 *
 * PURE: no React, no Supabase, no I/O. Never throws. This is the single client
 * source of truth for turning a subject's raw screening rows into an honest
 * posture, and it MUST agree with the SQL `genetics_subject_evidence` rollup:
 *   - superseded rows are excluded from "current"
 *   - the current (latest by collected_date) result per target is kept
 *   - the rollup is worst-wins: any positive => positive; else any inconclusive
 *     / not_tested => inconclusive; else any negative => negative_scoped; else
 *     untested
 *   - there is no reassuring all-clear state; absence of a row for a target is
 *     `untested`, never negative
 */
import type { EvidenceState, ScreeningResult } from "./traceabilityTypes";
import { isScreeningResult } from "./traceabilityTypes";

export interface ScreeningRowInput {
  readonly id?: string | null;
  readonly target?: string | null;
  readonly result?: string | null;
  readonly collectedDate?: string | null;
  readonly recordedAt?: string | null;
  readonly supersedesId?: string | null;
}

export interface TargetEvidence {
  readonly target: string;
  readonly result: ScreeningResult;
  readonly collectedDate: string | null;
}

export interface EvidenceSummary {
  readonly state: EvidenceState;
  readonly targets: readonly TargetEvidence[];
  readonly hasEvidence: boolean;
}

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Deterministic "later is greater" comparison; nulls sort earliest. */
function laterThan(a: string | null, b: string | null): boolean {
  if (a === b) return false;
  if (a === null) return false;
  if (b === null) return true;
  return a > b;
}

/**
 * Compute a subject's current per-target evidence and a worst-wins rollup.
 * Input is treated as untrusted; malformed rows are ignored, unknown result
 * values are dropped (never coerced to negative).
 */
export function computeEvidence(rows: readonly ScreeningRowInput[] | null | undefined): EvidenceSummary {
  const list = Array.isArray(rows) ? rows : [];

  // Rows referenced by another row's supersedesId are no longer "current".
  const superseded = new Set<string>();
  for (const r of list) {
    const sup = clean(r?.supersedesId);
    if (sup) superseded.add(sup);
  }

  // Keep the latest current row per target.
  const latestByTarget = new Map<string, { result: ScreeningResult; collectedDate: string | null; recordedAt: string | null }>();
  for (const r of list) {
    const id = clean(r?.id);
    if (id && superseded.has(id)) continue;
    const target = clean(r?.target)?.toLowerCase();
    const result = clean(r?.result);
    if (!target || !isScreeningResult(result)) continue; // drop malformed / unknown — never assume negative
    const collectedDate = clean(r?.collectedDate);
    const recordedAt = clean(r?.recordedAt);
    const existing = latestByTarget.get(target);
    if (
      !existing ||
      laterThan(collectedDate, existing.collectedDate) ||
      (collectedDate === existing.collectedDate && laterThan(recordedAt, existing.recordedAt))
    ) {
      latestByTarget.set(target, { result, collectedDate, recordedAt });
    }
  }

  const targets: TargetEvidence[] = [...latestByTarget.entries()]
    .map(([target, v]) => ({ target, result: v.result, collectedDate: v.collectedDate }))
    .sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0));

  const anyPositive = targets.some((t) => t.result === "positive");
  const anyInconclusive = targets.some((t) => t.result === "inconclusive" || t.result === "not_tested");
  const anyNegative = targets.some((t) => t.result === "negative");

  const state: EvidenceState = anyPositive
    ? "positive"
    : anyInconclusive
      ? "inconclusive"
      : anyNegative
        ? "negative_scoped"
        : "untested";

  return { state, targets, hasEvidence: targets.length > 0 };
}

/** Honest, scope-preserving label — never "clean" or "pathogen free". */
export function evidenceStateLabel(state: EvidenceState): string {
  switch (state) {
    case "positive":
      return "Positive detection";
    case "inconclusive":
      return "Inconclusive / not tested";
    case "negative_scoped":
      return "Negative (scoped)";
    case "untested":
      return "Not tested";
    default:
      return "Not tested";
  }
}

/**
 * Scoped negative copy, e.g. "Negative for HLVd on 2026-07-20". Never widens to
 * a claim about other pathogens or an unscoped "clean". Omits the date honestly
 * when it is unknown.
 */
export function scopedNegativeCopy(target: string, collectedDate: string | null): string {
  const label = clean(target) ?? "target";
  return collectedDate
    ? `Negative for ${label} on ${collectedDate}`
    : `Negative for ${label} (date unrecorded)`;
}

/**
 * Whether a subject may be rendered with a reassuring (green) treatment. This is
 * intentionally strict: only an all-negative posture with at least one target
 * qualifies, and even then the copy stays scoped. Untested / inconclusive /
 * positive never qualify.
 */
export function isReassuring(summary: EvidenceSummary): boolean {
  return summary.state === "negative_scoped" && summary.hasEvidence;
}
