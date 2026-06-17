/**
 * ggsSentinelSmokeRunnerViewModel — pure presenter helpers for the
 * GgsSentinelSmokeRunnerPanel. Maps the rule-module verdict into the
 * compact one-line-per-metric row data the panel renders.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no timers, no Supabase.
 *  - Never surfaces `raw_payload` or any other untrusted field. The
 *    verdict surface already excludes it; this module is constrained
 *    to that surface and explicitly does not accept the raw row type.
 *  - Status labels/tones are fixed strings — they do not change verdict
 *    precedence, only how the freshness section is described.
 */

import type {
  MetricFreshnessAssessment,
  MetricFreshnessState,
  SentinelSmokeRunnerVerdict,
  SentinelState,
} from "./ggsSentinelSmokeRunner";

export type FreshnessTone = "muted" | "warning" | "destructive" | "primary";

export interface FreshnessRowViewModel {
  metric: string;
  label: string;
  state: MetricFreshnessState;
  statusLabel: "Fresh" | "Fresh but aging" | "Stale" | "Missing";
  tone: FreshnessTone;
  ageText: string;
  capturedText: string | null;
  nextAction: string;
}

export interface VerdictPillViewModel {
  state: SentinelState;
  label: string;
  tone: FreshnessTone;
}

export interface GgsSentinelSmokeRunnerPanelViewModel {
  pill: VerdictPillViewModel;
  freshnessNote: string;
  rows: ReadonlyArray<FreshnessRowViewModel>;
}

export const FRESHNESS_EXPLANATORY_NOTE =
  "Freshness guidance does not change Sentinel result priority. It only explains why each metric is fresh, aging, stale, or missing.";

const STATE_TO_LABEL: Readonly<Record<MetricFreshnessState, FreshnessRowViewModel["statusLabel"]>> = {
  fresh: "Fresh",
  fresh_but_aging: "Fresh but aging",
  stale: "Stale",
  missing: "Missing",
};

const STATE_TO_TONE: Readonly<Record<MetricFreshnessState, FreshnessTone>> = {
  fresh: "primary",
  fresh_but_aging: "warning",
  stale: "destructive",
  missing: "muted",
};

const VERDICT_PILL_LABELS: Readonly<Record<SentinelState, { label: string; tone: FreshnessTone }>> = {
  PASS_LIVE_SENTINEL_READY: { label: "Live · Sentinel ready", tone: "primary" },
  BLOCKED_NO_GGS_ROWS: { label: "Blocked · no GGS rows", tone: "destructive" },
  BLOCKED_NO_SOIL_TEMP_C: { label: "Blocked · no soil temperature (C)", tone: "destructive" },
  BLOCKED_NO_EC: { label: "Blocked · no soil EC", tone: "destructive" },
  BLOCKED_VENDOR_PROVENANCE_MISSING: { label: "Blocked · vendor provenance missing", tone: "destructive" },
  BLOCKED_SOURCE_NOT_CANONICAL: { label: "Blocked · source not canonical", tone: "destructive" },
  BLOCKED_STALE_READING: { label: "Blocked · stale reading", tone: "destructive" },
  BLOCKED_VALIDATION_ERROR: { label: "Blocked · validation error", tone: "destructive" },
  BLOCKED_RAW_PAYLOAD_RENDER_RISK: { label: "Blocked · raw payload render risk", tone: "destructive" },
};

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function formatAgeText(ageMs: number | null, state: MetricFreshnessState): string {
  if (state === "missing" || ageMs === null) return "No row found";
  const abs = Math.max(0, Math.floor(ageMs));
  if (abs < MS_PER_MINUTE) return `${Math.floor(abs / MS_PER_SECOND)}s ago`;
  if (abs < MS_PER_HOUR) return `${Math.floor(abs / MS_PER_MINUTE)}m ago`;
  if (abs < MS_PER_DAY) return `${Math.floor(abs / MS_PER_HOUR)}h ago`;
  return `${Math.floor(abs / MS_PER_DAY)}d ago`;
}

export function formatCapturedText(capturedAt: string | null): string | null {
  if (capturedAt === null) return null;
  const ts = Date.parse(capturedAt);
  if (!Number.isFinite(ts)) return null;
  const d = new Date(ts);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${hh}:${mm}Z`;
}

function rowVm(assessment: MetricFreshnessAssessment): FreshnessRowViewModel {
  return {
    metric: assessment.metric,
    label: assessment.label,
    state: assessment.state,
    statusLabel: STATE_TO_LABEL[assessment.state],
    tone: STATE_TO_TONE[assessment.state],
    ageText: formatAgeText(assessment.ageMs, assessment.state),
    capturedText: formatCapturedText(assessment.capturedAt),
    nextAction: assessment.nextAction,
  };
}

export function buildGgsSentinelSmokeRunnerPanelViewModel(
  verdict: SentinelSmokeRunnerVerdict,
): GgsSentinelSmokeRunnerPanelViewModel {
  const pillSpec = VERDICT_PILL_LABELS[verdict.state];
  return {
    pill: { state: verdict.state, label: pillSpec.label, tone: pillSpec.tone },
    freshnessNote: FRESHNESS_EXPLANATORY_NOTE,
    rows: verdict.freshness.map(rowVm),
  };
}
