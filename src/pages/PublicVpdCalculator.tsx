import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calculator, Gauge, RotateCcw, Share2, ShieldCheck } from "lucide-react";

import BrandLogo from "@/components/BrandLogo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePageSeo } from "@/hooks/usePageSeo";
import { buildAttributedPricingPath } from "@/lib/paidAcquisitionAttributionRules";
import { trackPricingEvent } from "@/lib/pricingAnalytics";
import {
  buildPublicVpdShareData,
  evaluatePublicVpdCalculator,
  PUBLIC_VPD_CALCULATOR_FAQ,
  PUBLIC_VPD_CALCULATOR_PATH,
  PUBLIC_VPD_CALCULATOR_URL,
  PUBLIC_VPD_GUIDE_PATH,
  PUBLIC_VPD_STAGE_OPTIONS,
} from "@/lib/publicVpdCalculatorRules";
import { buildFaqPageJsonLd, safeJsonLdStringify } from "@/lib/seoStructuredData";
import { buildAttributedSignupPath } from "@/lib/signupAcquisitionRules";
import { cn } from "@/lib/utils";
import type { TempUnit } from "@/lib/vpdRules";
import type { VpdClassification, VpdStage } from "@/lib/vpdStageTargetRules";

const SIGNUP_PATH = buildAttributedSignupPath({ source: "vpd_calculator" });
const PRICING_PATH = buildAttributedPricingPath({ source: "vpd_calculator" });

const RESULT_STYLES: Readonly<Record<VpdClassification, string>> = Object.freeze({
  in_target: "border-primary/40 bg-primary/5",
  below_target: "border-amber-500/40 bg-amber-500/10",
  above_target: "border-amber-500/40 bg-amber-500/10",
  stage_unknown: "border-sky-500/40 bg-sky-500/10",
  context_only: "border-sky-500/40 bg-sky-500/10",
  unavailable: "border-border bg-card",
});

