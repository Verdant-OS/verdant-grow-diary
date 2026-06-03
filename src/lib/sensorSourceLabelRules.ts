/**
 * sensorSourceLabelRules — pure helper that resolves the user-facing
 * source label for a sensor reading/snapshot.
 *
 * Goal: keep source-label decisions out of JSX and prevent Ecowitt
 * hardware lineage from rendering as generic "Live."
 *
 * Hard constraints:
 *  - Pure function. No I/O. No React. No timers. No automation.
 *  - Does NOT change the underlying `source` enum or live-label logic.
 *  - Vendor labels are presentation-only; they do not promote an
 *    invalid/stale/manual/csv/demo reading to "live."
 *  - Unknown vendors fall back to the canonical source label.
 *  - Unknown / unrecognised source values resolve to "Unknown" — never
 *    "Live."
 */
import type { SensorReadingSource } from "@/mock";

/** Recognised hardware vendor lineage tags. */
export type SensorVendor = "ecowitt";

const CANONICAL_SOURCE_LABELS: Record<SensorReadingSource, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

const VENDOR_LABELS: Record<SensorVendor, string> = {
  ecowitt: "Ecowitt",
};

export interface ResolveSourceLabelInput {
  /** Canonical normalized source (provenance). */
  source: SensorReadingSource | null | undefined;
  /**
   * Optional hardware vendor lineage tag (e.g. from
   * `metadata.vendor === "ecowitt"`). Vendor only re-labels readings
   * whose canonical source is already "live" — never demo/manual/csv/
   * stale/invalid/unknown.
   */
  vendor?: string | null;
}

export interface ResolvedSourceLabel {
  /** User-facing label to render in a badge. */
  label: string;
  /** Lower-cased vendor key if recognised (presentation hint only). */
  vendor: SensorVendor | null;
  /** True if the label came from vendor lineage instead of canonical source. */
  vendorPromoted: boolean;
}

function normaliseVendor(v: string | null | undefined): SensorVendor | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  if (k === "ecowitt") return "ecowitt";
  return null;
}

/**
 * Resolve the display label for a sensor source.
 *
 * Rules:
 *  - Recognised vendor + source === "live" → vendor label (e.g. "Ecowitt").
 *  - Any other source → its canonical label (Manual, CSV, Demo, Stale,
 *    Invalid).
 *  - Missing/unrecognised source → "Unknown" (never "Live").
 */
export function resolveSensorSourceLabel(
  input: ResolveSourceLabelInput,
): ResolvedSourceLabel {
  const vendor = normaliseVendor(input.vendor);
  const source = input.source;

  if (!source || !(source in CANONICAL_SOURCE_LABELS)) {
    return { label: "Unknown", vendor, vendorPromoted: false };
  }

  if (vendor && source === "live") {
    return { label: VENDOR_LABELS[vendor], vendor, vendorPromoted: true };
  }

  return {
    label: CANONICAL_SOURCE_LABELS[source],
    vendor,
    vendorPromoted: false,
  };
}

/**
 * Convenience: resolve label given raw `metadata` object that may carry
 * `{ vendor: "ecowitt", ... }`.
 */
export function resolveSensorSourceLabelFromMetadata(
  source: SensorReadingSource | null | undefined,
  metadata: unknown,
): ResolvedSourceLabel {
  const vendor =
    metadata && typeof metadata === "object" && metadata !== null
      ? (metadata as { vendor?: unknown }).vendor
      : null;
  return resolveSensorSourceLabel({
    source,
    vendor: typeof vendor === "string" ? vendor : null,
  });
}
