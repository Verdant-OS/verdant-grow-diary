/**
 * environmentCheckViewModel — pure presenter model for Environment Check
 * diary entries.
 *
 * Contract:
 *  - Pure. No I/O, no React, no Supabase, no fetch, no timers, no
 *    automation, no device control.
 *  - Consumes resolved snapshot-like inputs only.
 *  - Surfaces greenhouse rule results (VPD, condensation, DLI, root-zone)
 *    as a deterministic display model.
 *  - DST-ambiguous windows are surfaced explicitly — never styled as
 *    healthy.
 *  - Stale / invalid / unknown telemetry is review-required or invalid —
 *    never healthy.
 *  - Returned objects MUST NOT contain `command`, `device_id`,
 *    `action_queue`, `control`, `relay`, or `execute` keys.
 */
import {
  assessVpd,
  calculateVpdKpa,
  detectSunsetCondensationRisk,
  type ClimateSample,
  type VpdBand,
} from "./greenhouseClimateRules";
import {
  aggregateDli,
  normalizeGreenhouseSource,
  type GreenhouseSource,
  type PpfdSample,
} from "./greenhouseLightRules";
import {
  assessRootZoneEc,
  type RootZoneEcInput,
} from "./greenhouseRootZoneRules";

export type EnvironmentCheckDiaryStatus =
  | "valid"
  | "invalid"
  | "dst_ambiguous"
  | "review_required";

export type EnvironmentCheckTone =
  | "success"
  | "warning"
  | "danger"
  | "neutral";

export interface EnvironmentCheckRuleAnnotation {
  ruleId: string;
  label: string;
  status: EnvironmentCheckDiaryStatus;
  message: string;
  metricKeys: string[];
}

export interface EnvironmentCheckMetricSummary {
  metricKey: string;
  label: string;
  valueLabel: string;
  status: EnvironmentCheckDiaryStatus;
}

export interface EnvironmentCheckDiaryViewModel {
  entryId: string;
  occurredAt: string;
  status: EnvironmentCheckDiaryStatus;
  statusLabel: string;
  statusTone: EnvironmentCheckTone;
  ruleAnnotations: EnvironmentCheckRuleAnnotation[];
  reviewPrompt: string | null;
  sourceLabel: GreenhouseSource;
  snapshotSummary: EnvironmentCheckMetricSummary[];
}

export interface EnvironmentCheckSnapshotInput {
  /** Resolved snapshot source label. */
  source?: unknown;
  tempC?: number | null;
  rhPercent?: number | null;
  vpdKpa?: number | null;
  vpdBand?: VpdBand | null;
  /** Optional surrounding climate window (for condensation review). */
  climateSamples?: ReadonlyArray<ClimateSample> | null;
  /** Optional 24h PPFD samples (for DLI). */
  ppfdSamples?: ReadonlyArray<PpfdSample> | null;
  /** IANA timezone for DLI window. */
  tzIana?: string | null;
  /** Optional root-zone inputs. */
  rootZone?: RootZoneEcInput | null;
}

export interface EnvironmentCheckEntryInput {
  entryId: string;
  occurredAt: string;
  kind: string;
  snapshot?: EnvironmentCheckSnapshotInput | null;
}

const STATUS_LABEL: Record<EnvironmentCheckDiaryStatus, string> = {
  valid: "Environment check valid",
  review_required: "Environment check needs review",
  dst_ambiguous: "DST-ambiguous window — review before acting",
  invalid: "Invalid environment data — do not use for decisions",
};

const STATUS_TONE: Record<EnvironmentCheckDiaryStatus, EnvironmentCheckTone> = {
  valid: "success",
  review_required: "warning",
  dst_ambiguous: "warning",
  invalid: "danger",
};

const STATUS_RANK: Record<EnvironmentCheckDiaryStatus, number> = {
  valid: 0,
  review_required: 1,
  dst_ambiguous: 2,
  invalid: 3,
};

const REVIEW_SOURCES: ReadonlySet<GreenhouseSource> = new Set<GreenhouseSource>([
  "stale",
  "demo",
]);

export function isEnvironmentCheckKind(kind: string | null | undefined): boolean {
  if (!kind) return false;
  const k = String(kind).toLowerCase();
  return (
    k === "environment" ||
    k === "environment_check" ||
    k === "sensor-snapshot" ||
    k === "sensor_snapshot" ||
    k === "measurement"
  );
}

function escalate(
  a: EnvironmentCheckDiaryStatus,
  b: EnvironmentCheckDiaryStatus,
): EnvironmentCheckDiaryStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

