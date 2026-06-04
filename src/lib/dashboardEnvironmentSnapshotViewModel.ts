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
import {
  isStale,
  snapshotFromReadings,
  type SensorReadingLike,
} from "@/lib/sensorSnapshot";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import { resolveSensorSourceLabel } from "@/lib/sensorSourceLabelRules";
import {
  classifyRhAgainstStage,
  classifyTempAgainstStage,
  environmentMetricChipStatus,
} from "@/lib/environmentStageTargetRules";
import {
  classifyVpdAgainstStage,
  vpdMetricChipStatus,
} from "@/lib/stageAwareVpdTargets";
import { tempFFromC } from "@/lib/temperatureUnits";
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
}

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

export function buildTentSnapshotView(
  rows: BuildTentSnapshotInput[] | null | undefined,
  stage: string | null | undefined,
  now: number = Date.now(),
): TentSnapshotView {
  if (!rows || rows.length === 0) return EMPTY;
  const snap = snapshotFromReadings(rows);
  if (!snap) return EMPTY;
  const latestRows = rows.filter((r) => r.ts === snap.ts);

  // Source resolution: derive from the actual contributing rows so an
  // unknown/garbage source can never be silently promoted to "live" by
  // `snapshotFromReadings`'s heuristic default.
  const RECOGNISED = new Set(["manual", "live", "csv", "import", "sim", "diary"]);
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
  const stale = !!capturedAt && isStale(capturedAt, now);
  const quality = evaluateSensorQuality(snap, now);
  const invalid = quality.suspiciousFields.length > 0;

  // Stale/invalid override the source label per requirement #2/#6.
  let sourceLabel = resolved.label;
  if (invalid) sourceLabel = "Invalid";
  else if (stale) sourceLabel = "Stale";

  const lastUpdatedDisplay = capturedAt
    ? format(new Date(capturedAt), "MMM d, yyyy, h:mm a")
    : "Unknown";

  const tempF = tempFFromC(snap.temp);

  const mkMetric = (
    key: "temp" | "rh" | "vpd",
    label: string,
    value: number | null,
    unit: string,
    chipStatus: "ok" | "warn" | "bad",
    suspiciousKey: string,
    digits: number,
  ): MetricView => {
    let status: MetricStatus = "ok";
    let statusLabel: string | null = null;
    if (value === null) {
      status = "unknown";
      statusLabel = "Unknown";
    } else if (quality.suspiciousFields.includes(suspiciousKey)) {
      status = "invalid";
      statusLabel = "Invalid";
    } else if (stale) {
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
      tempF,
      "°F",
      environmentMetricChipStatus(
        classifyTempAgainstStage(snap.temp ?? null, { stage }),
      ),
      "temp",
      1,
    ),
    mkMetric(
      "rh",
      "Humidity",
      snap.rh,
      "%",
      environmentMetricChipStatus(
        classifyRhAgainstStage(snap.rh ?? null, { stage }),
      ),
      "rh",
      1,
    ),
    mkMetric(
      "vpd",
      "VPD",
      snap.vpd,
      " kPa",
      vpdMetricChipStatus(
        classifyVpdAgainstStage({ value: snap.vpd ?? null, stage }),
      ),
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
