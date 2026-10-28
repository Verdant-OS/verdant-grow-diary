import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@/lib/react-router-compat";

import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  trackClimateToolEvent,
  type ClimateToolCtaLocation,
  type ClimateToolProblem,
} from "@/lib/growTentClimateAnalytics";
import {
  buildGrowTentClimateCsv,
  buildGrowTentClimateReading,
  buildGrowTentClimateTsv,
  calculateGrowTentNudgeRh,
  calculateGrowTentVpd,
  evaluateGrowTentBandStatus,
  formatGrowTentDateTime,
  GROW_TENT_CLIMATE_CTA_HREF,
  GROW_TENT_CLIMATE_DEFAULT_OFFSET_F,
  GROW_TENT_CLIMATE_DESCRIPTION,
  GROW_TENT_CLIMATE_FAQ,
  GROW_TENT_CLIMATE_H1,
  GROW_TENT_CLIMATE_PATH,
  GROW_TENT_CLIMATE_QUICK_ANSWER,
  GROW_TENT_CLIMATE_SOURCES,
  GROW_TENT_CLIMATE_SOURCE_URLS,
  GROW_TENT_CLIMATE_STAGES,
  GROW_TENT_CLIMATE_TITLE,
  growTentBandBarGeometry,
  growTentClimateCsvFilename,
  growTentClimateStageById,
  growTentExampleLines,
  growTentLocalDateTimeInput,
  parseGrowTentClimateInputs,
  shouldEmitThrottled,
  summarizeGrowTentClimateLog,
  type GrowTentAverages,
  type GrowTentBandStatusCode,
  type GrowTentClimateReading,
  type GrowTentLights,
} from "@/lib/growTentClimateRules";
import { publicVpdChartLateFlowerReferenceNote } from "@/lib/publicVpdChartRules";

const SRC = GROW_TENT_CLIMATE_SOURCE_URLS;

const inputClass =
  "mt-1 w-full min-w-0 rounded-md border border-emerald-900/20 bg-white px-2 py-1.5 text-sm text-emerald-950";
const buttonClass = "min-h-11 rounded-md border border-emerald-900/20 bg-white px-3 text-sm";
const sectionClass = "mt-8 max-w-3xl leading-7";
const tableWrapClass =
  "mt-3 max-w-full overflow-x-auto rounded-md border bg-white print:overflow-visible";
const cellClass = "border-b border-emerald-900/10 px-2 py-2 text-left align-top";

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="underline" href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

const Vivosun = () => <Ext href={SRC.vivosun}>Vivosun</Ext>;
const Trimleaf = () => <Ext href={SRC.trimleaf}>Trimleaf</Ext>;
const SpiderFarmer = () => <Ext href={SRC.spiderFarmerIdeal}>Spider Farmer</Ext>;
const SpiderFarmerVpd = () => <Ext href={SRC.spiderFarmerVpd}>Spider Farmer</Ext>;
const Gorilla = () => <Ext href={SRC.gorilla}>Gorilla Grow Tent</Ext>;
const Aroya = () => <Ext href={SRC.aroya}>Aroya</Ext>;

const STATUS_CLASS: Record<GrowTentBandStatusCode, string> = {
  in_band: "bg-emerald-100 text-emerald-900",
  below: "bg-sky-100 text-sky-900",
  above: "bg-amber-100 text-amber-900",
};

const LOG_HEADERS = [
  "Date & time",
  "Lights",
  "Air °F",
  "RH %",
  "Leaf offset °F",
  "Stage",
  "VPD",
  "Status",
  "Note",
] as const;

const DEFAULTS = { air: "77", rh: "60", stage: "veg", offset: "-2" } as const;

function pluralReadings(n: number): string {
  return `${n} reading${n === 1 ? "" : "s"}`;
}

function averagesLine(label: string, avg: GrowTentAverages): string {
  return `${label} (${pluralReadings(avg.count)}): ${avg.avgF}°F, ${avg.avgRh}% RH, ${avg.avgVpd} kPa VPD.`;
}

function FixPanel({
  problem,
  summary,
  open,
  onToggle,
  children,
}: {
  problem: ClimateToolProblem;
  summary: string;
  open: boolean;
  onToggle: (problem: ClimateToolProblem) => void;
  children: ReactNode;
}) {
  return (
    <details open={open} className="mt-2 rounded-md border bg-white p-3" data-problem={problem}>
      <summary
        className="min-h-11 cursor-pointer font-medium"
        onClick={(event) => {
          event.preventDefault();
          onToggle(problem);
        }}
      >
        {summary}
      </summary>
      {children}
    </details>
  );
}

