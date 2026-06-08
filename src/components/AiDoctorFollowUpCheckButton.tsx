/**
 * AiDoctorFollowUpCheckButton — presenter-only "Create 24-hour Follow-Up
 * Check" action. Renders next to the AI Doctor diagnosis card.
 *
 * Behavior:
 *  - Renders the action only when context is sufficient.
 *  - Opens a preview dialog with title, due time, checklist, posture,
 *    source caution, and guardrails.
 *  - Has TWO write modes:
 *      1. `onCreate` callback provided  → calls it (caller wires safe write).
 *      2. No `onCreate`                  → draft-only: Copy to clipboard +
 *         local "Mark created" toggle (no DB / no Action Queue).
 *  - Never calls fetch / supabase / edge-function invokes / device control.
 *  - Duplicate detection via deterministic idempotency key against
 *    `existingFollowUpKeys` supplied by the caller.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildAiDoctorFollowUpDraft,
  evaluateFollowUpEligibility,
  isDuplicateFollowUp,
  FOLLOWUP_INELIGIBLE_COPY,
  type AiDoctorFollowUpDraft,
  type AiDoctorFollowUpInputs,
} from "@/lib/aiDoctorFollowUpRules";

export interface AiDoctorFollowUpCheckButtonProps {
  inputs: AiDoctorFollowUpInputs;
  /** Idempotency keys for follow-ups already created in this session/store. */
  existingFollowUpKeys?: readonly string[] | null;
  /**
   * Optional safe write callback. If omitted, the dialog falls back to
   * draft preview + copy-to-clipboard only (no persistence).
   */
  onCreate?: (draft: AiDoctorFollowUpDraft) => Promise<void> | void;
  /** Optional link to navigate to an existing follow-up if duplicate. */
  existingFollowUpHref?: string | null;
  testIdPrefix?: string;
}

const BUTTON_COPY = "Create 24-hour Follow-Up Check";

export default function AiDoctorFollowUpCheckButton({
  inputs,
  existingFollowUpKeys,
  onCreate,
  existingFollowUpHref,
  testIdPrefix,
}: AiDoctorFollowUpCheckButtonProps) {
  const tid = (s: string) => (testIdPrefix ? `${testIdPrefix}-${s}` : s);

  const eligibility = useMemo(
    () => evaluateFollowUpEligibility(inputs),
    [inputs],
  );
  const draft = useMemo<AiDoctorFollowUpDraft | null>(
    () => (eligibility.ok ? buildAiDoctorFollowUpDraft(inputs) : null),
    [eligibility.ok, inputs],
  );
  const isDuplicate = useMemo(
    () => (draft ? isDuplicateFollowUp(draft.idempotencyKey, existingFollowUpKeys) : false),
    [draft, existingFollowUpKeys],
  );

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localCreated, setLocalCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (eligibility.ok === false) {
    const reason = eligibility.reason;
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid={tid("ai-doctor-follow-up-disabled")}
        data-reason={reason}
      >
        {FOLLOWUP_INELIGIBLE_COPY[reason]}
      </p>
    );
  }
  if (!draft) return null;

  if (isDuplicate || localCreated) {
    return (
      <div
        className="text-xs text-muted-foreground flex items-center gap-2"
        data-testid={tid("ai-doctor-follow-up-already-created")}
      >
        <span>Follow-up already created.</span>
        {existingFollowUpHref ? (
          <a
            href={existingFollowUpHref}
            className="underline"
            aria-label="Open existing AI Doctor follow-up"
          >
            View it.
          </a>
        ) : null}
      </div>
    );
  }

  const draftOnly = typeof onCreate !== "function";

  async function handleCreate() {
    if (!draft) return;
    setError(null);
    setSubmitting(true);
    try {
      if (typeof onCreate === "function") {
        await onCreate(draft);
      }
      setLocalCreated(true);
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create follow-up. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!draft) return;
    try {
      const clip = (globalThis as { navigator?: Navigator }).navigator?.clipboard;
      if (clip && typeof clip.writeText === "function") {
        await clip.writeText(draft.body);
        setCopied(true);
      }
    } catch {
      // Silent — copy is a convenience only.
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid={tid("ai-doctor-follow-up-button")}
        data-mode={draftOnly ? "draft-only" : "write"}
      >
        {BUTTON_COPY}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid={tid("ai-doctor-follow-up-dialog")}>
          <DialogHeader>
            <DialogTitle data-testid={tid("ai-doctor-follow-up-title")}>
              {draft.title}
            </DialogTitle>
            <DialogDescription
              data-testid={tid("ai-doctor-follow-up-due")}
            >
              Planned recheck: {draft.dueAt} · Evidence basis:{" "}
              <span data-testid={tid("ai-doctor-follow-up-posture")}>
                {draft.postureLabel}
              </span>
            </DialogDescription>
          </DialogHeader>

          <ul
            className="text-xs space-y-1 list-disc pl-4"
            data-testid={tid("ai-doctor-follow-up-checklist")}
          >
            {draft.checklist.map((c, i) => (
              <li key={`c-${i}`}>{c}</li>
            ))}
          </ul>

          {draft.sourceNotes.length > 0 ? (
            <ul
              className="text-xs space-y-1 list-disc pl-4 text-muted-foreground"
              data-testid={tid("ai-doctor-follow-up-source-notes")}
            >
              {draft.sourceNotes.map((s, i) => (
                <li key={`s-${i}`}>{s}</li>
              ))}
            </ul>
          ) : null}

          {draft.guardrails.length > 0 ? (
            <ul
              className="text-xs space-y-1 list-disc pl-4 text-amber-300"
              data-testid={tid("ai-doctor-follow-up-guardrails")}
              role="note"
            >
              {draft.guardrails.map((g, i) => (
                <li key={`g-${i}`}>{g}</li>
              ))}
            </ul>
          ) : null}

          {draftOnly ? (
            <p
              className="text-[11px] text-muted-foreground"
              data-testid={tid("ai-doctor-follow-up-draft-only")}
            >
              Draft-only mode — no diary or task write path is available yet.
              Use Copy to save it manually.
            </p>
          ) : null}

          {error ? (
            <p
              className="text-xs text-amber-300"
              role="alert"
              data-testid={tid("ai-doctor-follow-up-error")}
            >
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              data-testid={tid("ai-doctor-follow-up-cancel")}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              data-testid={tid("ai-doctor-follow-up-copy")}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCreate}
              disabled={submitting}
              data-testid={tid("ai-doctor-follow-up-create")}
            >
              {draftOnly ? "Mark created" : "Create Follow-Up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
