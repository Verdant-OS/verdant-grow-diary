/**
 * OneTentLoopNextStepCard — presenter-only card that surfaces the next
 * safe step in the One-Tent Loop. Pure UI. No data fetching, no model
 * calls, no hardware-side-effects, no auto-execution.
 *
 * - Uses safe CTA labels from oneTentLoopNavigationRules.
 * - Shows a calm disabled state when required ids are missing.
 * - Never renders internal IDs as visible copy.
 * - Action Queue wording is always approval-required.
 */
import { Link } from "@/lib/react-router-compat";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ONE_TENT_LOOP_STEP_LABEL,
  ONE_TENT_LOOP_HELPER_COPY,
  ONE_TENT_LOOP_PENDING_COPY,
  resolveOneTentLoopNextStep,
  type OneTentLoopIds,
  type OneTentLoopStep,
} from "@/lib/oneTentLoopNavigationRules";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

interface Props {
  current: OneTentLoopStep;
  ids?: OneTentLoopIds;
  className?: string;
  testId?: string;
  /**
   * Hold the CTA while a carried selection is still being verified.
   *
   * Presenter-only and opt-in: the owning page decides, because only it
   * knows whether a second read is still in flight. Defaults false, so no
   * existing mount changes. Never use this for a FAILED read — that is
   * terminal and the step should stay offered without the carry.
   */
  pending?: boolean;
}

export default function OneTentLoopNextStepCard({
  current,
  ids,
  className,
  testId,
  pending = false,
}: Props) {
  const step = resolveOneTentLoopNextStep(current, ids);
  const resolvedTestId = testId ?? "one-tent-loop-next-step-card";
  const currentLabel = ONE_TENT_LOOP_STEP_LABEL[current];
  const nextLabel = step.next ? ONE_TENT_LOOP_STEP_LABEL[step.next] : null;

  return (
    <div
      data-testid={resolvedTestId}
      data-current-step={current}
      data-next-step={step.next ?? ""}
      className={
        "rounded-2xl border border-border/60 bg-secondary/30 p-4 space-y-2 " + (className ?? "")
      }
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        One-Tent Loop · {currentLabel}
      </div>
      {nextLabel && (
        <div className="text-sm">
          Next step: <span className="font-medium">{nextLabel}</span>
        </div>
      )}
      {ONE_TENT_LOOP_HELPER_COPY[current] && (
        <p className="text-xs text-muted-foreground" data-testid={`${resolvedTestId}-helper`}>
          {ONE_TENT_LOOP_HELPER_COPY[current]}
        </p>
      )}
      {pending ? (
        // Distinct from `-disabled`: that means "select a record", this means
        // "already selected, still checking". A test that cannot tell them
        // apart cannot prove the hold is the reason the CTA is absent.
        <p
          className="text-xs text-muted-foreground"
          role="status"
          data-testid={`${resolvedTestId}-pending`}
        >
          {ONE_TENT_LOOP_PENDING_COPY}
        </p>
      ) : step.disabled ? (
        <p className="text-xs text-muted-foreground" data-testid={`${resolvedTestId}-disabled`}>
          {step.disabledReason}
        </p>
      ) : step.intent === "open_quick_log" && step.quickLogPrefill ? (
        <Button
          type="button"
          size="sm"
          data-testid={`${resolvedTestId}-cta`}
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, {
                detail: step.quickLogPrefill,
              }),
            );
          }}
        >
          {step.ctaLabel}
          <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
        </Button>
      ) : step.href ? (
        <Button asChild size="sm" data-testid={`${resolvedTestId}-cta`}>
          <Link to={step.href}>
            {step.ctaLabel}
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      ) : (
        <Button size="sm" disabled data-testid={`${resolvedTestId}-cta-inert`}>
          {step.ctaLabel}
        </Button>
      )}
    </div>
  );
}
