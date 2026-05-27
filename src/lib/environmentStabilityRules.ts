/**
 * environmentStabilityRules — pure helper that summarizes how long a tent's
 * VPD has been outside its stage-aware target band over recent windows.
 *
 * Display-only domain logic. Contract:
 *   - No I/O, no React, no Supabase, no fetch.
 *   - No persistence writes.
 *   - No queue insertion.
 *   - No AI calls, no hardware control.
 *   - Reuses `classifyVpdAgainstStage` as the single source of truth for the
 *     stage-aware VPD band.
 *
 * "Outside target" only counts readings whose classification is
 * `below_target` or `above_target`. `unavailable`, `stage_unknown`, and
 * `context_only` (e.g. harvest) are not counted as outside-target.
 *
 * Hour estimate is conservative: each reading is assigned a duration equal
 * to the gap to the next reading, capped by `MAX_GAP_HOURS` so a long
 * silence in telemetry does not get treated as a long out-of-band event.
 */

import {
  classifyVpdAgainstStage,
  type VpdClassification,
  type VpdStage,
} from "@/lib/vpdStageTargetRules";

export type StabilityStatus =
  | "stable"
  | "watch"
  | "unstable"
  | "unavailable"
  | "context_only"
  | "stage_unknown";

export interface StabilityReadingInput {
  ts: string | number | Date;
  vpd: number | null | undefined;
  /** Optional source label. Readings marked "demo" are ignored. */
  source?: string | null;
  /** Optional explicit stale flag. Stale readings are ignored. */
  stale?: boolean | null;
}

export interface StabilityWindowStats {
  /** Approximate hours outside stage-aware VPD band in the window. */
  hoursOutside: number;
  /** Approximate hours of usable telemetry coverage in the window. */
  hoursConsidered: number;
  /** Count of usable readings inside the window. */
  totalConsidered: number;
  /** Count of usable readings classified below/above target. */
  outsideCount: number;
}

export interface StabilityResult {
  status: StabilityStatus;
  last24h: StabilityWindowStats;
  last7d: StabilityWindowStats;
  /** True when the 24h window has too little telemetry for confidence. */
  sparse: boolean;
  /** Optional human-readable note for the presenter. */
  message: string | null;
  /** The normalized stage used for classification. */
  stage: VpdStage;
}

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_24H_MS = 24 * HOUR_MS;
const WINDOW_7D_MS = 7 * 24 * HOUR_MS;

/** Conservative cap so a long telemetry gap is not treated as a long event. */
export const MAX_GAP_HOURS = 2;
/** Minimum readings in 24h before status is considered confident. */
export const MIN_READINGS_24H = 6;
/** Minimum hours of coverage in 24h before status is considered confident. */
export const MIN_COVERAGE_HOURS_24H = 12;
/** Hours outside in 24h to escalate from stable -> watch. */
export const WATCH_THRESHOLD_HOURS_24H = 1;
/** Hours outside in 24h to escalate from watch -> unstable. */
export const UNSTABLE_THRESHOLD_HOURS_24H = 4;

const EMPTY_WINDOW: StabilityWindowStats = {
  hoursOutside: 0,
  hoursConsidered: 0,
  totalConsidered: 0,
  outsideCount: 0,
};

