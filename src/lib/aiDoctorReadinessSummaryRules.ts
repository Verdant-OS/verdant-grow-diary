/**
 * AI Doctor readiness summary (spec #2809).
 *
 * Pure: reconciles the hold state, the review-eligibility gate, the context
 * readiness and the readiness view into ONE verdict for Plant Detail. No React,
 * no Supabase, no wall clock — `now` is injected.
 */

import type { AiDoctorReviewMode } from "@/lib/aiDoctorReviewEligibilityRules";
import type { AiDoctorContextReadiness } from "@/lib/aiDoctorContextRules";
import {
  AI_DOCTOR_SOURCE_LABELS,
  type AiDoctorReadinessState,
} from "@/lib/aiDoctorReadinessViewModel";
import {
  AI_DOCTOR_READINESS_SUMMARY_AGE_JUST_NOW,
  AI_DOCTOR_READINESS_SUMMARY_AGE_SUFFIXES,
  AI_DOCTOR_READINESS_SUMMARY_AGE_UNKNOWN,
  AI_DOCTOR_READINESS_SUMMARY_FROM_WORD,
  AI_DOCTOR_READINESS_SUMMARY_HEADLINES,
  AI_DOCTOR_READINESS_SUMMARY_MISSING_LABELS,
  AI_DOCTOR_READINESS_SUMMARY_NEXT_STEP_LABELS,
  AI_DOCTOR_READINESS_SUMMARY_NO_SENSOR_LINE,
  AI_DOCTOR_READINESS_SUMMARY_READINGS_WORD,
  AI_DOCTOR_READINESS_SUMMARY_SCOPE_LABELS,
  AI_DOCTOR_READINESS_SUMMARY_SEPARATOR,
  AI_DOCTOR_READINESS_SUMMARY_UNKNOWN_MISSING_LABEL,
  AI_DOCTOR_READINESS_SUMMARY_UNKNOWN_SOURCE_LABEL,
} from "@/constants/aiDoctorReadinessSummaryCopy";

export type ReadinessHold = "none" | "pending" | "recovery" | "read_error";
export type ReadinessSummaryVerdict = "checking" | "not_ready" | "limited" | "ready";
export type ReadinessSensorSource =
  "live" | "manual" | "csv" | "demo" | "stale" | "invalid" | "unknown";

export interface ReadinessSummarySensorInput {
  scope: "tent" | "plant";
  scopeName: string | null;
  source: ReadinessSensorSource | null;
  capturedAt: string | null;
  stale: boolean | null;
}

export interface AiDoctorReadinessSummaryInput {
  hold: ReadinessHold | null | undefined;
  gate: AiDoctorReviewMode | null | undefined;
  ctx: AiDoctorContextReadiness | null | undefined;
  view: AiDoctorReadinessState | null | undefined;
  missing: readonly string[] | null | undefined;
  sensor: ReadinessSummarySensorInput | null | undefined;
  now: Date;
}

export type ReadinessNextStep =
  | { kind: "none" }
  | { kind: "retry"; label: string }
  | { kind: "recovery"; label: string }
  | { kind: "start_review"; label: string }
  | { kind: "add_missing"; label: string; code: string };

export interface AiDoctorReadinessSummary {
  verdict: ReadinessSummaryVerdict;
  row: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  headline: string;
  sensorLine: string;
  missing: ReadonlyArray<{ code: string; label: string }>;
  nextStep: ReadinessNextStep;
}

export const READINESS_SUMMARY_MAX_MISSING = 3;

/** Environment → root zone/watering → feeding → stage/profile → photo. */
export const READINESS_SUMMARY_MISSING_PRIORITY: readonly string[] = Object.freeze([
  "recent-manual-sensor-snapshot",
  "root-zone-history",
  "recent-watering-or-feeding",
  "recent-timeline-activity",
  "plant-profile",
  "stage",
  "plant-type",
  "strain",
  "medium",
  "plant-photo",
]);

const HOLDS: readonly ReadinessHold[] = ["none", "pending", "recovery", "read_error"];
const GATES: readonly AiDoctorReviewMode[] = ["blocked", "standard", "historical_review"];
const CTXS: readonly AiDoctorContextReadiness[] = ["strong", "partial", "insufficient"];
const VIEWS: readonly AiDoctorReadinessState[] = [
  "ready",
  "needs_more_context",
  "sensor_missing",
  "telemetry_limited",
  "demo_only",
];
const SOURCES: readonly ReadinessSensorSource[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "unknown",
];

function pick<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function labelForMissing(code: string): string {
  const labels = AI_DOCTOR_READINESS_SUMMARY_MISSING_LABELS as Record<string, string>;
  return Object.prototype.hasOwnProperty.call(labels, code)
    ? labels[code]
    : AI_DOCTOR_READINESS_SUMMARY_UNKNOWN_MISSING_LABEL;
}

export function rankAiDoctorReadinessMissing(
  missing: readonly unknown[] | null | undefined,
): ReadonlyArray<{ code: string; label: string }> {
  if (!Array.isArray(missing)) return [];
  const codes = new Set<string>();
  for (const raw of missing) {
    if (typeof raw !== "string") continue;
    const code = raw.trim();
    if (code.length > 0) codes.add(code);
  }
  const rank = (code: string): number => {
    const index = READINESS_SUMMARY_MISSING_PRIORITY.indexOf(code);
    return index === -1 ? READINESS_SUMMARY_MISSING_PRIORITY.length : index;
  };
  return [...codes]
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, READINESS_SUMMARY_MAX_MISSING)
    .map((code) => ({ code, label: labelForMissing(code) }));
}

