/**
 * Sensor metric presentation state rules.
 *
 * Pure helper that classifies the per-metric card state on the Sensor Data
 * page (and any view-model that wants the same calm semantics) so the UI
 * does NOT render a red "Unavailable" badge just because an optional metric
 * is not connected yet.
 *
 * States:
 *   - live | manual | csv | demo  → real value of some provenance
 *   - stale | invalid             → cautionary
 *   - derived                     → calculated (e.g. VPD from temp + RH)
 *   - not_connected               → optional metric, calm
 *   - no_reading_yet              → core metric, calm
 *   - optional                    → optional metric, calm
 *
 * Only `stale` and `invalid` are cautionary. Everything else is calm.
 *
 * No React. No I/O. No side effects.
 */

export type SensorMetricKey =
  | "temp"
  | "rh"
  | "vpd"
  | "co2"
  | "soil"
  | "ppfd";

export type SensorMetricStateKind =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "derived"
  | "not_connected"
  | "no_reading_yet";

export interface SensorMetricState {
  kind: SensorMetricStateKind;
  label: string;
  tone: "calm" | "caution";
  /** Short copy to render when no chart is available. */
  message: string;
  /** True for not_connected/no_reading_yet/optional; suppress red badge. */
  isOptionalEmpty: boolean;
  /** Whether the chart should render (true when we have a real value). */
  showChart: boolean;
}

export interface ClassifyMetricInput {
  metric: SensorMetricKey;
  /** Latest numeric value for this metric (already-normalized). */
  value: number | null | undefined;
  /** Source label, if any. */
  source?: string | null;
  /** Whether ANY reading exists in the current slice. */
  hasAnyReading: boolean;
  /** Stale: any real reading whose age exceeded the freshness window. */
  isStale?: boolean;
  /** Invalid: detected impossible/stuck telemetry. */
  isInvalid?: boolean;
  /** True if the metric was derived (e.g. VPD from temp + RH). */
  isDerived?: boolean;
}

/** Core metrics that are always expected from a working tent. */
const CORE_METRICS: ReadonlySet<SensorMetricKey> = new Set([
  "temp",
  "rh",
  "vpd",
]);

/** Optional metrics that may simply not be connected — never alarm. */
const OPTIONAL_METRICS: ReadonlySet<SensorMetricKey> = new Set([
  "co2",
  "ppfd",
  "soil",
]);

const CALM_EMPTY_COPY: Record<SensorMetricKey, string> = {
  temp: "No temperature reading yet. Add a manual reading or connect a source.",
  rh: "No humidity reading yet. Add a manual reading or connect a source.",
  vpd: "Needs temperature + humidity",
  co2: "No CO₂ sensor connected. Add a manual reading or connect a source when ready.",
  soil: "No soil moisture reading yet. Add a manual reading or connect a source when ready.",
  ppfd: "No PPFD reading yet. Add a manual reading or connect a source when ready.",
};

function normalizeSource(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

const LIVE_SOURCES = new Set([
  "live",
  "supabase",
  "sensor",
  "hassio",
  "ha",
  "broker",
  "api",
  "device",
  "gateway",
]);
const MANUAL_SOURCES = new Set(["manual", "user", "entry", "log"]);
const CSV_SOURCES = new Set(["csv", "import"]);
const DEMO_SOURCES = new Set(["demo", "mock", "fake", "sample", "fixture"]);

function sourceKind(source: string | null): SensorMetricStateKind | null {
  if (!source) return null;
  if (LIVE_SOURCES.has(source)) return "live";
  if (MANUAL_SOURCES.has(source)) return "manual";
  if (CSV_SOURCES.has(source)) return "csv";
  if (DEMO_SOURCES.has(source)) return "demo";
  return null;
}

const KIND_LABEL: Record<SensorMetricStateKind, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
  derived: "Derived",
  not_connected: "Not connected",
  no_reading_yet: "No reading yet",
};

const CAUTION_KINDS: ReadonlySet<SensorMetricStateKind> = new Set([
  "stale",
  "invalid",
]);

export function isOptionalMetric(metric: SensorMetricKey): boolean {
  return OPTIONAL_METRICS.has(metric);
}

export function isCoreMetric(metric: SensorMetricKey): boolean {
  return CORE_METRICS.has(metric);
}

/**
 * Classify a metric's presentation state. Pure & deterministic.
 */
export function classifySensorMetricState(
  input: ClassifyMetricInput,
): SensorMetricState {
  const { metric, value, hasAnyReading } = input;
  const hasValue = typeof value === "number" && Number.isFinite(value);

  // Cautionary takes priority over "we have a value".
  if (input.isInvalid) {
    return makeState("invalid", metric, "Invalid telemetry detected.", false);
  }
  if (hasValue && input.isStale) {
    return makeState(
      "stale",
      metric,
      "Reading is older than the freshness window.",
      true,
    );
  }
  if (input.isDerived && hasValue) {
    return makeState(
      "derived",
      metric,
      "Calculated from temperature and humidity.",
      true,
    );
  }
  if (hasValue) {
    const kind = sourceKind(normalizeSource(input.source)) ?? "demo";
    return makeState(kind, metric, KIND_LABEL[kind], true);
  }

  // No value path — calm, never red.
  if (isOptionalMetric(metric)) {
    return makeState("not_connected", metric, CALM_EMPTY_COPY[metric], false);
  }
  // Core metric (temp/rh/vpd) with no reading.
  if (metric === "vpd") {
    return makeState("no_reading_yet", metric, CALM_EMPTY_COPY.vpd, false);
  }
  return makeState(
    hasAnyReading ? "no_reading_yet" : "not_connected",
    metric,
    CALM_EMPTY_COPY[metric],
    false,
  );
}

function makeState(
  kind: SensorMetricStateKind,
  metric: SensorMetricKey,
  message: string,
  showChart: boolean,
): SensorMetricState {
  return {
    kind,
    label: KIND_LABEL[kind],
    tone: CAUTION_KINDS.has(kind) ? "caution" : "calm",
    message,
    isOptionalEmpty:
      kind === "not_connected" || kind === "no_reading_yet",
    showChart,
  };
}

export const SENSOR_METRIC_CALM_COPY = CALM_EMPTY_COPY;
