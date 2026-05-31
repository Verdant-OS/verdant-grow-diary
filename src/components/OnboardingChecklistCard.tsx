import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Sprout, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { OnboardingChecklistViewModel } from "@/lib/onboardingChecklistViewModel";
import { useOnboardingChecklistDismissed } from "@/lib/localOnboardingPreferences";

/**
 * First-run onboarding checklist card.
 *
 * Pure presenter — all activation logic lives in
 * `onboardingChecklistViewModel`. The card never fetches data, never
 * writes anything, and never blocks the dashboard.
 *
 * Local-only dismiss: the "Got it" button hides this card via a
 * localStorage-backed preference. The Dashboard still renders the
 * compact `OnboardingProgressPill` so users are not stranded.
 */
export default function OnboardingChecklistCard({
  vm,
}: {
  vm: OnboardingChecklistViewModel;
}) {
  const { isDismissed, dismiss } = useOnboardingChecklistDismissed();

  // Fully-activated users see a compact "memory active" line. Everyone
  // else sees the full checklist (unless they have locally dismissed it).
  if (vm.isFullyActivated) {
    return (
      <div
        data-testid="onboarding-checklist-completed"
        className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary flex items-center gap-2"
      >
        <CheckCircle2 className="h-4 w-4" />
        <span className="font-medium">{vm.completedHeadline}</span>
      </div>
    );
  }

  if (isDismissed) {
    // Card hidden by user. Dashboard header progress pill remains.
    return null;
  }

  return (
    <Card data-testid="onboarding-checklist-card" className="border-primary/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sprout className="h-4 w-4 text-primary" /> Get your grow started
            </CardTitle>
            <p className="text-sm text-muted-foreground">{vm.intro}</p>
            <p className="text-xs text-muted-foreground">{vm.honestyNote}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="onboarding-checklist-dismiss"
            aria-label="Hide onboarding checklist"
            onClick={dismiss}
            className="shrink-0 -mr-2"
          >
            <X className="h-3.5 w-3.5" />
            <span className="ml-1 text-xs">Got it</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground mb-3">
          {vm.completeCount} of {vm.totalCount} complete
        </div>
        <ul className="space-y-2">
          {vm.steps.map((s) => (
            <li
              key={s.key}
              data-testid={`onboarding-step-${s.key}`}
              data-complete={s.complete ? "true" : "false"}
              className="flex items-start gap-3 rounded-lg border border-border/40 bg-card/40 p-3"
            >
              {s.complete ? (
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" aria-label="complete" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground mt-0.5" aria-label="incomplete" />
              )}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${s.complete ? "text-muted-foreground line-through" : ""}`}>
                  {s.title}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>
              </div>
              {!s.complete && (
                <Link to={s.href} className="shrink-0">
                  <Button size="sm" variant="outline">{s.ctaLabel}</Button>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
