/**
 * groveBagAirflowRules — pure normalization, status, and copy for the
 * Grove Bag Cure Check `airflow_observation` field.
 *
 * Pure. No I/O, no React. Deterministic. Null-safe.
 *
 * Hard rules:
 *  - Airflow is grower-observed context, NEVER inferred from sensors.
 *  - This module emits no alerts, no Action Queue items, and no device
 *    commands. Status values are presentation-only.
 *  - Invalid / missing input falls back to "unknown" → needs_review.
 *  - Copy is cautious; never claims automation, AI, or guaranteed cure.
 */

import {
  GROVE_BAG_AIRFLOW_LABELS,
  GROVE_BAG_AIRFLOW_OBSERVATIONS,
  type GroveBagAirflowObservation,
} from "@/constants/groveBagCureFields";

export type GroveBagAirflowStatus = "recorded" | "needs_review" | "caution";

const STATUS: Record<GroveBagAirflowObservation, GroveBagAirflowStatus> = {
  gentle_indirect: "recorded",
  unknown: "needs_review",
  stagnant: "needs_review",
  fluctuating: "needs_review",
  strong_direct: "caution",
};

const COPY: Record<GroveBagAirflowObservation, string> = {
  gentle_indirect: "Recorded: gentle indirect airflow.",
  stagnant:
    "Needs review: stagnant air may allow localized humidity buildup around bags.",
  fluctuating:
    "Needs review: changing airflow can make cure conditions less consistent.",
  strong_direct:
    "Caution: direct airflow can dry bags too quickly. Grower review required.",
  unknown: "Airflow observation not recorded.",
};

export function normalizeGroveBagAirflowObservation(
  input: unknown,
): GroveBagAirflowObservation {
  if (typeof input !== "string") return "unknown";
  const v = input.trim().toLowerCase();
  return (GROVE_BAG_AIRFLOW_OBSERVATIONS as readonly string[]).includes(v)
    ? (v as GroveBagAirflowObservation)
    : "unknown";
}

export function getGroveBagAirflowStatus(
  observation: GroveBagAirflowObservation,
): GroveBagAirflowStatus {
  return STATUS[observation];
}

export function getGroveBagAirflowCopy(
  observation: GroveBagAirflowObservation,
): string {
  return COPY[observation];
}

export function getGroveBagAirflowLabel(
  observation: GroveBagAirflowObservation,
): string {
  return GROVE_BAG_AIRFLOW_LABELS[observation];
}

export interface GroveBagAirflowViewModel {
  observation: GroveBagAirflowObservation;
  label: string;
  status: GroveBagAirflowStatus;
  copy: string;
  /** Short prefix line for the timeline, e.g. "Airflow: Gentle indirect airflow". */
  timelineLabel: string;
}

export function buildGroveBagAirflowViewModel(
  input: unknown,
): GroveBagAirflowViewModel {
  const observation = normalizeGroveBagAirflowObservation(input);
  const label = getGroveBagAirflowLabel(observation);
  return {
    observation,
    label,
    status: getGroveBagAirflowStatus(observation),
    copy: getGroveBagAirflowCopy(observation),
    timelineLabel: `Airflow: ${label}`,
  };
}
