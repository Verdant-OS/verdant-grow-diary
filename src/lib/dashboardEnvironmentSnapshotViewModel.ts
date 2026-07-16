/**
 * dashboardEnvironmentSnapshotViewModel — pure helper that turns a tent's
 * raw `sensor_readings` rows into a labeled, display-ready snapshot view
 * for the Dashboard Environment Snapshot strip.
 *
 * Responsibilities:
 *  - Resolve verified source label (Ecowitt / Manual / CSV / Stale /
 *    Invalid / Unknown). Never promotes unknown → Live.
 *  - Derive per-metric status (ok / stale / invalid / unknown) using
 *    existing helpers: `isStale`, `evaluateSensorQuality`. No JSX-local
 *    thresholds.
 *  - Resolve the verified `captured_at` for the latest reading and never
 *    invent a timestamp when it is missing/invalid.
 *
 * No I/O, no React, no automation, no device control.
 */
import { format } from "date-fns";
import { isStale, snapshotFromReadings, type SensorReadingLike } from "@/lib/sensorSnapshot";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import { resolveSensorSourceLabel } from "@/lib/sensorSourceLabelRules";
import {
  classifyRhAgainstStage,
  classifyTempAgainstStage,
  environmentMetricChipStatus,
} from "@/lib/environmentStageTargetRules";
import { classifyVpdAgainstStage, vpdMetricChipStatus } from "@/lib/stageAwareVpdTargets";
import { tempFFromC } from "@/lib/temperatureUnits";
import type { TemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import type { SensorReadingSource } from "@/mock";

export type MetricStatus = "ok" | "stale" | "invalid" | "unknown";

export interface MetricView {
  key: "temp" | "rh" | "vpd";
  label: string;
  /** Display value without unit; "—" when unknown. */
  display: string;
  unit: string;
  chipStatus: "ok" | "warn" | "bad";
  status: MetricStatus;
  /** "Stale" | "Invalid" | "Unknown" or null when ok. */
  statusLabel: string | null;
}

export interface TentSnapshotView {
  hasReading: boolean;
  /** Verified source label for the badge (never "Live" for unknown). */
  sourceLabel: string;
  /** ISO timestamp of the verified captured time, or null when missing. */
  lastUpdatedIso: string | null;
  /** Human-readable last-updated string, or "Unknown" when missing. */
  lastUpdatedDisplay: string;
  stale: boolean;
  invalid: boolean;
  metrics: MetricView[];
}

export interface BuildTentSnapshotInput extends SensorReadingLike {
  captured_at?: string | null;
  raw_payload?: unknown;
  /**
   * Raw `sensor_readings.quality` intake-validation flag. Authoritative
   * downgrade signal: "invalid"/"stale" here must never render as
   * OK/fresh (mirrors aiDoctorContextCompiler.classifySource — explicit
   * flags win over value plausibility and age). Never an upgrade.
   */
  quality?: string | null;
}

/**
 * Explicit per-row downgrade flag: intake `quality` wins, then a canonical
 * "invalid"/"stale" source value. Returns null when the row carries no
 * explicit flag. Only ever downgrades — an "ok"/unknown flag grants nothing.
 */
function explicitRowFlag(r: BuildTentSnapshotInput): "invalid" | "stale" | null {
  const q = (r.quality ?? "").toString().toLowerCase().trim();
  if (q === "invalid") return "invalid";
  if (q === "stale") return "stale";
  const s = (r.source ?? "").toString().toLowerCase().trim();
  if (s === "invalid") return "invalid";
  if (s === "stale") return "stale";
  return null;
}

/** Reading metric key that feeds each MetricView slot. */
const METRIC_READING_KEY: Record<"temp" | "rh" | "vpd", string> = {
  temp: "temperature_c",
  rh: "humidity_pct",
  vpd: "vpd_kpa",
};

const EMPTY: TentSnapshotView = {
  hasReading: false,
  sourceLabel: "Unknown",
  lastUpdatedIso: null,
  lastUpdatedDisplay: "Unknown",
  stale: false,
  invalid: false,
  metrics: [],
};

function pickVendor(rows: BuildTentSnapshotInput[]): string | null {
  for (const r of rows) {
    const p = r.raw_payload;
    if (p && typeof p === "object") {
      const direct = (p as { vendor?: unknown }).vendor;
      if (typeof direct === "string" && direct) return direct;
      const meta = (p as { metadata?: unknown }).metadata;
      if (meta && typeof meta === "object") {
        const v = (meta as { vendor?: unknown }).vendor;
        if (typeof v === "string" && v) return v;
      }
    }
  }
  return null;
}

function resolveCapturedAt(
  rows: BuildTentSnapshotInput[],
  fallbackTs: string | null,
): string | null {
  for (const r of rows) {
    const c = r.captured_at;
    if (typeof c === "string" && c) {
      const t = new Date(c).getTime();
      if (Number.isFinite(t)) return c;
    }
  }
  if (fallbackTs) {
    const t = new Date(fallbackTs).getTime();
    if (Number.isFinite(t)) return fallbackTs;
  }
  return null;
}

function formatNumber(v: number | null, digits: number): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export interface BuildTentSnapshotViewOptions {
  /**
   * Temperature display unit. Stored sensor values are canonical Celsius;
   * the default ("fahrenheit") preserves the Dashboard strip's existing
   * display. Callers honoring the grower's saved unit preference (e.g. the
   * Tents list) resolve it themselves and pass it in — this module stays
   * pure and never reads storage.
   */
  temperatureUnit?: TemperatureUnitPreference;
}

export function buildTentSnapshotView(
  rows: BuildTentSnapshotInput[] | null | undefined,
  stage: string | null | undefined,
  now: number = Date.now(),
  options: BuildTentSnapshotViewOptions = {},
): TentSnapshotView {
  if (!rows || rows.length === 0) return EMPTY;
  const snap = snapshotFromReadings(rows);
  if (!snap) return EMPTY;
  const latestRows = rows.filter((r) => r.ts === snap.ts);

  // Source resolution: derive from the actual contributing rows so an
  // unknown/garbage source can never be silently promoted to "live" by
  // `snapshotFromReadings`'s heuristic default. "pi_bridge" is a read-side
  // ingest provenance tag inside the strict live reservation pinned in
  // `snapshotFromReadings`; a group classifies as live ONLY when every row
  // at the latest timestamp carries that reservation — recognizing the tag
  // here routes it through that strict classification (parity with Tent
  // Detail) without widening trust for any other source string.
  const RECOGNISED = new Set([
    "manual",
    "live",
    "csv",
    "import",
    "sim",
    "diary",
    "pi_bridge",
    "demo",
    "stale",
    "invalid",
  ]);
  const hasRecognised = latestRows.some(
    (r) => typeof r.source === "string" && RECOGNISED.has(r.source),
  );
  let canonicalSource: SensorReadingSource | null = null;
  if (!hasRecognised) {
    canonicalSource = null;
  } else if (latestRows.some((r) => r.source === "csv" || r.source === "import")) {
    canonicalSource = "csv";
  } else if (snap.source === "manual" || snap.source === "diary") {
    canonicalSource = "manual";
  } else if (snap.source === "sim") {
    canonicalSource = "demo";
  } else if (snap.source === "live") {
    canonicalSource = "live";
  }

  const vendor = pickVendor(latestRows);
  const resolved = resolveSensorSourceLabel({
    source: canonicalSource,
    vendor,
  });

  const capturedAt = resolveCapturedAt(latestRows, snap.ts);
  const quality = evaluateSensorQuality(snap, now);
  // Explicit intake flags on the contributing rows are authoritative
  // downgrades: flagged-invalid data must never render OK/Live and
  // flagged-stale data must never render fresh, regardless of how
  // plausible the values look or how recent the timestamp is.
  const flaggedInvalid = latestRows.some((r) => explicitRowFlag(r) === "invalid");
  const flaggedStale = latestRows.some((r) => explicitRowFlag(r) === "stale");
  const stale = flaggedStale || (!!capturedAt && isStale(capturedAt, now));
  // Beyond explicit flags, "Invalid" is reserved for present-but-implausible
  // values. evaluateSensorQuality also marks an absent VPD as suspicious
  // (review hint for the quality card), but a missing metric is
  // unknown/no-data — it must not relabel an otherwise-honest
  // Stale/Manual/CSV snapshot as Invalid.
  const invalid =
    flaggedInvalid ||
    quality.suspiciousFields.some((f) => typeof snap[f as keyof typeof snap] === "number");

  // Stale/invalid override the source label per requirement #2/#6.
  let sourceLabel = resolved.label;
  if (invalid) sourceLabel = "Invalid";
  else if (stale) sourceLabel = "Stale";

  const lastUpdatedDisplay = capturedAt
    ? format(new Date(capturedAt), "MMM d, yyyy, h:mm a")
    : "Unknown";

  const temperatureUnit = options.temperatureUnit ?? "fahrenheit";
  const tempDisplayValue =
    temperatureUnit === "celsius" ? (snap.temp ?? null) : tempFFromC(snap.temp);
  const tempUnitSymbol = temperatureUnit === "celsius" ? "°C" : "°F";

  const mkMetric = (
    key: "temp" | "rh" | "vpd",
    label: string,
    value: number | null,
    unit: string,
    chipStatus: "ok" | "warn" | "bad",
    suspiciousKey: string,
    digits: number,
  ): MetricView => {
    // Explicit intake flag on the row that contributed this metric (same
    // first-match-at-latest-ts selection as snapshotFromReadings).
    const contributingRow = latestRows.find((r) => r.metric === METRIC_READING_KEY[key]);
    const rowFlag = contributingRow ? explicitRowFlag(contributingRow) : null;
    let status: MetricStatus = "ok";
    let statusLabel: string | null = null;
    if (value === null) {
      status = "unknown";
      statusLabel = "Unknown";
    } else if (rowFlag === "invalid" || quality.suspiciousFields.includes(suspiciousKey)) {
      status = "invalid";
      statusLabel = "Invalid";
    } else if (stale || rowFlag === "stale") {
      status = "stale";
      statusLabel = "Stale";
    }
    return {
      key,
      label,
      display: formatNumber(value, digits),
      unit,
      chipStatus,
      status,
      statusLabel,
    };
  };

  const metrics: MetricView[] = [
    mkMetric(
      "temp",
      "Temperature",
      tempDisplayValue,
      tempUnitSymbol,
      environmentMetricChipStatus(classifyTempAgainstStage(snap.temp ?? null, { stage })),
      "temp",
      1,
    ),
    mkMetric(
      "rh",
      "Humidity",
      snap.rh,
      "%",
      environmentMetricChipStatus(classifyRhAgainstStage(snap.rh ?? null, { stage })),
      "rh",
      1,
    ),
    mkMetric(
      "vpd",
      "VPD",
      snap.vpd,
      " kPa",
      vpdMetricChipStatus(classifyVpdAgainstStage({ value: snap.vpd ?? null, stage })),
      "vpd",
      2,
    ),
  ];

  return {
    hasReading: true,
    sourceLabel,
    lastUpdatedIso: capturedAt,
    lastUpdatedDisplay,
    stale,
    invalid,
    metrics,
  };
}
