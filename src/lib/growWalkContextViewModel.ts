import {
  GROW_WALK_MISSING_EVIDENCE_CODES,
  GROW_WALK_REASON_CODES,
  type GrowWalkActionQueuePosture,
  type GrowWalkAiDoctorPosture,
  type GrowWalkAttentionBand,
  type GrowWalkContext,
  type GrowWalkEvidenceConfidence,
  type GrowWalkMissingEvidenceCode,
  type GrowWalkReasonCode,
  type GrowWalkSensorEvidence,
} from "./growWalkContracts";
import {
  evaluateStabilizeMode,
  type StabilizeSensorSourceSummary,
} from "./stabilizeModeRules";

export const GROW_WALK_QUICK_LOG_TEMPLATE =
  "After the walk, log: response = better / same / worse; root-zone check = light / moderate / heavy / not checked; new growth = unchanged / changed / not checked; photo = added / not added.";

export interface GrowWalkBrief {
  readonly scopeLabel: string;
  readonly attentionBand: GrowWalkAttentionBand;
  readonly whatChanged: readonly string[];
  readonly evidenceTrustSummary: readonly string[];
  readonly physicalChecks: readonly string[];
  readonly missingInformation: readonly string[];
  readonly safestNextObservation: string;
  readonly whatNotToDo: readonly string[];
  readonly aiDoctorPosture: GrowWalkAiDoctorPosture;
  readonly quickLogTemplate: string | null;
  readonly actionQueuePosture: GrowWalkActionQueuePosture;
  readonly confidence: GrowWalkEvidenceConfidence;
}

const REASON_COPY: Readonly<Record<GrowWalkReasonCode, string>> = {
  active_high_alert_needs_confirmation:
    "A high-severity alert needs a fresh physical confirmation.",
  multiple_adverse_evidence_lanes:
    "More than one independent evidence lane changed in an adverse direction.",
  stacked_major_changes_48h:
    "Several major changes were recorded within the last 48 hours.",
  stale_or_invalid_sensor_during_problem:
    "Stale or invalid sensor evidence overlaps an active problem period.",
  missing_post_intervention_observation:
    "No credible plant-response observation follows the latest major change.",
  flower_humidity_alert_needs_inspection:
    "Flower-stage humidity evidence needs a flower-site and airflow-path inspection.",
  stressed_or_recovering_with_adverse_change:
    "A stressed or recovering plant also has a newer adverse signal.",
  contradictory_evidence:
    "Available evidence conflicts and should be verified before it is trusted.",
  worsening_observation:
    "The grower recorded a worse response compared with the prior check.",
};

const CHECK_BY_REASON: Readonly<Record<GrowWalkReasonCode, string>> = {
  active_high_alert_needs_confirmation:
    "Confirm the alert with a fresh plant observation and verify the related sensor is positioned correctly.",
  multiple_adverse_evidence_lanes:
    "Compare plant posture and new growth with the last credible observation; record better, same, or worse.",
  stacked_major_changes_48h:
    "Pause additional changes and inspect the plant response to changes already made.",
  stale_or_invalid_sensor_during_problem:
    "Verify the affected condition physically and capture a fresh source-labeled reading.",
  missing_post_intervention_observation:
    "Capture one post-change observation before deciding on another adjustment.",
  flower_humidity_alert_needs_inspection:
    "Inspect flower sites for trapped moisture and confirm airflow paths without changing equipment setpoints.",
  stressed_or_recovering_with_adverse_change:
    "Inspect new growth and overall turgor gently; avoid adding plant stress.",
  contradictory_evidence:
    "Re-check sensor placement and compare the conflicting evidence before trusting either lane.",
  worsening_observation:
    "Compare current posture and new growth with the prior observation and record whether the change is continuing.",
};

const MISSING_COPY: Readonly<Record<GrowWalkMissingEvidenceCode, string>> = {
  no_recent_grower_log: "A recent grower observation is missing.",
  no_current_visual_evidence: "No current image was inspected in this run.",
  photo_predates_latest_major_change: "The newest photo record predates the latest major change.",
  sensor_lane_unavailable: "Sensor context is unavailable.",
  sensor_lane_not_current_live: "Available sensor evidence does not pass the current-live gate.",
  plant_profile_incomplete: "Plant stage, medium, pot size, or type context is incomplete.",
  no_post_intervention_observation: "A post-intervention response observation is missing.",
};

const CHECK_BY_MISSING: Readonly<Partial<Record<GrowWalkMissingEvidenceCode, string>>> = {
  no_recent_grower_log:
    "Make one fresh observation now: compare posture and new growth, then record better, same, or worse.",
  no_current_visual_evidence:
    "Complete one normal observation: compare posture and new growth, and add a current photo if useful.",
  photo_predates_latest_major_change:
    "Capture a current whole-plant photo after the latest change; record observations only.",
  sensor_lane_unavailable:
    "Verify room and plant conditions physically because no sensor lane is available.",
  sensor_lane_not_current_live:
    "Verify the condition physically; the available sensor evidence is not live.",
  plant_profile_incomplete:
    "Confirm stage, medium, and pot size before interpreting a pattern.",
  no_post_intervention_observation:
    "Record one response after the latest change before adding another change.",
};

