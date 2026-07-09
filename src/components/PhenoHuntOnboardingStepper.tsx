import type {
  PhenoOnboardingStep,
  PhenoOnboardingStepId,
} from "@/lib/phenoHuntOnboardingViewModel";
import { CheckCircle2, Circle } from "lucide-react";

/**
 * PhenoHuntOnboardingStepper — presenter for the guided onboarding flow.
 * Renders step labels + completion state driven by the pure view model.
 */
export interface PhenoHuntOnboardingStepperProps {
  steps: ReadonlyArray<PhenoOnboardingStep>;
  currentStepId: PhenoOnboardingStepId;
  onStepSelect?: (id: PhenoOnboardingStepId) => void;
  "data-testid"?: string;
}

export default function PhenoHuntOnboardingStepper({
  steps,
  currentStepId,
  onStepSelect,
  ...rest
}: PhenoHuntOnboardingStepperProps) {
  const testId = rest["data-testid"] ?? "pheno-onboarding-stepper";
  return (
    <ol
      data-testid={testId}
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      {steps.map((s, idx) => {
        const isCurrent = s.id === currentStepId;
        const Icon = s.complete ? CheckCircle2 : Circle;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStepSelect?.(s.id)}
              data-testid={`${testId}-step-${s.id}`}
              data-current={isCurrent ? "true" : "false"}
              data-complete={s.complete ? "true" : "false"}
              className={
                "flex items-center gap-1 rounded-full border px-2 py-1 " +
                (isCurrent
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground")
              }
            >
              <Icon
                aria-hidden="true"
                className={
                  "h-3.5 w-3.5 " +
                  (s.complete ? "text-primary" : "text-muted-foreground")
                }
              />
              <span className="font-medium">{idx + 1}.</span>
              <span>{s.label}</span>
            </button>
            {idx < steps.length - 1 ? (
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
