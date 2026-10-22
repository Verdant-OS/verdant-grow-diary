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
import { captureRefsKnown, rowCaptureRef } from "@/lib/sensorCaptureRefRules";
import { format } from "date-fns";
import { isStale, snapshotFromReadings, type SensorReadingLike } from "@/lib/sensorSnapshot";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import { classifyManualMetric } from "@/lib/sensorTruthRules";
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
import { isDiagnosticSensorProvenanceRow } from "@/lib/sensorProvenanceFenceRules";
import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";

export type MetricStatus = "ok" | "stale" | "invalid" | "degraded" | "unknown";

export interface MetricView {
  key: "temp" | "rh" | "vpd";
  label: string;
  /** Display value without unit; "—" when unknown. */
  display: string;
  unit: string;
  /**
   * Chip color, capped by metric status: an invalid metric renders "bad"
   * and a stale/degraded metric never renders the healthy "ok" green,
   * so a flagged value cannot look healthy beside its status label.
   */
  chipStatus: "ok" | "warn" | "bad";
  status: MetricStatus;
  /** "Stale" | "Invalid" | "Degraded" | "Unknown" or null when ok. */
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
  /** True only for one coherent live/manual/CSV latest-source cohort. */
  provenanceEligible: boolean;
  /** Fresh, valid, provenance-eligible evidence may receive stage guidance. */
  canAssessStage: boolean;
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
  /** Capture identity when the row stands in for another record (`sensorCaptureRefRules`). */
  capture_ref?: string | null;
}

/**
 * Explicit per-row downgrade flag: intake `quality` wins ("ok" | "degraded"
 * | "stale" | "invalid" is the persisted vocabulary), then a canonical
 * "invalid"/"stale" source value. Returns null when the row carries no
 * explicit flag. Only ever downgrades — an "ok"/unknown flag grants nothing.
 */
function explicitRowFlag(r: BuildTentSnapshotInput): "invalid" | "stale" | "degraded" | null {
  const q = (r.quality ?? "").toString().toLowerCase().trim();
  if (q === "invalid") return "invalid";
  if (q === "stale") return "stale";
  if (q === "degraded") return "degraded";
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
  provenanceEligible: false,
  canAssessStage: false,
  metrics: [],
};

type TentSnapshotProvenance = "live" | "manual" | "csv" | "demo" | "unverified";

function classifyRowProvenance(row: BuildTentSnapshotInput): TentSnapshotProvenance {
  if (isDiagnosticSensorProvenanceRow(row)) return "demo";
  const source = typeof row.source === "string" ? row.source.trim().toLowerCase() : "";
  if (source === "live" || source === "pi_bridge") return "live";
  if (source === "manual") return "manual";
  if (source === "csv" || source === "import") return "csv";
  if (source === "demo" || source === "sim") return "demo";
  return "unverified";
}

/**
 * Resolve only a source-coherent latest group. Mixing source classes is
 * unverified even when each individual row looks plausible.
 */
function classifyLatestGroupProvenance(
  rows: readonly BuildTentSnapshotInput[],
): TentSnapshotProvenance {
  const classes = new Set(rows.map(classifyRowProvenance));
  if (classes.size !== 1) return "unverified";
  return classes.values().next().value ?? "unverified";
}

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
  /**
   * The tent's canonical VPD, as the Dashboard's Tonight card derives it
   * (VER-189, docs/specs/dashboard-canonical-tent-vpd.md; #2268). It replaces
   * the latest-cohort stored vpd_kpa. From the cohort's own capture it is
   * graded like the cohort's other metrics. From any other capture it is
   * graded and labelled with its own source and age, never the cohort's
   * (Codex P1 on #2303). Omitted, the stored value is used.
   */
  canonicalVpd?: CanonicalTentVpd | null;
}

/** The Dashboard Tonight VPD for a tent, with its own provenance. */
export interface CanonicalTentVpd {
  /** Null only on a rejected result whose capture Tonight withheld as invalid. */
  kpa: number | null;
  capturedAt: string | null;
  /** Canonical source of the VPD's own capture (live / manual / csv / demo / stale / invalid). */
  source: string | null;
  sourceLabel: string | null;
  ageText: string | null;
  /**
   * True when the capture behind this VPD failed the capture gate (an
   * unrealistic or quality-flagged same-instant temperature or RH, or
   * unrealistic contributors). The value is never shown as the canonical VPD;
   * at the cohort's own instant the cohort's stored VPD is withheld as Invalid
   * too (Codex P1 on #2303 at 108e3eab).
   */
  rejected?: boolean;
  /**
   * True when Tonight could not read this tent's VPD at all (raw refresh and
   * snapshot read both failed). The stored VPD is then withheld rather than
   * restored as a healthy value (Copilot on #2303 at b49c32ae).
   */
  unavailable?: boolean;
  /**
   * The stored records behind the VPD (`sensorCaptureRefRules`); null entries
   * are unknown. Decides whether it is the cohort's own capture.
   */
  captureRefs?: readonly (string | null)[];
}

