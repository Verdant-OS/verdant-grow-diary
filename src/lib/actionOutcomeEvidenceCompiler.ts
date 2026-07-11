/**
 * actionOutcomeEvidenceCompiler — pure compiler from repo-shaped rows
 * to an ActionOutcomeEvidenceBundle, plus the end-to-end analysis entry
 * point that produces the final receipt.
 *
 * The compiler NEVER queries, NEVER writes, NEVER fabricates readings,
 * and never reads the clock — callers inject `analysisAt`.
 *
 * Follow-up resolution mirrors the product contract
 * (actionFollowUpEvidenceService.pickPrimary): rows must satisfy
 * details.event_type === "action_followup" AND
 * details.action_queue_id === action id; when several match, the
 * earliest lexicographic row id wins.
 */

import type {
  ActionOutcomeAnalysisReceipt,
  ActionOutcomeEvidenceBundle,
  EvidenceQuality,
  GrowerActionFollowUp,
  GrowerActionFollowUpOutcome,
  NormalizedGrowTargets,
  OutcomeEvidenceWindow,
  VerifiedCompletedAction,
} from "@/lib/actionOutcomeAnalysisTypes";
import {
  MIN_USEFUL_POST_WINDOW_HOURS,
  isWithinWindow,
  resolveOutcomeWindows,
} from "@/lib/actionOutcomeWindowRules";
import {
  normalizeDiaryEvidence,
  normalizeSensorEvidence,
  type RawDiaryEvidenceRow,
  type RawSensorReadingRow,
} from "@/lib/actionOutcomeEvidenceRules";
import {
  agreementSummaryCopy,
  assessOutcomeAgreement,
  classifyOutcome,
  compareAllMetrics,
  deriveLearningGuidance,
  deriveRiskLevel,
  CRITICAL_OUTCOME_METRICS,
} from "@/lib/actionOutcomeAnalysisEngine";
import { scoreActionOutcomeConfidence } from "@/lib/actionOutcomeConfidenceRules";
import { celsiusToFahrenheit } from "@/lib/temperatureUnits";

export const ACTION_FOLLOWUP_EVENT_TYPE = "action_followup";

const FOLLOWUP_OUTCOMES: readonly GrowerActionFollowUpOutcome[] = [
  "improved",
  "unchanged",
  "declined",
  "too_soon",
  "unclear",
] as const;

export type RawActionQueueRow = {
  id: string;
  status: string | null;
  completed_at: string | null;
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  action_type: string | null;
  target_metric: string | null;
  suggested_change: string | null;
  reason: string | null;
  user_id?: string | null;
};

export type RawFollowUpEntryRow = {
  id: string;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  details: {
    event_type?: string | null;
    action_queue_id?: string | null;
    outcome?: string | null;
    observed_at?: string | null;
    note?: string | null;
    // extras shape (post-normalizeDiaryEntry): outcome/observed_at may
    // surface under details.extras — both shapes are accepted.
    extras?: {
      outcome?: string | null;
      observed_at?: string | null;
      action_queue_id?: string | null;
    } | null;
  } | null;
};

export type RawGrowTargetsRow = {
  grow_id: string;
  temp_min: number | null;
  temp_max: number | null;
  rh_min: number | null;
  rh_max: number | null;
  vpd_min: number | null;
  vpd_max: number | null;
  soil_wc_min: number | null;
  soil_wc_max: number | null;
  soil_ec_min: number | null;
  soil_ec_max: number | null;
  ppfd_min: number | null;
  ppfd_max: number | null;
};

export type CompileActionOutcomeInput = {
  action: RawActionQueueRow;
  followUpEntries: RawFollowUpEntryRow[];
  sensorRows: RawSensorReadingRow[];
  diaryRows: RawDiaryEvidenceRow[];
  growTargets: RawGrowTargetsRow | null;
  /** Injected analysis time (ISO). Pure logic never reads the clock. */
  analysisAt: string;
};

