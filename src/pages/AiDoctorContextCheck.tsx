import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  RotateCcw,
  Share2,
  ShieldCheck,
} from "lucide-react";

import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  AI_DOCTOR_CONTEXT_CATEGORIES,
  AI_DOCTOR_CONTEXT_CHECK_PATH,
  buildAiDoctorContextPricingPath,
  buildAiDoctorContextShareData,
  evaluateAiDoctorContext,
  getAiDoctorContextCategory,
  type AiDoctorContextKey,
  type AiDoctorContextReadiness,
} from "@/lib/aiDoctorContextCheckRules";
import { trackPricingEvent } from "@/lib/pricingAnalytics";
import { cn } from "@/lib/utils";

const PRICING_PATH = buildAiDoctorContextPricingPath();

const READINESS_LABELS: Readonly<Record<AiDoctorContextReadiness, string>> = Object.freeze({
  insufficient: "More context needed",
  partial: "Partial context",
  strong: "Strong context coverage",
});

const READINESS_STYLES: Readonly<Record<AiDoctorContextReadiness, string>> = Object.freeze({
  insufficient: "border-destructive/30 bg-destructive/5 text-destructive",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  strong: "border-primary/30 bg-primary/5 text-primary",
});

type ShareStatus = "idle" | "copied" | "manual";

function selectedRecord(selected: ReadonlySet<AiDoctorContextKey>): Record<string, true> {
  return Object.fromEntries([...selected].map((key) => [key, true] as const));
}