/**
 * Sources whose canonical VPD may read healthy. CSV is historical context and
 * never turns a badge or stage target green (`isDashboardSnapshotEligibleForHealthyCues`
 * in dashboardSensorEvidenceRules; Codex P1 on #2303 at d6ef3a20).
 */
const CANONICAL_HEALTHY_SOURCES = new Set(["live", "manual"]);

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const aMs = Date.parse(a);
  return Number.isFinite(aMs) && aMs === Date.parse(b);
}

/** True when `a` is a known instant strictly before `b`; unknown is never older. */
function olderThan(a: string | null | undefined, b: string | null | undefined): boolean {
  const aMs = a ? Date.parse(a) : Number.NaN;
  const bMs = b ? Date.parse(b) : Number.NaN;
  return Number.isFinite(aMs) && Number.isFinite(bMs) && aMs < bMs;
}

function ownCaptureVpdMetric(
  canonical: CanonicalTentVpd & { kpa: number },
  stage: string | null | undefined,
  now: number,
): MetricView {
  const chipStatus = vpdMetricChipStatus(classifyVpdAgainstStage({ value: canonical.kpa, stage }));
  let status: MetricStatus = "ok";
  let word: string | null = null;
  // The shared realism range, as the Tent Detail resolver uses, so a VPD from
  // another capture cannot read as current when sensor truth rejects it
  // (Codex P1 on #2303 at 69de43db).
  if (!classifyManualMetric("vpd_kpa", canonical.kpa).valid || canonical.source === "invalid") {
    status = "invalid";
    word = "Invalid";
  } else if (
    canonical.source === "stale" ||
    canonical.capturedAt === null ||
    isStale(canonical.capturedAt, now, undefined, canonical.source ?? undefined)
  ) {
    status = "stale";
    word = "Stale";
  } else if (canonical.source === "csv" || canonical.source === "diary") {
    // CSV and generic diary snapshots are historical context, never a
    // healthy cue (Codex P1 on #2303 at d6ef3a20 and 4bd3fae7).
    status = "degraded";
    word = "Historical";
  } else if (canonical.source === null || !CANONICAL_HEALTHY_SOURCES.has(canonical.source)) {
    status = "degraded";
    word = "Needs verification";
  }
  const statusLabel = [word ?? canonical.sourceLabel ?? "Unknown source", canonical.ageText]
    .filter((part): part is string => !!part)
    .join(" · ");
  return {
    key: "vpd",
    label: "VPD",
    display: formatNumber(canonical.kpa, 2),
    unit: " kPa",
    chipStatus:
      status === "invalid"
        ? "bad"
        : (status === "stale" || status === "degraded") && chipStatus === "ok"
          ? "warn"
          : chipStatus,
    status,
    statusLabel,
  };
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
  const latestRows = rows.filter((r) => resolveSensorObservationTime(r) === snap.ts);
  const canonical =
    options.canonicalVpd != null &&
    (Number.isFinite(options.canonicalVpd.kpa) ||
      options.canonicalVpd.rejected === true ||
      options.canonicalVpd.unavailable === true)
      ? options.canonicalVpd
      : null;
  // Source resolution is strict across the whole latest timestamp. A mixed
  // or unknown cohort stays visible but is never promoted to healthy/live.
  // `pi_bridge` remains the one explicit legacy alias for physical live
  // readings; diagnostics carrying that label are classified as demo first.
  const provenance = classifyLatestGroupProvenance(latestRows);
  const canonicalRejected = canonical?.rejected === true;
  // The canonical VPD is the cohort's own capture only when it comes from one
  // of the cohort's own records (Codex P1 on #2303 at fa8edcff). With an
  // unknown identity on either side it must share both the instant and the
  // source (Codex P1 at be0fe2f5); a matching timestamp alone never makes it
  // the cohort's capture.
  const cohortRefs = latestRows.map(rowCaptureRef);
  const sameCapture =
    canonical !== null &&
    sameInstant(canonical.capturedAt, snap.ts) &&
    (captureRefsKnown(canonical.captureRefs) && captureRefsKnown(cohortRefs)
      ? canonical.captureRefs.some((ref) => cohortRefs.includes(ref))
      : canonical.source !== null && canonical.source === provenance);
  const useCanonicalVpd = sameCapture && !canonicalRejected;
  // The capture gate rejected the cohort's own capture: its stored VPD is the
  // rejected reading and must not fall back to "ok" (Codex P1 at 108e3eab).
  const cohortVpdRejected = sameCapture && canonicalRejected;
  const vpdKpa =
    canonical?.unavailable === true
      ? null
      : useCanonicalVpd && canonical
        ? canonical.kpa
        : snap.vpd;
  const canonicalSource: SensorReadingSource | null =
    provenance === "live" || provenance === "manual" || provenance === "csv"
      ? provenance
      : provenance === "demo"
        ? "demo"
        : null;
  const provenanceEligible =
    provenance === "live" || provenance === "manual" || provenance === "csv";

  const vendor = pickVendor(latestRows);
  const resolved = resolveSensorSourceLabel({
    source: canonicalSource,
    vendor,
  });

  const capturedAt = resolveCapturedAt(latestRows, snap.ts);
  const quality = evaluateSensorQuality(useCanonicalVpd ? { ...snap, vpd: vpdKpa } : snap, now);
  // Explicit intake flags on the contributing rows are authoritative
  // downgrades: flagged-invalid data must never render OK/Live and
  // flagged-stale data must never render fresh, regardless of how
  // plausible the values look or how recent the timestamp is.
  const flaggedInvalid = latestRows.some((r) => explicitRowFlag(r) === "invalid");
  const flaggedStale = latestRows.some((r) => explicitRowFlag(r) === "stale");
  const flaggedDegraded = latestRows.some((r) => explicitRowFlag(r) === "degraded");
  const stale =
    flaggedStale ||
    (!!capturedAt && isStale(capturedAt, now, undefined, canonicalSource ?? provenance));
  // Beyond explicit flags, "Invalid" is reserved for present-but-implausible
  // values. evaluateSensorQuality also marks an absent VPD as suspicious
  // (review hint for the quality card), but a missing metric is
  // unknown/no-data — it must not relabel an otherwise-honest
  // Stale/Manual/CSV snapshot as Invalid.
  // A canonical VPD from the cohort's own capture is graded here, not in
  // ownCaptureVpdMetric, so it needs the same shared realism range: 3–5 kPa
  // passes evaluateSensorQuality's 0..5 but sensor truth rejects it
  // (Codex P1 on #2303 at 85ec1e78).
  const canonicalVpdInvalid =
    useCanonicalVpd && typeof vpdKpa === "number" && !classifyManualMetric("vpd_kpa", vpdKpa).valid;
  // A VPD Tonight derived from a CSV capture is historical context on this
  // path too, never a healthy cue (Codex P1 on #2303 at 3d1e5800).
  const canonicalVpdHistorical =
    useCanonicalVpd && (canonical?.source === "csv" || canonical?.source === "diary");
  const invalid =
    flaggedInvalid ||
    canonicalVpdInvalid ||
    (cohortVpdRejected && typeof vpdKpa === "number") ||
    quality.suspiciousFields.some((f) => typeof snap[f as keyof typeof snap] === "number");
  const canAssessStage =
    provenanceEligible && capturedAt !== null && !stale && !invalid && !flaggedDegraded;

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
    } else if (
      rowFlag === "invalid" ||
      quality.suspiciousFields.includes(suspiciousKey) ||
      (key === "vpd" && (canonicalVpdInvalid || cohortVpdRejected))
    ) {
      status = "invalid";
      statusLabel = "Invalid";
    } else if (stale || rowFlag === "stale") {
      status = "stale";
      statusLabel = "Stale";
    } else if (key === "vpd" && canonicalVpdHistorical) {
      status = "degraded";
      statusLabel = "Historical";
    } else if (rowFlag === "degraded") {
      status = "degraded";
      statusLabel = "Degraded";
    } else if (!provenanceEligible || capturedAt === null) {
      status = "degraded";
      statusLabel = "Needs verification";
    }
    // Cap the chip color by status so a flagged metric can never render
    // as a healthy green chip beside an Invalid/Stale/Degraded label.
    const cappedChipStatus: "ok" | "warn" | "bad" =
      status === "invalid"
        ? "bad"
        : (status === "stale" || status === "degraded") && chipStatus === "ok"
          ? "warn"
          : chipStatus;
    return {
      key,
      label,
      display: formatNumber(value, digits),
      unit,
      chipStatus: cappedChipStatus,
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
      vpdKpa,
      " kPa",
      vpdMetricChipStatus(classifyVpdAgainstStage({ value: vpdKpa ?? null, stage })),
      "vpd",
      2,
    ),
  ];

  // A canonical VPD from another capture keeps its own source and age.
  if (canonical !== null && !canonicalRejected && !useCanonicalVpd && canonical.kpa !== null) {
    metrics[2] = ownCaptureVpdMetric({ ...canonical, kpa: canonical.kpa }, stage, now);
  }
  // A rejected canonical VPD from a capture no older than the cohort is the
  // tent's latest VPD evidence: the cohort's older stored VPD must not stand
  // in for it as a healthy value (Codex P1 on #2303 at 3e689090).
  if (
    canonical !== null &&
    canonicalRejected &&
    !sameCapture &&
    !olderThan(canonical.capturedAt, snap.ts)
  ) {
    metrics[2] = {
      key: "vpd",
      label: "VPD",
      display: formatNumber(null, 2),
      unit: " kPa",
      chipStatus: "bad",
      status: "invalid",
      statusLabel: ["Invalid", canonical.ageText]
        .filter((part): part is string => !!part)
        .join(" · "),
    };
  }

  return {
    hasReading: true,
    sourceLabel,
    lastUpdatedIso: capturedAt,
    lastUpdatedDisplay,
    stale,
    invalid,
    provenanceEligible,
    canAssessStage,
    metrics,
  };
}