export type CompileActionOutcomeResult =
  | { ok: true; bundle: ActionOutcomeEvidenceBundle }
  | {
      ok: false;
      reason:
        | "action_not_completed"
        | "missing_completed_at"
        | "invalid_completed_at"
        | "future_completed_at"
        | "missing_analysis_endpoint"
        | "invalid_analysis_endpoint"
        | "analysis_endpoint_before_completion"
        | "missing_grow_context";
    };

function followupMatches(row: RawFollowUpEntryRow, actionId: string): boolean {
  const d = row.details;
  if (!d) return false;
  if ((d.event_type ?? "") !== ACTION_FOLLOWUP_EVENT_TYPE) return false;
  const id = d.action_queue_id ?? d.extras?.action_queue_id ?? null;
  return typeof id === "string" && id.trim() === actionId;
}

/** Earliest lexicographic id wins — mirrors the product's pickPrimary. */
export function resolvePrimaryFollowUp(
  rows: RawFollowUpEntryRow[],
  actionId: string,
): RawFollowUpEntryRow | null {
  const matching = rows.filter((r) => followupMatches(r, actionId));
  if (matching.length === 0) return null;
  return matching.reduce((earliest, cur) => (earliest.id <= cur.id ? earliest : cur));
}

function normalizeFollowUp(
  row: RawFollowUpEntryRow | null,
  actionId: string,
): GrowerActionFollowUp | null {
  if (!row || !row.details) return null;
  const d = row.details;
  const rawOutcome = d.outcome ?? d.extras?.outcome ?? null;
  const outcome = FOLLOWUP_OUTCOMES.includes(rawOutcome as GrowerActionFollowUpOutcome)
    ? (rawOutcome as GrowerActionFollowUpOutcome)
    : null;
  const observedAt = d.observed_at ?? d.extras?.observed_at ?? null;
  return {
    actionQueueId: actionId,
    outcome,
    observedAt: typeof observedAt === "string" ? observedAt : null,
    note: typeof d.note === "string" ? d.note : null,
  };
}

export function normalizeGrowTargets(row: RawGrowTargetsRow | null): NormalizedGrowTargets | null {
  if (!row) return null;
  const bands: NormalizedGrowTargets["bands"] = {};
  const put = (
    metric: keyof NormalizedGrowTargets["bands"],
    min: number | null,
    max: number | null,
  ) => {
    if (min !== null || max !== null) bands[metric] = { min, max };
  };
  // grow_targets temps are °C (see grow-targets-editor tests); the
  // engine's temperature slot is °F — convert through the trusted rule.
  put(
    "temperature_f",
    row.temp_min !== null ? celsiusToFahrenheit(row.temp_min) : null,
    row.temp_max !== null ? celsiusToFahrenheit(row.temp_max) : null,
  );
  put("humidity_pct", row.rh_min, row.rh_max);
  put("vpd_kpa", row.vpd_min, row.vpd_max);
  put("soil_moisture_pct", row.soil_wc_min, row.soil_wc_max);
  put("soil_ec", row.soil_ec_min, row.soil_ec_max);
  put("ppfd", row.ppfd_min, row.ppfd_max);
  return { growId: row.grow_id, bands };
}

function windowQuality(
  metricsCount: number,
  elapsedHours: number,
  insufficient: boolean,
): EvidenceQuality {
  if (metricsCount === 0) return "unusable";
  if (insufficient) return "low";
  if (metricsCount >= 6 && elapsedHours >= MIN_USEFUL_POST_WINDOW_HOURS) return "high";
  if (metricsCount >= 2) return "medium";
  return "low";
}

/**
 * Pure compiler: repo rows in, evidence bundle out. No queries, no
 * writes, no fabricated readings, no clock reads.
 */
