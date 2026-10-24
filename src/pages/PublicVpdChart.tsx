import { useMemo, useState } from "react";
import { Link } from "@/lib/react-router-compat";

import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  calculatePublicVpdChartFromFahrenheit,
  classifyPublicVpdChartCell,
  PUBLIC_VPD_CALCULATOR_CROSS_LINK_PATH,
  PUBLIC_VPD_CHART_DEFAULTS,
  PUBLIC_VPD_CHART_DESCRIPTION,
  PUBLIC_VPD_CHART_FAQ,
  PUBLIC_VPD_CHART_H1,
  PUBLIC_VPD_CHART_HEATMAP_F_ROWS,
  PUBLIC_VPD_CHART_HEATMAP_RH_COLS,
  PUBLIC_VPD_CHART_PATH,
  PUBLIC_VPD_CHART_STAGES,
  PUBLIC_VPD_CHART_TITLE,
  publicVpdChartAirTemperatureFromDisplay,
  publicVpdChartClamp,
  publicVpdChartDisplayedAirTemperature,
  publicVpdChartDisplayedOffset,
  publicVpdChartFahrenheitToCelsius,
  publicVpdChartMatchingStages,
  publicVpdChartMoveFocus,
  publicVpdChartNearestHeatmapCell,
  publicVpdChartOffsetFahrenheitToCelsius,
  publicVpdChartOffsetFromDisplay,
  publicVpdChartSelectedStageVerdict,
  publicVpdChartStageById,
  type PublicVpdChartStageId,
  type PublicVpdChartUnit,
} from "@/lib/publicVpdChartRules";

const BAND_CLASS: Readonly<Record<string, string>> = {
  "band-low": "bg-blue-100 text-blue-950",
  "band-clone": "bg-emerald-100 text-emerald-950",
  "band-veg": "bg-green-100 text-green-950",
  "band-eflower": "bg-yellow-100 text-yellow-950",
  "band-lflower": "bg-orange-100 text-orange-950",
  "band-high": "bg-red-100 text-red-950",
};

function parseFinite(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function DraftNumberInput({
  id,
  describedBy,
  committed,
  min,
  max,
  step,
  inputMode,
  onCommit,
}: {
  id: string;
  describedBy: string;
  committed: number;
  min: number;
  max: number;
  step: number;
  inputMode: "decimal" | "numeric";
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit(raw: string) {
    onCommit(raw);
    setDraft(null);
  }

  return (
    <input
      id={id}
      className="mt-1 w-full rounded-md border px-3 py-2"
      type="number"
      inputMode={inputMode}
      min={min}
      max={max}
      step={step}
      value={draft ?? String(committed)}
      aria-describedby={describedBy}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        commit(event.currentTarget.value);
      }}
    />
  );
}