function uniqueFirst(values: readonly string[], limit?: number): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (limit !== undefined && result.length >= limit) break;
  }
  return Object.freeze(result);
}

function normalizedStatus(status: string): string {
  return status.trim().toLowerCase();
}

function openAlertCount(context: GrowWalkContext): number {
  return context.evidence.alerts.filter((alert) => {
    const status = normalizedStatus(alert.status);
    return status !== "resolved" && status !== "closed" && status !== "dismissed";
  }).length;
}

function summarizeSensorSources(sensors: GrowWalkSensorEvidence): StabilizeSensorSourceSummary {
  if (!sensors.available) return "none";
  const readings = Object.values(sensors.readings);
  if (readings.length === 0) return "none";

  const summaries = new Set<StabilizeSensorSourceSummary>();
  for (const reading of readings) {
    if (reading.current_live) {
      summaries.add("live");
      continue;
    }
    const source = reading.source.trim().toLowerCase();
    if (
      source === "manual" ||
      source === "csv" ||
      source === "demo" ||
      source === "stale" ||
      source === "invalid"
    ) {
      summaries.add(source);
    } else {
      summaries.add("invalid");
    }
  }
  return summaries.size === 1 ? [...summaries][0]! : "mixed";
}

function hasStaleOrInvalid(sensors: GrowWalkSensorEvidence): boolean {
  return Object.values(sensors.readings).some((reading) => {
    const source = reading.source.trim().toLowerCase();
    const quality = reading.quality.trim().toLowerCase();
    return (
      reading.freshness === "stale" ||
      reading.freshness === "invalid" ||
      source === "stale" ||
      source === "invalid" ||
      quality === "stale" ||
      quality === "invalid"
    );
  });
}

function hasOnlyNonLive(sensors: GrowWalkSensorEvidence): boolean {
  const readings = Object.values(sensors.readings);
  return readings.length > 0 && readings.every((reading) => !reading.current_live);
}

function buildScopeLabel(context: GrowWalkContext): string {
  if (context.scope.plantName && context.scope.tentName) {
    return `${context.scope.plantName} — ${context.scope.tentName}`;
  }
  return context.scope.plantName ?? context.scope.tentName ?? context.scope.growName;
}

function buildTrustSummary(context: GrowWalkContext): readonly string[] {
  const lines: string[] = [];
  const readings = Object.values(context.evidence.sensors.readings);
  const currentLive = readings.filter((reading) => reading.current_live);
  const nonLiveSources = [
    ...new Set(readings.filter((reading) => !reading.current_live).map((reading) => reading.source)),
  ].sort();

  if (!context.evidence.sensors.available) {
    lines.push("Sensor lane unavailable; verify physically before relying on room conditions.");
  } else if (readings.length === 0) {
    lines.push("No sensor reading was returned for this scope.");
  } else {
    if (currentLive.length > 0) {
      lines.push(
        `${currentLive.length} sensor reading${currentLive.length === 1 ? "" : "s"} passed source, quality, plausibility, and freshness gates as current live evidence.`,
      );
    }
    if (nonLiveSources.length > 0) {
      lines.push(
        `Other sensor evidence is labeled ${nonLiveSources.join(", ")} and is not live.`,
      );
    }
  }

  if ((context.evidence.sensors.contradictionMetrics?.length ?? 0) > 0) {
    lines.push(
      `Conflicting sensor evidence exists for ${context.evidence.sensors.contradictionMetrics!.join(", ")}.`,
    );
  }

  if (context.evidence.photos.length > 0) {
    lines.push(
      `${context.evidence.photos.length} photo record${context.evidence.photos.length === 1 ? "" : "s"} exist; image content was not inspected in this run.`,
    );
  } else {
    lines.push("No current photo was inspected in this run.");
  }

  if (context.receipt.partialLanes.length > 0) {
    lines.push(`Partial evidence lanes: ${context.receipt.partialLanes.join(", ")}.`);
  }
  if (context.receipt.truncatedLanes.length > 0) {
    lines.push(`Bounded evidence was truncated for: ${context.receipt.truncatedLanes.join(", ")}.`);
  }

  return uniqueFirst(lines);
}

function buildChecks(context: GrowWalkContext): readonly string[] {
  const checks: string[] = [];
  for (const reason of GROW_WALK_REASON_CODES) {
    if (context.derived.reasonCodes.includes(reason)) checks.push(CHECK_BY_REASON[reason]);
  }
  for (const missing of GROW_WALK_MISSING_EVIDENCE_CODES) {
    if (!context.derived.missingEvidenceCodes.includes(missing)) continue;
    const check = CHECK_BY_MISSING[missing];
    if (check) checks.push(check);
  }
  if (checks.length === 0) {
    checks.push(
      "Complete one normal observation: compare plant posture and new growth with the last check.",
    );
  }
  return uniqueFirst(checks, 3);
}

