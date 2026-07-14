import { CheckCircle2 } from "lucide-react";
import type { PhenoEvidenceGoalId } from "@/lib/phenoEvidenceGoals";
import type { PhenoEvidenceCaptureContext } from "@/hooks/usePhenoEvidenceCaptureContext";

interface Props {
  status: "loading" | "ready" | "error";
  context: PhenoEvidenceCaptureContext | null;
  candidateLabel: string | null;
  selectedGoal: PhenoEvidenceGoalId | null;
  onSelectedGoalChange: (goal: PhenoEvidenceGoalId | null) => void;
}

export default function PhenoEvidenceQuickLogPanel({
  status,
  context,
  candidateLabel,
  selectedGoal,
  onSelectedGoalChange,
}: Props) {
  return (
    <section
      data-testid="quick-log-pheno-evidence-panel"
      data-status={status}
      aria-label="Pheno hunt evidence"
      className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2"
    >
      <div className="space-y-0.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Pheno evidence{candidateLabel ? ` · ${candidateLabel}` : ""}
        </h3>
        {context?.huntName && (
          <p className="text-xs text-foreground" data-testid="quick-log-pheno-hunt-name">
            {context.huntName}
          </p>
        )}
      </div>

      {status === "loading" ? (
        <p className="text-xs text-muted-foreground" role="status">
          Loading this candidate’s evidence goals…
        </p>
      ) : status === "error" || !context ? (
        <p className="text-xs text-muted-foreground" role="status">
          Pheno tagging is unavailable right now. Your regular Quick Log can still be saved.
        </p>
      ) : context.coverage.totalCount === 0 ? (
        <p className="text-xs text-muted-foreground">
          This hunt has no evidence goals configured. Add goals in the Pheno workspace first.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Tag this manual observation to one goal. This records evidence only—it does not rank
            candidates or make selections.
          </p>
          <div
            role="radiogroup"
            aria-label="Pheno evidence goal"
            data-testid="quick-log-pheno-evidence-goals"
            className="flex flex-wrap gap-1.5"
          >
            {context.coverage.goals.map((goal) => {
              const selected = selectedGoal === goal.id;
              return (
                <button
                  key={goal.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${goal.label}${goal.recorded ? ", previously recorded" : ""}`}
                  data-testid={`quick-log-pheno-evidence-goal-${goal.id}`}
                  data-recorded={goal.recorded ? "true" : "false"}
                  onClick={() => onSelectedGoalChange(selected ? null : goal.id)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? "border-emerald-600 bg-emerald-500/20 text-foreground"
                      : "border-border/60 bg-background text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {goal.recorded && <CheckCircle2 className="h-3 w-3" aria-hidden />}
                  {goal.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground" data-testid="quick-log-pheno-coverage">
            {context.coverage.completedCount} of {context.coverage.totalCount} goals have at least
            one saved receipt for this candidate.
          </p>
        </>
      )}
    </section>
  );
}
