/**
 * GuidedGrowWalkPanel — shared Field Edition visit presenter.
 *
 * Presentation-only. Visit-mode and guided-control selections are not
 * persisted; durable content stays in the accurate note / save path.
 * Reuses growWalkContracts — do not duplicate mode tables here.
 */

import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";
import {
  GROW_WALK_FOLLOW_UP_OPTIONS,
  GROW_WALK_MISSINGNESS_OPTIONS,
  GROW_WALK_RISK_OPTIONS,
  GROW_WALK_VISIT_MODES,
  composeGrowWalkCloseoutNote,
  resolveGrowWalkPlantPrompts,
  type GrowWalkVisitMode,
} from "@/lib/growWalkContracts";
import {
  EVIDENCE_PHOTO_SLOT_LABELS,
  V0_VISIBLE_SLOTS,
  stampSlot,
  type EvidencePhotoSlot,
} from "@/lib/evidencePhotoSlotRules";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

export type GuidedGrowWalkTargetType = "plant" | "tent" | null;

export interface GuidedGrowWalkPanelProps {
  visitMode: GrowWalkVisitMode;
  onVisitModeChange: (mode: GrowWalkVisitMode) => void;
  /** True when a verified plant or tent target is resolved. */
  targetOk: boolean;
  tentId?: string | null;
  targetType?: GuidedGrowWalkTargetType;
  stage?: string | null;
  /**
   * Test-id / heading-id prefix. Defaults to `qlv2` so existing V2 tests
   * keep passing. Grower Quick Log should pass `ql`.
   */
  testIdPrefix?: string;
  /** When Apply closeout is used, receives the composed Obs|Interp|Action note text. */
  onApplyCloseoutToNote?: (composed: string) => void;
}

