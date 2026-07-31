/**
 * verdantSkillApplicabilityRules — decides whether a skill may run
 * against a compiled plant context, and says why not when it may not.
 *
 * Build 4 of Verdant Skill Runtime v1. Pure and deterministic: no I/O,
 * no model calls, no clock. The evaluator is the enforcement point for
 * "a skill cannot run outside its declared operating envelope" — and a
 * model cannot override it, because nothing here reads model output.
 *
 * RELATIONSHIP TO EXISTING VERDICTS (this repo already has six
 * readiness ladders): this evaluator answers a DIFFERENT question —
 * "does this specific skill's declared envelope match this plant?" —
 * not "is there enough context for AI in general", which
 * `evaluateAiContextSufficiency` already answers. The two compose:
 * sufficiency caps confidence, applicability decides eligibility.
 *
 * Vocabulary is deliberately borrowed rather than forked:
 *  - missing context uses the compiler's exported `CONTEXT_SLOTS`
 *    tokens, so the evaluator and the bundle name gaps identically.
 *  - provenance blockers reuse the truth gate's exclusion reasons.
 *  - the next-step field mirrors the existing `safeNextStep` name.
 */

import {
  CONTEXT_SLOTS,
  type PlantContextCompilation,
  type PlantContextSlot,
} from "@/lib/plantContextBundleCompiler";
import {
  normalizeEnvelopeToken,
  normalizeIrrigationArchitecture,
  normalizeMedium,
  type SkillIrrigationArchitecture,
  type SkillMedium,
  type VerdantSkillManifest,
} from "@/lib/verdantSkillManifest";

// ---------------------------------------------------------------------------
// Result vocabulary
// ---------------------------------------------------------------------------

export const SKILL_APPLICABILITY_VERDICTS = [
  "applicable",
  "partially_applicable",
  "insufficient_context",
  "not_applicable",
] as const;
export type SkillApplicabilityVerdict = (typeof SKILL_APPLICABILITY_VERDICTS)[number];

/** Stable reason codes. Ordered deterministically in the result. */
export const SKILL_APPLICABILITY_REASONS = [
  "skill_retired",
  "medium_excluded",
  "medium_unsupported",
  "medium_unknown",
  "irrigation_excluded",
  "irrigation_unsupported",
  "irrigation_unknown",
  "grow_setting_excluded",
  "grow_setting_unsupported",
  "grow_setting_unknown",
  "missing_required_sensor_metric",
  "required_sensor_metric_conflicted",
  "autoflower_status_unknown",
  "missing_required_context",
  "missing_optional_context",
  "insufficient_usable_sensor_readings",
  "sensor_provenance_blocked",
  "conflicting_sensor_evidence",
] as const;
export type SkillApplicabilityReason = (typeof SKILL_APPLICABILITY_REASONS)[number];

export interface SkillApplicabilityResult {
  verdict: SkillApplicabilityVerdict;
  skillId: string;
  skillVersion: string;
  /** Deterministically ordered reason codes. */
  reasons: SkillApplicabilityReason[];
  /** Context slots the skill requires but the plant does not have. */
  missingRequiredContext: PlantContextSlot[];
  /** Declared exclusions that this plant actually matches. */
  excludedConditions: string[];
  /** Truth-gate reasons that block the sensor evidence this skill needs. */
  provenanceBlockers: string[];
  /**
   * One safe, non-actionable next step: what to record so the skill
   * could run. Never a cultivation instruction.
   */
  safeNextStep: string | null;
}

// ---------------------------------------------------------------------------
// Safe next steps — data requests only, never cultivation advice
// ---------------------------------------------------------------------------

