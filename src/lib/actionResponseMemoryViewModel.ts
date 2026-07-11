/**
 * actionResponseMemoryViewModel — presentation model for the shared
 * ActionResponseMemoryCard across Action Detail, Timeline, and Plant Detail.
 *
 * Pure, deterministic, null-safe. No React, no I/O, no writes.
 *
 * All outcome labels/tones flow through the single centralized mapping in
 * actionFollowUpEvidenceViewModel (actionFollowUpOutcomeMeta). Sensor source
 * labels flow through sensorSourceRules. No rule tables live in JSX.
 *
 * Internal ids (action id, diary row id, snapshot id) and durable storage
 * references exist on the view model ONLY for links/slots — the presenter
 * never renders them as visible or accessible text.
 */

import {
  type ActionFollowUpOutcome,
} from "@/lib/actionFollowUpEvidenceRules";
import {
  actionFollowUpOutcomeMeta,
  type ActionFollowUpOutcomeTone,
} from "@/lib/actionFollowUpEvidenceViewModel";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";
import {
  sensorSourceLabel,
  normalizeSensorSource,
} from "@/lib/sensor/sensorSourceRules";
import {
  ACTION_RESPONSE_MEMORY_HISTORICAL_COPY,
  ACTION_RESPONSE_MEMORY_RECORDED_COPY,
  ACTION_RESPONSE_MEMORY_TITLE,
  type ActionResponseMemory,
  type ActionResponsePhotoState,
  type ActionResponseSensorState,
  type ActionResponseSensorTrustState,
} from "@/lib/actionResponseMemoryRules";

export const ACTION_RESPONSE_PHOTO_UNAVAILABLE_COPY =
  "Associated photo evidence is unavailable.";
export const ACTION_RESPONSE_SENSOR_UNAVAILABLE_COPY =
  "Associated sensor snapshot is unavailable.";
export const ACTION_RESPONSE_VIEW_ACTION_LABEL = "View action";

const NOTE_EXCERPT_MAX = 200;

export interface ActionResponseMemoryCardViewModel {
  /** Opaque React key — never rendered as text. */
  readonly key: string;
  /** Internal id for building the Action Detail link. Never visible text. */
  readonly actionId: string;
  readonly title: string;
  readonly recordedCopy: string;
  readonly historicalCopy: string;
  readonly outcome: ActionFollowUpOutcome;
  readonly outcomeLabel: string;
  readonly outcomeTone: ActionFollowUpOutcomeTone;
  readonly recordedAtLabel: string;
  readonly actionSummary: string | null;
  readonly noteExcerpt: string | null;
  readonly photoState: ActionResponsePhotoState;
  /** Durable reference for the photo slot only. Never visible text. */
  readonly photoReference: string | null;
  readonly sensorState: ActionResponseSensorState;
  readonly sensorTrustState: ActionResponseSensorTrustState;
  /** Honest provenance line, e.g. "Manual reading · recorded <time>". */
  readonly sensorLine: string | null;
}