export function compileActionOutcomeEvidenceFromRows(
  input: CompileActionOutcomeInput,
): CompileActionOutcomeResult {
  const action = input.action;
  if ((action.status ?? "") !== "completed") {
    return { ok: false, reason: "action_not_completed" };
  }
  if (!action.grow_id) {
    return { ok: false, reason: "missing_grow_context" };
  }

  const primaryFollowUpRow = resolvePrimaryFollowUp(input.followUpEntries, action.id);
  const followUp = normalizeFollowUp(primaryFollowUpRow, action.id);

  const windows = resolveOutcomeWindows({
    completedAt: action.completed_at,
    followUpObservedAt: followUp?.observedAt ?? null,
    analysisAt: input.analysisAt,
  });
  if (windows.ok === false) return { ok: false, reason: windows.reason };

  const verified: VerifiedCompletedAction = {
    actionQueueId: action.id,
    status: "completed",
    completedAt: windows.actionCompletedAt,
    growId: action.grow_id,
    tentId: action.tent_id ?? null,
    plantId: action.plant_id ?? null,
    actionType: action.action_type ?? null,
    targetMetric: action.target_metric ?? null,
    suggestedChange: action.suggested_change ?? null,
    reason: action.reason ?? "",
  };

  const sensor = normalizeSensorEvidence({
    rows: input.sensorRows,
    actionTentId: verified.tentId,
    analysisAt: input.analysisAt,
  });
  const diary = normalizeDiaryEvidence({
    rows: input.diaryRows,
    actionGrowId: verified.growId,
    actionPlantId: verified.plantId,
    analysisAt: input.analysisAt,
  });

  const preMetrics = sensor.metrics.filter((m) => isWithinWindow(m.capturedAt, windows.pre, "pre"));
  const postMetrics = sensor.metrics.filter((m) =>
    isWithinWindow(m.capturedAt, windows.post, "post"),
  );
  const preDiary = diary.filter((d) => isWithinWindow(d.occurredAt, windows.pre, "pre"));
  const postDiary = diary.filter((d) => isWithinWindow(d.occurredAt, windows.post, "post"));

  const preAction: OutcomeEvidenceWindow = {
    start: windows.pre.start,
    end: windows.pre.end,
    elapsedHours: windows.pre.elapsedHours,
    metrics: preMetrics,
    diaryEvidence: preDiary,
    quality: windowQuality(preMetrics.length, windows.pre.elapsedHours, false),
  };
  const postAction: OutcomeEvidenceWindow = {
    start: windows.post.start,
    end: windows.post.end,
    elapsedHours: windows.post.elapsedHours,
    metrics: postMetrics,
    diaryEvidence: postDiary,
    quality: windowQuality(
      postMetrics.length,
      windows.post.elapsedHours,
      windows.postWindowInsufficient,
    ),
  };

  const growTargets = normalizeGrowTargets(input.growTargets);

  const missingInformation: string[] = [];
  if (!followUp) missingInformation.push("No grower follow-up has been recorded for this action.");
  else if (!followUp.outcome)
    missingInformation.push("The grower follow-up has no outcome selection.");
  if (!growTargets || Object.keys(growTargets.bands).length === 0) {
    missingInformation.push(
      "No grow targets are configured; target-distance comparison is unavailable.",
    );
  }
  if (preMetrics.length === 0)
    missingInformation.push("No usable pre-action sensor evidence in the 24h window.");
  if (postMetrics.length === 0)
    missingInformation.push("No usable post-action sensor evidence in the window.");
  if (windows.postWindowInsufficient) {
    missingInformation.push(
      `Post-action window is shorter than ${MIN_USEFUL_POST_WINDOW_HOURS} hours; recovery evidence is not yet meaningful.`,
    );
  }
  if (!verified.tentId)
    missingInformation.push("Action has no tent context; tent telemetry cannot be attributed.");
  for (const flag of sensor.flags) missingInformation.push(`Telemetry flag: ${flag}.`);

  return {
    ok: true,
    bundle: {
      action: verified,
      followUp,
      preAction,
      postAction,
      growTargets,
      recentDiaryEvidence: [...preDiary, ...postDiary],
      missingInformation: [...missingInformation].sort(),
    },
  };
}

// ---------------------------------------------------------------------------
// End-to-end analysis: bundle → receipt
// ---------------------------------------------------------------------------