const SLOT_NEXT_STEPS: Record<PlantContextSlot, string> = {
  stage: "Set this plant's current stage.",
  strain: "Add the cultivar or strain name.",
  plant_type: "Record whether this plant is photoperiod or autoflower.",
  medium: "Record the growing medium.",
  pot_size: "Record the container size.",
  irrigation_architecture: "Record how this plant is watered.",
  targets: "Set environment targets for this tent.",
  recent_actions: "Log a recent watering, feeding, or training entry.",
  sensor_readings: "Add a current sensor reading or manual snapshot.",
  photos: "Add a recent photo of this plant.",
};

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export interface EvaluateSkillApplicabilityInput {
  manifest: VerdantSkillManifest;
  compilation: PlantContextCompilation;
  /** Grow setting (tent, outdoor, …) when the caller knows it. */
  growSetting?: string | null;
}

/**
 * Is a required slot genuinely present?
 *
 * The compiler's gap flags answer "did anyone type something here",
 * which is not the same question for identity axes that have a
 * controlled vocabulary. `medium: "moon dust"` is a nonempty string but
 * resolves to no known medium, and an unrecognized irrigation token
 * resolves to null — treating either as present would let a skill run
 * (and propose a manual action) without the context it declared it
 * needs. So those slots are checked SEMANTICALLY.
 */
function slotIsPresent(compilation: PlantContextCompilation, slot: PlantContextSlot): boolean {
  if (compilation.missingInformation.includes(slot)) return false;
  if (slot === "medium") {
    const m = normalizeMedium(compilation.bundle.medium);
    return m !== null && m !== "unknown";
  }
  if (slot === "irrigation_architecture") {
    const a = normalizeIrrigationArchitecture(compilation.irrigationArchitecture);
    return a !== null && a !== "unknown";
  }
  if (slot === "plant_type") {
    const t = normalizeEnvelopeToken(compilation.plantType);
    return t !== null && t !== "unknown";
  }
  if (slot === "stage") {
    // "unknown" is a CANONICAL stage value, so the compiler rightly does
    // not flag it as a gap — the field was populated. But a skill that
    // declared `stage` as required context needs to know the stage, and
    // "unknown" is the answer "nobody knows", not a stage.
    const s = compilation.bundle.stage;
    return s !== null && s !== undefined && s !== "unknown";
  }
  return true;
}

/**
 * Evaluate one skill against one compiled context.
 *
 * Precedence, most decisive first:
 *  1. retired skill or a matched exclusion → not_applicable
 *  2. envelope mismatch (medium / irrigation / setting) → not_applicable
 *  3. required context absent, unknown-but-required envelope facts, or
 *     too few usable readings → insufficient_context
 *  4. optional context absent or evidence caveats → partially_applicable
 *  5. otherwise → applicable
 */