export default function PublicVpdChart() {
  const [unit, setUnit] = useState<PublicVpdChartUnit>(PUBLIC_VPD_CHART_DEFAULTS.unit);
  const [airTempF, setAirTempF] = useState<number>(PUBLIC_VPD_CHART_DEFAULTS.airTempF);
  const [rh, setRh] = useState<number>(PUBLIC_VPD_CHART_DEFAULTS.rh);
  const [offsetF, setOffsetF] = useState<number>(PUBLIC_VPD_CHART_DEFAULTS.offsetF);
  const [stageId, setStageId] = useState<PublicVpdChartStageId>(PUBLIC_VPD_CHART_DEFAULTS.stageId);
  const [roving, setRoving] = useState<{ row: number; column: number } | null>(null);

  usePageSeo({
    title: PUBLIC_VPD_CHART_TITLE,
    description: PUBLIC_VPD_CHART_DESCRIPTION,
    path: PUBLIC_VPD_CHART_PATH,
  });

  const calculation = useMemo(
    () => calculatePublicVpdChartFromFahrenheit(airTempF, rh, offsetF),
    [airTempF, offsetF, rh],
  );
  const selectedStage = publicVpdChartStageById(stageId);
  const matches = publicVpdChartMatchingStages(calculation.vpdRounded);
  const band = classifyPublicVpdChartCell(calculation.vpdRounded, stageId);
  const nearest = publicVpdChartNearestHeatmapCell(airTempF, rh);
  const nearestIndex = {
    row: PUBLIC_VPD_CHART_HEATMAP_F_ROWS.indexOf(nearest.rowF),
    column: PUBLIC_VPD_CHART_HEATMAP_RH_COLS.indexOf(nearest.colRH),
  };
  const focus = roving ?? nearestIndex;
  const displayedAir = publicVpdChartDisplayedAirTemperature(airTempF, unit);
  const displayedOffset = publicVpdChartDisplayedOffset(offsetF, unit);
  const leafF = airTempF + offsetF;
  const isFahrenheit = unit === "F";

  function selectCell(rowTempF: number, columnRh: number) {
    setAirTempF(publicVpdChartClamp(rowTempF, 50, 100));
    setRh(publicVpdChartClamp(columnRh, 0, 100));
    setRoving(null);
  }

  return (
    <div className="min-h-screen bg-[#f4f7f3] text-[#162419]">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link to="/" className="inline-flex items-center gap-2 font-semibold">
          <BrandLogo className="h-8 w-8" />
          Verdant Grow Diary
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link to={PUBLIC_VPD_CALCULATOR_CROSS_LINK_PATH} className="underline">
            Stage-aware VPD calculator
          </Link>
          <Link to="/guides/grow-room-vpd-tracker" className="underline">
            Grow-room VPD tracker guide
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-16">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          {PUBLIC_VPD_CHART_H1}
        </h1>
        <p className="max-w-3xl text-base leading-7">
          Vapor Pressure Deficit (VPD) measures the difference in kilopascals (kPa) between moisture
          saturation inside the leaf and moisture in the surrounding grow tent air. Common grower
          targets are 0.4–0.8 kPa for clones and seedlings, 0.8–1.2 kPa for veg, 1.0–1.5 kPa for
          early flower, and 1.2–1.6 kPa for late flower.
        </p>
        <p className="text-sm text-[#526656]">
          Calculated from values you entered. This is not a live sensor reading.
        </p>

        <section
          className="rounded-xl border border-[#c5d4c7] bg-white p-4 shadow-sm"
          aria-labelledby="calc-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="calc-heading" className="text-xl font-semibold">
              1. Enter your environment
            </h2>
            <div
              className="inline-flex rounded-md border"
              role="group"
              aria-label="Temperature unit"
            >
              <button
                type="button"
                className="px-3 py-2 text-sm"
                aria-pressed={isFahrenheit}
                onClick={() => setUnit("F")}
              >
                °F
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm"
                aria-pressed={!isFahrenheit}
                onClick={() => setUnit("C")}
              >
                °C
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="air-temp-number" className="font-medium">
                Air temperature ({isFahrenheit ? "°F" : "°C"})
              </label>
              <p id="air-temp-range-hint" className="text-sm text-[#526656]">
                {isFahrenheit ? "Range: 50–100 °F" : "Range: 10–38 °C"}
              </p>
              <DraftNumberInput
                key={unit}
                id="air-temp-number"
                describedBy="air-temp-range-hint"
                committed={displayedAir}
                min={isFahrenheit ? 50 : 10}
                max={isFahrenheit ? 100 : 38}
                step={0.1}
                inputMode="decimal"
                onCommit={(raw) => {
                  const parsed = parseFinite(raw);
                  if (parsed === null) return;
                  setAirTempF(publicVpdChartAirTemperatureFromDisplay(parsed, unit));
                }}
              />
            </div>
            <div>
              <label htmlFor="rh-number" className="font-medium">
                Relative humidity (%)
              </label>
              <p id="rh-range-hint" className="text-sm text-[#526656]">
                Range: 0–100%
              </p>
              <DraftNumberInput
                id="rh-number"
                describedBy="rh-range-hint"
                committed={rh}
                min={0}
                max={100}
                step={1}
                inputMode="numeric"
                onCommit={(raw) => {
                  const parsed = parseFinite(raw);
                  if (parsed === null) return;
                  setRh(publicVpdChartClamp(Math.round(parsed), 0, 100));
                }}
              />
            </div>
            <div>
              <label htmlFor="leaf-offset-number" className="font-medium">
                Leaf temperature offset (leaf minus air)
              </label>
              <p id="leaf-offset-range-hint" className="text-sm text-[#526656]">
                {isFahrenheit ? "Range: −10 to +5 °F" : "Range: −5.6 to +2.8 °C"}
              </p>
              <DraftNumberInput
                key={unit}
                id="leaf-offset-number"
                describedBy="leaf-offset-range-hint"
                committed={displayedOffset}
                min={isFahrenheit ? -10 : -5.6}
                max={isFahrenheit ? 5 : 2.8}
                step={0.1}
                inputMode="decimal"
                onCommit={(raw) => {
                  const parsed = parseFinite(raw);
                  if (parsed === null) return;
                  setOffsetF(publicVpdChartOffsetFromDisplay(parsed, unit));
                }}
              />
            </div>
            <div>
              <label htmlFor="stage-select" className="font-medium">
                Growth stage target
              </label>
              <select
                id="stage-select"
                className="mt-6 w-full rounded-md border px-3 py-2"
                value={stageId}
                onChange={(event) => setStageId(event.target.value as PublicVpdChartStageId)}
              >
                {PUBLIC_VPD_CHART_STAGES.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name} ({stage.min.toFixed(1)}–{stage.max.toFixed(1)} kPa)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section
          className={`rounded-xl border p-4 ${BAND_CLASS[band.cssClass] ?? "bg-white"}`}
          aria-live="polite"
          aria-label="Calculated VPD"
        >
          <p className="text-sm">Calculated from values you entered</p>
          <p className="font-display text-4xl font-bold">{calculation.vpdFormatted} kPa</p>
          <p>
            Computed leaf temp:{" "}
            {isFahrenheit
              ? `${leafF.toFixed(1)} °F (${calculation.leafTempC.toFixed(1)} °C)`
              : `${calculation.leafTempC.toFixed(1)} °C (${leafF.toFixed(1)} °F)`}
          </p>
          <p>Leaf SVP: {calculation.svpLeaf.toFixed(2)} kPa</p>
          <p>Air actual vapor pressure: {calculation.avpAir.toFixed(2)} kPa</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {calculation.vpdRounded < 0.4 ? (
              <span className="rounded-full bg-white/70 px-2 py-1 text-sm">
                Below 0.4 kPa — very low (damp, mold risk)
              </span>
            ) : calculation.vpdRounded > 1.6 ? (
              <span className="rounded-full bg-white/70 px-2 py-1 text-sm">
                Above 1.6 kPa — very high (plant stress)
              </span>
            ) : (
              matches.map((stage) => (
                <span key={stage.id} className="rounded-full bg-white/70 px-2 py-1 text-sm">
                  {stage.name} ({stage.min.toFixed(1)}–{stage.max.toFixed(1)} kPa)
                </span>
              ))
            )}
          </div>
          <p className="mt-2 font-medium">
            {publicVpdChartSelectedStageVerdict(calculation.vpdRounded, stageId)}
          </p>
          <p className="mt-3 text-sm">
            <Link to="/signup" className="underline">
              Log this reading in Verdant
            </Link>
          </p>
        </section>

        <section aria-labelledby="chart-heading">
          <h2 id="chart-heading" className="text-2xl font-semibold">
            VPD chart by growth stage
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <h3 className="text-base font-semibold">Clone and seedling VPD: 0.4–0.8 kPa</h3>
            <h3 className="text-base font-semibold">Veg VPD: 0.8–1.2 kPa</h3>
            <h3 className="text-base font-semibold">Early flower VPD: 1.0–1.5 kPa</h3>
            <h3 className="text-base font-semibold">Late flower VPD: 1.2–1.6 kPa</h3>
          </div>
          <p className="mt-3 text-sm">
            Overlapping band rule: cells matching {selectedStage.name}:{" "}
            {selectedStage.min.toFixed(1)}–{selectedStage.max.toFixed(1)} kPa are marked with a
            star. Nearest current input:{" "}
            {isFahrenheit
              ? `${nearest.rowF} °F / ${nearest.colRH}% RH`
              : `${publicVpdChartFahrenheitToCelsius(nearest.rowF).toFixed(1)} °C / ${nearest.colRH}% RH`}
            .
          </p>
          <div
            className="mt-3 overflow-x-auto"
            role="region"
            aria-label="Scrollable VPD heatmap table"
          >
            <table className="min-w-[720px] border-collapse text-xs">
              <caption className="mb-2 text-left text-sm">
                {isFahrenheit
                  ? `VPD (kPa) across air temperature (60–90 °F) and relative humidity (30–90%) with leaf offset ${offsetF.toFixed(1)} °F`
                  : `VPD (kPa) across air temperature (15.6–32.2 °C) and relative humidity (30–90%) with leaf offset ${publicVpdChartOffsetFahrenheitToCelsius(offsetF).toFixed(1)} °C`}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="border px-1 py-1">
                    {isFahrenheit ? "Air °F \\ RH %" : "Air °C \\ RH %"}
                  </th>
                  {PUBLIC_VPD_CHART_HEATMAP_RH_COLS.map((column) => (
                    <th key={column} scope="col" className="border px-1 py-1">
                      {column}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody
                onKeyDown={(event) => {
                  const next = publicVpdChartMoveFocus(focus.row, focus.column, event.key);
                  if (!next) return;
                  event.preventDefault();
                  setRoving(next);
                  const button = event.currentTarget.querySelector<HTMLButtonElement>(
                    `[data-row-idx="${next.row}"][data-col-idx="${next.column}"]`,
                  );
                  button?.focus();
                }}
              >
                {PUBLIC_VPD_CHART_HEATMAP_F_ROWS.map((rowTempF, rowIndex) => {
                  const tempLabel = isFahrenheit
                    ? `${rowTempF} °F`
                    : `${publicVpdChartFahrenheitToCelsius(rowTempF).toFixed(1)} °C`;
                  return (
                    <tr key={rowTempF}>
                      <th scope="row" className="border px-1 py-1 text-left">
                        {tempLabel}
                      </th>
                      {PUBLIC_VPD_CHART_HEATMAP_RH_COLS.map((columnRh, columnIndex) => {
                        const cell = calculatePublicVpdChartFromFahrenheit(
                          rowTempF,
                          columnRh,
                          offsetF,
                        );
                        const cellBand = classifyPublicVpdChartCell(cell.vpdRounded, stageId);
                        const isNearest = rowTempF === nearest.rowF && columnRh === nearest.colRH;
                        const isFocus = focus.row === rowIndex && focus.column === columnIndex;
                        return (
                          <td key={columnRh} className="border p-0">
                            <button
                              type="button"
                              data-row-idx={rowIndex}
                              data-col-idx={columnIndex}
                              tabIndex={isFocus ? 0 : -1}
                              className={`flex min-h-11 w-full min-w-11 flex-col items-center justify-center px-1 py-1 ${BAND_CLASS[cellBand.cssClass] ?? ""} ${cellBand.matchesSelected ? "ring-1 ring-black" : "opacity-80"} ${isNearest ? "outline outline-2 outline-offset-[-2px] outline-black" : ""}`}
                              aria-label={`${tempLabel}, ${columnRh}% RH: VPD ${cell.vpdFormatted} kPa (${cellBand.label})${isNearest ? ", nearest current input" : ""}`}
                              onClick={() => selectCell(rowTempF, columnRh)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                selectCell(rowTempF, columnRh);
                              }}
                            >
                              <span>{cell.vpdFormatted}</span>
                              <span>{cellBand.code}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm">
            Sources: Spider Farmer blog (clone/seedling 0.4–0.8 kPa, veg 0.8–1.2 kPa), Gorilla Grow
            Tent VPD chart guide (early flower 1.0–1.5 kPa), Aroya VPD chart (late flower 1.2–1.6
            kPa). Common grower targets, not strict rules. Updated Oct 2026.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">How VPD is calculated</h2>
          <p className="mt-2">
            Saturation vapor pressure (SVP) in kPa is calculated from temperature T in °C (where °C
            = (°F − 32) / 1.8), and VPD compares saturation at the leaf against actual moisture in
            the air.
          </p>
          <p className="mt-2 font-mono text-sm">SVP = 0.61078 × exp(17.27T / (T + 237.3))</p>
          <p className="font-mono text-sm">VPD = SVP(leaf) − SVP(air) × RH/100</p>
          <p className="mt-2">
            Worked example: at 77 °F, 60% RH, and a leaf offset of −2 °F, the result is 1.06 kPa.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">FAQ</h2>
          {PUBLIC_VPD_CHART_FAQ.map((entry) => (
            <details key={entry.question} open className="mt-2 rounded-md border bg-white p-3">
              <summary className="cursor-pointer font-medium">{entry.question}</summary>
              <p className="mt-1">{entry.answer}</p>
            </details>
          ))}
        </section>
      </main>
    </div>
  );
}
