import { CheckCircle2, Sprout } from "lucide-react";
import type { OnboardingChecklistViewModel } from "@/lib/onboardingChecklistViewModel";

/**
 * Compact Dashboard header pill summarizing onboarding progress.
 *
 * Pure presenter. Reads everything off the shared view model so the
 * checklist card and pill cannot drift out of sync. Renders nothing
 * heavy — always safe to mount.
 */
export default function OnboardingProgressPill({
  vm,
  className,
}: {
  vm: OnboardingChecklistViewModel;
  className?: string;
}) {
  const activated = vm.isFullyActivated;
  const label = activated
    ? "Grow memory active"
    : `${vm.completeCount} of ${vm.totalCount} steps done`;

  const Icon = activated ? CheckCircle2 : Sprout;
  const tone = activated
    ? "border-primary/40 bg-primary/10 text-primary"
    : "border-border/50 bg-secondary/40 text-muted-foreground";

  return (
    <div
      data-testid="onboarding-progress-pill"
      data-activated={activated ? "true" : "false"}
      data-complete-count={vm.completeCount}
      data-total-count={vm.totalCount}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tone} ${className ?? ""}`}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </div>
  );
}
