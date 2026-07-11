/**
 * actionFollowUpEvidenceViewModel — pure presenter mapping for
 * grower-entered Action Queue follow-up evidence.
 *
 * SCOPE / SAFETY:
 *  - Pure, deterministic, null-safe. No I/O, React, DB, AI, device.
 *  - Never infers plant response. `improved` tone is a visual accent
 *    for the grower-selected label, not a diagnosis.
 *  - Fallback note handling: the persistence service writes the
 *    conservative literal "Follow-up recorded." into the top-level
 *    `note` column when the grower left the observation blank.
 *    This module recognises that literal and does NOT present it as
 *    a meaningful observation.
 */
import { formatSnapshotTimestamp } from "@/lib/dateFormat";
import {
  ACTION_FOLLOWUP_OUTCOMES,
  type ActionFollowUpOutcome,
} from "@/lib/actionFollowUpEvidenceRules";
import type { ActionFollowUpEvidenceRecord } from "@/lib/actionFollowUpEvidenceService";

export const ACTION_FOLLOWUP_CONSERVATIVE_NOTE = "Follow-up recorded.";
export const ACTION_FOLLOWUP_NO_OBSERVATION_COPY =
  "No additional observation entered.";
export const ACTION_FOLLOWUP_LEGACY_LABEL = "Follow-up";

export type ActionFollowUpOutcomeTone = "positive" | "neutral" | "warning" | "muted";

interface OutcomeMeta {
  label: string;
  tone: ActionFollowUpOutcomeTone;
}

const OUTCOME_META: Record<ActionFollowUpOutcome, OutcomeMeta> = {
  improved: { label: "Improved", tone: "positive" },
  unchanged: { label: "No clear change", tone: "neutral" },
  declined: { label: "Declined", tone: "warning" },
  too_soon: { label: "Too soon to tell", tone: "muted" },
  unclear: { label: "Unclear", tone: "muted" },
};

export function isActionFollowUpOutcome(v: unknown): v is ActionFollowUpOutcome {
  return typeof v === "string" && (ACTION_FOLLOWUP_OUTCOMES as readonly string[]).includes(v);
}

export function actionFollowUpOutcomeMeta(
  outcome: ActionFollowUpOutcome | null | undefined,
): OutcomeMeta {
  if (!outcome || !isActionFollowUpOutcome(outcome)) {
    return { label: ACTION_FOLLOWUP_LEGACY_LABEL, tone: "muted" };
  }
  return OUTCOME_META[outcome];
}

export interface ActionFollowUpEvidenceViewModel {
  outcome: ActionFollowUpOutcome | null;
  outcomeLabel: string;
  outcomeTone: ActionFollowUpOutcomeTone;
  note: string | null;
  observedAtLabel: string;
  actionLabel: string;
  photoReference: string | null;
  sensorSnapshotId: string | null;
}

function normalizeNote(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length === 0) return null;
  if (t === ACTION_FOLLOWUP_CONSERVATIVE_NOTE) return null;
  return t;
}

export interface BuildActionFollowUpEvidenceViewModelInput {
  record: ActionFollowUpEvidenceRecord | null | undefined;
  actionLabel: string | null | undefined;
  locale?: string;
}

export function buildActionFollowUpEvidenceViewModel(
  input: BuildActionFollowUpEvidenceViewModelInput,
): ActionFollowUpEvidenceViewModel | null {
  const record = input.record;
  if (!record) return null;
  const outcome = isActionFollowUpOutcome(record.outcome) ? record.outcome : null;
  const meta = actionFollowUpOutcomeMeta(outcome);
  const observedAtLabel = formatSnapshotTimestamp(record.observedAt || null, input.locale);
  return {
    outcome,
    outcomeLabel: meta.label,
    outcomeTone: meta.tone,
    note: normalizeNote(record.note),
    observedAtLabel,
    actionLabel:
      (typeof input.actionLabel === "string" && input.actionLabel.trim().length > 0
        ? input.actionLabel.trim()
        : "Completed action"),
    photoReference:
      typeof record.photoReference === "string" && record.photoReference.length > 0
        ? record.photoReference
        : null,
    sensorSnapshotId:
      typeof record.sensorSnapshotId === "string" && record.sensorSnapshotId.length > 0
        ? record.sensorSnapshotId
        : null,
  };
}

/**
 * Timeline label extension. Backward-compatible: when the diary
 * details carry a grower-selected outcome, emit "Follow-up · <label>";
 * otherwise preserve the legacy marker-only label.
 */
export function actionFollowupTimelineLabel(
  details: { outcome?: unknown } | null | undefined,
): string {
  const raw = details?.outcome;
  if (!isActionFollowUpOutcome(raw)) return ACTION_FOLLOWUP_LEGACY_LABEL;
  return `${ACTION_FOLLOWUP_LEGACY_LABEL} · ${OUTCOME_META[raw].label}`;
}
