/**
 * AiDoctorPhase1SaveEvidenceButton — grower-initiated save control.
 *
 * Renders ONLY when a valid plant + derived result exists and the page is
 * not in loading / unknown / no-result states. The wiring in
 * `OperatorAiDoctorPhase1` is responsible for not mounting this component
 * outside those states; this component additionally short-circuits via
 * `buildAiDoctorPhase1TimelineDraft` if inputs are incomplete.
 *
 * No Action Queue / alert / device-control behavior. No auto-save.
 */

import { useCallback, useMemo } from "react";
import { useSaveAiDoctorPhase1TimelineEvidence } from "@/hooks/useSaveAiDoctorPhase1TimelineEvidence";
import {
  AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER,
  buildAiDoctorPhase1TimelineDraft,
  isOkPhase1TimelineDraft,
  type AiDoctorPhase1TimelineDraftInput,
} from "@/lib/aiDoctorPhase1TimelineDraft";
import {
  AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES,
  AI_DOCTOR_PHASE1_TOUCH_TARGET_CLASSES,
} from "@/lib/aiDoctorPhase1A11yClassNames";

export interface AiDoctorPhase1SaveEvidenceButtonProps {
  identity: AiDoctorPhase1TimelineDraftInput["identity"];
  result: AiDoctorPhase1TimelineDraftInput["result"];
}

const STATUS_COPY: Record<string, string> = {
  idle: "Save to timeline",
  saving: "Saving…",
  saved: "Saved to timeline",
  duplicate: "Already saved to timeline",
  error: "Could not save evidence. Nothing else was changed.",
  blocked: "Save unavailable",
};

export function AiDoctorPhase1SaveEvidenceButton({
  identity,
  result,
}: AiDoctorPhase1SaveEvidenceButtonProps) {
  const { status, save } = useSaveAiDoctorPhase1TimelineEvidence();

  const draftPreview = useMemo(
    () => buildAiDoctorPhase1TimelineDraft({ identity, result }),
    [identity, result],
  );
  const isDraftOk = isOkPhase1TimelineDraft(draftPreview);

  const onClick = useCallback(() => {
    if (!isDraftOk) return;
    void save({ identity, result });
  }, [identity, result, save, isDraftOk]);

  if (!isDraftOk) return null;

  const disabled =
    status === "saving" || status === "saved" || status === "duplicate";

  const buttonLabel = STATUS_COPY[status] ?? STATUS_COPY.idle;

  return (
    <section
      data-testid="ai-doctor-phase1-save-evidence"
      className="space-y-2 rounded-md border border-border bg-card p-3 text-sm"
    >
      <p className="text-muted-foreground">
        Saves this AI Doctor result as plant evidence only. No Action Queue
        item is created.
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-testid="ai-doctor-phase1-save-evidence-button"
        aria-label="Save AI Doctor Phase 1 evidence to plant timeline"
        className={`inline-flex items-center justify-center rounded-md border border-border bg-primary px-4 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70 ${AI_DOCTOR_PHASE1_TOUCH_TARGET_CLASSES} ${AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES}`}
      >
        {buttonLabel}
      </button>
      {status === "saved" && (
        <p
          role="status"
          data-testid="ai-doctor-phase1-save-evidence-status-saved"
          className="text-xs text-muted-foreground"
        >
          Saved to timeline as evidence.
        </p>
      )}
      {status === "duplicate" && (
        <p
          role="status"
          data-testid="ai-doctor-phase1-save-evidence-status-duplicate"
          className="text-xs text-muted-foreground"
        >
          Already saved to timeline.
        </p>
      )}
      {status === "error" && (
        <p
          role="alert"
          data-testid="ai-doctor-phase1-save-evidence-status-error"
          className="text-xs text-destructive"
        >
          Could not save evidence. Nothing else was changed.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER}
      </p>
    </section>
  );
}
