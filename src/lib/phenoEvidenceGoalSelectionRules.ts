/**
 * phenoEvidenceGoalSelectionRules — copy and summary for the Pheno Hunt
 * Evidence goals step (#574).
 *
 * A new hunt arrives with a suggested starting set pre-selected. The step must say
 * so plainly, instead of implying the grower already chose them, and the
 * summary must say whether the grower kept or changed that suggestion.
 *
 * Pure: no React, no I/O, no clock. Deterministic and null-safe.
 */

import {
  DEFAULT_SELECTED_EVIDENCE_GOALS,
  PHENO_EVIDENCE_GOALS,
  type PhenoEvidenceGoalId,
} from "@/lib/phenoEvidenceGoals";

export const PHENO_EVIDENCE_GOALS_STEP_INTRO =
  "Verdant pre-selected a suggested starting set of goals to track through the hunt. Some, " +
  "like yield, can only be recorded later in the hunt. Review them, remove any you won't " +
  "track, and add later-stage goals if you want them. You decide what matters — Verdant " +
  "preserves the evidence you record.";

export interface PhenoEvidenceGoalSelectionSummary {
  /** True when the selection is exactly the suggested starting set. */
  readonly isSuggestedDefault: boolean;
  readonly summary: string;
}

const KNOWN_GOAL_IDS: ReadonlySet<string> = new Set(PHENO_EVIDENCE_GOALS.map((g) => g.id));
const SUGGESTED: ReadonlySet<string> = new Set(DEFAULT_SELECTED_EVIDENCE_GOALS);

/**
 * Known goal ids from untrusted input (e.g. a restored localStorage draft),
 * trimmed, in order, de-duplicated. Unknown or removed ids are dropped so the
 * summary, step readiness and Create all see the same selection (Codex on
 * #1843).
 */
export function normalizeEvidenceGoalIds(input: unknown): PhenoEvidenceGoalId[] {
  if (!Array.isArray(input)) return [];
  const out: PhenoEvidenceGoalId[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!KNOWN_GOAL_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as PhenoEvidenceGoalId);
  }
  return out;
}

/** True when `id` is part of the suggested starting set. */
export function isSuggestedEvidenceGoal(id: PhenoEvidenceGoalId): boolean {
  return SUGGESTED.has(id);
}

export function describePhenoEvidenceGoalSelection(
  selected: ReadonlyArray<PhenoEvidenceGoalId> | null | undefined,
): PhenoEvidenceGoalSelectionSummary {
  const chosen = new Set((selected ?? []).filter((id) => KNOWN_GOAL_IDS.has(id)));
  const total = PHENO_EVIDENCE_GOALS.length;
  if (chosen.size === 0) {
    return { isSuggestedDefault: false, summary: "None selected yet — choose at least one goal" };
  }
  const isSuggestedDefault =
    chosen.size === SUGGESTED.size && [...chosen].every((id) => SUGGESTED.has(id));
  return {
    isSuggestedDefault,
    summary: isSuggestedDefault
      ? `${chosen.size} of ${total} selected — the suggested starting set`
      : `${chosen.size} of ${total} selected — changed from the suggested ${SUGGESTED.size}`,
  };
}
