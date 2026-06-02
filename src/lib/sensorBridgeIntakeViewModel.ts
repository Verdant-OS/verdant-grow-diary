/**
 * Sensor Bridge Intake — pure view-model for status surfaces.
 *
 * Maps a BridgeIntakeResult (or "no intake yet" state) into a deterministic,
 * UI-ready descriptor. Never executes I/O. Never implies automation or
 * device control. Always includes a "No device control" disclosure.
 */

import type {
  BridgeIntakeReasonCode,
  BridgeIntakeResolvedSource,
  BridgeIntakeResult,
  BridgeIntakeSuspicionCode,
} from "@/lib/sensorBridgeIntakeRules";

export type BridgeIntakeStatusSeverity =
  | "info"
  | "watch"
  | "warning"
  | "good";

export interface BridgeIntakeStatusViewModel {
  label: string;
  severity: BridgeIntakeStatusSeverity;
  resolvedSource: BridgeIntakeResolvedSource | null;
  message: string;
  /** Always present; this layer never controls devices. */
  controlDisclosure: string;
  lastAcceptedAtIso: string | null;
  lastRejectedReasonCode: BridgeIntakeReasonCode | null;
  suspicionCodes: BridgeIntakeSuspicionCode[];
  isAccepted: boolean;
}

const CONTROL_DISCLOSURE = "No device control. Readings are observed only.";

const SOURCE_LABELS: Record<BridgeIntakeResolvedSource, string> = {
  live: "Live (bridge)",
  manual: "Manual entry",
  csv: "CSV import",
  demo: "Demo data",
  stale: "Stale reading",
  invalid: "Invalid reading",
};

const SOURCE_SEVERITY: Record<
  BridgeIntakeResolvedSource,
  BridgeIntakeStatusSeverity
> = {
  live: "good",
  manual: "info",
  csv: "info",
  demo: "info",
  stale: "watch",
  invalid: "warning",
};

export interface BridgeIntakeStatusInput {
  /** Most recent intake result (accepted OR rejected), or null if none yet. */
  lastResult?: BridgeIntakeResult | null;
}

export function buildBridgeIntakeStatusViewModel(
  input: BridgeIntakeStatusInput,
): BridgeIntakeStatusViewModel {
  const last = input.lastResult ?? null;

  if (!last) {
    return {
      label: "No bridge intake yet",
      severity: "info",
      resolvedSource: null,
      message:
        "No external bridge reading has been received. Manual snapshots and existing sensors are unaffected.",
      controlDisclosure: CONTROL_DISCLOSURE,
      lastAcceptedAtIso: null,
      lastRejectedReasonCode: null,
      suspicionCodes: [],
      isAccepted: false,
    };
  }

  const isAccepted = last.ok && last.resolved_source !== "invalid";
  const resolved = last.resolved_source;
  const label = SOURCE_LABELS[resolved];
  const severity = SOURCE_SEVERITY[resolved];

  const firstFailureReason =
    !isAccepted
      ? (last.reasons.find((r) => r !== "ok") ?? null)
      : null;

  const message = isAccepted
    ? buildAcceptedMessage(resolved, last.suspicions)
    : "Last bridge reading was rejected. No data was stored.";

  return {
    label,
    severity,
    resolvedSource: resolved,
    message,
    controlDisclosure: CONTROL_DISCLOSURE,
    lastAcceptedAtIso: isAccepted ? last.captured_at : null,
    lastRejectedReasonCode: firstFailureReason,
    suspicionCodes: last.suspicions,
    isAccepted,
  };
}

function buildAcceptedMessage(
  resolved: BridgeIntakeResolvedSource,
  suspicions: BridgeIntakeSuspicionCode[],
): string {
  switch (resolved) {
    case "live":
      return "Bridge reading accepted and fresh.";
    case "stale":
      return "Bridge reading accepted but older than the freshness window.";
    case "manual":
      return "Manual bridge entry accepted.";
    case "csv":
      return "CSV bridge entry accepted.";
    case "demo":
      return "Demo bridge reading accepted. Not used for healthy classification.";
    case "invalid":
      return "Bridge reading was invalid.";
    default: {
      const _exhaustive: never = resolved;
      void _exhaustive;
      return suspicions.length > 0
        ? "Bridge reading accepted with caution."
        : "Bridge reading accepted.";
    }
  }
}
