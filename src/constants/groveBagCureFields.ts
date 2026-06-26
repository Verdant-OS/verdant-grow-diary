/**
 * groveBagCureFields — canonical airflow observation values for Grove
 * Bag Cure Check Quick Log entries.
 *
 * Pure constants. No React, no I/O.
 *
 * Airflow is an operator-entered observation, NOT telemetry. Verdant
 * must never infer airflow from sensor data, RH, or VPD.
 */

export const GROVE_BAG_AIRFLOW_OBSERVATIONS = [
  "gentle_indirect",
  "stagnant",
  "strong_direct",
  "fluctuating",
  "unknown",
] as const;

export type GroveBagAirflowObservation =
  (typeof GROVE_BAG_AIRFLOW_OBSERVATIONS)[number];

export const GROVE_BAG_AIRFLOW_LABELS: Record<
  GroveBagAirflowObservation,
  string
> = {
  gentle_indirect: "Gentle indirect airflow",
  stagnant: "Stagnant / dead air",
  strong_direct: "Strong direct airflow",
  fluctuating: "Fluctuating airflow",
  unknown: "Unknown",
};
