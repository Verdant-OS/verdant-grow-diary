/**
 * EcoWitt Live Evidence multi-plant rules — pure deterministic.
 *
 * Parses operator-entered plant_id entries and evaluates the same tent
 * evidence per plant. Does NOT query sensors, write data, persist data,
 * call models, control devices, or create alerts/Action Queue items.
 */

import {
  evaluateLiveSourceTruth,
  type LiveSourceTruthGateResult,
  type LiveSourceTruthVerdict,
} from "./liveSourceTruthGateRules";
import {
  buildLiveSourceTruthEvidenceFromForm,
  type EcowittLiveEvidenceFormState,
} from "./ecowittLiveEvidenceFormRules";
import {
  detectEcowittEvidenceUnitWarnings,
  type EcowittEvidenceUnitWarning,
} from "./ecowittLiveEvidenceUnitWarningRules";

export interface EcowittPerPlantResult {
  readonly plant_id: string | null;
  readonly result: LiveSourceTruthGateResult;
}

export interface EcowittMultiPlantEvaluation {
  readonly overall_verdict: LiveSourceTruthVerdict;
  readonly overall_is_live_proof: boolean;
  readonly overall_summary: string;
  readonly per_plant: readonly EcowittPerPlantResult[];
  readonly form_warnings: readonly string[];
  readonly unit_warnings: readonly EcowittEvidenceUnitWarning[];
  readonly combined_next_steps: readonly string[];
  readonly note: string;
}

export function parsePlantIdEntries(input: string): string[] {
  if (typeof input !== "string") return [];
  const raw = input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

const VERDICT_RANK: Record<LiveSourceTruthVerdict, number> = {
  // Conservative precedence order from spec:
  // mismatch > invalid > stale > unverified_live > not_live_proof > verified_live
  // Higher number = picked first when "any result matches".
  mismatch: 6,
  invalid: 5,
  stale: 4,
  unverified_live: 3,
  not_live_proof: 2,
  verified_live: 1,
};

function pickOverallVerdict(
  verdicts: readonly LiveSourceTruthVerdict[],
): LiveSourceTruthVerdict {
  if (verdicts.length === 0) return "invalid";
  // verified_live only if ALL are verified_live
  if (verdicts.every((v) => v === "verified_live")) return "verified_live";
  // Otherwise pick the highest-rank (most conservative) verdict seen.
  let best: LiveSourceTruthVerdict = verdicts[0];
  let bestRank = VERDICT_RANK[best] ?? 0;
  for (const v of verdicts) {
    const r = VERDICT_RANK[v] ?? 0;
    if (r > bestRank) {
      best = v;
      bestRank = r;
    }
  }
  return best;
}

const OVERALL_SUMMARY: Readonly<Record<LiveSourceTruthVerdict, string>> = {
  verified_live:
    "All per-plant evaluations support live proof from the same tent evidence.",
  unverified_live:
    "At least one per-plant evaluation is recent live-source evidence without complete controller comparison.",
  not_live_proof:
    "No per-plant evaluation proves live sensor truth from this evidence.",
  stale: "At least one per-plant evaluation is too old to prove live conditions.",
  invalid:
    "At least one per-plant evaluation has missing, malformed, or suspicious evidence.",
  mismatch:
    "At least one per-plant evaluation shows backend/controller disagreement beyond tolerance.",
};

export interface EvaluateLiveEvidenceForPlantsInput {
  readonly formState: EcowittLiveEvidenceFormState;
  readonly plantIdsInput: string;
}

export function evaluateLiveEvidenceForPlants(
  input: EvaluateLiveEvidenceForPlantsInput,
): EcowittMultiPlantEvaluation {
  const plantIds = parsePlantIdEntries(input.plantIdsInput);
  const unit_warnings = detectEcowittEvidenceUnitWarnings(
    input.formState.metric_rows,
  );

  const baseBuilt = buildLiveSourceTruthEvidenceFromForm(input.formState);
  const targets: Array<string | null> =
    plantIds.length === 0 ? [null] : plantIds.slice();

  const per_plant: EcowittPerPlantResult[] = targets.map((pid) => {
    const built = buildLiveSourceTruthEvidenceFromForm({
      ...input.formState,
      plant_id: pid ?? "",
    });
    return {
      plant_id: pid,
      result: evaluateLiveSourceTruth(built.evidence),
    };
  });

  const verdicts = per_plant.map((p) => p.result.verdict);
  const overall = pickOverallVerdict(verdicts);

  // Combined, deduplicated next steps
  const nextSet = new Set<string>();
  for (const p of per_plant) {
    for (const s of p.result.required_next_steps) nextSet.add(s);
  }
  for (const w of baseBuilt.form_warnings) {
    nextSet.add(`Form: ${w}`);
  }
  for (const w of unit_warnings) {
    nextSet.add(
      w.severity === "blocks_live_proof"
        ? `Unit mismatch blocks live proof for ${w.metric_key}. ${w.operator_fix}`
        : `Unit warning for ${w.metric_key}. ${w.operator_fix}`,
    );
  }
  const combined_next_steps = [...nextSet].sort();

  const note =
    plantIds.length > 1
      ? "EcoWitt evidence is usually tent-level. Per-plant verdicts reuse the same tent evidence and should not be treated as plant-specific sensor proof."
      : plantIds.length === 1
        ? "Single plant_id supplied; result reuses the tent-level evidence and is not plant-specific sensor proof."
        : "No plant_id supplied; tent-level evaluation only.";

  return Object.freeze({
    overall_verdict: overall,
    overall_is_live_proof: overall === "verified_live",
    overall_summary: OVERALL_SUMMARY[overall],
    per_plant: Object.freeze(per_plant),
    form_warnings: Object.freeze([...baseBuilt.form_warnings]),
    unit_warnings,
    combined_next_steps: Object.freeze(combined_next_steps),
    note,
  });
}
