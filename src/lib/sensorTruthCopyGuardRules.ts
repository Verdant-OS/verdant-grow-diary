/**
 * Sensor Truth Copy Guard V0.
 *
 * One conservative copy layer for sensor-source + status wording.
 * This does not classify telemetry. It only answers what presenters may safely
 * say once source/status are already known.
 *
 * Hard safety rules:
 * - Unknown, stale, invalid, demo, and no-data telemetry never gets live/current/healthy copy.
 * - Manual and CSV readings may be useful context, but they are never described as live.
 * - Only source=live AND status=usable can use healthy-live language.
 *
 * No I/O. No React. No Supabase. No Date.now().
 */

import type { SnapshotStatus } from "@/lib/sensorSnapshotStatusContract";
import type { SourceBadgeTone } from "@/lib/sensorSourceLabelViewModel";

export type SensorTruthSourceTone = SourceBadgeTone;

export type SensorTruthContextVerdict =
  | "healthy_live"
  | "review_live"
  | "manual_context"
  | "historical_context"
  | "demo_blocked"
  | "stale_blocked"
  | "invalid_blocked"
  | "unknown_blocked"
  | "no_data";

export interface SensorTruthCopyGuardInput {
  sourceTone: SensorTruthSourceTone | string | null | undefined;
  status?: SnapshotStatus | null;
}

export interface SensorTruthCopyGuard {
  sourceTone: SensorTruthSourceTone;
  status: SnapshotStatus | "unknown";
  verdict: SensorTruthContextVerdict;
  label: string;
  helper: string;
  canDescribeAsLive: boolean;
  canDescribeAsCurrent: boolean;
  canDescribeAsHealthyLive: boolean;
  canUseAsContext: boolean;
}

const KNOWN_SOURCE_TONES: ReadonlySet<SensorTruthSourceTone> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "unknown",
]);

function normalizeSourceTone(
  value: SensorTruthCopyGuardInput["sourceTone"],
): SensorTruthSourceTone {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  return KNOWN_SOURCE_TONES.has(normalized as SensorTruthSourceTone)
    ? (normalized as SensorTruthSourceTone)
    : "unknown";
}

function normalizeStatus(
  status: SnapshotStatus | null | undefined,
): SensorTruthCopyGuard["status"] {
  return status ?? "unknown";
}

function build(
  input: Omit<SensorTruthCopyGuard, "canDescribeAsLive" | "canDescribeAsCurrent" | "canDescribeAsHealthyLive">,
): SensorTruthCopyGuard {
  const canDescribeAsHealthyLive = input.verdict === "healthy_live";
  return {
    ...input,
    canDescribeAsLive: canDescribeAsHealthyLive,
    canDescribeAsCurrent: canDescribeAsHealthyLive,
    canDescribeAsHealthyLive,
  };
}

export function buildSensorTruthCopyGuard(
  input: SensorTruthCopyGuardInput,
): SensorTruthCopyGuard {
  const sourceTone = normalizeSourceTone(input.sourceTone);
  const status = normalizeStatus(input.status);

  if (sourceTone === "live") {
    if (status === "usable") {
      return build({
        sourceTone,
        status,
        verdict: "healthy_live",
        label: "Live sensor · current",
        helper: "Fresh validated live telemetry. Safe to describe as current sensor context.",
        canUseAsContext: true,
      });
    }
    return build({
      sourceTone,
      status,
      verdict: status === "no_data" ? "no_data" : "review_live",
      label: status === "no_data" ? "No live data" : "Live source needs review",
      helper:
        status === "no_data"
          ? "No live sensor reading is available. Do not describe this as current."
          : "Live-source telemetry is not validated as usable. Do not describe this as healthy or current.",
      canUseAsContext: false,
    });
  }

  if (sourceTone === "manual") {
    return build({
      sourceTone,
      status,
      verdict: "manual_context",
      label: "Manual reading",
      helper: "Grower-entered reading. Useful context, but not live telemetry.",
      canUseAsContext: true,
    });
  }

  if (sourceTone === "csv") {
    return build({
      sourceTone,
      status,
      verdict: "historical_context",
      label: "CSV import",
      helper: "Imported historical reading. Useful for history, but not live telemetry.",
      canUseAsContext: true,
    });
  }

  if (sourceTone === "demo") {
    return build({
      sourceTone,
      status,
      verdict: "demo_blocked",
      label: "Demo data",
      helper: "Sample data only. Never describe this as real live telemetry.",
      canUseAsContext: false,
    });
  }

  if (sourceTone === "stale") {
    return build({
      sourceTone,
      status,
      verdict: "stale_blocked",
      label: "Stale reading",
      helper: "Reading is too old to treat as current. Re-check before acting.",
      canUseAsContext: false,
    });
  }

  if (sourceTone === "invalid") {
    return build({
      sourceTone,
      status,
      verdict: "invalid_blocked",
      label: "Invalid reading",
      helper: "Reading failed validation. Do not use it as healthy evidence.",
      canUseAsContext: false,
    });
  }

  return build({
    sourceTone: "unknown",
    status,
    verdict: status === "no_data" ? "no_data" : "unknown_blocked",
    label: status === "no_data" ? "No sensor data" : "Unknown source",
    helper:
      status === "no_data"
        ? "No sensor reading is available. Do not describe this as current."
        : "Source is unknown. Do not describe this as live, current, or healthy.",
    canUseAsContext: false,
  });
}