export default function GuidedGrowWalkPanel({
  visitMode,
  onVisitModeChange,
  targetOk,
  tentId = null,
  targetType = null,
  stage = null,
  testIdPrefix = "qlv2",
  onApplyCloseoutToNote,
}: GuidedGrowWalkPanelProps) {
  const growWalkPrompts = resolveGrowWalkPlantPrompts({
    targetType,
    stage,
  });
  const headingId = `${testIdPrefix}-visit-mode-heading`;
  const doorwayId = `${testIdPrefix}-doorway-status`;
  const closeoutCheckpointListId = `${testIdPrefix}-closeout-checkpoint-list`;

  const [closeoutObservation, setCloseoutObservation] = useState("");
  const [closeoutInterpretation, setCloseoutInterpretation] = useState("");
  const [closeoutAction, setCloseoutAction] = useState("");
  const [closeoutNextCheckpoint, setCloseoutNextCheckpoint] = useState("");
  const [closeoutObservationRequired, setCloseoutObservationRequired] = useState(false);

  function handleApplyCloseout() {
    const observation = closeoutObservation.trim();
    if (!observation) {
      setCloseoutObservationRequired(true);
      return;
    }
    setCloseoutObservationRequired(false);
    const composed = composeGrowWalkCloseoutNote({
      observation,
      interpretation: closeoutInterpretation,
      action: closeoutAction,
      nextCheckpoint: closeoutNextCheckpoint,
    });
    if (!composed) return;
    onApplyCloseoutToNote?.(composed);
    // Clear local closeout fields so a second Apply cannot double-append.
    setCloseoutObservation("");
    setCloseoutInterpretation("");
    setCloseoutAction("");
    setCloseoutNextCheckpoint("");
  }

  function openEvidencePhotoSlot(slot: EvidencePhotoSlot) {
    const stamped = stampSlot("", slot);
    // Prefer existing note path when already inside Quick Log; otherwise open QL.
    if (onApplyCloseoutToNote) {
      onApplyCloseoutToNote(stamped);
      return;
    }
    window.dispatchEvent(
      new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, {
        detail: {
          eventType: "observation",
          note: stamped,
          source: "evidence-photo-slot",
        },
      }),
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid={`${testIdPrefix}-guided-grow-walk`}
      data-visit-mode={visitMode}
      className="rounded-lg border border-border/60 bg-secondary/10 p-3 space-y-3"
    >
      <div>
        <h3 id={headingId} className="text-sm font-semibold">
          Field Edition visit
        </h3>
        <p className="text-xs text-muted-foreground">
          Start fast. Open a guided walk only when it helps.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Visit mode">
        {GROW_WALK_VISIT_MODES.map((mode) => (
          <Button
            key={mode.id}
            type="button"
            size="sm"
            variant={visitMode === mode.id ? "default" : "outline"}
            aria-pressed={visitMode === mode.id}
            data-testid={`${testIdPrefix}-visit-mode-${mode.id}`}
            onClick={() => onVisitModeChange(mode.id)}
          >
            {mode.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {GROW_WALK_VISIT_MODES.find((mode) => mode.id === visitMode)?.description}
      </p>

      {visitMode !== "fast_check" && !targetOk && (
        <p
          role="status"
          data-testid={`${testIdPrefix}-grow-walk-identity-blocked`}
          className="text-sm"
        >
          Choose a verified plant or tent before starting this guided walk.
        </p>
      )}

      {visitMode !== "fast_check" && targetOk && (
        <div className="space-y-4" data-testid={`${testIdPrefix}-grow-walk-backbone`}>
          <p
            role="status"
            data-testid={`${testIdPrefix}-grow-walk-nonpersist-disclosure`}
            className="text-xs text-muted-foreground"
          >
            Guided control selections (light phase, visit reason, doorway scan, risk, follow-up)
            apply to this visit only and are not saved. Put anything durable in the accurate note
            below. Closeout fields apply to the note only when you use Apply closeout to note.
          </p>
          <div className="rounded-md border border-border/60 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Identity confirmed</p>
            <p>Date/time: recorded when you save.</p>
            {growWalkPrompts.showStage && <p>Stage: {stage || "Unknown"}.</p>}
            {growWalkPrompts.showSex && (
              <p data-testid={`${testIdPrefix}-grow-walk-sex-prompt`}>
                Sex: confirm only if visible.
              </p>
            )}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label>
                Light phase
                <select
                  aria-label="Light phase"
                  defaultValue="Unknown"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-foreground"
                >
                  <option>Day / lights on</option>
                  <option>Night / lights off</option>
                  <option>Not applicable</option>
                  <option>Unknown</option>
                </select>
              </label>
              <label>
                Visit reason
                <select
                  aria-label="Visit reason"
                  defaultValue="Routine check"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-foreground"
                >
                  <option>Routine check</option>
                  <option>Follow-up</option>
                  <option>Concern</option>
                  <option>Alert verification</option>
                </select>
              </label>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Doorway scan</legend>
            <label className="text-xs text-muted-foreground" htmlFor={doorwayId}>
              Record what you actually checked
            </label>
            <select
              id={doorwayId}
              aria-label="Doorway scan"
              defaultValue="Not checked"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {GROW_WALK_MISSINGNESS_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </fieldset>

          <div className="space-y-2">
            <p className="text-sm font-medium">Sensor snapshot or no trusted reading</p>
            <QuickLogSensorSnapshotStrip tentId={tentId} attached={false} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" data-testid={`${testIdPrefix}-no-trusted-reading`} />
              No trusted reading
            </label>
          </div>

          {targetType === "plant" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Canopy / plant scan</legend>
              <select
                aria-label="Canopy or plant scan status"
                defaultValue="Not checked"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {GROW_WALK_MISSINGNESS_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </fieldset>
          )}

          <div
            className="rounded-md border border-border/60 p-3 text-sm space-y-3"
            data-testid={`${testIdPrefix}-grow-walk-closeout`}
          >
            <div className="space-y-1">
              <p className="font-medium">Closeout</p>
              <p className="text-xs text-muted-foreground">
                Observation · Interpretation · Action. Suggestions stay advisory. Nothing is sent to
                the approval-required Action Queue automatically.
              </p>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Observation</span>
              <textarea
                aria-label="Closeout observation"
                data-testid={`${testIdPrefix}-closeout-observation`}
                value={closeoutObservation}
                onChange={(e) => {
                  setCloseoutObservation(e.target.value);
                  if (closeoutObservationRequired && e.target.value.trim()) {
                    setCloseoutObservationRequired(false);
                  }
                }}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="What you actually saw or checked"
              />
            </label>
            {closeoutObservationRequired && (
              <p
                role="status"
                data-testid={`${testIdPrefix}-closeout-observation-required`}
                className="text-xs text-muted-foreground"
              >
                Add an observation before applying closeout to the note.
              </p>
            )}
            <label className="block space-y-1">
              <span className="text-sm font-medium">Interpretation</span>
              <textarea
                aria-label="Closeout interpretation"
                data-testid={`${testIdPrefix}-closeout-interpretation`}
                value={closeoutInterpretation}
                onChange={(e) => setCloseoutInterpretation(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Mark uncertainty; no keeper claims"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Action</span>
              <textarea
                aria-label="Closeout action"
                data-testid={`${testIdPrefix}-closeout-action`}
                value={closeoutAction}
                onChange={(e) => setCloseoutAction(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="none tonight | exact reversible task"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Next checkpoint</span>
              <input
                aria-label="Closeout next checkpoint"
                data-testid={`${testIdPrefix}-closeout-next-checkpoint`}
                list={closeoutCheckpointListId}
                value={closeoutNextCheckpoint}
                onChange={(e) => setCloseoutNextCheckpoint(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="24 hours / 72 hours / Next visit / free text"
              />
              <datalist id={closeoutCheckpointListId}>
                {GROW_WALK_FOLLOW_UP_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid={`${testIdPrefix}-apply-closeout`}
              onClick={handleApplyCloseout}
            >
              Apply closeout to note
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Risk
              <select
                aria-label="Grow walk risk"
                defaultValue="Routine"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
              >
                {GROW_WALK_RISK_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Follow-up
              <select
                aria-label="Grow walk follow-up"
                defaultValue="Next visit"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
              >
                {GROW_WALK_FOLLOW_UP_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          {visitMode === "deep_evidence_walk" && (
            <div
              className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2"
              data-testid={`${testIdPrefix}-evidence-photo-slots`}
            >
              <p className="text-xs text-muted-foreground">
                Evidence photo slots. Skip allowed — no placeholder images. Opens the existing Quick
                Log note/photo path with a slot stamp in the caption.
              </p>
              <div className="flex min-w-0 flex-wrap gap-2">
                {V0_VISIBLE_SLOTS.map((slot) => (
                  <Button
                    key={slot}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="min-h-11 gap-1"
                    data-testid={`${testIdPrefix}-evidence-photo-slot-${slot}`}
                    onClick={() => openEvidencePhotoSlot(slot)}
                  >
                    <Camera className="h-3.5 w-3.5" aria-hidden />
                    {EVIDENCE_PHOTO_SLOT_LABELS[slot]}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {visitMode === "alert_walk" && (
            <p className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs text-muted-foreground">
              Alert Walk details are coming later. Verify the alert in person before changing
              anything.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
