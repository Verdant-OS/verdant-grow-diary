/**
 * environmentCheckSensorContextRules — pure helper for Quick Log
 * Environment Check pre-save clarity.
 *
 * Hard rules:
 *  - No I/O, no React, no Supabase, no Action Queue, no AI, no device
 *    control. Deterministic.
 *  - Never inserts sensor readings. Never claims demo/manual data is
 *    "verified sensor data".
 *  - Does NOT decide whether the Quick Log save itself happens — the
 *    existing save path owns that. This helper only describes whether
 *    the current context is safe for manual sensor snapshot association.
 */
import { isUuid } from "@/lib/isUuid";

export type EnvironmentCheckContextSourceLabel =
  | "manual"
  | "demo"
  | "live"
  | "stale"
  | "invalid"
  | "unknown";

export interface EnvironmentCheckSensorContextInput {
  tentId?: string | null;
  plantId?: string | null;
  sourceLabel?: EnvironmentCheckContextSourceLabel | null;
  hasMeasurements: boolean;
}

export type EnvironmentCheckSensorContextStatus =
  | "valid"
  | "warning"
  | "blocked"
  | "not_applicable";

export type EnvironmentCheckSensorContextReason =
  | "ok_verified_tent"
  | "missing_tent"
  | "non_uuid_tent"
  | "demo_context"
  | "invalid_or_stale_context"
  | "note_only";

export interface EnvironmentCheckSensorContextView {
  status: EnvironmentCheckSensorContextStatus;
  title: string;
  message: string;
  canAttachManualSnapshot: boolean;
  /** Whether existing Quick Log save behavior should remain allowed. */
  canSaveEnvironmentCheck: boolean;
  reasonCode: EnvironmentCheckSensorContextReason;
  sourceLabel: EnvironmentCheckContextSourceLabel;
  /** Safe provenance summary suitable for details metadata. */
  measurementSource: "manual" | "demo";
  contextStatus: "verified" | "unverified" | "demo";
}

const COPY = {
  validTitle: "Manual snapshot context verified",
  validMsg: "This Environment Check is tied to a real tent context.",
  warnTitle: "Manual snapshot not linked to a real tent",
  warnMsg:
    "This check can be saved as a diary note, but it will not be treated as verified sensor data.",
  missingTitle: "Select a real tent before linking sensor data",
  missingMsg:
    "Without a real tent context, this check is saved as a diary note only.",
  demoTitle: "Demo tent context",
  demoMsg:
    "This Environment Check is tied to a demo context and is not stored as live sensor data.",
  invalidTitle: "Sensor context is stale or invalid",
  invalidMsg:
    "Recent sensor data for this tent is stale or invalid. This check will be saved as a diary note only.",
  noteOnlyTitle: "Environment Check note",
  noteOnlyMsg:
    "No measurements entered — this will be saved as a diary note.",
} as const;

/** Pure: derive the pre-save sensor-context view for Environment Check. */
export function buildEnvironmentCheckSensorContext(
  input: EnvironmentCheckSensorContextInput,
): EnvironmentCheckSensorContextView {
  const rawSource = input.sourceLabel ?? "manual";
  const isDemo = rawSource === "demo";
  const isStaleOrInvalid = rawSource === "stale" || rawSource === "invalid";
  const sourceLabel: EnvironmentCheckContextSourceLabel = isDemo
    ? "demo"
    : isStaleOrInvalid
      ? rawSource
      : "manual";

  // Note-only path — still allowed to save as a diary note.
  if (!input.hasMeasurements) {
    return {
      status: "not_applicable",
      title: COPY.noteOnlyTitle,
      message: COPY.noteOnlyMsg,
      canAttachManualSnapshot: false,
      canSaveEnvironmentCheck: true,
      reasonCode: "note_only",
      sourceLabel,
      measurementSource: isDemo ? "demo" : "manual",
      contextStatus: isDemo ? "demo" : "unverified",
    };
  }

  if (isDemo) {
    return {
      status: "warning",
      title: COPY.demoTitle,
      message: COPY.demoMsg,
      canAttachManualSnapshot: false,
      canSaveEnvironmentCheck: true,
      reasonCode: "demo_context",
      sourceLabel: "demo",
      measurementSource: "demo",
      contextStatus: "demo",
    };
  }

  if (isStaleOrInvalid) {
    return {
      status: "warning",
      title: COPY.invalidTitle,
      message: COPY.invalidMsg,
      canAttachManualSnapshot: false,
      canSaveEnvironmentCheck: true,
      reasonCode: "invalid_or_stale_context",
      sourceLabel,
      measurementSource: "manual",
      contextStatus: "unverified",
    };
  }

  const tentId = typeof input.tentId === "string" ? input.tentId.trim() : "";

  if (!tentId) {
    return {
      status: "blocked",
      title: COPY.missingTitle,
      message: COPY.missingMsg,
      canAttachManualSnapshot: false,
      canSaveEnvironmentCheck: true,
      reasonCode: "missing_tent",
      sourceLabel: "manual",
      measurementSource: "manual",
      contextStatus: "unverified",
    };
  }

  if (!isUuid(tentId)) {
    return {
      status: "warning",
      title: COPY.warnTitle,
      message: COPY.warnMsg,
      canAttachManualSnapshot: false,
      canSaveEnvironmentCheck: true,
      reasonCode: "non_uuid_tent",
      sourceLabel: "manual",
      measurementSource: "manual",
      contextStatus: "unverified",
    };
  }

  return {
    status: "valid",
    title: COPY.validTitle,
    message: COPY.validMsg,
    canAttachManualSnapshot: true,
    canSaveEnvironmentCheck: true,
    reasonCode: "ok_verified_tent",
    sourceLabel: "manual",
    measurementSource: "manual",
    contextStatus: "verified",
  };
}

/** Stable copy export so UI and tests share a single source. */
export const ENVIRONMENT_CHECK_SENSOR_CONTEXT_COPY = COPY;
