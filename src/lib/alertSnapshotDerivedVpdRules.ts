/**
 * Alert-evaluation VPD for a capture that logged temperature and RH but no VPD.
 *
 * A manual reading of temperature and RH stores no `vpd_kpa` row, so the
 * snapshot's `vpd` is null and both alert checks (default thresholds and
 * target comparison) skipped VPD, while the tent page already calculates and
 * grades it (issue #3124). This fills `vpd` for alert evaluation only, with
 * the same `calculateVpdKpa` the tent page uses, and marks it as calculated.
 *
 * - A stored VPD always wins; nothing is replaced.
 * - Temperature and RH must come from one capture: the same instant on their
 *   per-metric refs (a Quick Log value merged over an older sensor value is
 *   not one capture), else the snapshot `ts`.
 * - No `metric_refs.vpd` is added: no `sensor_readings` row backs the value.
 * - Pure: no I/O, no React, no clock.
 */
import { calculateVpdKpa } from "@/lib/greenhouseClimateRules";
import type { SensorSnapshot, SensorSnapshotMetricRefKey } from "@/lib/sensorSnapshot";

export const CALCULATED_VPD_ORIGIN = "calculated_from_temp_rh" as const;

/** Appended to a VPD alert reason when the VPD was calculated, not measured. */
export const CALCULATED_VPD_ALERT_NOTE =
  "VPD calculated from the temperature and RH of the same reading; no measured VPD was logged.";

export type AlertEvaluationSnapshot = SensorSnapshot & {
  vpd_origin?: typeof CALCULATED_VPD_ORIGIN;
};

type PerMetricCaptureRefs = {
  manual_metric_refs?: Partial<Record<string, { captured_at: string }>>;
};

function captureMs(
  snapshot: SensorSnapshot & PerMetricCaptureRefs,
  key: SensorSnapshotMetricRefKey,
): number {
  const at =
    snapshot.manual_metric_refs?.[key]?.captured_at ??
    snapshot.metric_refs?.[key]?.captured_at ??
    snapshot.ts;
  return typeof at === "string" ? Date.parse(at) : Number.NaN;
}

export function withCaptureDerivedVpd(
  snapshot: SensorSnapshot | null,
): AlertEvaluationSnapshot | null {
  if (!snapshot) return snapshot;
  if (typeof snapshot.vpd === "number" && Number.isFinite(snapshot.vpd)) return snapshot;
  const tempAt = captureMs(snapshot, "temp");
  if (!Number.isFinite(tempAt) || tempAt !== captureMs(snapshot, "rh")) return snapshot;
  const vpd = calculateVpdKpa({ tempC: snapshot.temp, rhPercent: snapshot.rh });
  if (vpd === null) return snapshot;
  return { ...snapshot, vpd, vpd_origin: CALCULATED_VPD_ORIGIN };
}

export function hasCalculatedVpd(snapshot: SensorSnapshot | null | undefined): boolean {
  return (
    (snapshot as AlertEvaluationSnapshot | null | undefined)?.vpd_origin === CALCULATED_VPD_ORIGIN
  );
}