function toMillis(ts: string | number | Date): number | null {
  if (ts instanceof Date) {
    const t = ts.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof ts === "number") return Number.isFinite(ts) ? ts : null;
  if (typeof ts === "string") {
    const t = new Date(ts).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function isUsableSource(source: string | null | undefined): boolean {
  if (source == null) return true;
  const s = String(source).trim().toLowerCase();
  if (s === "" || s === "demo" || s === "mock") return false;
  return true;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

interface UsableReading {
  tMs: number;
  vpd: number;
}

function selectUsable(readings: StabilityReadingInput[]): UsableReading[] {
  const out: UsableReading[] = [];
  for (const r of readings) {
    if (!r) continue;
    if (r.stale === true) continue;
    if (!isUsableSource(r.source)) continue;
    if (!isFiniteNumber(r.vpd)) continue;
    const tMs = toMillis(r.ts);
    if (tMs === null) continue;
    out.push({ tMs, vpd: r.vpd });
  }
  out.sort((a, b) => a.tMs - b.tMs);
  return out;
}

function computeWindow(
  readings: UsableReading[],
  stage: string | null | undefined,
  nowMs: number,
  windowMs: number,
): { stats: StabilityWindowStats; classifications: Set<VpdClassification> } {
  const startMs = nowMs - windowMs;
  const inWindow = readings.filter((r) => r.tMs >= startMs && r.tMs <= nowMs);
  const classifications = new Set<VpdClassification>();
  if (inWindow.length === 0) {
    return { stats: { ...EMPTY_WINDOW }, classifications };
  }

  let hoursOutside = 0;
  let hoursConsidered = 0;
  let outsideCount = 0;
  let totalConsidered = 0;

  for (let i = 0; i < inWindow.length; i++) {
    const cur = inWindow[i];
    const next = inWindow[i + 1];
    const gapEndMs = next ? Math.min(next.tMs, nowMs) : nowMs;
    const rawGapMs = Math.max(0, gapEndMs - cur.tMs);
    const cappedGapMs = Math.min(rawGapMs, MAX_GAP_HOURS * HOUR_MS);
    const gapHours = cappedGapMs / HOUR_MS;

    const classification = classifyVpdAgainstStage({
      value: cur.vpd,
      stage,
    }).classification;
    classifications.add(classification);

    // Only count usable, in-band/out-of-band classifications toward coverage
    if (
      classification === "in_target" ||
      classification === "below_target" ||
      classification === "above_target"
    ) {
      totalConsidered += 1;
      hoursConsidered += gapHours;
      if (
        classification === "below_target" ||
        classification === "above_target"
      ) {
        outsideCount += 1;
        hoursOutside += gapHours;
      }
    }
  }

  return {
    stats: {
      hoursOutside: round2(hoursOutside),
      hoursConsidered: round2(hoursConsidered),
      totalConsidered,
      outsideCount,
    },
    classifications,
  };
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export interface ComputeStabilityOptions {
  /** Plant/grow stage (raw string OK; normalized internally). */
  stage: string | null | undefined;
  /** Override "now" — used by tests for determinism. */
  now?: Date | number;
}

/**
 * Compute the environment stability summary for a tent.
 *
 * Pure: given the same inputs, returns the same output. Does not throw on
 * malformed timestamps or invalid VPDs — those readings are simply skipped.
 */
export function computeEnvironmentStability(
  readings: StabilityReadingInput[],
  options: ComputeStabilityOptions,
): StabilityResult {
  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : typeof options.now === "number"
        ? options.now
        : Date.now();

  // Probe stage classification with a dummy in-band value to find the
  // band's own stage classification (stage_unknown / context_only / normal).
  const probe = classifyVpdAgainstStage({ value: 1.0, stage: options.stage });
  const normalizedStage = probe.band.stage;

  if (probe.classification === "stage_unknown") {
    return {
      status: "stage_unknown",
      last24h: { ...EMPTY_WINDOW },
      last7d: { ...EMPTY_WINDOW },
      sparse: true,
      message: "Set plant stage to evaluate VPD stability.",
      stage: normalizedStage,
    };
  }
  if (probe.classification === "context_only") {
    return {
      status: "context_only",
      last24h: { ...EMPTY_WINDOW },
      last7d: { ...EMPTY_WINDOW },
      sparse: false,
      message: "Stage has no active VPD target; shown as context only.",
      stage: normalizedStage,
    };
  }

  const usable = selectUsable(readings);
  if (usable.length === 0) {
    return {
      status: "unavailable",
      last24h: { ...EMPTY_WINDOW },
      last7d: { ...EMPTY_WINDOW },
      sparse: true,
      message: "No usable VPD readings for the recent window.",
      stage: normalizedStage,
    };
  }

  const w24 = computeWindow(usable, options.stage, nowMs, WINDOW_24H_MS);
  const w7d = computeWindow(usable, options.stage, nowMs, WINDOW_7D_MS);

  if (w24.stats.totalConsidered === 0 && w7d.stats.totalConsidered === 0) {
    return {
      status: "unavailable",
      last24h: w24.stats,
      last7d: w7d.stats,
      sparse: true,
      message: "No usable VPD readings for the recent window.",
      stage: normalizedStage,
    };
  }

  const sparse =
    w24.stats.totalConsidered < MIN_READINGS_24H ||
    w24.stats.hoursConsidered < MIN_COVERAGE_HOURS_24H;

  let status: StabilityStatus;
  if (w24.stats.totalConsidered === 0) {
    status = "unavailable";
  } else if (w24.stats.hoursOutside >= UNSTABLE_THRESHOLD_HOURS_24H) {
    status = "unstable";
  } else if (w24.stats.hoursOutside >= WATCH_THRESHOLD_HOURS_24H) {
    status = "watch";
  } else {
    status = "stable";
  }

  const message = sparse
    ? "Limited data — stability estimate may be incomplete."
    : null;

  return {
    status,
    last24h: w24.stats,
    last7d: w7d.stats,
    sparse,
    message,
    stage: normalizedStage,
  };
}

export const STABILITY_STATUS_LABEL: Record<StabilityStatus, string> = {
  stable: "Stable",
  watch: "Watch",
  unstable: "Unstable",
  unavailable: "Unavailable",
  context_only: "Context only",
  stage_unknown: "Stage unknown",
};
