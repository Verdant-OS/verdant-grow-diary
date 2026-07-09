/**
 * PhenoHuntSetupProgressCard — presenter for the workspace "Continue setup"
 * card. Purely reflects the persisted hunt (evidence_goals, setup_completed_at)
 * + the loaded candidate count. Never infers evidence completion. Grower
 * clicks "Mark setup complete" to stamp setup_completed_at via the parent.
 */
import type { PhenoHuntSummary } from "@/lib/phenoHuntCandidatesService";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle } from "lucide-react";
import { PHENO_EVIDENCE_GOALS } from "@/lib/phenoEvidenceGoals";

export interface PhenoHuntSetupProgressCardProps {
  hunt: PhenoHuntSummary;
  candidateCount: number;
  onMarkComplete?: () => void;
  saving?: boolean;
  "data-testid"?: string;
}

interface ProgressItem {
  id: string;
  label: string;
  complete: boolean;
  detail: string;
}

export default function PhenoHuntSetupProgressCard({
  hunt,
  candidateCount,
  onMarkComplete,
  saving,
  ...rest
}: PhenoHuntSetupProgressCardProps) {
  const testId = rest["data-testid"] ?? "pheno-workspace-setup-progress";
  const goals = hunt.evidenceGoals ?? [];
  const setupDone = !!hunt.setupCompletedAt;

  const items: ProgressItem[] = [
    {
      id: "basics",
      label: "Hunt basics",
      complete: hunt.name.trim().length > 0 && !!hunt.growId,
      detail: hunt.name,
    },
    {
      id: "candidates",
      label: "Candidate plants",
      complete: candidateCount >= 1,
      detail:
        candidateCount === 0
          ? "No candidates tagged yet"
          : candidateCount === 1
            ? "1 candidate — tracking only, not comparison-ready"
            : `${candidateCount} candidates — comparison-eligible`,
    },
    {
      id: "goals",
      label: "Evidence goals",
      complete: goals.length > 0,
      detail:
        goals.length > 0
          ? `${goals.length} of ${PHENO_EVIDENCE_GOALS.length} goals selected`
          : "No evidence goals selected yet",
    },
    {
      id: "confirmation",
      label: "Setup confirmed",
      complete: setupDone,
      detail: setupDone
        ? "Setup marked complete"
        : "Mark setup complete to finish onboarding",
    },
  ];

  const missing = items.filter((i) => !i.complete);
  const allDone = missing.length === 0;

  return (
    <section
      data-testid={testId}
      data-setup-complete={setupDone ? "true" : "false"}
      data-missing-count={missing.length}
      className="glass rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {allDone ? "Setup complete" : "Continue setup"}
        </h2>
        <span className="text-xs text-muted-foreground" data-testid={`${testId}-count`}>
          {items.length - missing.length} of {items.length} steps done
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((i) => {
          const Icon = i.complete ? CheckCircle2 : Circle;
          return (
            <li
              key={i.id}
              data-testid={`${testId}-item-${i.id}`}
              data-complete={i.complete ? "true" : "false"}
              className="flex items-start gap-2 text-sm"
            >
              <Icon
                aria-hidden="true"
                className={
                  "h-4 w-4 mt-0.5 flex-none " +
                  (i.complete ? "text-primary" : "text-muted-foreground")
                }
              />
              <div className="min-w-0">
                <div className="font-medium">{i.label}</div>
                <div className="text-xs text-muted-foreground">{i.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {!setupDone && onMarkComplete ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={onMarkComplete}
            disabled={!!saving || candidateCount === 0 || goals.length === 0}
            data-testid={`${testId}-mark-complete`}
          >
            {saving ? "Saving…" : "Mark setup complete"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
