import type { PhenoOnboardingViewModel } from "@/lib/phenoHuntOnboardingViewModel";
import { CheckCircle2, Circle, Clock } from "lucide-react";

/**
 * PhenoComparisonReadyChecklist — presenter for the readiness checklist
 * from the onboarding view model. No business logic here; statuses come
 * straight from `computePhenoHuntOnboardingViewModel`.
 */
export interface PhenoComparisonReadyChecklistProps {
  vm: PhenoOnboardingViewModel;
  "data-testid"?: string;
}

const STATUS_ICON = {
  ok: CheckCircle2,
  missing: Circle,
  pending: Clock,
} as const;

const STATUS_TEXT = {
  ok: "text-primary",
  missing: "text-muted-foreground",
  pending: "text-muted-foreground",
} as const;

export default function PhenoComparisonReadyChecklist({
  vm,
  ...rest
}: PhenoComparisonReadyChecklistProps) {
  const testId = rest["data-testid"] ?? "pheno-comparison-ready-checklist";
  return (
    <section
      data-testid={testId}
      data-readiness={vm.readiness}
      className="space-y-3"
    >
      <div
        className="flex items-center gap-2 text-sm"
        data-testid={`${testId}-readiness`}
      >
        <span className="font-medium">Readiness:</span>
        <span>{vm.readinessLabel}</span>
      </div>
      <ul className="space-y-1.5">
        {vm.checklist.map((item) => {
          const Icon = STATUS_ICON[item.status];
          return (
            <li
              key={item.id}
              data-testid={`${testId}-item-${item.id}`}
              data-status={item.status}
              className="flex items-start gap-2 text-sm"
            >
              <Icon
                aria-hidden="true"
                className={`h-4 w-4 mt-0.5 flex-none ${STATUS_TEXT[item.status]}`}
              />
              <div className="min-w-0">
                <div className="font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
