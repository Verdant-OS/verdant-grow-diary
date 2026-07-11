/**
 * LearningDecisionDialog — grower chooses repeat / avoid / adjust / monitor
 * for a closed-outcome episode.
 *
 * SAFETY:
 *  - The grower selects the decision. Verdant never pre-selects it and never
 *    derives it from the outcome (improved may still be monitor; worsened
 *    may still be adjust).
 *  - Presenter only: the write goes through the injected onSave callback,
 *    which the page wires to saveRunLearningDecision. No Supabase here.
 *  - Copy is explicit that this is a grower decision, not a causal claim.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  LEARNING_RATIONALE_MAX_LENGTH,
  NEXT_RUN_DECISIONS,
  buildRunLearningDecisionDraft,
  type NextRunDecision,
  type PlantMemoryEpisode,
  type RunLearningDecisionDraft,
} from "@/lib/plantMemoryEpisodeRules";
import { NEXT_RUN_DECISION_LABELS } from "@/lib/plantMemoryEpisodeViewModel";

const DECISION_HELP: Record<NextRunDecision, string> = {
  repeat: "Try the same approach again under similar conditions.",
  avoid: "Do not repeat this action under similar conditions.",
  adjust: "Change the timing, amount, method, or context next run.",
  monitor: "Evidence is not strong enough for a repeat/avoid decision yet.",
};

const RATIONALE_REQUIRED: ReadonlySet<NextRunDecision> = new Set(["avoid", "adjust"]);

export interface LearningDecisionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly episode: PlantMemoryEpisode;
  /** Injected persistence — page wires this to saveRunLearningDecision. */
  readonly onSave: (draft: RunLearningDecisionDraft) => Promise<{ ok: boolean; message?: string }>;
  readonly nowIso: string;
}

export function LearningDecisionDialog({
  open,
  onOpenChange,
  episode,
  onSave,
  nowIso,
}: LearningDecisionDialogProps) {
  const [decision, setDecision] = useState<NextRunDecision | null>(
    episode.learning.decision,
  );
  const [rationale, setRationale] = useState(episode.learning.rationale ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDecision(episode.learning.decision);
      setRationale(episode.learning.rationale ?? "");
      setError(null);
      setSubmitting(false);
    }
  }, [open, episode.learning.decision, episode.learning.rationale]);

  const rationaleRequired = decision ? RATIONALE_REQUIRED.has(decision) : false;
  const rationaleTrimmed = rationale.trim();
  const rationaleOverLimit = rationaleTrimmed.length > LEARNING_RATIONALE_MAX_LENGTH;

  const canSubmit = useMemo(() => {
    if (!decision || submitting) return false;
    if (rationaleRequired && rationaleTrimmed.length === 0) return false;
    if (rationaleOverLimit) return false;
    return true;
  }, [decision, submitting, rationaleRequired, rationaleTrimmed, rationaleOverLimit]);

  const submit = async () => {
    if (!decision) return;
    const result = buildRunLearningDecisionDraft(episode, {
      decision,
      rationale: rationaleTrimmed.length > 0 ? rationaleTrimmed : null,
      recordedAt: nowIso,
    });
    // strictNullChecks is off in this project, so the ok/false union does not
    // narrow via `result.ok`. Cast the failure branch, matching the existing
    // convention in ActionDetail.tsx (buildActionOutcomeDiaryDraft consumer).
    if (!result.ok) {
      const reason = (result as { ok: false; reason: string }).reason;
      setError(
        reason === "rationale_required"
          ? "A short rationale is required for Avoid and Adjust."
          : reason === "rationale_too_long"
            ? "That rationale is too long. Shorten it and try again."
            : "This decision could not be saved. Review the episode.",
      );
      return;
    }
    const { draft } = result;
    setSubmitting(true);
    setError(null);
    const saved = await onSave(draft);
    setSubmitting(false);
    if (!saved.ok) {
      setError(saved.message ?? "Could not save this decision. Try again shortly.");
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>What should you do with this lesson next run?</DialogTitle>
          <DialogDescription>
            This is your grower decision based on this run. Verdant is not claiming the
            action caused the outcome.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={decision ?? undefined}
          onValueChange={(value) => setDecision(value as NextRunDecision)}
          aria-label="Next-run decision"
          className="space-y-2"
        >
          {NEXT_RUN_DECISIONS.map((option) => (
            <label
              key={option}
              htmlFor={`decision-${option}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50"
            >
              <RadioGroupItem value={option} id={`decision-${option}`} className="mt-1" />
              <span>
                <span className="block font-medium">{NEXT_RUN_DECISION_LABELS[option]}</span>
                <span className="block text-sm text-muted-foreground">
                  {DECISION_HELP[option]}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>

        <div className="space-y-1">
          <Label htmlFor="decision-rationale">
            Rationale{rationaleRequired ? " (required)" : " (optional)"}
          </Label>
          <Textarea
            id="decision-rationale"
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            maxLength={LEARNING_RATIONALE_MAX_LENGTH}
            placeholder="What did you observe, and what would you keep or change?"
            aria-describedby="decision-rationale-help"
          />
          <p id="decision-rationale-help" className="text-xs text-muted-foreground">
            {rationaleTrimmed.length}/{LEARNING_RATIONALE_MAX_LENGTH} characters. Your own notes;
            no automatic action is taken.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? "Saving…" : "Save next-run decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
