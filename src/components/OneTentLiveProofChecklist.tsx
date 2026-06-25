/**
 * OneTentLiveProofChecklist — presenter for the guided proof checklist.
 * All status/copy comes from `buildOneTentLiveProofViewModel`.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, AlertCircle, HelpCircle } from "lucide-react";
import type {
  ProofStep,
  ProofStepStatus,
  ProofViewModel,
} from "@/lib/oneTentLiveProofViewModel";

const STATUS_LABEL: Record<ProofStepStatus, string> = {
  pending: "Pending",
  complete: "Complete",
  stale: "Stale",
  "needs-confirmation": "Needs operator confirmation",
};

const STATUS_TONE: Record<ProofStepStatus, string> = {
  pending: "text-muted-foreground",
  complete: "text-emerald-700 dark:text-emerald-300",
  stale: "text-amber-700 dark:text-amber-300",
  "needs-confirmation": "text-amber-700 dark:text-amber-300",
};

function StatusIcon({ status }: { status: ProofStepStatus }) {
  if (status === "complete")
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
  if (status === "stale")
    return <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden />;
  if (status === "needs-confirmation")
    return <HelpCircle className="h-4 w-4 text-amber-600" aria-hidden />;
  return <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />;
}

function StepRow({ step }: { step: ProofStep }) {
  return (
    <li
      className="rounded-md border border-border p-3 space-y-1"
      data-testid={`one-tent-live-proof-step-${step.id}`}
      data-status={step.status}
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={step.status} />
        <span className="text-sm font-medium">
          {step.id}. {step.label}
        </span>
        <span
          className={`ml-auto text-[11px] ${STATUS_TONE[step.status]}`}
          data-testid={`one-tent-live-proof-step-${step.id}-status`}
        >
          {STATUS_LABEL[step.status]}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{step.message}</p>
      {step.missingEvidence ? (
        <p
          className="text-[11px] text-amber-700 dark:text-amber-300"
          data-testid={`one-tent-live-proof-step-${step.id}-missing-evidence`}
        >
          {step.missingEvidence}
        </p>
      ) : null}
      {step.ctaHref && step.ctaLabel ? (
        <div>
          <Button
            asChild
            size="sm"
            variant="outline"
            data-testid={`one-tent-live-proof-step-${step.id}-cta`}
          >
            <Link to={step.ctaHref}>{step.ctaLabel}</Link>
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export default function OneTentLiveProofChecklist({
  vm,
  testId = "one-tent-live-proof-checklist",
}: {
  vm: ProofViewModel;
  testId?: string;
}) {
  return (
    <ol
      className="space-y-2"
      data-testid={testId}
      aria-label="One-Tent Live Proof checklist"
    >
      {vm.steps.map((s) => (
        <StepRow key={s.id} step={s} />
      ))}
    </ol>
  );
}
