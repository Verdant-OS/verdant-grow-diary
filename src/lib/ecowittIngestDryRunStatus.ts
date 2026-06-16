// Pure deterministic explanation helper for the EcoWitt dry-run can_send_later
// status. Surfaces the exact taxonomy triggers without duplicating rule tables.
//
// SAFETY: read-only. No I/O. No Supabase. No network.

import { CanonicalEcowittTentSnapshot } from "./ecowittTentSnapshot";
import { EcowittIngestDryRunResult } from "./ecowittIngestDryRun";

export interface EcowittDryRunStatusTrigger {
  /** Exact taxonomy string from blocked_reasons or warnings. */
  trigger: string;
  /** Short human explanation. */
  explanation: string;
}

export interface EcowittDryRunStatusExplanation {
  can_send_later: boolean;
  state: "pass" | "blocked";
  blockers: readonly EcowittDryRunStatusTrigger[];
  warnings: readonly EcowittDryRunStatusTrigger[];
  /** When pass, the positive reasons (required metrics present, source ok, etc.). */
  pass_reasons: readonly EcowittDryRunStatusTrigger[];
}

function explain(trigger: string): string {
  if (trigger === "source_invalid") {
    return "Canonical source is invalid. Cannot become future-ingest ready.";
  }
  if (trigger.startsWith("missing_required_metric:")) {
    const metric = trigger.split(":")[1];
    return `Required metric ${metric} is missing. Snapshot cannot be marked sendable.`;
  }
  if (trigger.startsWith("invalid_reason:")) {
    const r = trigger.slice("invalid_reason:".length);
    return `Normalizer reported invalid reason: ${r}.`;
  }
  if (trigger.startsWith("stale_snapshot:")) {
    return "Snapshot age exceeds the freshness window. Do not treat as current.";
  }
  if (trigger === "non_uuid_tent_id_preview_only") {
    return "Tent context is a placeholder / non-UUID. Real ingest later requires a real UUID-backed tent.";
  }
  if (trigger === "source_degraded") {
    return "Canonical source is degraded. Partially trustworthy.";
  }
  if (trigger.startsWith("degraded_reason:")) {
    const r = trigger.slice("degraded_reason:".length);
    return `Normalizer reported degraded reason: ${r}.`;
  }
  if (trigger === "placeholder_device_identity") {
    return "Device identity is unset. Not traceable for real ingest yet.";
  }
  if (trigger.startsWith("optional_metric_missing:")) {
    const metric = trigger.slice("optional_metric_missing:".length);
    return `Optional metric ${metric} is missing. Does not block.`;
  }
  if (trigger === "manual_or_csv_not_live") {
    return "Source is not live. Must not be displayed or described as live.";
  }
  return "Reviewed.";
}

export function buildEcowittDryRunStatusExplanation(
  snap: CanonicalEcowittTentSnapshot,
  dry: EcowittIngestDryRunResult,
): EcowittDryRunStatusExplanation {
  const blockers = dry.blocked_reasons.map((t) => ({
    trigger: t,
    explanation: explain(t),
  }));
  const warnings = dry.warnings.map((t) => ({
    trigger: t,
    explanation: explain(t),
  }));

  const pass_reasons: EcowittDryRunStatusTrigger[] = [];
  if (dry.can_send_later) {
    if (snap.metrics.air_temp_f !== null) {
      pass_reasons.push({
        trigger: "required_metric_present:air_temp_f",
        explanation: "Required metric air_temp_f is present.",
      });
    }
    if (snap.metrics.humidity_pct !== null) {
      pass_reasons.push({
        trigger: "required_metric_present:humidity_pct",
        explanation: "Required metric humidity_pct is present.",
      });
    }
    if (snap.source !== "invalid") {
      pass_reasons.push({
        trigger: "source_not_invalid",
        explanation: "Source is not invalid.",
      });
    }
    if (!dry.blocked_reasons.some((b) => b.startsWith("stale_snapshot:"))) {
      pass_reasons.push({
        trigger: "snapshot_not_stale",
        explanation: "Snapshot is within the freshness window.",
      });
    }
    if (snap.invalid_reasons.length === 0) {
      pass_reasons.push({
        trigger: "no_invalid_reasons",
        explanation: "Normalizer reported no invalid reasons.",
      });
    }
    if (!dry.blocked_reasons.includes("non_uuid_tent_id_preview_only")) {
      pass_reasons.push({
        trigger: "no_blocking_identity_rule",
        explanation: "No blocking identity rule is active.",
      });
    }
  }

  return {
    can_send_later: dry.can_send_later,
    state: dry.can_send_later ? "pass" : "blocked",
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    pass_reasons: Object.freeze(pass_reasons),
  };
}
