/**
 * sensorSnapshotTrustBadgeRules — pure presenter rules that convert a
 * normalized snapshot trust signal into a Quick Log badge.
 *
 * Trust is decoupled from provider identity. The badge surfaces only:
 *   Live | Stale | Invalid | Manual | Demo | CSV
 *
 * Provider identity (Ecowitt, Home Assistant, MQTT, ...) is rendered
 * separately by `deriveProviderLabel`. `ecowitt_mqtt` is never shown as
 * a trust state.
 *
 * Stale / invalid snapshots can never be "attachable as healthy live"
 * context. Unknown telemetry never resolves to Live.
 *
 * No I/O. No React. No Supabase.
 */

import { deriveProviderLabel } from "@/constants/sensorProviderLabels";
import type { SensorSnapshotStatus as StrictSnapshotStatus } from "@/lib/latestSensorSnapshotRules";

export type SnapshotTrustBadge =
  | "live"
  | "stale"
  | "invalid"
  | "manual"
  | "demo"
  | "csv";

export interface SnapshotTrustBadgeView {
  badge: SnapshotTrustBadge;
  label: string;
  /** Trust helper copy. Never claims live for unknown/bad telemetry. */
  helper: string;
  /** True when this snapshot may be attached to a Quick Log as live context. */
  attachable: boolean;
  /** Optional provider chip (e.g. "EcoWitt"). Never used to imply Live. */
  providerLabel: string | null;
  /** Underlying severity tier the presenter can color against. */
  severity: "ok" | "info" | "warn" | "error";
}

export interface SnapshotTrustInput {
  /** Strict resolver status when available — the source of truth for live/stale/invalid. */
  resolverStatus?: StrictSnapshotStatus | null;
  /** Raw source label from the underlying reading. */
  source?: string | null;
  /** True when the snapshot is empty or no rows exist. */
  empty?: boolean;
}

const HELPER: Record<SnapshotTrustBadge, string> = {
  live: "Fresh validated sensor reading",
  stale: "Reading is too old to treat as current",
  invalid: "Reading failed validation",
  manual: "Entered by grower",
  demo: "Sample data, not real sensor telemetry",
  csv: "Imported reading",
};

const LABEL: Record<SnapshotTrustBadge, string> = {
  live: "Live",
  stale: "Stale",
  invalid: "Invalid",
  manual: "Manual",
  demo: "Demo",
  csv: "CSV",
};

const SEVERITY: Record<SnapshotTrustBadge, SnapshotTrustBadgeView["severity"]> = {
  live: "ok",
  stale: "warn",
  invalid: "error",
  manual: "info",
  demo: "info",
  csv: "info",
};

const ATTACHABLE: Record<SnapshotTrustBadge, boolean> = {
  live: true,
  stale: false,
  invalid: false,
  manual: true,
  demo: false,
  csv: true,
};

/**
 * Classify a snapshot's trust badge. Resolver status (when present)
 * dominates: only `fresh_live` ever resolves to Live. Provider/vendor
 * identity strings are rendered as the provider chip and never as a trust label.
 */
export function classifySnapshotTrustBadge(
  input: SnapshotTrustInput,
): SnapshotTrustBadgeView {
  const src = (input.source ?? "").toString().trim().toLowerCase();
  const providerLabel = deriveProviderLabel(input.source ?? null);

  // Resolver-driven path wins when present.
  if (input.resolverStatus) {
    switch (input.resolverStatus) {
      case "fresh_live":
        return view("live", providerLabel);
      case "fresh_non_live":
        // Fresh but the row was not resolver-live (e.g. CSV/manual import).
        return view(mapNonLiveSource(src), providerLabel);
      case "stale":
        return view("stale", providerLabel);
      case "invalid":
        return view("invalid", providerLabel);
      case "empty":
      default:
        return view("invalid", providerLabel);
    }
  }

  if (input.empty) return view("invalid", providerLabel);

  // No resolver status — fall back to source heuristics, defensively.
  switch (src) {
    case "manual":
      return view("manual", providerLabel);
    case "csv":
    case "import":
      return view("csv", providerLabel);
    case "demo":
    case "sim":
      return view("demo", providerLabel);
    case "stale":
      return view("stale", providerLabel);
    case "invalid":
    case "unavailable":
    case "":
      return view("invalid", providerLabel);
    case "live":
      // We refuse to promote "live" without a resolver verdict.
      return view("invalid", providerLabel);
    default:
      // Any vendor/provider key (ecowitt, ecowitt_mqtt, mqtt, ...) is
      // NOT a trust label — never auto-promote to Live.
      return view("invalid", providerLabel);
  }
}

function mapNonLiveSource(src: string): SnapshotTrustBadge {
  switch (src) {
    case "manual":
      return "manual";
    case "csv":
    case "import":
      return "csv";
    case "demo":
    case "sim":
      return "demo";
    default:
      return "stale";
  }
}

function view(
  badge: SnapshotTrustBadge,
  providerLabel: string | null,
): SnapshotTrustBadgeView {
  return {
    badge,
    label: LABEL[badge],
    helper: HELPER[badge],
    attachable: ATTACHABLE[badge],
    providerLabel,
    severity: SEVERITY[badge],
  };
}
