/**
 * Freshness line for the compact sensor strip under Plants on Grow → Tent
 * (Cheek, 2026-11-28). It names where the climate chips' values came from and
 * when, from the same inputs the chips and the Environment header already use,
 * so the strip never reads fresher than the chips. Pure: no React, no I/O, no
 * clock (callers pass staleness already computed against their own now).
 */

export interface TentSensorStripFreshnessInput {
  /** The merged climate the chips show. */
  displayed: {
    snapshot: { ts?: string | null } | null;
    fromManual: boolean;
    manualMetrics: { temp: boolean; rh: boolean };
    stale: boolean;
  };
  /** The stored sensor header (the Environment card's source, time and staleness). */
  sensorHeader: {
    hasReadings: boolean;
    capturedAt: string | null;
    sourceLabel: string | null;
    stale: boolean;
  };
  /** Each climate chip's own staleness. */
  chipStale: { temp: boolean; rh: boolean };
}

export type TentSensorStripFreshness =
  | { kind: "none" }
  | {
      kind: "single";
      sourceLabel: string;
      /** ISO capture time, or null when the source carries none. */
      capturedAt: string | null;
      stale: boolean;
    }
  | { kind: "mixed"; stale: boolean };

export const TENT_SENSOR_STRIP_COPY = {
  heading: "Latest readings",
  none: "No readings yet.",
  manual: "Manual entry",
  sensorFallback: "Sensor",
  mixed: "Mixed: manual entry and sensor. Each reading's time is in Environment below.",
  stale: "Stale",
  airLabel: "Air",
  rhLabel: "RH",
  vpdLabel: "VPD",
  notReported: "Not reported",
  vpdUnavailable: "VPD unavailable.",
  calculated: "Calculated from same-capture temperature and RH",
} as const;

function validIso(value: string | null | undefined): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function resolveTentSensorStripFreshness(
  input: TentSensorStripFreshnessInput,
): TentSensorStripFreshness {
  const { displayed, sensorHeader, chipStale } = input;
  if (displayed.fromManual) {
    const both = displayed.manualMetrics.temp && displayed.manualMetrics.rh;
    // A manual value that replaced only one chip leaves the other on the
    // sensor: no single source or time is true for both.
    const sensorShowsToo = sensorHeader.hasReadings && !both;
    if (sensorShowsToo) return { kind: "mixed", stale: chipStale.temp || chipStale.rh };
    return {
      kind: "single",
      sourceLabel: TENT_SENSOR_STRIP_COPY.manual,
      capturedAt: validIso(displayed.snapshot?.ts),
      stale: displayed.stale,
    };
  }
  if (!sensorHeader.hasReadings) return { kind: "none" };
  return {
    kind: "single",
    sourceLabel: sensorHeader.sourceLabel ?? TENT_SENSOR_STRIP_COPY.sensorFallback,
    capturedAt: validIso(sensorHeader.capturedAt),
    stale: sensorHeader.stale,
  };
}

/** The VPD the strip shows when only one value fits. */
export interface TentSensorStripVpd {
  /** Null when no trustworthy VPD exists: the strip says "VPD unavailable." */
  value: number | null;
  /** True when derived from temperature and RH of one capture. */
  calculated: boolean;
  freshness: TentSensorStripFreshness;
}

/**
 * The strip reuses the tent page's own resolved VPD (`resolveTentDetailVpd`),
 * which already rejects untrusted rows and only calculates from temperature and
 * RH of the same capture. This adds no VPD math; it only shapes what the strip
 * says about that one value.
 */
export function resolveTentSensorStripVpd(input: {
  observation: {
    value: number | null | undefined;
    capturedAt: string | null;
    stale: boolean;
    calculated: boolean;
  };
  /** The VPD's own provenance label, as the page already formats it. */
  sourceLabel: string | null;
}): TentSensorStripVpd {
  const { observation } = input;
  const value =
    typeof observation.value === "number" && Number.isFinite(observation.value)
      ? observation.value
      : null;
  if (value === null) return { value: null, calculated: false, freshness: { kind: "none" } };
  return {
    value,
    calculated: observation.calculated,
    freshness: {
      kind: "single",
      sourceLabel: input.sourceLabel ?? TENT_SENSOR_STRIP_COPY.sensorFallback,
      capturedAt: validIso(observation.capturedAt),
      stale: observation.stale,
    },
  };
}