export default function AiDoctorContextCheck() {
  const [selected, setSelected] = useState<Set<AiDoctorContextKey>>(() => new Set());
  const [showResult, setShowResult] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const result = useMemo(() => evaluateAiDoctorContext(selectedRecord(selected)), [selected]);

  usePageSeo({
    title: "Free AI Doctor Context Check | Verdant Grow Diary",
    description:
      "Check whether you have enough plant stage, medium, pot size, watering, feeding, sensor, photo, target, and history context for a cautious grow review.",
    path: AI_DOCTOR_CONTEXT_CHECK_PATH,
  });

  useEffect(() => {
    trackPricingEvent("context_check_page_view");
  }, []);

  function toggleCategory(key: AiDoctorContextKey, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function checkContext() {
    setShowResult(true);
    trackPricingEvent("context_check_completed", {
      item: result.readiness,
      source: `${result.completedCount}_of_${result.totalCount}`,
    });
  }

  function resetContext() {
    setSelected(new Set());
    setShowResult(false);
    setShareStatus("idle");
    trackPricingEvent("context_check_reset");
  }

  async function shareCheck() {
    const shareData = buildAiDoctorContextShareData();
    const nativeShare = navigator.share?.bind(navigator);
    const clipboard = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    const source = nativeShare ? "native_share" : "copy_link";
    trackPricingEvent("context_check_share_clicked", { source });

    try {
      if (nativeShare) {
        await nativeShare(shareData);
        setShareStatus("idle");
        trackPricingEvent("context_check_share_completed", { source });
        return;
      }
      if (clipboard) {
        await clipboard(shareData.url);
        setShareStatus("copied");
        trackPricingEvent("context_check_share_completed", { source });
        return;
      }
      setShareStatus("manual");
      trackPricingEvent("context_check_share_failed", { reason: "copy_unavailable" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus("manual");
      trackPricingEvent("context_check_share_failed", { reason: "share_unavailable" });
    }
  }

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-testid="ai-doctor-context-check-page"
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            to="/how-ai-doctor-works"
            className="hidden text-muted-foreground hover:text-foreground sm:inline"
          >
            How AI Doctor works
          </Link>
          <Link to={PRICING_PATH} className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <article className="mx-auto max-w-5xl px-6 pb-20 pt-6">
        <section className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary/80">
            Free · private · about 60 seconds
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-5xl">
            Is your grow context ready for a cautious review?
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            Check the information you already have. Verdant measures context coverage—not plant
            health—and shows which gaps would limit a responsible AI Doctor review.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
              Nothing is uploaded or saved
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClipboardCheck aria-hidden="true" className="h-4 w-4 text-primary" />
              No diagnosis or cultivation instruction
            </span>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="context-check-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="context-check-heading" className="font-display text-2xl font-semibold">
                What context do you have right now?
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Select only information you could actually provide. Unknown is safer than a guess.
              </p>
            </div>
            <p className="text-sm font-medium" data-testid="context-check-running-count">
              {result.completedCount} of {result.totalCount} categories
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2" data-testid="context-check-categories">
            {AI_DOCTOR_CONTEXT_CATEGORIES.map((category) => {
              const inputId = `context-${category.key}`;
              return (
                <label
                  key={category.key}
                  htmlFor={inputId}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                    selected.has(category.key)
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/70 hover:border-primary/30",
                  )}
                >
                  <Checkbox
                    id={inputId}
                    checked={selected.has(category.key)}
                    onCheckedChange={(checked) => toggleCategory(category.key, checked === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {category.label}
                      {category.core && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          core
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {category.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" size="lg" onClick={checkContext}>
              Check my context
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Button>
            {(selected.size > 0 || showResult) && (
              <Button type="button" size="lg" variant="ghost" onClick={resetContext}>
                <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />
                Reset
              </Button>
            )}
          </div>
        </section>

        {showResult && (
          <section className="mt-8" aria-live="polite" data-testid="context-check-result">
            <Card className={cn("border-2", READINESS_STYLES[result.readiness])}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em]">Your result</p>
                    <CardTitle className="mt-2 font-display text-2xl">
                      {READINESS_LABELS[result.readiness]}
                    </CardTitle>
                  </div>
                  <span
                    className="rounded-full border border-current/20 px-3 py-1 text-sm font-semibold"
                    data-testid="context-check-coverage"
                  >
                    {result.completedCount}/{result.totalCount} · {result.coveragePercent}%
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <Progress
                  value={result.coveragePercent}
                  aria-label={`${result.coveragePercent}% context coverage`}
                  className="h-2 bg-background/70"
                />
                <p className="mt-5 max-w-3xl text-sm leading-6 text-current/90">{result.summary}</p>

                {result.nextKeys.length > 0 ? (
                  <div className="mt-6 rounded-xl border border-current/15 bg-background/70 p-4 text-foreground">
                    <h3 className="font-semibold">Best context to capture next</h3>
                    <ul className="mt-3 space-y-3" data-testid="context-check-next-steps">
                      {result.nextKeys.map((key) => {
                        const category = getAiDoctorContextCategory(key);
                        return (
                          <li key={key} className="flex gap-2 text-sm">
                            <CheckCircle2
                              aria-hidden="true"
                              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                            />
                            <span>
                              <span className="font-medium">{category.label}:</span>{" "}
                              <span className="text-muted-foreground">{category.description}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-6 text-sm font-medium">
                    All twelve context categories are represented. New evidence can still change the
                    picture, so certainty remains bounded.
                  </p>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    to="/auth"
                    onClick={() =>
                      trackPricingEvent("context_check_signup_clicked", {
                        item: result.readiness,
                      })
                    }
                  >
                    <Button>Start a free grow memory</Button>
                  </Link>
                  <Link
                    to={PRICING_PATH}
                    onClick={() =>
                      trackPricingEvent("context_check_pricing_clicked", {
                        item: result.readiness,
                      })
                    }
                  >
                    <Button variant="outline">Compare Free and Pro</Button>
                  </Link>
                  <Button type="button" variant="ghost" onClick={shareCheck}>
                    <Share2 aria-hidden="true" className="mr-2 h-4 w-4" />
                    Share this check
                  </Button>
                </div>
                <p className="mt-3 min-h-5 text-xs text-muted-foreground" role="status">
                  {shareStatus === "copied" &&
                    "Check link copied. Your selections were not included."}
                  {shareStatus === "manual" &&
                    `Copy ${buildAiDoctorContextShareData().url} to share the blank check.`}
                </p>
              </CardContent>
            </Card>
          </section>
        )}

        <section className="mt-10 rounded-xl border border-border/70 p-5 text-sm text-muted-foreground">
          <h2 className="font-display text-lg font-semibold text-foreground">
            What this result does—and does not mean
          </h2>
          <p className="mt-3 leading-6">
            This result only measures whether common context categories are represented. It does not
            inspect a plant, validate readings, diagnose a condition, or recommend nutrient,
            irrigation, equipment, or stress changes. Verdant AI Doctor must still evaluate source
            quality, freshness, conflicts, and missing information before offering cautious
            guidance.
          </p>
        </section>
      </article>
    </main>
  );
}