function fmtNumber(n: number | null | undefined, digits = 1, unit = ""): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${unit}`;
}

/**
 * Build the deterministic Environment Check view model for a diary entry.
 *
 * Safe defaults:
 *  - No snapshot → review_required (nothing to verify).
 *  - Source is stale/invalid/demo → review_required (or invalid).
 *  - DST-ambiguous DLI/dark-window → dst_ambiguous (never styled valid).
 */
export function buildEnvironmentCheckDiaryViewModel(
  entry: EnvironmentCheckEntryInput,
): EnvironmentCheckDiaryViewModel {
  const snapshot = entry.snapshot ?? null;
  const sourceLabel = normalizeGreenhouseSource(snapshot?.source);

  const annotations: EnvironmentCheckRuleAnnotation[] = [];
  const metrics: EnvironmentCheckMetricSummary[] = [];
  let overall: EnvironmentCheckDiaryStatus = "valid";

  if (!snapshot) {
    return {
      entryId: entry.entryId,
      occurredAt: entry.occurredAt,
      status: "review_required",
      statusLabel: STATUS_LABEL.review_required,
      statusTone: STATUS_TONE.review_required,
      ruleAnnotations: [
        {
          ruleId: "snapshot.missing",
          label: "Snapshot missing",
          status: "review_required",
          message: "No environment snapshot attached to this entry.",
          metricKeys: [],
        },
      ],
      reviewPrompt: "Attach a sensor snapshot or manual reading to verify this entry.",
      sourceLabel,
      snapshotSummary: [],
    };
  }

  // Source gating.
  if (sourceLabel === "invalid") {
    overall = escalate(overall, "invalid");
    annotations.push({
      ruleId: "source.invalid",
      label: "Telemetry source invalid",
      status: "invalid",
      message: "Source label is invalid — do not use this snapshot for decisions.",
      metricKeys: [],
    });
  } else if (REVIEW_SOURCES.has(sourceLabel)) {
    overall = escalate(overall, "review_required");
    annotations.push({
      ruleId: "source.review",
      label: `Source: ${sourceLabel}`,
      status: "review_required",
      message: `Source labeled "${sourceLabel}" — verify before acting.`,
      metricKeys: [],
    });
  }

  // VPD assessment.
  const vpd =
    typeof snapshot.vpdKpa === "number" && Number.isFinite(snapshot.vpdKpa)
      ? snapshot.vpdKpa
      : calculateVpdKpa({
          tempC: snapshot.tempC ?? null,
          rhPercent: snapshot.rhPercent ?? null,
        });

  if (typeof snapshot.tempC === "number") {
    metrics.push({
      metricKey: "temp_c",
      label: "Air temp",
      valueLabel: fmtNumber(snapshot.tempC, 1, "°C"),
      status: sourceLabel === "invalid" ? "invalid" : "valid",
    });
  }
  if (typeof snapshot.rhPercent === "number") {
    metrics.push({
      metricKey: "rh_percent",
      label: "RH",
      valueLabel: fmtNumber(snapshot.rhPercent, 0, "%"),
      status: sourceLabel === "invalid" ? "invalid" : "valid",
    });
  }

  if (vpd !== null) {
    const vpdRes = assessVpd({
      vpdKpa: vpd,
      source: snapshot.source,
      band: snapshot.vpdBand ?? null,
    });
    let vpdStatus: EnvironmentCheckDiaryStatus = "valid";
    let msg = "VPD within target band.";
    if (vpdRes.status === "unknown") {
      vpdStatus = sourceLabel === "invalid" ? "invalid" : "review_required";
      msg = "VPD could not be assessed for this source.";
    } else if (vpdRes.status !== "in_band") {
      vpdStatus = "review_required";
      msg =
        vpdRes.status === "low"
          ? "VPD below target — review before acting."
          : "VPD above target — review before acting.";
    }
    annotations.push({
      ruleId: "climate.vpd",
      label: "VPD",
      status: vpdStatus,
      message: msg,
      metricKeys: ["temp_c", "rh_percent", "vpd_kpa"],
    });
    metrics.push({
      metricKey: "vpd_kpa",
      label: "VPD",
      valueLabel: fmtNumber(vpd, 2, " kPa"),
      status: vpdStatus,
    });
    overall = escalate(overall, vpdStatus);
  }

  // Condensation review.
  if (snapshot.climateSamples && snapshot.climateSamples.length > 0) {
    const cond = detectSunsetCondensationRisk(snapshot.climateSamples);
    if (cond.status === "review") {
      annotations.push({
        ruleId: "climate.condensation",
        label: "Sunset condensation",
        status: "review_required",
        message: "Falling temperature with high RH — review for condensation.",
        metricKeys: ["temp_c", "rh_percent"],
      });
      overall = escalate(overall, "review_required");
    } else if (cond.status === "invalid") {
      annotations.push({
        ruleId: "climate.condensation",
        label: "Sunset condensation",
        status: "invalid",
        message: "No healthy climate samples in the window.",
        metricKeys: ["temp_c", "rh_percent"],
      });
      overall = escalate(overall, "invalid");
    }
  }

  // DLI / dark-window.
  if (snapshot.ppfdSamples && snapshot.ppfdSamples.length > 0) {
    const dli = aggregateDli({
      samples: snapshot.ppfdSamples,
      tzIana: snapshot.tzIana ?? null,
    });
    let dliStatus: EnvironmentCheckDiaryStatus = "valid";
    let msg = `DLI window healthy${
      typeof dli.dliMolPerM2 === "number" ? ` (${dli.dliMolPerM2.toFixed(1)} mol/m²/day)` : ""
    }.`;
    if (dli.windowStatus === "dst_ambiguous") {
      dliStatus = "dst_ambiguous";
      msg = "DLI window crosses a DST transition — review before acting.";
    } else if (dli.windowStatus === "invalid_timezone") {
      dliStatus = "invalid";
      msg = "DLI window has an invalid timezone — do not use for decisions.";
    } else if (dli.windowStatus !== "ok") {
      dliStatus = "review_required";
      msg = "DLI window incomplete — review before acting.";
    }
    annotations.push({
      ruleId: "light.dli",
      label: "DLI",
      status: dliStatus,
      message: msg,
      metricKeys: ["ppfd", "dli"],
    });
    if (typeof dli.dliMolPerM2 === "number") {
      metrics.push({
        metricKey: "dli",
        label: "DLI",
        valueLabel: `${dli.dliMolPerM2.toFixed(1)} mol/m²/day`,
        status: dliStatus,
      });
    }
    overall = escalate(overall, dliStatus);
  }

  // Root zone.
  if (snapshot.rootZone) {
    const rz = assessRootZoneEc(snapshot.rootZone);
    let rzStatus: EnvironmentCheckDiaryStatus = "valid";
    let msg = "Root-zone EC delta in normal range.";
    if (rz.status === "review") {
      rzStatus = "review_required";
      msg = "Root-zone EC delta elevated — review before acting.";
    } else if (rz.status === "risk") {
      rzStatus = "review_required";
      msg = "Root-zone EC delta is large — inspect root zone before acting.";
    } else if (rz.status === "unknown") {
      rzStatus = "review_required";
      msg = "Root-zone EC not usable as a primary signal for this medium.";
    }
    annotations.push({
      ruleId: "rootzone.ec",
      label: "Root zone EC",
      status: rzStatus,
      message: msg,
      metricKeys: ["feed_ec", "runoff_ec"],
    });
    overall = escalate(overall, rzStatus);
  }

  // If nothing emitted any annotation, treat as review-required (nothing
  // verified rather than falsely valid).
  if (annotations.length === 0) {
    overall = escalate(overall, "review_required");
    annotations.push({
      ruleId: "snapshot.empty",
      label: "No metrics",
      status: "review_required",
      message: "Snapshot has no usable metrics to verify.",
      metricKeys: [],
    });
  }

  const reviewPrompt = buildReviewPrompt(overall, annotations);

  return {
    entryId: entry.entryId,
    occurredAt: entry.occurredAt,
    status: overall,
    statusLabel: STATUS_LABEL[overall],
    statusTone: STATUS_TONE[overall],
    ruleAnnotations: annotations,
    reviewPrompt,
    sourceLabel,
    snapshotSummary: metrics,
  };
}

function buildReviewPrompt(
  status: EnvironmentCheckDiaryStatus,
  annotations: EnvironmentCheckRuleAnnotation[],
): string | null {
  if (status === "valid") return null;
  if (status === "dst_ambiguous") {
    return "This window crosses a DST transition — verify timestamps before acting.";
  }
  if (status === "invalid") {
    return "This entry contains invalid environment data — do not use it for decisions.";
  }
  const first = annotations.find((a) => a.status !== "valid");
  return first?.message ?? "Review this entry before acting.";
}
