import { useState } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  buildAttributedPricingPath,
  type PaidAcquisitionSource,
} from "@/lib/paidAcquisitionAttributionRules";
import { trackPricingEvent } from "@/lib/pricingAnalytics";
import {
  getNextPublicOneTentTourStepId,
  PUBLIC_ONE_TENT_TOUR_STEPS,
  resolvePublicOneTentTourStep,
  type PublicOneTentTourStepId,
} from "@/lib/publicOneTentTourRules";
import { buildAttributedSignupPath } from "@/lib/signupAcquisitionRules";

interface PublicOneTentTourProps {
  hasAccount: boolean;
  acquisitionSource?: PaidAcquisitionSource;
}

export default function PublicOneTentTour({
  hasAccount,
  acquisitionSource = "landing_page",
}: PublicOneTentTourProps) {
  const signupPath = buildAttributedSignupPath({ source: acquisitionSource });
  const pricingPath = buildAttributedPricingPath({ source: acquisitionSource });
  const [activeId, setActiveId] = useState<PublicOneTentTourStepId>("home");
  const activeStep = resolvePublicOneTentTourStep(activeId);
  const nextStepId = getNextPublicOneTentTourStepId(activeId);

  const selectStep = (stepId: PublicOneTentTourStepId) => {
    setActiveId(stepId);
    trackPricingEvent("landing_loop_step_viewed", {
      item: stepId,
      source: "one_tent_tour",
    });
  };

  const moveTabFocus = (
    currentId: PublicOneTentTourStepId,
    key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
  ) => {
    const currentIndex = PUBLIC_ONE_TENT_TOUR_STEPS.findIndex((step) => step.id === currentId);
    const lastIndex = PUBLIC_ONE_TENT_TOUR_STEPS.length - 1;
    const targetIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? lastIndex
          : key === "ArrowRight"
            ? (currentIndex + 1) % PUBLIC_ONE_TENT_TOUR_STEPS.length
            : (currentIndex - 1 + PUBLIC_ONE_TENT_TOUR_STEPS.length) %
              PUBLIC_ONE_TENT_TOUR_STEPS.length;
    const target = PUBLIC_ONE_TENT_TOUR_STEPS[targetIndex];
    selectStep(target.id);
    document.getElementById(`public-one-tent-tour-tab-${target.id}`)?.focus();
  };

  return (
    <section
      id="loop"
      aria-labelledby="public-one-tent-tour-heading"
      className="scroll-mt-6 border-y border-border/50 bg-card/20 px-4 py-14 sm:px-6"
      data-testid="public-one-tent-tour"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
            Your first minute in Verdant
          </p>
          <h2
            id="public-one-tent-tour-heading"
            className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl"
          >
            Follow one decision through the full loop.
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
            See how a grow-room observation becomes plant memory, evidence-aware guidance, and an
            approval-required next step—without giving Verdant control of your equipment.
          </p>
          <div
            role="note"
            className="mx-auto mt-5 flex max-w-xl items-start justify-center gap-2 rounded-full border border-amber-400/40 bg-amber-50 px-4 py-2 text-left text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
            data-testid="public-one-tent-tour-demo-label"
          >
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Illustrative product walkthrough. No account data is loaded, and nothing shown here is
              live telemetry or a diagnosis.
            </span>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="One-Tent Loop walkthrough steps"
          className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5"
        >
          {PUBLIC_ONE_TENT_TOUR_STEPS.map((step) => {
            const selected = step.id === activeStep.id;
            return (
              <button
                key={step.id}
                id={`public-one-tent-tour-tab-${step.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="public-one-tent-tour-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => selectStep(step.id)}
                onKeyDown={(event) => {
                  if (
                    event.key === "ArrowLeft" ||
                    event.key === "ArrowRight" ||
                    event.key === "Home" ||
                    event.key === "End"
                  ) {
                    event.preventDefault();
                    moveTabFocus(step.id, event.key);
                  }
                }}
                className={`rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  selected
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
                data-testid={`public-one-tent-tour-tab-${step.id}`}
              >
                <span className="block text-[10px] font-medium uppercase tracking-[0.14em]">
                  Step {step.order} of {PUBLIC_ONE_TENT_TOUR_STEPS.length}
                </span>
                <span className="mt-1 block text-sm font-semibold">{step.navLabel}</span>
              </button>
            );
          })}
        </div>

        <div
          id="public-one-tent-tour-panel"
          role="tabpanel"
          aria-live="polite"
          aria-labelledby={`public-one-tent-tour-tab-${activeStep.id}`}
          className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm"
          data-testid={`public-one-tent-tour-panel-${activeStep.id}`}
        >
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-border/60 p-5 sm:p-7 lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap gap-2" aria-label="Loop stages in this step">
                {activeStep.journey.map((stage) => (
                  <span
                    key={stage}
                    className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium"
                  >
                    {stage}
                  </span>
                ))}
              </div>
              <h3 className="mt-5 font-display text-2xl font-semibold">{activeStep.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{activeStep.body}</p>
              <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-5">
                <p className="flex gap-2 font-medium">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span data-testid="public-one-tent-tour-safety-note">
                    {activeStep.safetyNote}
                  </span>
                </p>
              </div>
            </div>

            <div className="bg-muted/20 p-5 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                What the grower sees
              </p>
              <dl className="mt-4 space-y-3">
                {activeStep.details.map((detail) => (
                  <div
                    key={detail.label}
                    className="rounded-xl border border-border/60 bg-background p-3.5"
                  >
                    <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
                      {detail.label}
                    </dt>
                    <dd className="mt-1 pl-5 text-sm font-medium">{detail.value}</dd>
                  </div>
                ))}
              </dl>
              {nextStepId ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-4 w-full justify-between"
                  onClick={() => selectStep(nextStepId)}
                  data-testid="public-one-tent-tour-next"
                >
                  Continue the loop
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              ) : (
                <p className="mt-4 rounded-xl border border-border/60 bg-background p-3 text-center text-sm font-medium">
                  Loop complete: record the outcome, then make the next decision with better
                  evidence.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {hasAccount ? (
            <Link to="/" data-testid="public-one-tent-tour-dashboard-cta">
              <Button size="lg">Open your dashboard</Button>
            </Link>
          ) : (
            <Link
              to={signupPath}
              data-testid="public-one-tent-tour-signup-cta"
              onClick={() =>
                trackPricingEvent("landing_loop_signup_clicked", {
                  source: "one_tent_tour",
                  item: acquisitionSource,
                })
              }
            >
              <Button size="lg">Start your real grow free</Button>
            </Link>
          )}
          <Link
            to={pricingPath}
            data-testid="public-one-tent-tour-pricing-cta"
            onClick={() =>
              trackPricingEvent("landing_loop_pricing_clicked", {
                source: "one_tent_tour",
                item: acquisitionSource,
              })
            }
          >
            <Button size="lg" variant="outline">
              See plans
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          The walkthrough is illustrative. Your account uses your own grow records and preserves
          missing information instead of fabricating it.
        </p>
      </div>
    </section>
  );
}
