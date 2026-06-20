/**
 * EcoWitt Live Evidence quick-fill templates — pure deterministic.
 *
 * Returns local example form state for faster operator testing. These are
 * EXAMPLES, not real evidence. They do not query sensors, write data,
 * persist data, call models, or contain secrets/tokens/env values.
 */

import {
  createInitialEcowittLiveEvidenceFormState,
  type EcowittLiveEvidenceFormState,
  type EcowittLiveEvidenceMetricRow,
} from "./ecowittLiveEvidenceFormRules";

export type EcowittLiveEvidenceTemplateId =
  | "live_verified_example"
  | "manual_comparison_example"
  | "stale_evidence_example";

export interface EcowittLiveEvidenceTemplate {
  readonly id: EcowittLiveEvidenceTemplateId;
  readonly label: string;
  readonly description: string;
  readonly build: () => EcowittLiveEvidenceFormState;
}

function patchRow(
  state: EcowittLiveEvidenceFormState,
  key: EcowittLiveEvidenceMetricRow["key"],
  patch: Partial<EcowittLiveEvidenceMetricRow>,
): EcowittLiveEvidenceFormState {
  return {
    ...state,
    metric_rows: state.metric_rows.map((r) =>
      r.key === key ? { ...r, ...patch } : r,
    ),
  };
}

function liveVerifiedExample(): EcowittLiveEvidenceFormState {
  let s: EcowittLiveEvidenceFormState = {
    ...createInitialEcowittLiveEvidenceFormState(),
    source: "live",
    captured_at: "2026-06-09T12:00:00Z",
    now: "2026-06-09T12:01:00Z",
    tent_id: "example-tent",
    plant_id: "example-plant-1",
    raw_payload_present: true,
    normalized_payload_present: true,
    operator_compared_controller: true,
  };
  s = patchRow(s, "temp_f", {
    enabled: true,
    backend_value: "72",
    controller_value: "72",
    unit: "F",
    backend_unit: "F",
    controller_unit: "F",
  });
  s = patchRow(s, "humidity_pct", {
    enabled: true,
    backend_value: "55",
    controller_value: "55",
    unit: "%",
    backend_unit: "%",
    controller_unit: "%",
  });
  return s;
}

function manualComparisonExample(): EcowittLiveEvidenceFormState {
  let s: EcowittLiveEvidenceFormState = {
    ...createInitialEcowittLiveEvidenceFormState(),
    source: "manual",
    captured_at: "2026-06-09T12:00:00Z",
    now: "2026-06-09T12:01:00Z",
    tent_id: "example-tent",
    plant_id: "",
    raw_payload_present: false,
    normalized_payload_present: false,
    operator_compared_controller: true,
  };
  s = patchRow(s, "temp_f", {
    enabled: true,
    backend_value: "72",
    controller_value: "72",
    unit: "F",
    backend_unit: "F",
    controller_unit: "F",
  });
  s = patchRow(s, "humidity_pct", {
    enabled: true,
    backend_value: "55",
    controller_value: "55",
    unit: "%",
    backend_unit: "%",
    controller_unit: "%",
  });
  return s;
}

function staleEvidenceExample(): EcowittLiveEvidenceFormState {
  let s: EcowittLiveEvidenceFormState = {
    ...createInitialEcowittLiveEvidenceFormState(),
    source: "live",
    captured_at: "2026-06-09T10:00:00Z",
    now: "2026-06-09T12:00:00Z",
    tent_id: "example-tent",
    plant_id: "example-plant-1",
    raw_payload_present: true,
    normalized_payload_present: true,
    operator_compared_controller: true,
  };
  s = patchRow(s, "temp_f", {
    enabled: true,
    backend_value: "72",
    controller_value: "72",
    unit: "F",
    backend_unit: "F",
    controller_unit: "F",
  });
  return s;
}

export const ECOWITT_LIVE_EVIDENCE_TEMPLATES: readonly EcowittLiveEvidenceTemplate[] =
  Object.freeze([
    Object.freeze({
      id: "live_verified_example" as const,
      label: "Use live example",
      description:
        "Example only. Replace with tonight's real EcoWitt/MQTT/backend evidence before treating any result as useful.",
      build: liveVerifiedExample,
    }),
    Object.freeze({
      id: "manual_comparison_example" as const,
      label: "Use manual example",
      description:
        "Example only. Manual source cannot prove live sensor truth on its own.",
      build: manualComparisonExample,
    }),
    Object.freeze({
      id: "stale_evidence_example" as const,
      label: "Use stale example",
      description:
        "Example only. Captured_at is intentionally old so the evaluator returns stale.",
      build: staleEvidenceExample,
    }),
  ]);

export function getEcowittLiveEvidenceTemplate(
  id: EcowittLiveEvidenceTemplateId,
): EcowittLiveEvidenceTemplate | null {
  return (
    ECOWITT_LIVE_EVIDENCE_TEMPLATES.find((t) => t.id === id) ?? null
  );
}