function aiDoctorPosture(context: GrowWalkContext): GrowWalkAiDoctorPosture {
  const invalidScope = context.derived.contradictionCodes.includes("scope_relationship_invalid");
  if (
    invalidScope ||
    context.derived.contradictionCodes.length > 0 ||
    (context.receipt.partialLanes.length > 0 && context.derived.evidenceConfidence === "low")
  ) {
    return "cannot_assess_reliably";
  }

  const corroborated = context.derived.reasonCodes.includes("multiple_adverse_evidence_lanes");
  const worsening = context.derived.reasonCodes.includes("worsening_observation");
  const highAlert = context.derived.reasonCodes.includes(
    "active_high_alert_needs_confirmation",
  );
  if (context.derived.evidenceConfidence === "high" && corroborated && (worsening || highAlert)) {
    return "recommended";
  }

  const waitFor = new Set<GrowWalkMissingEvidenceCode>([
    "no_recent_grower_log",
    "no_current_visual_evidence",
    "photo_predates_latest_major_change",
    "sensor_lane_unavailable",
    "no_post_intervention_observation",
  ]);
  if (
    context.derived.attentionBand === "insufficient_evidence" ||
    context.derived.missingEvidenceCodes.some((code) => waitFor.has(code))
  ) {
    return "wait_for_missing_evidence";
  }
  return "not_needed";
}

function buildWhatChanged(context: GrowWalkContext): readonly string[] {
  const lines = GROW_WALK_REASON_CODES.filter((reason) =>
    context.derived.reasonCodes.includes(reason),
  ).map((reason) => REASON_COPY[reason]);
  return lines.length > 0
    ? uniqueFirst(lines)
    : Object.freeze(["No adverse change is established from the available evidence."]);
}

function buildMissingInformation(context: GrowWalkContext): readonly string[] {
  return uniqueFirst(
    GROW_WALK_MISSING_EVIDENCE_CODES.filter((code) =>
      context.derived.missingEvidenceCodes.includes(code),
    ).map((code) => MISSING_COPY[code]),
  );
}

/** Build one deterministic, read-only physical inspection brief. */
export function buildGrowWalkBrief(context: GrowWalkContext): GrowWalkBrief {
  const stabilize = evaluateStabilizeMode({
    now: context.receipt.generatedAt,
    plant_stage: `${context.profile.stage ?? ""} ${context.profile.growType ?? ""}`.trim(),
    plant_status: context.profile.plantStatus,
    last_log_at: context.derived.latestObservationAt,
    recent_action_count_48h: context.derived.recentMajorChangeCount48h,
    recent_major_change_count_48h: context.derived.recentMajorChangeCount48h,
    active_alert_count: openAlertCount(context),
    sensor_source_summary: summarizeSensorSources(context.evidence.sensors),
    has_stale_or_invalid_sensor_data: hasStaleOrInvalid(context.evidence.sensors),
    has_demo_or_manual_only_sensor_data: hasOnlyNonLive(context.evidence.sensors),
    ai_doctor_confidence_level: context.evidence.aiDoctor?.confidenceBand ?? "unknown",
    ai_doctor_missing_info_count: context.evidence.aiDoctor?.missingInformationCount ?? 0,
  });

  const nonRoutine = context.derived.attentionBand !== "routine_observation";
  const whatNotToDo = nonRoutine
    ? uniqueFirst(
        stabilize.what_not_to_do.length > 0
          ? stabilize.what_not_to_do
          : ["Do not stack another change until a fresh observation is recorded."],
      )
    : Object.freeze([] as string[]);

  const invalidScope = context.derived.contradictionCodes.includes("scope_relationship_invalid");
  const actionQueuePosture: GrowWalkActionQueuePosture =
    context.evidence.actionQueue.openCount > 0 ? "existing_item_review" : "none";

  return Object.freeze({
    scopeLabel: buildScopeLabel(context),
    attentionBand: context.derived.attentionBand,
    whatChanged: buildWhatChanged(context),
    evidenceTrustSummary: buildTrustSummary(context),
    physicalChecks: buildChecks(context),
    missingInformation: buildMissingInformation(context),
    safestNextObservation:
      context.derived.attentionBand === "routine_observation"
        ? "Complete one normal observation and record better, same, or worse."
        : stabilize.safe_next_log_prompt,
    whatNotToDo,
    aiDoctorPosture: aiDoctorPosture(context),
    quickLogTemplate: invalidScope ? null : GROW_WALK_QUICK_LOG_TEMPLATE,
    actionQueuePosture,
    confidence: context.derived.evidenceConfidence,
  });
}