export function evaluateSkillApplicability(
  input: EvaluateSkillApplicabilityInput,
): SkillApplicabilityResult {
  const { manifest, compilation } = input;
  const reasons = new Set<SkillApplicabilityReason>();
  const excluded: string[] = [];
  const missingRequired: PlantContextSlot[] = [];
  const provenanceBlockers = new Set<string>();

  const envelope = manifest.operatingEnvelope;
  const medium = normalizeMedium(compilation.bundle.medium);
  const irrigation = normalizeIrrigationArchitecture(compilation.irrigationArchitecture);
  const growSetting = (input.growSetting ?? "").trim().toLowerCase();

  // 1. Retired skills never run.
  const retired =
    manifest.deprecation.deprecated === true ||
    manifest.lifecycle === "deprecated" ||
    manifest.lifecycle === "superseded" ||
    manifest.lifecycle === "paused";
  if (retired) reasons.add("skill_retired");

  // 2. Declared exclusions the plant actually matches.
  // An ABSENT value is the "unknown" case: a manifest that excludes
  // `unknown` is saying "refuse when nobody recorded it", so a null
  // must match that exclusion just as the literal token does.
  const mediumForExclusion = medium ?? "unknown";
  const irrigationForExclusion = irrigation ?? "unknown";
  if (manifest.excludedConditions.media.includes(mediumForExclusion)) {
    reasons.add("medium_excluded");
    excluded.push(`medium:${mediumForExclusion}`);
  }
  if (manifest.excludedConditions.irrigationArchitectures.includes(irrigationForExclusion)) {
    reasons.add("irrigation_excluded");
    excluded.push(`irrigation_architecture:${irrigationForExclusion}`);
  }
  if (
    growSetting !== "" &&
    (manifest.excludedConditions.growSettings as readonly string[]).includes(growSetting)
  ) {
    reasons.add("grow_setting_excluded");
    excluded.push(`grow_setting:${growSetting}`);
  }

  // 3. Envelope support. An EMPTY list means the skill is agnostic on
  //    that axis; a non-empty list is a closed allow-list.
  if (envelope.media.length > 0 && medium !== null && medium !== "unknown") {
    if (!envelope.media.includes(medium as SkillMedium)) {
      reasons.add("medium_unsupported");
    }
  }
  if (envelope.irrigationArchitectures.length > 0) {
    if (irrigation === null || irrigation === "unknown") {
      // Closed allow-list + unknown architecture: absence is not
      // agreement here either. Handled below as missing context.
      reasons.add("irrigation_unknown");
      if (!missingRequired.includes("irrigation_architecture")) {
        missingRequired.push("irrigation_architecture");
      }
    } else if (
      !envelope.irrigationArchitectures.includes(irrigation as SkillIrrigationArchitecture)
    ) {
      reasons.add("irrigation_unsupported");
    }
  }
  if (envelope.growSettings.length > 0) {
    if (growSetting === "") {
      // A closed allow-list with an UNKNOWN setting is not a pass. The
      // plant could be outdoor or greenhouse; absence is not agreement.
      reasons.add("grow_setting_unknown");
    } else if (!(envelope.growSettings as readonly string[]).includes(growSetting)) {
      reasons.add("grow_setting_unsupported");
    }
  }

  // 4. Unknown-but-required envelope facts. These are NOT guesses —
  //    an unknown irrigation architecture yields insufficient context.
  if (
    envelope.requiresKnownIrrigationArchitecture &&
    (irrigation === null || irrigation === "unknown")
  ) {
    reasons.add("irrigation_unknown");
    if (!missingRequired.includes("irrigation_architecture")) {
      missingRequired.push("irrigation_architecture");
    }
  }
  if (envelope.media.length > 0 && (medium === null || medium === "unknown")) {
    reasons.add("medium_unknown");
    if (!missingRequired.includes("medium")) missingRequired.push("medium");
  }
  if (envelope.requiresKnownAutoflowerStatus && compilation.bundle.isAutoflower === null) {
    // null is not false — autoflower-sensitive skills stay conservative.
    reasons.add("autoflower_status_unknown");
    if (!missingRequired.includes("plant_type")) missingRequired.push("plant_type");
  }

  // 5. Declared required context.
  for (const slot of manifest.requiredContext) {
    if (!slotIsPresent(compilation, slot) && !missingRequired.includes(slot)) {
      missingRequired.push(slot);
    }
  }
  if (missingRequired.length > 0) reasons.add("missing_required_context");

  // 6. Sensor sufficiency and provenance.
  // The floor is measured against UNCONFLICTED evidence. Counting
  // readings from a metric whose devices disagree would let a plant
  // where nothing agrees clear a sensor-hungry skill's minimum, and a
  // bare conflict only downgrades to partially_applicable — so the run
  // would proceed with no trustworthy value behind it.
  if (
    envelope.minUsableSensorReadings > 0 &&
    compilation.sensorSummary.unconflictedIncludedCount < envelope.minUsableSensorReadings
  ) {
    reasons.add("insufficient_usable_sensor_readings");
    if (!missingRequired.includes("sensor_readings")) {
      missingRequired.push("sensor_readings");
    }
  }
  // A skill that depends on a specific signal must actually have it.
  // A global reading count is not enough: a fresh temperature reading
  // must not satisfy a moisture-dependent skill.
  for (const required of envelope.requiredSensorMetrics) {
    const entry = compilation.sensorSummary.metrics.find((m) => m.metric === required);
    if (entry === undefined || entry.usableCount === 0) {
      reasons.add("missing_required_sensor_metric");
      provenanceBlockers.add(`no_usable_${required}`);
      if (!missingRequired.includes("sensor_readings")) {
        missingRequired.push("sensor_readings");
      }
      continue;
    }
    // A metric the skill DEPENDS on, whose devices disagree, has no
    // single trustworthy value — that must block the run, not merely
    // downgrade it to partially applicable.
    if (entry.conflicted) {
      reasons.add("required_sensor_metric_conflicted");
      provenanceBlockers.add(`conflicted_${required}`);
      if (!missingRequired.includes("sensor_readings")) {
        missingRequired.push("sensor_readings");
      }
    }
  }
  // Sensor caveats apply only to skills that actually CONSUME sensor
  // evidence. A diary/photo skill must not be downgraded because some
  // unrelated metric in the tent happens to be stale.
  const dependsOnSensors =
    envelope.requiredSensorMetrics.length > 0 ||
    envelope.minUsableSensorReadings > 0 ||
    manifest.requiredContext.includes("sensor_readings") ||
    manifest.optionalContext.includes("sensor_readings");
  if (dependsOnSensors) {
    // When the skill names specific metrics, only those matter.
    const relevant = new Set<string>(envelope.requiredSensorMetrics);
    for (const metric of compilation.sensorSummary.metrics) {
      if (relevant.size > 0 && !relevant.has(metric.metric)) continue;
      if (metric.excludedCount > 0 && metric.usableCount === 0) {
        provenanceBlockers.add(`no_usable_${metric.metric}`);
      }
    }
    if (provenanceBlockers.size > 0) reasons.add("sensor_provenance_blocked");
    const relevantConflicts = compilation.sensorSummary.conflicts.filter(
      (c) => relevant.size === 0 || relevant.has(c.metric),
    );
    if (relevantConflicts.length > 0) reasons.add("conflicting_sensor_evidence");
  }

  // 7. Optional context (never blocks, only downgrades).
  const missingOptional = manifest.optionalContext.filter(
    (slot) => !slotIsPresent(compilation, slot),
  );
  if (missingOptional.length > 0) reasons.add("missing_optional_context");

  // --- Verdict ------------------------------------------------------------
  let verdict: SkillApplicabilityVerdict;
  if (
    reasons.has("skill_retired") ||
    excluded.length > 0 ||
    reasons.has("medium_unsupported") ||
    reasons.has("irrigation_unsupported") ||
    reasons.has("grow_setting_unsupported")
  ) {
    verdict = "not_applicable";
  } else if (missingRequired.length > 0 || reasons.has("grow_setting_unknown")) {
    verdict = "insufficient_context";
  } else if (
    missingOptional.length > 0 ||
    reasons.has("sensor_provenance_blocked") ||
    reasons.has("conflicting_sensor_evidence")
  ) {
    verdict = "partially_applicable";
  } else {
    verdict = "applicable";
  }

  // Deterministic reason ordering: the declared vocabulary order.
  const orderedReasons = SKILL_APPLICABILITY_REASONS.filter((r) => reasons.has(r));

  // Safe next step: the first missing slot in canonical slot order.
  const orderedMissing = CONTEXT_SLOTS.filter((slot) => missingRequired.includes(slot));
  const safeNextStep =
    verdict === "not_applicable"
      ? null
      : orderedMissing.length > 0
        ? SLOT_NEXT_STEPS[orderedMissing[0]]
        : reasons.has("grow_setting_unknown")
          ? "Record whether this grow is in a tent, greenhouse, or outdoors."
          : null;

  return {
    verdict,
    skillId: manifest.id,
    skillVersion: manifest.version,
    reasons: [...orderedReasons],
    missingRequiredContext: [...orderedMissing],
    excludedConditions: excluded.sort(),
    provenanceBlockers: [...provenanceBlockers].sort(),
    safeNextStep,
  };
}

/** True only for verdicts that may proceed to a skill run. */
export function skillMayRun(result: SkillApplicabilityResult): boolean {
  return result.verdict === "applicable" || result.verdict === "partially_applicable";
}
