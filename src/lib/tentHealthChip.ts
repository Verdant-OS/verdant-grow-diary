/**
 * Pure derivation of a per-tent status chip from plant and alert counts.
 *
 * Counts are not telemetry, so this chip never claims health. Zero open
 * alerts can mean the tent was never assessed, and an unknown alert count is
 * not zero.
 *
 * Rules:
 *  - plantCount unknown or negative → "unknown"   (copy: "Status unknown")
 *  - plantCount === 0               → "empty"     (copy: "No plants")
 *  - alertCount unknown or negative → "unknown"   (copy: "Alert status unknown")
 *  - alertCount > 0                 → "alerts"    (destructive)
 *  - alertCount === 0               → "no_alerts" (neutral, copy: "No open alerts")
 *
 * Presenter-only. No I/O. No React.
 */

export type TentHealthChipVariant = "alerts" | "no_alerts" | "empty" | "unknown";

export interface TentHealthChip {
  variant: TentHealthChipVariant;
  copy: string;
  /** Always false: plant and alert counts cannot establish tent health. */
  isHealthy: false;
}

function knownCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function deriveTentHealthChip(args: {
  plantCount: number | null | undefined;
  alertCount: number | null | undefined;
}): TentHealthChip {
  const plants = knownCount(args.plantCount);
  const alerts = knownCount(args.alertCount);

  if (plants === null) {
    return { variant: "unknown", copy: "Status unknown", isHealthy: false };
  }
  if (plants === 0) {
    return { variant: "empty", copy: "No plants", isHealthy: false };
  }
  if (alerts === null) {
    return { variant: "unknown", copy: "Alert status unknown", isHealthy: false };
  }
  if (alerts > 0) {
    return {
      variant: "alerts",
      copy: `● ${alerts} alert${alerts > 1 ? "s" : ""}`,
      isHealthy: false,
    };
  }
  return { variant: "no_alerts", copy: "No open alerts", isHealthy: false };
}
