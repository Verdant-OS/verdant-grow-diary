/**
 * aiDoctorManualSaveConfirmationViewModel — pure presenter for the
 * "Save preview to diary" confirmation UI.
 *
 * Hard constraints:
 *  - Pure. No React, no Supabase, no fetch, no RPC, no invoke.
 *  - No mutation/write helpers. Wraps `buildAiDoctorManualSaveDraft` only.
 *  - Deterministic for a given input.
 */

import {
  buildAiDoctorManualSaveDraft,
  isBlockedManualSaveDraft,
  type AiDoctorManualSaveDraftInput,
  type AiDoctorManualSaveDraftResult,
} from "./aiDoctorManualSaveDraft";

export const AI_DOCTOR_MANUAL_SAVE_BUTTON_LABEL =
  "Save preview to diary" as const;
export const AI_DOCTOR_MANUAL_SAVE_CONFIRM_LABEL = "Save to diary" as const;
export const AI_DOCTOR_MANUAL_SAVE_SAVING_LABEL = "Saving…" as const;
export const AI_DOCTOR_MANUAL_SAVE_DISABLED_LABEL = "Save coming next" as const;
export const AI_DOCTOR_MANUAL_SAVE_CANCEL_LABEL = "Cancel" as const;

export const AI_DOCTOR_MANUAL_SAVE_SUCCESS_MESSAGE =
  "Saved to diary." as const;
export const AI_DOCTOR_MANUAL_SAVE_DUPLICATE_MESSAGE =
  "Already saved to diary." as const;
export const AI_DOCTOR_MANUAL_SAVE_FAILURE_MESSAGE =
  "Could not save AI Doctor check-in. Nothing else was changed." as const;

export const AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY = Object.freeze({
  intro: "This will save the AI Doctor preview as a diary observation.",
  noModel: "No live AI model was called.",
  noAlerts: "No alerts or Action Queue items will be created.",
  cancel: "You can cancel before anything is saved.",
});

export interface AiDoctorManualSaveConfirmationViewOk {
  status: "ready";
  plant: {
    id: string | null;
    name: string | null;
    stage: string | null;
  };
  eventTypeLabel: "Observation";
  sourceLabel: "AI Doctor check-in manual save";
  safetyLabels: readonly string[];
  limitations: ReadonlyArray<{ code: string; message: string }>;
  idempotencyKey: string;
  idempotencyKeyShort: string;
  copy: typeof AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY;
  buttonLabel: typeof AI_DOCTOR_MANUAL_SAVE_BUTTON_LABEL;
  confirmLabel: typeof AI_DOCTOR_MANUAL_SAVE_CONFIRM_LABEL;
  savingLabel: typeof AI_DOCTOR_MANUAL_SAVE_SAVING_LABEL;
  cancelLabel: typeof AI_DOCTOR_MANUAL_SAVE_CANCEL_LABEL;
}

export interface AiDoctorManualSaveConfirmationViewBlocked {
  status: "blocked";
  reasons: readonly string[];
  copy: typeof AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY;
  buttonLabel: typeof AI_DOCTOR_MANUAL_SAVE_BUTTON_LABEL;
}

export type AiDoctorManualSaveConfirmationView =
  | AiDoctorManualSaveConfirmationViewOk
  | AiDoctorManualSaveConfirmationViewBlocked;

const SAFETY_LABELS: readonly string[] = Object.freeze([
  "Preview only",
  "Deterministic engine",
  "No live AI model",
]);

function shortKey(key: string): string {
  // Show last 10 chars of the hash component (after last colon)
  const colon = key.lastIndexOf(":");
  const tail = colon >= 0 ? key.slice(colon + 1) : key;
  return tail.slice(0, 10);
}

export function buildAiDoctorManualSaveConfirmationView(
  input: AiDoctorManualSaveDraftInput,
): AiDoctorManualSaveConfirmationView {
  const draft: AiDoctorManualSaveDraftResult =
    buildAiDoctorManualSaveDraft(input);

  if (isBlockedManualSaveDraft(draft)) {
    return Object.freeze({
      status: "blocked",
      reasons: Object.freeze([...draft.reasons]),
      copy: AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY,
      buttonLabel: AI_DOCTOR_MANUAL_SAVE_BUTTON_LABEL,
    });
  }

  return Object.freeze({
    status: "ready",
    plant: Object.freeze({
      id: input.identity.plant_id ?? null,
      name: input.identity.plant_name ?? null,
      stage: input.identity.stage ?? null,
    }),
    eventTypeLabel: "Observation",
    sourceLabel: "AI Doctor check-in manual save",
    safetyLabels: SAFETY_LABELS,
    limitations: Object.freeze(
      input.view.limitations.map((l) =>
        Object.freeze({ code: l.code, message: l.message }),
      ),
    ),
    idempotencyKeyShort: shortKey(draft.idempotency_key),
    copy: AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY,
    buttonLabel: AI_DOCTOR_MANUAL_SAVE_BUTTON_LABEL,
    confirmDisabled: true,
    confirmDisabledLabel: AI_DOCTOR_MANUAL_SAVE_DISABLED_LABEL,
    cancelLabel: AI_DOCTOR_MANUAL_SAVE_CANCEL_LABEL,
  });
}