export function analyzeActionOutcomeBundle(
  bundle: ActionOutcomeEvidenceBundle,
  context?: {
    /** True when any critical metric row was rejected as implausible/invalid. */
    criticalTelemetryInvalid?: boolean;
    /** True when the supplied sensor rows were exclusively demo-source. */
    demoOnlyEvidence?: boolean;
  },
): ActionOutcomeAnalysisReceipt {
  const comparisons = compareAllMetrics(bundle);
  const classification = classifyOutcome({ bundle, comparisons });
  const confidence = scoreActionOutcomeConfidence({
    bundle,
    comparisons,
    criticalTelemetryInvalid: context?.criticalTelemetryInvalid ?? false,
    demoOnlyEvidence: context?.demoOnlyEvidence ?? false,
  });
  const growerOutcome = bundle.followUp?.outcome ?? null;
  const agreement = assessOutcomeAgreement({
    growerOutcome,
    systemClassification: classification,
  });
  const guidance = deriveLearningGuidance({
    classification,
    confidenceLevel: confidence.level,
    action: {
      actionType: bundle.action.actionType,
      suggestedChange: bundle.action.suggestedChange,
      reason: bundle.action.reason,
    },
    comparisons,
  });
  const riskLevel = deriveRiskLevel(classification, comparisons);

  const supportingEvidence: string[] = [];
  const conflictingEvidence: string[] = [];
  for (const c of comparisons) {
    if (c.direction === "improved") supportingEvidence.push(c.explanation);
    if (c.direction === "declined") conflictingEvidence.push(c.explanation);
  }
  if (agreement === "conflicts") {
    conflictingEvidence.push(
      "The grower-reported outcome and the system evidence comparison point in different directions.",
    );
  }

  const summary = `${agreementSummaryCopy({
    agreement,
    growerOutcome,
    systemClassification: classification,
  })}`;

  return {
    schemaVersion: "1",
    actionQueueId: bundle.action.actionQueueId,
    classification,
    confidenceScore: confidence.score,
    confidenceLevel: confidence.level,
    riskLevel,
    growerReportedOutcome: growerOutcome,
    evidenceAgreement: agreement,
    summary,
    metricComparisons: comparisons,
    supportingEvidence: [...supportingEvidence].sort(),
    conflictingEvidence: [...conflictingEvidence].sort(),
    missingInformation: [...bundle.missingInformation].sort(),
    cautions: [...guidance.cautions].sort(),
    repeatNextRun: guidance.repeatNextRun,
    avoidNextRun: guidance.avoidNextRun,
    evidenceWindow: {
      actionCompletedAt: bundle.action.completedAt,
      preWindowStart: bundle.preAction.start,
      preWindowEnd: bundle.preAction.end,
      postWindowStart: bundle.postAction.start,
      postWindowEnd: bundle.postAction.end,
    },
  };
}

/**
 * Convenience: rows → receipt. Detects demo-only / invalid-critical
 * context deterministically from the raw rows so callers don't have to.
 */
export function analyzeActionOutcomeFromRows(
  input: CompileActionOutcomeInput,
):
  | { ok: true; receipt: ActionOutcomeAnalysisReceipt }
  | { ok: false; reason: Extract<CompileActionOutcomeResult, { ok: false }>["reason"] } {
  const compiled = compileActionOutcomeEvidenceFromRows(input);
  if (compiled.ok === false) return { ok: false, reason: compiled.reason };

  const sensor = normalizeSensorEvidence({
    rows: input.sensorRows,
    actionTentId: compiled.bundle.action.tentId,
    analysisAt: input.analysisAt,
  });
  const suppliedSources = new Set(
    input.sensorRows
      .map((r) => (typeof r.source === "string" ? r.source.trim().toLowerCase() : ""))
      .filter((s) => s.length > 0),
  );
  const demoOnlyEvidence =
    input.sensorRows.length > 0 && suppliedSources.size === 1 && suppliedSources.has("demo");
  const criticalRepoMetrics = new Set(["temperature_c", "humidity_pct", "vpd_kpa"]);
  const criticalTelemetryInvalid = sensor.rejections.some(
    (r) =>
      r.reason === "implausible_value" && r.metric !== null && criticalRepoMetrics.has(r.metric),
  );

  return {
    ok: true,
    receipt: analyzeActionOutcomeBundle(compiled.bundle, {
      criticalTelemetryInvalid,
      demoOnlyEvidence,
    }),
  };
}

export { CRITICAL_OUTCOME_METRICS };
