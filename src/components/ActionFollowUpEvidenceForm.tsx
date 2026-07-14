/**
 * ActionFollowUpEvidenceForm — presenter form for grower-entered
 * Action Queue follow-up evidence.
 *
 * Presenter-only:
 *  - Pure UI + local state. No I/O, no Supabase, no AI.
 *  - Delegates persistence to parent via onSubmit(draft).
 *  - Never infers outcome. No default outcome that implies success.
 */
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ACTION_FOLLOWUP_OUTCOMES,
  actionFollowUpRequiresNote,
  type ActionFollowUpOutcome,
} from "@/lib/actionFollowUpEvidenceRules";

export interface ActionFollowUpFormSubmit {
  outcome: ActionFollowUpOutcome;
  note: string;
  observedAt: string; // ISO
  photoReference: string | null;
  sensorSnapshotId: string | null;
}

export interface ActionFollowUpEvidenceFormProps {
  saving: boolean;
  errorMessage?: string | null;
  initialObservedAt?: string; // ISO
  onSubmit: (values: ActionFollowUpFormSubmit) => void;
  onCancel?: () => void;
  /** Controlled durable photo reference. `null` = "No photo". */
  photoReference?: string | null;
  /** Controlled manual sensor snapshot id. `null` = "No snapshot". */
  sensorSnapshotId?: string | null;
  /** Optional slot for the existing-photo selector (Slice 4c). */
  photoSelectorSlot?: React.ReactNode;
  /** Optional slot for the manual sensor selector (Slice 4b). */
  sensorSelectorSlot?: React.ReactNode;
}

const OUTCOME_LABEL: Record<ActionFollowUpOutcome, string> = {
  improved: "Improved",
  unchanged: "No clear change",
  declined: "Declined",
  too_soon: "Too soon to tell",
  unclear: "Unclear",
};

const NOTE_MAX = 1000;

/** Convert an ISO string to a datetime-local input value in the user's local time. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function ActionFollowUpEvidenceForm({
  saving,
  errorMessage,
  initialObservedAt,
  onSubmit,
  onCancel,
  photoReference = null,
  sensorSnapshotId = null,
  photoSelectorSlot,
  sensorSelectorSlot,
}: ActionFollowUpEvidenceFormProps) {
  const defaultObservedAt = useMemo(
    () => isoToLocalInput(initialObservedAt ?? new Date().toISOString()),
    [initialObservedAt],
  );
  const [outcome, setOutcome] = useState<ActionFollowUpOutcome | "">("");
  const [note, setNote] = useState("");
  const [observedAtLocal, setObservedAtLocal] = useState(defaultObservedAt);
  const [fieldError, setFieldError] = useState<
    "outcome" | "note" | "observed_at" | "note_too_long" | null
  >(null);

  const outcomeRef = useRef<HTMLDivElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const observedRef = useRef<HTMLInputElement | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (!outcome) {
      setFieldError("outcome");
      outcomeRef.current?.focus();
      return;
    }
    const trimmed = note.trim();
    if (trimmed.length > NOTE_MAX) {
      setFieldError("note_too_long");
      noteRef.current?.focus();
      return;
    }
    if (actionFollowUpRequiresNote(outcome) && trimmed.length === 0) {
      setFieldError("note");
      noteRef.current?.focus();
      return;
    }
    const iso = localInputToIso(observedAtLocal);
    if (!iso) {
      setFieldError("observed_at");
      observedRef.current?.focus();
      return;
    }
    setFieldError(null);
    onSubmit({ outcome, note: trimmed, observedAt: iso, photoReference, sensorSnapshotId });
  }

  const showNoteRequired = outcome && actionFollowUpRequiresNote(outcome);

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="action-followup-form"
      className="space-y-4"
      aria-describedby={errorMessage ? "action-followup-form-error" : undefined}
      noValidate
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Outcome</legend>
        <div
          role="radiogroup"
          aria-label="Outcome"
          aria-required="true"
          aria-invalid={fieldError === "outcome"}
          ref={outcomeRef}
          tabIndex={-1}
          className="grid gap-2 sm:grid-cols-2"
        >
          {ACTION_FOLLOWUP_OUTCOMES.map((o) => {
            const id = `action-followup-outcome-${o}`;
            const checked = outcome === o;
            return (
              <label
                key={o}
                htmlFor={id}
                className={`flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer transition ${
                  checked
                    ? "border-primary bg-primary/10"
                    : "border-border/40 hover:bg-secondary/30"
                }`}
              >
                <input
                  id={id}
                  type="radio"
                  name="action-followup-outcome"
                  value={o}
                  checked={checked}
                  onChange={() => {
                    setOutcome(o);
                    if (fieldError === "outcome") setFieldError(null);
                  }}
                  disabled={saving}
                  data-testid={`action-followup-outcome-${o}`}
                />
                <span>{OUTCOME_LABEL[o]}</span>
              </label>
            );
          })}
        </div>
        {fieldError === "outcome" && (
          <p role="alert" className="text-xs text-red-500">
            Select an outcome to continue.
          </p>
        )}
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor="action-followup-note">
          What did you observe?
          {showNoteRequired ? (
            <span className="ml-1 text-xs text-muted-foreground">(required)</span>
          ) : (
            <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
          )}
        </Label>
        <Textarea
          id="action-followup-note"
          ref={noteRef}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (fieldError === "note" || fieldError === "note_too_long") setFieldError(null);
          }}
          maxLength={NOTE_MAX + 200}
          rows={3}
          disabled={saving}
          aria-invalid={fieldError === "note" || fieldError === "note_too_long"}
          data-testid="action-followup-note"
        />
        {fieldError === "note" && (
          <p role="alert" className="text-xs text-red-500">
            Add a short observation to describe what you saw.
          </p>
        )}
        {fieldError === "note_too_long" && (
          <p role="alert" className="text-xs text-red-500">
            Keep the observation under {NOTE_MAX} characters.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="action-followup-observed-at">Observed at</Label>
        <Input
          id="action-followup-observed-at"
          ref={observedRef}
          type="datetime-local"
          value={observedAtLocal}
          onChange={(e) => {
            setObservedAtLocal(e.target.value);
            if (fieldError === "observed_at") setFieldError(null);
          }}
          disabled={saving}
          aria-invalid={fieldError === "observed_at"}
          data-testid="action-followup-observed-at"
        />
        {fieldError === "observed_at" && (
          <p role="alert" className="text-xs text-red-500">
            Enter a valid observation time.
          </p>
        )}
      </div>

      {photoSelectorSlot}
      {sensorSelectorSlot}

      {errorMessage && (
        <p
          id="action-followup-form-error"
          role="alert"
          className="text-sm text-red-500"
          data-testid="action-followup-form-error"
        >
          {errorMessage}
        </p>
      )}

      <div
        aria-live="polite"
        className="sr-only"
        data-testid="action-followup-form-status"
      >
        {saving ? "Saving follow-up…" : ""}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={saving}
          className="min-h-[44px]"
          data-testid="action-followup-submit"
        >
          {saving ? "Saving…" : "Save follow-up"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={saving}
            className="min-h-[44px]"
            data-testid="action-followup-cancel"
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