type ShareStatus = "idle" | "copied" | "manual";

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function PublicVpdCalculator() {
  const [temperature, setTemperature] = useState("");
  const [temperatureUnit, setTemperatureUnit] = useState<TempUnit>("F");
  const [humidity, setHumidity] = useState("");
  const [stage, setStage] = useState<VpdStage>("unknown");
  const [showResult, setShowResult] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");

  const result = useMemo(
    () =>
      evaluatePublicVpdCalculator({
        temperature: parseNumber(temperature),
        temperatureUnit,
        humidity: parseNumber(humidity),
        stage,
      }),
    [humidity, stage, temperature, temperatureUnit],
  );

  usePageSeo({
    title: "Free Cannabis VPD Calculator by Growth Stage | Verdant",
    description:
      "Calculate air VPD from manual temperature and humidity inputs, then compare it with a conservative stage-aware range. No upload, live telemetry, diagnosis, or device control.",
    path: PUBLIC_VPD_CALCULATOR_PATH,
  });

  useEffect(() => {
    trackPricingEvent("vpd_calculator_page_view");
    const faq = buildFaqPageJsonLd({
      pageUrl: PUBLIC_VPD_CALCULATOR_URL,
      questions: PUBLIC_VPD_CALCULATOR_FAQ,
    });
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-page-ldjson", "public-vpd-calculator-faq");
    script.text = safeJsonLdStringify(faq);
    document.head.appendChild(script);
    return () => script.remove();
  }, []);

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowResult(true);
    setShareStatus("idle");
    trackPricingEvent("vpd_calculator_completed", {
      item: result.state === "derived" ? (result.classification ?? "unavailable") : result.state,
      source: stage,
    });
  }

  function invalidateVisibleResult() {
    setShowResult(false);
    setShareStatus("idle");
  }

  function reset() {
    setTemperature("");
    setTemperatureUnit("F");
    setHumidity("");
    setStage("unknown");
    setShowResult(false);
    setShareStatus("idle");
    trackPricingEvent("vpd_calculator_reset");
  }

  async function shareCalculator() {
    const shareData = buildPublicVpdShareData();
    const nativeShare = navigator.share?.bind(navigator);
    const clipboard = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    const source = nativeShare ? "native_share" : "copy_link";
    trackPricingEvent("vpd_calculator_share_clicked", { source });

    try {
      if (nativeShare) {
        await nativeShare(shareData);
        setShareStatus("idle");
        trackPricingEvent("vpd_calculator_share_completed", { source });
        return;
      }
      if (clipboard) {
        await clipboard(shareData.url ?? PUBLIC_VPD_CALCULATOR_URL);
        setShareStatus("copied");
        trackPricingEvent("vpd_calculator_share_completed", { source });
        return;
      }
      setShareStatus("manual");
      trackPricingEvent("vpd_calculator_share_failed", { reason: "copy_unavailable" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus("manual");
      trackPricingEvent("vpd_calculator_share_failed", { reason: "share_unavailable" });
    }
  }

  const resultStyle = result.classification
    ? RESULT_STYLES[result.classification]
    : RESULT_STYLES.unavailable;

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-testid="public-vpd-calculator-page"
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            to={PUBLIC_VPD_GUIDE_PATH}
            className="hidden text-muted-foreground hover:text-foreground sm:inline"
          >
            VPD guide
          </Link>
          <Link to={PRICING_PATH} className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <article className="mx-auto max-w-5xl px-6 pb-20 pt-6">
        <section className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary/80">
            Free · private · read-only
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-5xl">
            Stage-aware air VPD calculator
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            Enter air temperature and relative humidity to derive air VPD. Add a plant stage for a
            conservative comparison band—without uploading a reading or turning one number into a
            diagnosis.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
              Nothing is uploaded or saved
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Gauge aria-hidden="true" className="h-4 w-4 text-primary" />
              Air VPD only—not leaf VPD
            </span>
          </div>
        </section>

        <section className="mx-auto mt-10 max-w-3xl" aria-labelledby="calculator-heading">
          <Card>
            <CardHeader>
              <CardTitle id="calculator-heading" className="flex items-center gap-2 font-display">
                <Calculator aria-hidden="true" className="h-5 w-5 text-primary" />
                Calculate from a manual reading
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={calculate} className="space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vpd-temperature">Air temperature</Label>
                    <div className="flex gap-2">
                      <Input
                        id="vpd-temperature"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={temperatureUnit === "C" ? -20 : -4}
                        max={temperatureUnit === "C" ? 60 : 140}
                        value={temperature}
                        onChange={(event) => {
                          setTemperature(event.target.value);
                          invalidateVisibleResult();
                        }}
                        placeholder={temperatureUnit === "C" ? "25" : "77"}
                        aria-describedby="vpd-source-note"
                      />
                      <select
                        aria-label="Temperature unit"
                        value={temperatureUnit}
                        onChange={(event) => {
                          setTemperatureUnit(event.target.value as TempUnit);
                          invalidateVisibleResult();
                        }}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="F">°F</option>
                        <option value="C">°C</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="vpd-humidity">Relative humidity</Label>
                    <div className="relative">
                      <Input
                        id="vpd-humidity"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="0"
                        max="100"
                        value={humidity}
                        onChange={(event) => {
                          setHumidity(event.target.value);
                          invalidateVisibleResult();
                        }}
                        placeholder="60"
                        className="pr-10"
                      />
                      <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vpd-stage">Plant stage</Label>
                  <select
                    id="vpd-stage"
                    value={stage}
                    onChange={(event) => {
                      setStage(event.target.value as VpdStage);
                      invalidateVisibleResult();
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-sm"
                  >
                    {PUBLIC_VPD_STAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Select the actual stage when known. Leaving it blank still calculates air VPD
                    but does not apply a stage-specific interpretation.
                  </p>
                </div>

                <p id="vpd-source-note" className="rounded-lg bg-muted/50 p-3 text-xs leading-5">
                  Manual inputs · derived air VPD · not live telemetry. Nothing is uploaded or
                  saved.
                </p>

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" size="lg">
                    Calculate air VPD
                    <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                  </Button>
                  {(temperature || humidity || stage !== "unknown" || showResult) && (
                    <Button type="button" size="lg" variant="ghost" onClick={reset}>
                      <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />
                      Reset
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </section>

        {showResult && (
          <section
            className="mx-auto mt-8 max-w-3xl"
            aria-live="polite"
            data-testid="public-vpd-calculator-result"
          >
            <Card className={cn("border-2", resultStyle)}>
              <CardHeader>
                <p className="text-xs font-medium uppercase tracking-[0.16em]">Derived result</p>
                <CardTitle className="font-display text-3xl tabular-nums">
                  {result.vpdKpa === null ? "Check the inputs" : `${result.vpdKpa.toFixed(2)} kPa`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <p className="font-semibold" data-testid="public-vpd-classification">
                    {result.classificationLabel}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{result.targetLabel}</p>
                </div>
                <p className="text-sm leading-6">{result.interpretation}</p>
                <div className="rounded-xl border border-current/15 bg-background/70 p-4 text-sm">
                  <p className="font-medium">Source and safety boundary</p>
                  <p className="mt-2 text-muted-foreground">{result.sourceNote}</p>
                  <p className="mt-2 text-muted-foreground">{result.safetyNote}</p>
                </div>
                {result.state === "derived" && (
                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link
                        to={SIGNUP_PATH}
                        onClick={() =>
                          trackPricingEvent("vpd_calculator_signup_clicked", {
                            item: result.classification ?? "unavailable",
                          })
                        }
                      >
                        Start a free grow memory
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link
                        to={PRICING_PATH}
                        onClick={() =>
                          trackPricingEvent("vpd_calculator_pricing_clicked", {
                            item: result.classification ?? "unavailable",
                          })
                        }
                      >
                        Compare Free and Pro
                      </Link>
                    </Button>
                    <Button type="button" variant="ghost" onClick={shareCalculator}>
                      <Share2 aria-hidden="true" className="mr-2 h-4 w-4" />
                      Share calculator
                    </Button>
                  </div>
                )}
                <p className="min-h-5 text-xs text-muted-foreground" role="status">
                  {shareStatus === "copied" &&
                    "Calculator link copied. Your temperature, humidity, and stage were not included."}
                  {shareStatus === "manual" &&
                    `Copy ${buildPublicVpdShareData().url} to share the blank calculator.`}
                </p>
              </CardContent>
            </Card>
          </section>
        )}

        <section className="mx-auto mt-12 max-w-3xl">
          <h2 className="font-display text-2xl font-semibold">Use the number as context</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Air VPD describes the relationship between temperature and humidity. It does not prove
            that a plant is healthy, identify a root-zone problem, validate a sensor, or justify a
            sudden equipment, nutrient, or irrigation change. Check the source, timestamp, sensor
            placement, medium, watering history, targets, and plant response together.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Want the reasoning behind source labels and stage context? Read the{" "}
            <Link to={PUBLIC_VPD_GUIDE_PATH} className="underline hover:text-foreground">
              grow-room VPD tracking guide
            </Link>
            .
          </p>
        </section>

        <section className="mx-auto mt-12 max-w-3xl" aria-labelledby="vpd-faq-heading">
          <h2 id="vpd-faq-heading" className="font-display text-2xl font-semibold">
            VPD calculator questions
          </h2>
          <Accordion type="single" collapsible className="mt-4 w-full">
            {PUBLIC_VPD_CALCULATOR_FAQ.map((entry, index) => (
              <AccordionItem key={entry.question} value={`vpd-faq-${index}`}>
                <AccordionTrigger className="text-left">{entry.question}</AccordionTrigger>
                <AccordionContent>{entry.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </article>
    </main>
  );
}
