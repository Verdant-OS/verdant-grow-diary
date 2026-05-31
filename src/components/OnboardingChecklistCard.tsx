import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Sprout } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { OnboardingChecklistViewModel } from "@/lib/onboardingChecklistViewModel";

/**
 * First-run onboarding checklist card.
 *
 * Pure presenter — all activation logic lives in
 * `onboardingChecklistViewModel`. The card never fetches data, never
 * writes anything, and never blocks the dashboard.
 */
export default function OnboardingChecklistCard({
  vm,
}: {
  vm: OnboardingChecklistViewModel;
}) {
  // Fully-activated users see a compact "memory active" line. Everyone
  // else sees the full checklist.
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

  return (
    <Card data-testid="onboarding-checklist-card" className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sprout className="h-4 w-4 text-primary" /> Get your grow started
        </CardTitle>
        <p className="text-sm text-muted-foreground">{vm.intro}</p>
        <p className="text-xs text-muted-foreground">{vm.honestyNote}</p>
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
