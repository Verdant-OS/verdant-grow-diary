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
import type { VpdSensorPlacement } from "@/lib/vpdMeasurementTrustStatusRules";

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
  const [leafTemperature, setLeafTemperature] = useState("");
  const [temperatureUnit, setTemperatureUnit] = useState<TempUnit>("F");
  const [humidity, setHumidity] = useState("");
  const [stage, setStage] = useState<VpdStage>("unknown");
  const [placement, setPlacement] = useState<VpdSensorPlacement>("unknown");
  const [leafMeasuredNow, setLeafMeasuredNow] = useState(false);
  const [temperatureReference, setTemperatureReference] = useState("");
  const [temperatureVerifiedAt, setTemperatureVerifiedAt] = useState("");
  const [temperatureAtOperatingConditions, setTemperatureAtOperatingConditions] = useState(false);
  const [humidityReference, setHumidityReference] = useState("");
  const [humidityVerifiedAt, setHumidityVerifiedAt] = useState("");
  const [sensorCommissionedAt, setSensorCommissionedAt] = useState("");
  const [measurementNowMs, setMeasurementNowMs] = useState(() => Date.now());
  const [showResult, setShowResult] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");

  const result = useMemo(
    () =>
      evaluatePublicVpdCalculator({
        temperature: parseNumber(temperature),
        leafTemperature: parseNumber(leafTemperature),
        temperatureUnit,
        humidity: parseNumber(humidity),
        stage,
        nowMs: measurementNowMs,
        measurementEvidence: {
          observedAt: new Date(measurementNowMs).toISOString(),
          temperatureVerifiedAt: temperatureVerifiedAt || null,
          temperatureReference,
          temperatureVerifiedAtOperatingConditions: temperatureAtOperatingConditions,
          humidityVerifiedAt: humidityVerifiedAt || null,
          humidityReferenceRhPercent: parseNumber(humidityReference),
          leafTemperatureMeasuredAt: leafMeasuredNow
            ? new Date(measurementNowMs).toISOString()
            : null,
          placement,
          sensorCommissionedAt: sensorCommissionedAt || null,
        },
      }),
    [
      humidity,
      humidityReference,
      humidityVerifiedAt,
      leafMeasuredNow,
      leafTemperature,
      measurementNowMs,
      placement,
      sensorCommissionedAt,
      stage,
      temperature,
      temperatureAtOperatingConditions,
      temperatureReference,
      temperatureUnit,
      temperatureVerifiedAt,
    ],
  );

  usePageSeo({
    title: "Accurate Cannabis Leaf VPD Calculator | Verdant",
    description:
      "Calculate air VPD, add measured leaf temperature and calibration evidence, then unlock an honest stage-aware leaf VPD comparison. No upload, diagnosis, or device control.",
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
      item:
        result.state === "derived"
          ? result.canCompareToStageTarget
            ? (result.classification ?? "stage_unknown")
            : result.basis
          : result.state,
      source: stage,
    });
  }

  function invalidateVisibleResult() {
    setShowResult(false);
    setShareStatus("idle");
    setMeasurementNowMs(Date.now());
  }

  function reset() {
    setTemperature("");
    setLeafTemperature("");
    setTemperatureUnit("F");
    setHumidity("");
    setStage("unknown");
    setPlacement("unknown");
    setLeafMeasuredNow(false);
    setTemperatureReference("");
    setTemperatureVerifiedAt("");
    setTemperatureAtOperatingConditions(false);
    setHumidityReference("");
    setHumidityVerifiedAt("");
    setSensorCommissionedAt("");
    setMeasurementNowMs(Date.now());
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

  const resultStyle =
    result.canCompareToStageTarget && result.classification
      ? RESULT_STYLES[result.classification]
      : result.state === "derived"
        ? "border-amber-500/40 bg-amber-500/10"
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
            VPD truth calculator
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            Start with air temperature and RH. Add a measured leaf temperature, canopy placement,
            and current calibration evidence before Verdant will compare the result with a stage
            target.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
              Nothing is uploaded or saved
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Gauge aria-hidden="true" className="h-4 w-4 text-primary" />
              Air estimate first · verified leaf VPD for target status
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
                <div className="grid gap-5 sm:grid-cols-3">
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

                  <div className="space-y-2">
                    <Label htmlFor="vpd-leaf-temperature">Measured leaf temperature</Label>
                    <div className="relative">
                      <Input
                        id="vpd-leaf-temperature"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={temperatureUnit === "C" ? -20 : -4}
                        max={temperatureUnit === "C" ? 60 : 140}
                        value={leafTemperature}
                        onChange={(event) => {
                          setLeafTemperature(event.target.value);
                          invalidateVisibleResult();
                        }}
                        placeholder={temperatureUnit === "C" ? "23" : "73.4"}
                        aria-describedby="vpd-leaf-temperature-help"
                        className="pr-10"
                      />
                      <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-muted-foreground">
                        °{temperatureUnit}
                      </span>
                    </div>
                    <p id="vpd-leaf-temperature-help" className="text-xs text-muted-foreground">
                      Measure a representative leaf in the current light and airflow conditions.
                    </p>
                  </div>
                </div>

                <fieldset className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <legend className="px-1 text-sm font-semibold">Measurement evidence</legend>
                  <p className="text-xs leading-5 text-muted-foreground">
                    These checks stay in this browser session and are not uploaded. Missing or old
                    evidence keeps the result visible but blocks a target-status claim.
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="vpd-sensor-placement">Temperature/RH sensor placement</Label>
                      <select
                        id="vpd-sensor-placement"
                        value={placement}
                        onChange={(event) => {
                          setPlacement(event.target.value as VpdSensorPlacement);
                          invalidateVisibleResult();
                        }}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="unknown">Not recorded</option>
                        <option value="canopy">Canopy level</option>
                        <option value="above_canopy">Above canopy</option>
                        <option value="below_canopy">Below canopy</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="vpd-sensor-first-used">Sensor first used (optional)</Label>
                      <Input
                        id="vpd-sensor-first-used"
                        type="date"
                        value={sensorCommissionedAt}
                        onChange={(event) => {
                          setSensorCommissionedAt(event.target.value);
                          invalidateVisibleResult();
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="vpd-temperature-reference">Temperature reference</Label>
                      <Input
                        id="vpd-temperature-reference"
                        value={temperatureReference}
                        onChange={(event) => {
                          setTemperatureReference(event.target.value);
                          invalidateVisibleResult();
                        }}
                        placeholder="Reference thermometer / certificate"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="vpd-temperature-verified-at">Temperature verified date</Label>
                      <Input
                        id="vpd-temperature-verified-at"
                        type="date"
                        value={temperatureVerifiedAt}
                        onChange={(event) => {
                          setTemperatureVerifiedAt(event.target.value);
                          invalidateVisibleResult();
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="vpd-humidity-reference">RH reference point</Label>
                      <div className="relative">
                        <Input
                          id="vpd-humidity-reference"
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min="0"
                          max="100"
                          value={humidityReference}
                          onChange={(event) => {
                            setHumidityReference(event.target.value);
                            invalidateVisibleResult();
                          }}
                          placeholder="75"
                          className="pr-10"
                        />
                        <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Must be at least 75% RH.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="vpd-humidity-verified-at">Humidity verified date</Label>
                      <Input
                        id="vpd-humidity-verified-at"
                        type="date"
                        value={humidityVerifiedAt}
                        onChange={(event) => {
                          setHumidityVerifiedAt(event.target.value);
                          invalidateVisibleResult();
                        }}
                      />
                    </div>
                  </div>

                  <label
                    className="flex items-start gap-2 text-sm"
                    htmlFor="vpd-temp-operating-check"
                  >
                    <input
                      id="vpd-temp-operating-check"
                      type="checkbox"
                      checked={temperatureAtOperatingConditions}
                      onChange={(event) => {
                        setTemperatureAtOperatingConditions(event.target.checked);
                        invalidateVisibleResult();
                      }}
                      className="mt-1 h-4 w-4 rounded border-input"
                    />
                    Temperature was checked against that reference at normal room operating
                    conditions.
                  </label>

                  <label className="flex items-start gap-2 text-sm" htmlFor="vpd-leaf-now-check">
                    <input
                      id="vpd-leaf-now-check"
                      type="checkbox"
                      checked={leafMeasuredNow}
                      onChange={(event) => {
                        setLeafMeasuredNow(event.target.checked);
                        invalidateVisibleResult();
                      }}
                      className="mt-1 h-4 w-4 rounded border-input"
                    />
                    Leaf temperature was measured now in the same canopy conditions as the air/RH
                    reading.
                  </label>
                </fieldset>

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
                    Stage comparison remains locked until the measurement evidence is verified.
                  </p>
                </div>

                <p id="vpd-source-note" className="rounded-lg bg-muted/50 p-3 text-xs leading-5">
                  Manual inputs · calculated locally · not live telemetry. Nothing is uploaded or
                  saved. Air-only results are labeled as estimates.
                </p>

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" size="lg">
                    Calculate VPD
                    <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                  </Button>
                  {(temperature ||
                    leafTemperature ||
                    humidity ||
                    stage !== "unknown" ||
                    showResult) && (
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
                <p className="text-xs font-medium uppercase tracking-[0.16em]">
                  {result.canCompareToStageTarget
                    ? "Verified leaf VPD"
                    : result.basis === "leaf"
                      ? "Leaf VPD estimate"
                      : "Air VPD estimate"}
                </p>
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
                {result.state === "derived" && (
                  <dl className="grid gap-3 rounded-xl border border-border/60 bg-background/60 p-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Air VPD</dt>
                      <dd className="font-medium tabular-nums">
                        {result.airVpdKpa === null ? "—" : `${result.airVpdKpa.toFixed(2)} kPa`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Leaf-to-air VPD</dt>
                      <dd className="font-medium tabular-nums">
                        {result.leafVpdKpa === null
                          ? "Not measured"
                          : `${result.leafVpdKpa.toFixed(2)} kPa`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Confidence</dt>
                      <dd className="font-medium capitalize" data-testid="public-vpd-confidence">
                        {result.confidence}
                      </dd>
                    </div>
                  </dl>
                )}
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
          <h2 className="font-display text-2xl font-semibold">Accuracy before color</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Air VPD describes the atmosphere. Leaf-to-air VPD adds the plant surface temperature.
            Neither proves plant health or justifies a sudden equipment, nutrient, or irrigation
            change. Verdant keeps the target color locked until the measurement basis is explicit
            and the calibration evidence is current.
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
