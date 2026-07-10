/**
 * PhenoHuntSetupProgressCard — presenter for the workspace "Continue setup"
 * card. Purely reflects the persisted hunt (evidence_goals, setup_completed_at)
 * + the loaded candidate count. Never infers evidence completion. Grower
 * clicks "Mark setup complete" to stamp setup_completed_at via the parent.
 *
 * Setup complete ≠ Comparison-ready. This card renders them as two
 * separate status lines and includes the canonical definitions from
 * `phenoOnboardingCopy` so growers are never misled.
 */
import type { PhenoHuntSummary } from "@/lib/phenoHuntCandidatesService";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle } from "lucide-react";
import { PHENO_EVIDENCE_GOALS } from "@/lib/phenoEvidenceGoals";
import {
  PHENO_COMPARISON_READY_DEFINITION,
  PHENO_SETUP_COMPLETE_DEFINITION,
  PHENO_STATUS_LABELS,
} from "@/constants/phenoOnboardingCopy";

export type PhenoWorkspaceComparisonReadiness =
  | "not_ready"
  | "ready_for_tracking"
  | "missing_evidence"
  | "pending_until_harvest"
  | "pending_until_cure"
  | "comparison_ready";

export interface PhenoHuntSetupProgressCardProps {
  hunt: PhenoHuntSummary;
  candidateCount: number;
  /**
   * Comparison-readiness reported by the workspace based on real recorded
   * evidence. Never derived from setup state. Defaults to "not_ready" so
   * we never imply comparison-ready without evidence.
   */
  comparisonReadiness?: PhenoWorkspaceComparisonReadiness;
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

const COMPARISON_READINESS_LABEL: Record<
  PhenoWorkspaceComparisonReadiness,
  string
> = {
  not_ready: PHENO_STATUS_LABELS.notComparisonReadyYet,
  ready_for_tracking: PHENO_STATUS_LABELS.readyForTracking,
  missing_evidence: PHENO_STATUS_LABELS.missingEvidence,
  pending_until_harvest: PHENO_STATUS_LABELS.pendingUntilHarvest,
  pending_until_cure: PHENO_STATUS_LABELS.pendingUntilCure,
  comparison_ready: PHENO_STATUS_LABELS.comparisonReady,
};

export default function PhenoHuntSetupProgressCard({
  hunt,
  candidateCount,
  comparisonReadiness = "not_ready",
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
  const comparisonLabel = COMPARISON_READINESS_LABEL[comparisonReadiness];

  return (
    <section
      data-testid={testId}
      data-setup-complete={setupDone ? "true" : "false"}
      data-missing-count={missing.length}
      data-comparison-readiness={comparisonReadiness}
      className="glass rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {allDone
            ? PHENO_STATUS_LABELS.setupComplete
            : "Continue setup"}
        </h2>
        <span className="text-xs text-muted-foreground" data-testid={`${testId}-count`}>
          {items.length - missing.length} of {items.length} steps done
        </span>
      </div>

      {/* Setup vs Comparison-ready — always two separate lines. */}
      <div
        className="grid gap-1 text-xs"
        data-testid={`${testId}-status-lines`}
      >
        <div data-testid={`${testId}-setup-status`}>
          <span className="font-medium">{PHENO_STATUS_LABELS.setupComplete}:</span>{" "}
          <span className="text-muted-foreground">
            {setupDone ? "Yes" : "Not yet"}
          </span>
        </div>
        <div data-testid={`${testId}-comparison-status`}>
          <span className="font-medium">Comparison readiness:</span>{" "}
          <span className="text-muted-foreground">{comparisonLabel}</span>
        </div>
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

      <div
        className="text-xs text-muted-foreground space-y-1 pt-1 border-t border-border/50"
        data-testid={`${testId}-definitions`}
      >
        <p data-testid={`${testId}-definition-setup`}>
          {PHENO_SETUP_COMPLETE_DEFINITION}
        </p>
        <p data-testid={`${testId}-definition-comparison`}>
          {PHENO_COMPARISON_READY_DEFINITION}
        </p>
      </div>

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
