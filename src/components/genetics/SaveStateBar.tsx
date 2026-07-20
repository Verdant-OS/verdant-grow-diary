/**
 * Visible save lifecycle: pending / saved / failed, with a Retry that reuses the
 * same idempotency key (so it cannot duplicate the write). Presenter-only.
 */
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/hooks/useGeneticsMutations";

const REASON_COPY: Record<string, string> = {
  batch_code_exists: "That batch code is already in use.",
  plant_not_owned: "One or more selected plants are not yours.",
  cycle_detected: "That would create a lineage cycle.",
  reassign_reason_required: "Reassigning a plant needs a reason.",
  linked_reference_invalid: "A linked reference could not be found.",
  subject_not_found: "That subject could not be found.",
  screening_subject_mismatch: "That certificate is for a different subject.",
  screening_not_negative: "Only a negative result can clear quarantine.",
  contradicting_or_newer_evidence: "Newer or conflicting evidence blocks clearance.",
  idempotency_key_conflict: "This key was already used for a different request.",
};

export interface SaveStateBarProps {
  status: SaveStatus;
  error: string | null;
  onRetry: () => void;
  className?: string;
}

export function SaveStateBar({ status, error, onRetry, className }: SaveStateBarProps) {
  if (status === "idle") return null;
  return (
    <div
      data-testid="save-state-bar"
      data-status={status}
      aria-live="polite"
      className={cn("flex min-w-0 flex-wrap items-center gap-2 text-sm", className)}
    >
      {status === "pending" ? (
        <span className="inline-flex items-center gap-1.5 text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
        </span>
      ) : null}
      {status === "saved" ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Saved
        </span>
      ) : null}
      {status === "failed" ? (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              {(error && REASON_COPY[error]) || "Save failed — you can retry."}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={onRetry}
            data-testid="save-retry"
          >
            Retry
          </Button>
        </span>
      ) : null}
    </div>
  );
}

export default SaveStateBar;
