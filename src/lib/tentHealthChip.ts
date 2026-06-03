/**
 * Pure derivation of the per-tent health chip on the Tents page.
 *
 * Rules:
 *  - plantCount === 0           → "empty"  (neutral, copy: "No plants")
 *  - alertCount > 0             → "alerts" (destructive)
 *  - plantCount > 0, no alerts  → "healthy"
 *  - any unknown input          → "unknown" (neutral, never healthy)
 *
 * Presenter-only. No I/O. No React.
 */

export type TentHealthChipVariant =
  | "healthy"
  | "alerts"
  | "empty"
  | "unknown";

export interface TentHealthChip {
  variant: TentHealthChipVariant;
  copy: string;
  /** True only when the chip should render in the green/success style. */
  isHealthy: boolean;
}

export function deriveTentHealthChip(args: {
  plantCount: number | null | undefined;
  alertCount: number | null | undefined;
}): TentHealthChip {
  const plants =
    typeof args.plantCount === "number" && Number.isFinite(args.plantCount)
      ? args.plantCount
      : null;
  const alerts =
    typeof args.alertCount === "number" && Number.isFinite(args.alertCount)
      ? args.alertCount
      : null;

  if (plants === null) {
    return { variant: "unknown", copy: "Status unknown", isHealthy: false };
  }
  if (plants === 0) {
    return { variant: "empty", copy: "No plants", isHealthy: false };
  }
  if (alerts !== null && alerts > 0) {
    return {
      variant: "alerts",
      copy: `● ${alerts} alert${alerts > 1 ? "s" : ""}`,
      isHealthy: false,
    };
  }
  return { variant: "healthy", copy: "● healthy", isHealthy: true };
}