function excerptNote(note: string | null): string | null {
  if (!note) return null;
  const trimmed = note.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= NOTE_EXCERPT_MAX) return trimmed;
  // Word-safe cut with an ellipsis; deterministic.
  const slice = trimmed.slice(0, NOTE_EXCERPT_MAX);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 80 ? lastSpace : NOTE_EXCERPT_MAX).trimEnd()}…`;
}

function sensorTrustLabel(trust: ActionResponseSensorTrustState): string {
  switch (trust) {
    case "trusted":
      return sensorSourceLabel("live");
    case "manual":
      return sensorSourceLabel("manual");
    case "csv":
      return sensorSourceLabel("csv");
    case "demo":
      return sensorSourceLabel("demo");
    case "stale":
      return sensorSourceLabel("stale");
    case "invalid":
      return sensorSourceLabel("invalid");
    default:
      return "Unknown source — review before trusting";
  }
}

function buildSensorLine(
  memory: ActionResponseMemory,
  locale?: string,
): string | null {
  const sensor = memory.sensor;
  if (sensor.state === "none") return null;
  if (sensor.state === "unavailable") {
    return ACTION_RESPONSE_SENSOR_UNAVAILABLE_COPY;
  }
  const label = sensorTrustLabel(sensor.trustState);
  const when = sensor.capturedAt
    ? formatSnapshotTimestamp(sensor.capturedAt, locale)
    : null;
  return when ? `${label} · recorded ${when}` : label;
}

export interface BuildActionResponseMemoryCardViewModelInput {
  readonly memory: ActionResponseMemory | null | undefined;
  readonly locale?: string;
}

export function buildActionResponseMemoryCardViewModel(
  input: BuildActionResponseMemoryCardViewModelInput,
): ActionResponseMemoryCardViewModel | null {
  const memory = input.memory;
  if (!memory) return null;
  const meta = actionFollowUpOutcomeMeta(memory.response.outcome);
  return {
    key: memory.key,
    actionId: memory.actionId,
    title: ACTION_RESPONSE_MEMORY_TITLE,
    recordedCopy: ACTION_RESPONSE_MEMORY_RECORDED_COPY,
    historicalCopy: ACTION_RESPONSE_MEMORY_HISTORICAL_COPY,
    outcome: memory.response.outcome,
    outcomeLabel: meta.label,
    outcomeTone: meta.tone,
    recordedAtLabel: formatSnapshotTimestamp(memory.response.recordedAt, input.locale),
    actionSummary: memory.action.summary,
    noteExcerpt: excerptNote(memory.response.note),
    photoState: memory.photo.state,
    photoReference: memory.photo.state === "available" ? memory.photo.durableReference : null,
    sensorState: memory.sensor.state,
    sensorTrustState: memory.sensor.trustState,
    sensorLine: buildSensorLine(memory, input.locale),
  };
}

/**
 * Adapter: canonical Action Response Memory → the established Action Detail
 * evidence-card view model. Keeps Action Detail's shipped, test-pinned DOM
 * while its data flows through the canonical model and the single
 * centralized outcome-label mapping.
 */
export function toActionFollowUpEvidenceViewModel(input: {
  memory: ActionResponseMemory;
  fallbackActionLabel?: string | null;
  locale?: string;
}): {
  outcome: ActionFollowUpOutcome;
  outcomeLabel: string;
  outcomeTone: ActionFollowUpOutcomeTone;
  note: string | null;
  observedAtLabel: string;
  actionLabel: string;
  photoReference: string | null;
  hasPhotoEvidence: boolean;
  sensorSnapshotId: string | null;
} {
  const memory = input.memory;
  const meta = actionFollowUpOutcomeMeta(memory.response.outcome);
  const fallback =
    typeof input.fallbackActionLabel === "string" && input.fallbackActionLabel.trim().length > 0
      ? input.fallbackActionLabel.trim()
      : "Completed action";
  const photoReference =
    memory.photo.state === "available" ? memory.photo.durableReference : null;
  return {
    outcome: memory.response.outcome,
    outcomeLabel: meta.label,
    outcomeTone: meta.tone,
    note: memory.response.note,
    observedAtLabel: formatSnapshotTimestamp(memory.response.recordedAt, input.locale),
    actionLabel: memory.action.summary ?? fallback,
    photoReference,
    hasPhotoEvidence: photoReference !== null,
    sensorSnapshotId: memory.sensor.snapshotId,
  };
}

/**
 * Normalized sensor source string for the SensorSourceBadge presenter.
 * Unknown provenance renders as "invalid" (badge vocabulary) — never live.
 */
export function sensorBadgeSource(
  trust: ActionResponseSensorTrustState,
): "live" | "manual" | "csv" | "demo" | "stale" | "invalid" {
  switch (trust) {
    case "trusted":
      return "live";
    case "manual":
    case "csv":
    case "demo":
    case "stale":
      return trust;
    default:
      return normalizeSensorSource(trust);
  }
}