function formatAge(capturedAt: string | null, now: Date): string {
  if (typeof capturedAt !== "string") return AI_DOCTOR_READINESS_SUMMARY_AGE_UNKNOWN;
  const captured = Date.parse(capturedAt);
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(captured) || !Number.isFinite(nowMs)) {
    return AI_DOCTOR_READINESS_SUMMARY_AGE_UNKNOWN;
  }
  const diffMs = nowMs - captured;
  if (diffMs < 0) return AI_DOCTOR_READINESS_SUMMARY_AGE_UNKNOWN;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return AI_DOCTOR_READINESS_SUMMARY_AGE_JUST_NOW;
  if (minutes < 60) return `${minutes} ${AI_DOCTOR_READINESS_SUMMARY_AGE_SUFFIXES.minutes}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${AI_DOCTOR_READINESS_SUMMARY_AGE_SUFFIXES.hours}`;
  return `${Math.floor(hours / 24)} ${AI_DOCTOR_READINESS_SUMMARY_AGE_SUFFIXES.days}`;
}

export function buildAiDoctorReadinessSensorLine(
  sensor: ReadinessSummarySensorInput | null | undefined,
  now: Date,
): string {
  if (!sensor || typeof sensor !== "object") return AI_DOCTOR_READINESS_SUMMARY_NO_SENSOR_LINE;
  const source = pick(SOURCES, sensor.source) ?? "unknown";
  const capturedAt = typeof sensor.capturedAt === "string" ? sensor.capturedAt : null;
  if (source === "unknown" && capturedAt === null) {
    return AI_DOCTOR_READINESS_SUMMARY_NO_SENSOR_LINE;
  }
  const scope =
    sensor.scope === "plant"
      ? AI_DOCTOR_READINESS_SUMMARY_SCOPE_LABELS.plant
      : AI_DOCTOR_READINESS_SUMMARY_SCOPE_LABELS.tent;
  const name = typeof sensor.scopeName === "string" ? sensor.scopeName.trim() : "";
  const head =
    name.length > 0
      ? `${scope} ${AI_DOCTOR_READINESS_SUMMARY_READINGS_WORD} ${AI_DOCTOR_READINESS_SUMMARY_FROM_WORD} ${name}`
      : `${scope} ${AI_DOCTOR_READINESS_SUMMARY_READINGS_WORD}`;
  const sourceLabel =
    sensor.stale === true
      ? AI_DOCTOR_SOURCE_LABELS.stale
      : source === "unknown"
        ? AI_DOCTOR_READINESS_SUMMARY_UNKNOWN_SOURCE_LABEL
        : AI_DOCTOR_SOURCE_LABELS[source];
  return [head, sourceLabel, formatAge(capturedAt, now)].join(
    AI_DOCTOR_READINESS_SUMMARY_SEPARATOR,
  );
}

export function buildAiDoctorReadinessSummary(
  input: AiDoctorReadinessSummaryInput,
): AiDoctorReadinessSummary {
  const hold = pick(HOLDS, input?.hold) ?? "pending";
  const gate = pick(GATES, input?.gate);
  const ctx = pick(CTXS, input?.ctx);
  const view = pick(VIEWS, input?.view);
  const missing = rankAiDoctorReadinessMissing(input?.missing);
  const sensorLine = buildAiDoctorReadinessSensorLine(input?.sensor, input?.now);

  const H = AI_DOCTOR_READINESS_SUMMARY_HEADLINES;
  const L = AI_DOCTOR_READINESS_SUMMARY_NEXT_STEP_LABELS;
  const startReview: ReadinessNextStep = { kind: "start_review", label: L.startReview };
  const first = missing[0];
  const firstMissing: ReadinessNextStep | null = first
    ? { kind: "add_missing", label: first.label, code: first.code }
    : null;

  const summary = (
    row: AiDoctorReadinessSummary["row"],
    verdict: ReadinessSummaryVerdict,
    headline: string,
    nextStep: ReadinessNextStep,
  ): AiDoctorReadinessSummary => ({ verdict, row, headline, sensorLine, missing, nextStep });

  if (hold === "pending") return summary(1, "checking", H.checking, { kind: "none" });
  if (hold === "read_error") {
    return summary(2, "not_ready", H.readError, { kind: "retry", label: L.retry });
  }
  if (hold === "recovery") {
    return summary(3, "not_ready", H.recovery, { kind: "recovery", label: L.recovery });
  }
  if (gate === "historical_review") return summary(4, "limited", H.historicalReview, startReview);
  if (gate !== "standard" || ctx === "insufficient") {
    return summary(5, "not_ready", H.notEnoughContext, firstMissing ?? { kind: "none" });
  }
  if (view === "demo_only") return summary(6, "limited", H.demoOnly, firstMissing ?? startReview);
  if (view === "telemetry_limited") {
    return summary(7, "limited", H.telemetryLimited, firstMissing ?? startReview);
  }
  if (ctx === "strong" && view === "ready") return summary(8, "ready", H.ready, startReview);
  return summary(9, "limited", H.limited, firstMissing ?? startReview);
}