export default function GrowTentTemperatureHumidityChart() {
  const [air, setAir] = useState<string>(DEFAULTS.air);
  const [rh, setRh] = useState<string>(DEFAULTS.rh);
  const [stage, setStage] = useState<string>(DEFAULTS.stage);
  const [offset, setOffset] = useState<string>(DEFAULTS.offset);
  const [dateTime, setDateTime] = useState("");
  const [lights, setLights] = useState<GrowTentLights>("Lights on");
  const [note, setNote] = useState("");
  const [readings, setReadings] = useState<GrowTentClimateReading[]>([]);
  const [nextId, setNextId] = useState(1);
  const [openPanels, setOpenPanels] = useState<Record<ClimateToolProblem, boolean>>({
    rh_high: false,
    rh_low: false,
    temp_high: false,
    temp_low: false,
  });
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<"log" | "blank">("log");
  const lastCheckedAt = useRef<number | null>(null);
  const dateEdited = useRef(false);

  usePageSeo({
    title: `${GROW_TENT_CLIMATE_TITLE} | Verdant Grow Diary`,
    description: GROW_TENT_CLIMATE_DESCRIPTION,
    path: GROW_TENT_CLIMATE_PATH,
  });

  useEffect(() => {
    setDateTime((current) => current || growTentLocalDateTimeInput(new Date()));
  }, []);

  const inputs = useMemo(
    () => parseGrowTentClimateInputs(air, rh, offset, stage),
    [air, rh, offset, stage],
  );
  const band = growTentClimateStageById(inputs.stageId);
  const live = useMemo(() => {
    if (!inputs.valid) return null;
    const vpd = calculateGrowTentVpd(inputs.airF, inputs.rh, inputs.offsetF);
    return {
      vpd,
      status: evaluateGrowTentBandStatus(vpd, inputs.stageId),
      nudge: calculateGrowTentNudgeRh(inputs.airF, inputs.offsetF, inputs.stageId),
      bar: growTentBandBarGeometry(vpd, inputs.stageId),
    };
  }, [inputs]);
  const summary = useMemo(() => summarizeGrowTentClimateLog(readings), [readings]);
  const liveCode = live?.status.code ?? null;

  // As in the source, an out-of-band reading opens the matching RH fix panel.
  useEffect(() => {
    if (liveCode === "below") setOpenPanels((p) => ({ ...p, rh_high: true, rh_low: false }));
    if (liveCode === "above") setOpenPanels((p) => ({ ...p, rh_low: true, rh_high: false }));
  }, [liveCode]);

  function announce(message: string) {
    setStatus("");
    window.setTimeout(() => setStatus(message), 20);
  }

  function changeInput(setter: (value: string) => void, value: string, nextField: object) {
    setter(value);
    setCopyFallback(null);
    const next = { air, rh, offset, stage, ...nextField };
    const parsed = parseGrowTentClimateInputs(next.air, next.rh, next.offset, next.stage);
    if (!parsed.valid) return;
    const now = performance.now();
    if (!shouldEmitThrottled(lastCheckedAt.current, now)) return;
    lastCheckedAt.current = now;
    const vpd = calculateGrowTentVpd(parsed.airF, parsed.rh, parsed.offsetF);
    trackClimateToolEvent("climate_tool_checked", {
      stage: parsed.stageId,
      status: evaluateGrowTentBandStatus(vpd, parsed.stageId).code,
    });
  }

  function togglePanel(problem: ClimateToolProblem) {
    const opening = !openPanels[problem];
    setOpenPanels((p) => ({ ...p, [problem]: opening }));
    if (opening) trackClimateToolEvent("climate_tool_fix_opened", { problem });
  }

  function logReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inputs.valid) return;
    const entry = buildGrowTentClimateReading(
      nextId,
      inputs,
      lights,
      formatGrowTentDateTime(dateEdited.current ? dateTime : "", new Date()),
      note,
    );
    const next = [...readings, entry];
    setReadings(next);
    setNextId((id) => id + 1);
    setNote("");
    setDateTime(growTentLocalDateTimeInput(new Date()));
    dateEdited.current = false;
    setCopyFallback(null);
    announce(
      `Logged reading for ${entry.dateTime} (${entry.vpd.toFixed(2)} kPa, ${entry.statusText}).`,
    );
    trackClimateToolEvent("climate_tool_reading_logged", { reading_count: next.length });
  }

  function removeReading(item: GrowTentClimateReading) {
    const remaining = readings.filter((r) => r.id !== item.id);
    setReadings(remaining);
    setCopyFallback(null);
    announce(`Removed reading from ${item.dateTime}.`);
    trackClimateToolEvent("climate_tool_reading_removed", { reading_count: remaining.length });
  }

  function downloadCsv() {
    const filename = growTentClimateCsvFilename(
      growTentLocalDateTimeInput(new Date()).slice(0, 10),
    );
    let url: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      const blob = new Blob([buildGrowTentClimateCsv(readings)], {
        type: "text/csv;charset=utf-8",
      });
      url = URL.createObjectURL(blob);
      link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
    } catch {
      link?.remove();
      if (url) URL.revokeObjectURL(url);
      announce("CSV download is unavailable in this browser.");
      return;
    }
    const objectUrl = url;
    const anchor = link;
    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    }, 0);
    announce(`Exported ${readings.length} reading(s) to ${filename}.`);
    trackClimateToolEvent("climate_tool_export_csv", { reading_count: readings.length });
  }

  async function copyLog() {
    const tsv = buildGrowTentClimateTsv(readings);
    trackClimateToolEvent("climate_tool_copy", { reading_count: readings.length });
    try {
      await navigator.clipboard.writeText(tsv);
      setCopyFallback(null);
      announce(`Copied ${readings.length} reading(s) to clipboard as tab-separated text.`);
    } catch {
      setCopyFallback(tsv);
      announce("Clipboard unavailable. Select and copy the tab-separated log shown below.");
    }
  }

  function printLog(mode: "log" | "blank") {
    setPrintMode(mode);
    announce(
      mode === "blank"
        ? "Opening print dialog for a 14-row blank tent climate log sheet."
        : "Opening print dialog for your tent climate log.",
    );
    trackClimateToolEvent("climate_tool_print", {});
    window.addEventListener("afterprint", () => setPrintMode("log"), { once: true });
    window.setTimeout(() => window.print(), 30);
  }

  function clearLog() {
    setReadings([]);
    setAir(DEFAULTS.air);
    setRh(DEFAULTS.rh);
    setStage(DEFAULTS.stage);
    setOffset(DEFAULTS.offset);
    setNote("");
    setLights("Lights on");
    setCopyFallback(null);
    setConfirmClear(false);
    announce("Cleared all logged climate readings.");
    trackClimateToolEvent("climate_tool_clear", {});
  }

  const cta = (location: ClimateToolCtaLocation) => (
    <div className="mt-4 rounded-lg border border-emerald-900/15 bg-emerald-50 p-4 print:hidden">
      <Link
        className="inline-flex min-h-11 items-center rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
        to={GROW_TENT_CLIMATE_CTA_HREF}
        data-cta-location={location}
        onClick={() => trackClimateToolEvent("climate_tool_cta_click", { cta_location: location })}
      >
        Keep this log in Verdant →
      </Link>
      <p className="mt-2 text-sm">
        Free to start. Log climate readings next to your plant&apos;s timeline, feeds and photos.
      </p>
    </div>
  );

  const hideForBlankPrint = printMode === "blank" ? "print:hidden" : "";
  const bandRange = `${band.min.toFixed(1)}–${band.max.toFixed(1)} kPa`;

  return (
    <div
      data-testid="grow-tent-climate-page"
      data-print-section="public-guide-tool"
      className="min-h-screen bg-[#f6f8f5] text-emerald-950"
    >
      <header className="border-b border-emerald-900/10 bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <a href="https://verdantgrowdiary.com/" aria-label="Verdant Grow Diary">
            <BrandLogo />
          </a>
          <nav aria-label="Breadcrumb" className="text-sm">
            <ol className="flex flex-wrap gap-1">
              <li>
                <a className="underline" href="https://verdantgrowdiary.com/">
                  Home
                </a>{" "}
                <span aria-hidden="true">›</span>
              </li>
              <li>
                <Link to="/guides" className="underline">
                  Guides
                </Link>{" "}
                <span aria-hidden="true">›</span>
              </li>
              <li aria-current="page">Grow Tent Temperature &amp; Humidity Chart</li>
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className={hideForBlankPrint}>
          <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
            {GROW_TENT_CLIMATE_H1}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7">
            Temperature and humidity only make sense together. Check both against your growth stage,
            fix the one that&apos;s off, and log readings so you&apos;re fixing patterns, not
            one-off spikes.
          </p>
          <p className="mt-2 max-w-3xl text-base leading-7">
            Want the full chart? See the{" "}
            <Link className="underline" to="/vpd-chart">
              VPD chart by growth stage
            </Link>
            .
          </p>

          <section id="quick-answer" className="mt-6 max-w-3xl" aria-labelledby="quick-answer-h">
            <h2 id="quick-answer-h" className="text-2xl font-semibold">
              Quick answer
            </h2>
            <div className="mt-2 rounded-xl bg-white p-4 shadow-sm">
              <p className="leading-7">{GROW_TENT_CLIMATE_QUICK_ANSWER}</p>
            </div>
          </section>
        </div>

        <section id="tent-climate-check-log" className="mt-8" aria-labelledby="tool-h">
          <h2 id="tool-h" className={`text-2xl font-semibold ${hideForBlankPrint}`}>
            Tent Climate Check &amp; Log
          </h2>
          <div className={`mt-3 rounded-xl bg-white p-4 shadow-sm ${hideForBlankPrint}`}>
            <p className="rounded-md bg-amber-50 p-3 text-sm print:hidden" role="note">
              Nothing is saved in your browser. Download CSV or copy your log before leaving this
              page.
            </p>

            <form className="mt-4 print:hidden" noValidate onSubmit={logReading}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="min-w-0 text-sm font-medium">
                  Air temperature (°F)
                  <input
                    type="number"
                    min={50}
                    max={100}
                    step={0.5}
                    required
                    className={inputClass}
                    value={air}
                    onChange={(e) => changeInput(setAir, e.target.value, { air: e.target.value })}
                  />
                </label>
                <label className="min-w-0 text-sm font-medium">
                  Relative humidity (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    required
                    className={inputClass}
                    value={rh}
                    onChange={(e) => changeInput(setRh, e.target.value, { rh: e.target.value })}
                  />
                </label>
                <label className="min-w-0 text-sm font-medium">
                  Stage
                  <select
                    className={inputClass}
                    value={inputs.stageId}
                    onChange={(e) =>
                      changeInput(setStage, e.target.value, { stage: e.target.value })
                    }
                  >
                    {GROW_TENT_CLIMATE_STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.min.toFixed(1)}–{s.max.toFixed(1)} kPa)
                      </option>
                    ))}
                  </select>
                </label>
                <div className="min-w-0">
                  <label className="text-sm font-medium" htmlFor="climate-leaf-offset">
                    Leaf temperature offset (°F)
                  </label>
                  <input
                    id="climate-leaf-offset"
                    type="number"
                    min={-10}
                    max={5}
                    step={0.5}
                    required
                    className={inputClass}
                    value={offset}
                    aria-describedby="climate-leaf-offset-help"
                    onChange={(e) =>
                      changeInput(setOffset, e.target.value, { offset: e.target.value })
                    }
                  />
                  <p id="climate-leaf-offset-help" className="mt-1 text-xs leading-5">
                    Leaf surfaces often run a little cooler than the air. Leave −
                    {Math.abs(GROW_TENT_CLIMATE_DEFAULT_OFFSET_F)} if you&apos;re not sure, or 0 to
                    ignore.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="min-w-0 text-sm font-medium">
                  Date &amp; time (local)
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={dateTime}
                    onChange={(e) => {
                      dateEdited.current = true;
                      setDateTime(e.target.value);
                    }}
                  />
                </label>
                <fieldset className="min-w-0">
                  <legend className="text-sm font-medium">Lights (optional)</legend>
                  <div className="mt-1 flex flex-wrap gap-4">
                    {(["Lights on", "Lights off"] as const).map((value) => (
                      <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="lightsPeriod"
                          value={value}
                          checked={lights === value}
                          onChange={() => setLights(value)}
                        />
                        {value}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="min-w-0 text-sm font-medium">
                  Note (optional)
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g., after raising exhaust"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </div>

              {!inputs.valid ? (
                <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-900">
                  Enter Air temperature between 50°F and 100°F, Relative humidity between 0% and
                  100%, and Leaf temperature offset between −10°F and +5°F.
                </p>
              ) : null}

              <button
                type="submit"
                className="mt-3 min-h-11 rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
              >
                Log this reading
              </button>
            </form>

            {live ? (
              <div
                className="mt-4 rounded-lg border border-emerald-900/15 p-4 print:hidden"
                aria-live="polite"
                data-testid="climate-live-result"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-3xl font-semibold">{live.vpd.toFixed(2)} kPa</span>
                    <p className="mt-1 text-sm">
                      Selected stage band: {band.name} ({bandRange}, common grower targets rather
                      than strict rules)
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_CLASS[live.status.code]}`}
                  >
                    {live.status.fullText}
                  </span>
                </div>

                <div className="mt-4" aria-hidden="true">
                  <div className="flex flex-wrap justify-between gap-2 text-xs">
                    <span>0.0 kPa (Humid / Low VPD)</span>
                    <span>
                      {band.name} band: {bandRange}
                    </span>
                    <span>2.2 kPa (Dry / High VPD)</span>
                  </div>
                  <div className="relative mt-1 h-3 rounded-full bg-emerald-900/10">
                    <div
                      className="absolute top-0 h-3 rounded-full bg-emerald-500/50"
                      style={{ left: `${live.bar.left}%`, width: `${live.bar.width}%` }}
                    />
                    <div
                      className="absolute -top-1 h-5 w-1 rounded bg-emerald-950"
                      style={{ left: `calc(${live.bar.marker}% - 2px)` }}
                    />
                  </div>
                  <p className="mt-1 text-xs">
                    Marker shows your current {live.vpd.toFixed(2)} kPa reading (
                    {live.status.fullText}).
                  </p>
                </div>

                {live.status.code === "below" ? (
                  <p className="mt-3 text-sm">
                    To move into the band, you can lower RH or raise temperature a little.
                  </p>
                ) : null}
                {live.status.code === "above" ? (
                  <p className="mt-3 text-sm">
                    To move into the band, you can raise RH or lower temperature a little.
                  </p>
                ) : null}

                <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm">
                  <strong>
                    RH that would center you in the band at this temperature (calculated, not a
                    recommendation):
                  </strong>{" "}
                  {live.nudge.reachable ? (
                    <>
                      {live.nudge.rhWhole}% RH (centers at {live.nudge.midpoint.toFixed(2)} kPa
                      midpoint for {inputs.airF}°F air and {inputs.offsetF}°F leaf offset)
                    </>
                  ) : (
                    <>
                      no RH from 0 to 100% reaches the {live.nudge.midpoint.toFixed(2)} kPa midpoint
                      at {inputs.airF}°F air and {inputs.offsetF}°F leaf offset; the temperature
                      would have to change.
                    </>
                  )}
                </p>
              </div>
            ) : null}

            <div className="mt-6 print:hidden">
              <h3 className="text-lg font-semibold">
                Tent climate troubleshooter (common fixes growers use, cheapest first)
              </h3>
              <FixPanel
                problem="rh_high"
                summary="Humidity too high (VPD below your stage band)"
                open={openPanels.rh_high}
                onToggle={togglePanel}
              >
                <ol className="mt-2 list-decimal space-y-2 pl-6 text-sm leading-6">
                  <li>
                    <strong>Increase exhaust fan speed or air exchange:</strong> Venting moist tent
                    air out into a drier lung room is the fastest free adjustment (<Vivosun />,{" "}
                    <Trimleaf />
                    ).
                  </li>
                  <li>
                    <strong>Improve airflow through the canopy:</strong> Angle oscillating clip fans
                    above and below the canopy so damp boundary air cannot sit around dense colas (
                    <SpiderFarmer />
                    ).
                  </li>
                  <li>
                    <strong>Remove standing water and saucer runoff immediately:</strong> Empty
                    drainage trays after watering so excess water does not evaporate into the tent (
                    <Vivosun />
                    ).
                  </li>
                  <li>
                    <strong>Water early in the lights-on period and avoid overwatering:</strong>{" "}
                    Give plants time to transpire while lights and warm °F air are active rather
                    than right before lights-off (<Trimleaf />
                    ).
                  </li>
                  <li>
                    <strong>Thin out dense foliage:</strong> Lightly defoliating overlapping inner
                    fan leaves reduces total transpiration surface and opens airflow lanes (
                    <Vivosun />
                    ).
                  </li>
                  <li>
                    <strong>Add a room dehumidifier outside or inside the space:</strong> If the
                    lung room air entering your intake is already humid, drying the room air is the
                    reliable step (<SpiderFarmer />
                    ).
                  </li>
                </ol>
                <p className="mt-2 text-sm">
                  Change one thing at a time and log your next reading after the tent settles.
                </p>
              </FixPanel>
              <FixPanel
                problem="rh_low"
                summary="Humidity too low (VPD above your stage band)"
                open={openPanels.rh_low}
                onToggle={togglePanel}
              >
                <ol className="mt-2 list-decimal space-y-2 pl-6 text-sm leading-6">
                  <li>
                    <strong>Lower your exhaust fan speed slightly:</strong> Slowing air extraction
                    keeps plant transpiration moisture inside the tent longer (<Vivosun />,{" "}
                    <SpiderFarmer />
                    ).
                  </li>
                  <li>
                    <strong>
                      Place a damp towel or shallow tray of water near the passive intake (small
                      tents):
                    </strong>{" "}
                    Evaporative surface area gives a modest humidity lift during dry spells (
                    <Trimleaf />, <Vivosun />
                    ).
                  </li>
                  <li>
                    <strong>Add an evaporative or cool-mist humidifier:</strong> In heated winter
                    rooms where indoor RH drops sharply, a humidifier in the tent or lung room
                    provides steady moisture control (<SpiderFarmer />
                    ).
                  </li>
                </ol>
                <p className="mt-2 text-sm">
                  Change one thing at a time and log your next reading to verify the shift.
                </p>
              </FixPanel>
              <FixPanel
                problem="temp_high"
                summary="Temperature too high (tent running hot in °F)"
                open={openPanels.temp_high}
                onToggle={togglePanel}
              >
                <ol className="mt-2 list-decimal space-y-2 pl-6 text-sm leading-6">
                  <li>
                    <strong>Increase exhaust fan speed and open passive lower intakes:</strong>{" "}
                    Pulling cooler lung-room air through the lower vents while exhausting top heat
                    is the first free step (<Vivosun />
                    ).
                  </li>
                  <li>
                    <strong>Raise or slightly dim your grow light:</strong> Increasing hanging
                    distance or dimming a step cuts radiant heat on the upper canopy (
                    <SpiderFarmer />
                    ).
                  </li>
                  <li>
                    <strong>Run lights-on during cooler overnight hours:</strong> Scheduling your
                    photoperiod so lights run at night and dark hours fall during the warmest part
                    of the afternoon evens out °F swings (<Trimleaf />
                    ).
                  </li>
                  <li>
                    <strong>Cool the lung room or vent exhaust outdoors:</strong> If warm exhaust
                    air recirculates back into the same room, conditioning the room or venting out a
                    window stops heat buildup (<Vivosun />
                    ).
                  </li>
                </ol>
              </FixPanel>
              <FixPanel
                problem="temp_low"
                summary="Temperature too low (tent running cold in °F)"
                open={openPanels.temp_low}
                onToggle={togglePanel}
              >
                <ol className="mt-2 list-decimal space-y-2 pl-6 text-sm leading-6">
                  <li>
                    <strong>Turn down exhaust fan speed during lights-off:</strong> Exhausting less
                    air retains warmth inside the tent (<Vivosun />
                    ).
                  </li>
                  <li>
                    <strong>
                      Elevate pots off cold concrete floors and insulate the tent base:
                    </strong>{" "}
                    Foam boards or pot risers keep root zones from losing heat to a cold basement
                    floor (<Trimleaf />
                    ).
                  </li>
                  <li>
                    <strong>
                      Warm the lung room with a thermostat-controlled heater at lights-off:
                    </strong>{" "}
                    Conditioning the intake room air keeps lights-off °F stable without blowing hot
                    dry air directly onto plants (<SpiderFarmer />
                    ).
                  </li>
                </ol>
              </FixPanel>
            </div>

            <p className="sr-only print:hidden" aria-live="polite">
              {status}
            </p>

            <div
              className={tableWrapClass}
              tabIndex={0}
              role="region"
              aria-label="Climate reading log table"
            >
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <caption className="p-2 text-left text-sm">
                  Logged grow tent temperature (°F), relative humidity, and VPD readings
                </caption>
                <thead>
                  <tr>
                    {LOG_HEADERS.map((header) => (
                      <th key={header} scope="col" className={cellClass}>
                        {header}
                      </th>
                    ))}
                    <th scope="col" className={`${cellClass} print:hidden`}>
                      Remove
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {readings.length === 0 ? (
                    <tr>
                      <th scope="row" colSpan={10} className={`${cellClass} font-normal`}>
                        No climate readings logged yet. Click &quot;Log this reading&quot; above to
                        record your tent&apos;s °F, RH, and VPD over time.
                      </th>
                    </tr>
                  ) : (
                    readings.map((r) => (
                      <tr key={r.id}>
                        <th scope="row" className={`${cellClass} whitespace-nowrap`}>
                          {r.dateTime}
                        </th>
                        <td className={cellClass}>{r.lights}</td>
                        <td className={cellClass}>{r.airF}°F</td>
                        <td className={cellClass}>{r.rh}%</td>
                        <td className={cellClass}>
                          {r.offsetF > 0 ? `+${r.offsetF}` : r.offsetF}°F
                        </td>
                        <td className={cellClass}>{r.stageLabel}</td>
                        <td className={`${cellClass} whitespace-nowrap`}>{r.vpd.toFixed(2)} kPa</td>
                        <td className={cellClass}>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.statusCode]}`}
                          >
                            {r.statusText}
                          </span>
                        </td>
                        <td className={`${cellClass} break-words`}>{r.note || "—"}</td>
                        <td className={`${cellClass} print:hidden`}>
                          <button
                            type="button"
                            className="min-h-11 underline"
                            aria-label={`Remove reading from ${r.dateTime}`}
                            onClick={() => removeReading(r)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6" aria-live="polite">
              <h3 className="text-lg font-semibold">Climate log summary</h3>
              {summary.overall === null ? (
                <p className="mt-2 leading-7">
                  0 readings logged. Log readings during lights-on and lights-off to see your
                  in-band counts and average °F, RH %, and VPD.
                </p>
              ) : (
                <div className="mt-2 space-y-1 text-sm leading-6">
                  <p>
                    Total readings: {summary.total} — In band: {summary.inBand}, Below band:{" "}
                    {summary.below}, Above band: {summary.above}.
                  </p>
                  <p>
                    Overall averages: {summary.overall.avgF}°F air temperature,{" "}
                    {summary.overall.avgRh}% RH, {summary.overall.avgVpd} kPa VPD.
                  </p>
                  {summary.lightsOn && summary.lightsOff ? (
                    <>
                      <p>{averagesLine("Lights-on averages", summary.lightsOn)}</p>
                      <p>{averagesLine("Lights-off averages", summary.lightsOff)}</p>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2 print:hidden">
              <button type="button" className={buttonClass} onClick={downloadCsv}>
                Download CSV
              </button>
              <button type="button" className={buttonClass} onClick={() => void copyLog()}>
                Copy log
              </button>
              <button type="button" className={buttonClass} onClick={() => printLog("log")}>
                Print / Save as PDF
              </button>
              <button type="button" className={buttonClass} onClick={() => printLog("blank")}>
                Print blank log sheet
              </button>
              <button
                type="button"
                className={`${buttonClass} border-red-300 text-red-900`}
                onClick={() => setConfirmClear(true)}
              >
                Clear log
              </button>
            </div>

            {confirmClear ? (
              <div
                className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm print:hidden"
                role="region"
                aria-label="Confirm clearing climate log"
              >
                <span>Clear all logged climate readings from this page?</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${buttonClass} border-red-300 text-red-900`}
                    onClick={clearLog}
                  >
                    Confirm clear
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {copyFallback !== null ? (
              <div className="mt-3 print:hidden">
                <label htmlFor="climate-copy-fallback" className="text-sm">
                  Clipboard access was unavailable. Select and copy your tab-separated climate log
                  below:
                </label>
                <textarea
                  id="climate-copy-fallback"
                  rows={5}
                  readOnly
                  className={inputClass}
                  value={copyFallback}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
            ) : null}

            {cta("tool")}
          </div>

          <div
            className={printMode === "blank" ? "hidden print:block" : "hidden"}
            aria-hidden="true"
          >
            <h3 className="text-lg font-semibold">
              Verdant Grow Diary — Blank Tent Climate Log Sheet
            </h3>
            <p className="mt-2 text-sm">
              Common grower VPD targets (not strict rules):{" "}
              {GROW_TENT_CLIMATE_STAGES.map(
                (s) => `${s.name} ${s.min.toFixed(1)}–${s.max.toFixed(1)} kPa`,
              ).join(" · ")}
              .
            </p>
            <table className="mt-2 w-full border-collapse text-sm">
              <caption className="p-2 text-left">Tent-side climate log sheet (14 rows)</caption>
              <thead>
                <tr>
                  {LOG_HEADERS.map((header) => (
                    <th key={header} scope="col" className="border border-black px-2 py-1">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 14 }, (_, row) => (
                  <tr key={row}>
                    <th scope="row" className="h-8 border border-black">
                      &nbsp;
                    </th>
                    {LOG_HEADERS.slice(1).map((header) => (
                      <td key={header} className="border border-black">
                        &nbsp;
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className={hideForBlankPrint}>
          <section id="grow-room-temp-and-humidity-chart-by-stage" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Grow room temp and humidity chart by stage</h2>
            <p className="mt-2">
              When growers search for a <strong>grow room temp and humidity chart</strong> or a{" "}
              <strong>grow tent temperature and humidity chart</strong>, they often find rigid
              tables that treat temperature and humidity as separate rules. In practice, plants
              experience air temperature and relative humidity together as <strong>VPD</strong>{" "}
              (vapor pressure deficit)—the drying power of the air on the leaf surface (
              <SpiderFarmerVpd />, <Gorilla />, <Aroya />
              ). The stage bands below are common grower targets rather than strict rules, matching
              our{" "}
              <Link className="underline" to="/vpd-chart">
                VPD chart
              </Link>
              . Our{" "}
              <Link className="underline" to="/tools/vpd-calculator">
                VPD calculator
              </Link>{" "}
              uses a different late-flower band: {publicVpdChartLateFlowerReferenceNote()}
            </p>
            <div
              className={tableWrapClass}
              tabIndex={0}
              role="region"
              aria-label="Grow room temperature and humidity chart by stage"
            >
              <table className="w-full border-collapse text-sm">
                <caption className="p-2 text-left text-sm">
                  Common grower VPD bands by stage and formula-calculated example °F/RH pairs
                  (examples, not targets; 0°F leaf offset)
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={cellClass}>
                      Stage
                    </th>
                    <th scope="col" className={cellClass}>
                      Common VPD band (common grower targets rather than strict rules)
                    </th>
                    <th scope="col" className={cellClass}>
                      Example readings inside the band (examples, not targets; 0°F leaf offset)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {GROW_TENT_CLIMATE_STAGES.map((s) => (
                    <tr key={s.id}>
                      <th scope="row" className={cellClass}>
                        {s.name}
                      </th>
                      <td className={`${cellClass} whitespace-nowrap`}>
                        {s.min.toFixed(1)}–{s.max.toFixed(1)} kPa
                      </td>
                      <td className={cellClass}>
                        {growTentExampleLines(s.id).map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 rounded-md bg-white p-3 text-sm leading-6">
              <strong>How the VPD formula works:</strong> Air temperature in °F is converted as °C =
              (°F − 32) / 1.8, and leaf temperature in °C is air °C plus the leaf offset (offset in
              °F × 5/9). Saturation vapor pressure is SVP(T) = 0.61078 × exp(17.27 × T / (T +
              237.3)), and VPD = SVP(leaf) − SVP(air) × RH / 100, rounded to 2 decimal places.
            </p>
          </section>

          <section id="how-to-lower-humidity-in-a-grow-tent" className={sectionClass}>
            <h2 className="text-2xl font-semibold">How to lower humidity in a grow tent</h2>
            <p className="mt-2">
              Knowing <strong>how to lower humidity in grow tent</strong> setups starts with
              understanding where the moisture comes from: almost all water poured into your pots
              eventually exits through plant transpiration and medium evaporation. When managing{" "}
              <strong>humidity for flowering</strong> or a crowded veg canopy, cultivation guides (
              <Vivosun />, <Trimleaf />, <SpiderFarmer />) recommend working through common fixes
              from cheapest to most equipment-intensive:
            </p>
            <ol className="mt-2 list-decimal space-y-2 pl-6">
              <li>
                <strong>Increase exhaust or air exchange:</strong> Turning up your inline exhaust
                fan swaps moist tent air for drier lung-room air and pulls fresh air through passive
                lower vents (<Vivosun />, <Trimleaf />
                ).
              </li>
              <li>
                <strong>Improve canopy airflow:</strong> Oscillating circulation fans don&apos;t
                remove water from the room by themselves, but they break up pockets of damp air
                trapped around leaves and dense buds (<SpiderFarmer />
                ).
              </li>
              <li>
                <strong>Remove standing water and runoff right away:</strong> Wet fabric pot
                saucers, drain trays, and spills act like open humidifiers inside an enclosed tent (
                <Vivosun />
                ).
              </li>
              <li>
                <strong>Avoid overwatering and water early in the lights-on period:</strong>{" "}
                Watering shortly after lights turn on gives the warm lights-on cycle and active
                exhaust hours to clear surface moisture before the cooler dark period arrives (
                <Trimleaf />
                ).
              </li>
              <li>
                <strong>Thin dense foliage:</strong> Selective defoliation of overlapping inner fan
                leaves reduces total transpiration and lets air move freely through the middle of
                the canopy (<Vivosun />
                ).
              </li>
              <li>
                <strong>Add a dehumidifier if room air is humid:</strong> When the room outside your
                tent is already humid, increasing exhaust speed only pulls humid air back in.
                Running a dehumidifier in the lung room dries the intake air before it enters the
                tent (<SpiderFarmer />
                ).
              </li>
            </ol>
            <p className="mt-2">
              Change one thing at a time and log your °F and RH reading an hour later so you can see
              which adjustment actually moved your VPD into the band. Keeping late-flower humidity
              in check is also a core part of{" "}
              <Link className="underline" to="/guides/bud-rot-prevention-identification">
                bud rot prevention
              </Link>
              .
            </p>
          </section>

          <section id="how-to-raise-humidity-in-a-grow-tent" className={sectionClass}>
            <h2 className="text-2xl font-semibold">How to raise humidity in a grow tent</h2>
            <p className="mt-2">
              When seedlings, clones, or early veg plants sit above their stage VPD band because the
              air is too dry, growers looking for{" "}
              <strong>how to raise humidity in grow tent</strong> environments use these common
              fixes (<Vivosun />, <Trimleaf />, <SpiderFarmer />
              ):
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-6">
              <li>
                <strong>Lower the exhaust fan speed:</strong> If your inline fan runs at high speed
                while plants are still small, it strips moisture out of the tent faster than young
                leaves can transpire. Stepping the exhaust down lets humidity build naturally (
                <Vivosun />
                ).
              </li>
              <li>
                <strong>Use a damp towel or tray of water near the intake for small tents:</strong>{" "}
                Hanging a clean wet towel or setting a shallow tray of water near the passive intake
                adds gentle evaporation without extra power draw (<Trimleaf />, <Vivosun />
                ).
              </li>
              <li>
                <strong>Add a humidifier:</strong> Winter room air is often dry once household
                heating kicks on, pulling tent RH down and pushing VPD above your stage band.
                Placing a humidifier in the tent or lung room—kept clean and positioned so mist
                never blows directly onto leaves or electrical gear—gives consistent control (
                <SpiderFarmer />
                ).
              </li>
            </ul>
          </section>

          <section id="fixing-grow-tent-temperature" className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              Fixing grow tent temperature (too hot or too cold)
            </h2>
            <p className="mt-2">
              Managing <strong>grow tent temperature</strong> in °F works hand in hand with humidity
              because warming air lowers relative humidity (raising VPD), while cooling air raises
              relative humidity (lowering VPD) (<Aroya />, <Gorilla />
              ). Grow guides (<Vivosun />, <Trimleaf />, <SpiderFarmer />) focus on four levers:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-6">
              <li>
                <strong>Exhaust and intake balance:</strong> Warm air rises to the top of the tent.
                Exhausting from the top roof port while opening opposite lower vents draws cooler
                room air across the canopy.
              </li>
              <li>
                <strong>Room air temperature (°F):</strong> A grow tent breathes the air of the room
                it sits in. Conditioning the lung room or venting hot exhaust air out of the room
                prevents heat from cycling right back through the intake.
              </li>
              <li>
                <strong>Light height and dimming:</strong> Raising the fixture a few inches, dimming
                slightly, or mounting a removable driver outside the tent reduces radiant °F load on
                top colas.
              </li>
              <li>
                <strong>Heater or insulation at lights-off:</strong> If °F drops sharply when the
                lights turn off, insulating cold floors under your pots and running a
                thermostat-controlled heater in the lung room keeps dark-period temperatures steady.
              </li>
            </ul>
          </section>

          <section id="lights-on-vs-lights-off-swings" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Lights-on vs lights-off swings</h2>
            <p className="mt-2">
              One of the most common surprises in a grow diary is a sudden relative humidity spike
              right after the timer clicks off. Even if no extra water entered the tent, RH often
              rises when lights go off because the air cools in °F, and cooler air holds less water
              vapor before reaching saturation (<Aroya />, <Gorilla />, <Vivosun />
              ).
            </p>
            <p className="mt-2">
              When air temperature in °F drops at lights-off while moisture from recently watered
              pots remains inside the tent, VPD can plummet below your stage band within minutes.
              Logging both lights-on and lights-off readings in the tracker above shows you the true
              day-to-night swing so you can keep exhaust airflow running through the dark transition
              and avoid watering right before lights-out.
            </p>
          </section>

          <section id="log-readings-not-single-spikes" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Log readings, not single spikes</h2>
            <p className="mt-2">
              Opening the tent door to water or inspect plants always causes a brief temperature or
              humidity blip on your hygrometer. Chasing a five-minute spike by cranking equipment up
              and down leads to constant overcorrection. Hang your probe at canopy height, shaded
              from direct grow light radiation and away from humidifier mist or intake drafts, so
              your °F and RH readings reflect what the leaves actually experience.
            </p>
            <p className="mt-2">
              Learn how probe placement affects your numbers in our{" "}
              <Link className="underline" to="/guides/sensor-truth-grow-room">
                sensor placement
              </Link>{" "}
              guide, and see how daily trends fit together in our{" "}
              <Link className="underline" to="/guides/grow-room-vpd-tracker">
                grow room VPD tracker
              </Link>
              .
            </p>
          </section>

          <section id="keep-your-climate-log-in-verdant" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Keep your climate log in Verdant</h2>
            <p className="mt-2">
              Instead of losing your lights-on and lights-off checks when you close this tab, save
              your readings inside Verdant Grow Diary alongside your watering volumes, nutrient
              feeds, and plant photos.
            </p>
            {cta("article")}
          </section>

          <section id="grow-tent-temperature-and-humidity-faq" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Grow tent temperature and humidity FAQ</h2>
            {GROW_TENT_CLIMATE_FAQ.map((entry) => (
              <details key={entry.question} className="mt-3 rounded-md border bg-white p-3">
                <summary className="min-h-11 cursor-pointer font-medium">{entry.question}</summary>
                <p className="mt-2 leading-7">{entry.answer}</p>
              </details>
            ))}
          </section>

          <section id="keep-reading" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Keep reading</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <Link className="underline" to="/vpd-chart">
                  VPD chart by growth stage
                </Link>
              </li>
              <li>
                <Link className="underline" to="/guides/grow-room-vpd-tracker">
                  Grow room VPD tracker
                </Link>
              </li>
              <li>
                <Link className="underline" to="/guides/ac-infinity-data-logging">
                  AC Infinity data logging
                </Link>
              </li>
              <li>
                <Link className="underline" to="/guides/spider-farmer-data-logging">
                  Spider Farmer data logging
                </Link>
              </li>
              <li>
                <Link className="underline" to="/guides/when-to-harvest-cannabis">
                  When to harvest cannabis
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </main>

      <footer
        id="sources"
        className={`border-t border-emerald-900/10 bg-white px-4 py-8 ${hideForBlankPrint}`}
      >
        <div className="mx-auto max-w-5xl">
          <h2 className="text-lg font-semibold">Sources</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {GROW_TENT_CLIMATE_SOURCES.map((source) => (
              <li key={source.url} className="break-words">
                {source.label}: <Ext href={source.url}>{source.url}</Ext>
              </li>
            ))}
          </ul>
          {cta("footer")}
          <p className="mt-4 text-sm">
            Educational content for home growers. Follow the laws where you live.
          </p>
        </div>
      </footer>
    </div>
  );
}
