import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/react-router-compat";

import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { trackFeedLogEvent, type FeedLogCtaLocation } from "@/lib/publicFeedLogAnalytics";
import {
  addFeedLogProduct,
  addFeedLogWeek,
  buildFeedLogCsv,
  buildFeedLogTsv,
  createDefaultFeedLogState,
  evaluateProductCell,
  FEED_LOG_AMOUNT_UNITS,
  FEED_LOG_FAQ,
  FEED_LOG_MAX_PRODUCTS,
  FEED_LOG_MAX_WEEKS,
  FEED_LOG_MEDIA,
  FEED_LOG_MIN_PRODUCTS,
  FEED_LOG_MIN_WEEKS,
  FEED_LOG_READING_TYPES,
  FEED_LOG_RESPONSES,
  FEED_LOG_STAGES,
  FEED_LOG_WATER_UNITS,
  PUBLIC_FEED_LOG_DESCRIPTION,
  PUBLIC_FEED_LOG_H1,
  PUBLIC_FEED_LOG_PATH,
  PUBLIC_FEED_LOG_SIGNUP_PATH,
  PUBLIC_FEED_LOG_TITLE,
  removeFeedLogProduct,
  removeFeedLogWeek,
  summarizeFeedLog,
  type FeedLogState,
} from "@/lib/publicFeedLogRules";

function useViewportLayout(): "phone" | "desktop" {
  const [layout, setLayout] = useState<"phone" | "desktop">("desktop");
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const apply = () => setLayout(query.matches ? "desktop" : "phone");
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return layout;
}

export default function PublicFeedLog() {
  const [state, setState] = useState<FeedLogState>(() => createDefaultFeedLogState());
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [blankPrint, setBlankPrint] = useState(false);
  const [calcTick, setCalcTick] = useState(0);
  const layout = useViewportLayout();
  const summary = useMemo(() => summarizeFeedLog(state), [state]);

  usePageSeo({
    title: `${PUBLIC_FEED_LOG_TITLE} | Verdant Grow Diary`,
    description: PUBLIC_FEED_LOG_DESCRIPTION,
    path: PUBLIC_FEED_LOG_PATH,
  });

  useEffect(() => {
    if (calcTick === 0) return;
    const timer = window.setTimeout(() => {
      trackFeedLogEvent("feed_log_calculated", {
        weeks_filled: summary.weeksFilled,
        weeks_flagged: summary.weeksFlagged,
        product_count: state.products.length,
      });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [calcTick, summary.weeksFilled, summary.weeksFlagged, state.products.length]);

  function patch(partial: Partial<FeedLogState>, recalculate = false) {
    setState((current) => ({ ...current, ...partial }));
    if (recalculate) setCalcTick((tick) => tick + 1);
  }

  function updateWeek(
    index: number,
    partial: Partial<FeedLogState["weeks"][number]>,
    recalculate = false,
  ) {
    setState((current) => ({
      ...current,
      weeks: current.weeks.map((week, weekIndex) =>
        weekIndex === index ? { ...week, ...partial } : week,
      ),
    }));
    if (recalculate) setCalcTick((tick) => tick + 1);
  }

  function updateCell(
    weekIndex: number,
    productIndex: number,
    key: "planned" | "actual",
    value: string,
  ) {
    setState((current) => ({
      ...current,
      weeks: current.weeks.map((week, index) => {
        if (index !== weekIndex) return week;
        const products = week.products.map((cell, cellIndex) =>
          cellIndex === productIndex ? { ...cell, [key]: value } : cell,
        );
        return { ...week, products };
      }),
    }));
    setCalcTick((tick) => tick + 1);
  }

  function announce(message: string) {
    setStatus("");
    window.setTimeout(() => setStatus(message), 20);
  }

  function downloadCsv() {
    let url: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      const csv = buildFeedLogCsv(state);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      url = URL.createObjectURL(blob);
      link = document.createElement("a");
      link.href = url;
      link.download = "planned-vs-actual-feed-log.csv";
      document.body.appendChild(link);
      link.click();
      const objectUrl = url;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      trackFeedLogEvent("feed_log_csv_exported", { row_count: state.weeks.length });
      announce("CSV downloaded to this device. This page did not store the log.");
    } catch {
      if (url) URL.revokeObjectURL(url);
      announce("CSV export unavailable in this browser.");
    } finally {
      link?.remove();
    }
  }

  async function copyLog() {
    const text = buildFeedLogTsv(state);
    try {
      await navigator.clipboard.writeText(text);
      trackFeedLogEvent("feed_log_copied", { row_count: state.weeks.length });
      announce("Copied. Paste it into a spreadsheet. This page did not store the log.");
    } catch {
      announce("Copy is unavailable in this browser.");
    }
  }

  function printLog(blank: boolean) {
    setBlankPrint(blank);
    trackFeedLogEvent("feed_log_printed", {});
    window.setTimeout(() => window.print(), 30);
  }

  function onCta(location: FeedLogCtaLocation) {
    trackFeedLogEvent("feed_log_cta_click", { cta_location: location });
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-emerald-900/20 bg-white px-2 py-1.5 text-sm text-emerald-950";

  return (
    <div
      data-testid="feed-log-page"
      data-layout={layout}
      className={`min-h-screen bg-[#f4f7f2] text-emerald-950 ${blankPrint ? "feed-log-blank-print" : ""}`}
    >
      <header className="border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/welcome" aria-label="Verdant Grow Diary home">
            <BrandLogo />
          </Link>
          <nav aria-label="Guide links" className="flex gap-4 text-sm">
            <Link to="/guides" className="underline">
              Guides
            </Link>
            <Link to="/tools/vpd-calculator" className="underline">
              VPD calculator
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-sm text-emerald-900/70">
          <Link to="/welcome" className="underline">
            Home
          </Link>
          {" / "}
          <Link to="/guides" className="underline">
            Guides
          </Link>
          {" / "}
          Feed log
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight md:text-4xl">
          {PUBLIC_FEED_LOG_H1}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7">
          Copy the planned targets from your own feeding schedule into this interactive table, log
          the actual doses you mixed each week alongside pH, EC or PPM, and environment readings,
          and export a clean record of how your plants responded.
        </p>
        <p className="mt-2 text-sm text-emerald-900/80">
          Advanced Nutrients, pH Perfect, Sensi, Connoisseur and BudLabs are trademarks of their
          owners. Verdant Grow Diary is not affiliated with or endorsed by Advanced Nutrients.
        </p>

        <section aria-labelledby="quick-answer" className="mt-6 rounded-xl bg-white p-4 shadow-sm">
          <h2 id="quick-answer" className="text-lg font-semibold">
            Quick answer
          </h2>
          <p className="mt-2 leading-7">
            The official Advanced Nutrients{" "}
            <a
              className="underline"
              href="https://www.advancednutrients.com/feeding/"
              rel="noopener noreferrer"
              target="_blank"
            >
              feeding charts
            </a>{" "}
            and{" "}
            <a
              className="underline"
              href="https://www.advancednutrients.com/nutrient-calculator/"
              rel="noopener noreferrer"
              target="_blank"
            >
              nutrient calculator
            </a>{" "}
            are on advancednutrients.com. Use your chart as the plan, then log what you actually fed
            each week, your pH and EC/PPM, and how your plants responded, so you can see where you
            deviated and adjust next time.
          </p>
        </section>

        <section aria-labelledby="log-heading" className="mt-8" data-testid="feed-log-tool">
          <h2 id="log-heading" className="text-2xl font-semibold">
            Planned vs actual feed log
          </h2>
          <p className="mt-2 text-sm">
            Planned cells start blank. Copy them from the official chart for your product line and
            medium. This page keeps numbers in memory only and does not store them.
          </p>

          <div
            className={`mt-4 grid gap-3 ${layout === "desktop" ? "md:grid-cols-3" : "grid-cols-1"}`}
          >
            <label className="text-sm">
              Grow name
              <input
                className={inputClass}
                value={state.growName}
                onChange={(event) => patch({ growName: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Product line
              <input
                className={inputClass}
                placeholder="e.g., pH Perfect Sensi Grow/Bloom"
                value={state.productLine}
                onChange={(event) => patch({ productLine: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Medium
              <select
                className={inputClass}
                value={state.medium}
                onChange={(event) =>
                  patch({ medium: event.target.value as FeedLogState["medium"] })
                }
              >
                {FEED_LOG_MEDIA.map((medium) => (
                  <option key={medium}>{medium}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Amount units
              <select
                className={inputClass}
                value={state.amountUnit}
                onChange={(event) =>
                  patch({ amountUnit: event.target.value as FeedLogState["amountUnit"] }, true)
                }
              >
                {FEED_LOG_AMOUNT_UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Reservoir or water volume
              <input
                className={inputClass}
                inputMode="decimal"
                value={state.waterVol}
                onChange={(event) => patch({ waterVol: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Water unit
              <select
                className={inputClass}
                value={state.waterUnit}
                onChange={(event) =>
                  patch({ waterUnit: event.target.value as FeedLogState["waterUnit"] })
                }
              >
                {FEED_LOG_WATER_UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <fieldset className="text-sm">
              <legend>Nutrient reading</legend>
              {FEED_LOG_READING_TYPES.map((reading) => (
                <label key={reading} className="mr-3 inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="reading-type"
                    checked={state.readingType === reading}
                    onChange={() => patch({ readingType: reading })}
                  />
                  {reading}
                </label>
              ))}
            </fieldset>
            <label className="text-sm">
              Your tolerance (±%)
              <input
                className={inputClass}
                inputMode="decimal"
                aria-describedby="tolerance-help"
                value={state.tolerance}
                onChange={(event) => patch({ tolerance: event.target.value }, true)}
              />
              <span id="tolerance-help" className="mt-1 block text-xs text-emerald-900/70">
                Your tolerance, not a recommendation. Default ±10%.
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {state.products.map((name, index) => (
              <label key={index} className="text-sm">
                Product {index + 1} name
                <input
                  className={inputClass}
                  value={name}
                  placeholder="e.g., your base nutrient"
                  onChange={(event) => {
                    const products = state.products.map((product, productIndex) =>
                      productIndex === index ? event.target.value : product,
                    );
                    patch({ products });
                  }}
                />
              </label>
            ))}
            <button
              type="button"
              className="self-end rounded-md border px-3 py-2 text-sm"
              disabled={state.products.length >= FEED_LOG_MAX_PRODUCTS}
              onClick={() => setState((current) => addFeedLogProduct(current))}
            >
              Add product
            </button>
            <button
              type="button"
              className="self-end rounded-md border px-3 py-2 text-sm"
              disabled={state.products.length <= FEED_LOG_MIN_PRODUCTS}
              onClick={() => setState((current) => removeFeedLogProduct(current))}
            >
              Remove product
            </button>
          </div>

          <div className="mt-4 overflow-x-auto" data-testid="feed-log-table-scroll">
            <table className="min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-emerald-900 text-white">
                  <th scope="col">Week #</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Date</th>
                  {state.products.map((name, index) => (
                    <th key={name + index} scope="col" colSpan={4}>
                      {name.trim() || `Product ${index + 1}`} ({state.amountUnit})
                    </th>
                  ))}
                  <th scope="col">pH in</th>
                  <th scope="col">{state.readingType} in</th>
                  <th scope="col">Runoff pH</th>
                  <th scope="col">Runoff {state.readingType}</th>
                  <th scope="col">Avg temp (°F)</th>
                  <th scope="col">Avg RH (%)</th>
                  <th scope="col">VPD (kPa)</th>
                  <th scope="col">Plant response</th>
                  <th scope="col">Notes</th>
                </tr>
                <tr className="bg-emerald-800 text-xs text-white">
                  <th scope="col" />
                  <th scope="col" />
                  <th scope="col" />
                  {state.products.map((_, index) => (
                    <Fragment key={`heads-${index}`}>
                      <th scope="col">Planned</th>
                      <th scope="col">Actual</th>
                      <th scope="col">Δ</th>
                      <th scope="col">% of plan</th>
                    </Fragment>
                  ))}
                  <th scope="col" colSpan={8} />
                </tr>
              </thead>
              <tbody>
                {state.weeks.map((week, weekIndex) => (
                  <tr key={weekIndex} className="border-b border-emerald-900/10 bg-white align-top">
                    <th scope="row">{weekIndex + 1}</th>
                    <td>
                      <select
                        aria-label={`Week ${weekIndex + 1} stage`}
                        value={week.stage}
                        onChange={(event) =>
                          updateWeek(weekIndex, {
                            stage: event.target.value as FeedLogState["weeks"][number]["stage"],
                          })
                        }
                      >
                        {FEED_LOG_STAGES.map((stage) => (
                          <option key={stage}>{stage}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} date`}
                        type="date"
                        value={week.date}
                        onChange={(event) => updateWeek(weekIndex, { date: event.target.value })}
                      />
                    </td>
                    {state.products.map((_, productIndex) => {
                      const cell = week.products[productIndex] ?? { planned: "", actual: "" };
                      const result = evaluateProductCell(
                        cell.planned,
                        cell.actual,
                        state.tolerance,
                      );
                      const flagged = result.flag !== null;
                      return (
                        <Fragment key={`cells-${weekIndex}-${productIndex}`}>
                          <td>
                            <input
                              aria-label={`Week ${weekIndex + 1} product ${productIndex + 1} planned`}
                              className="w-16"
                              inputMode="decimal"
                              placeholder="Chart"
                              value={blankPrint ? "" : cell.planned}
                              onChange={(event) =>
                                updateCell(weekIndex, productIndex, "planned", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Week ${weekIndex + 1} product ${productIndex + 1} actual`}
                              className="w-16"
                              inputMode="decimal"
                              value={blankPrint ? "" : cell.actual}
                              onChange={(event) =>
                                updateCell(weekIndex, productIndex, "actual", event.target.value)
                              }
                            />
                          </td>
                          <td>{blankPrint ? "" : result.diffFormatted}</td>
                          <td
                            data-flag={result.flag ?? ""}
                            className={flagged ? "bg-amber-100" : undefined}
                          >
                            {blankPrint || result.pctFormatted === ""
                              ? ""
                              : `${result.pctFormatted}%`}
                            {result.flag ? (
                              <span className="ml-1 text-xs">{result.flag}</span>
                            ) : null}
                          </td>
                        </Fragment>
                      );
                    })}
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} pH in`}
                        className="w-16"
                        value={week.feedPh}
                        onChange={(event) => updateWeek(weekIndex, { feedPh: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} feed reading`}
                        className="w-16"
                        value={week.feedEcPpm}
                        onChange={(event) =>
                          updateWeek(weekIndex, { feedEcPpm: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} runoff pH`}
                        className="w-16"
                        value={week.runoffPh}
                        onChange={(event) =>
                          updateWeek(weekIndex, { runoffPh: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} runoff reading`}
                        className="w-16"
                        value={week.runoffEcPpm}
                        onChange={(event) =>
                          updateWeek(weekIndex, { runoffEcPpm: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} average temperature Fahrenheit`}
                        className="w-16"
                        value={week.avgTempF}
                        onChange={(event) =>
                          updateWeek(weekIndex, { avgTempF: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} average relative humidity`}
                        className="w-16"
                        value={week.avgRh}
                        onChange={(event) => updateWeek(weekIndex, { avgRh: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} VPD`}
                        className="w-16"
                        value={week.vpd}
                        onChange={(event) => updateWeek(weekIndex, { vpd: event.target.value })}
                      />
                      <Link to="/tools/vpd-calculator" className="block text-xs underline">
                        calculate VPD
                      </Link>
                    </td>
                    <td>
                      <select
                        aria-label={`Week ${weekIndex + 1} plant response`}
                        value={week.response}
                        onChange={(event) =>
                          updateWeek(weekIndex, {
                            response: event.target
                              .value as FeedLogState["weeks"][number]["response"],
                          })
                        }
                      >
                        {FEED_LOG_RESPONSES.map((response) => (
                          <option key={response}>{response}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} notes`}
                        value={week.notes}
                        onChange={(event) => updateWeek(weekIndex, { notes: event.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs">
            Copy planned amounts from the official chart for your product line and medium.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-emerald-800 px-3 py-2 text-sm text-white"
              disabled={state.weeks.length >= FEED_LOG_MAX_WEEKS}
              onClick={() => {
                setState((current) => {
                  const next = addFeedLogWeek(current);
                  trackFeedLogEvent("feed_log_row_added", { row_count: next.weeks.length });
                  return next;
                });
              }}
            >
              Add week
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm"
              disabled={state.weeks.length <= FEED_LOG_MIN_WEEKS}
              onClick={() => {
                setState((current) => {
                  const next = removeFeedLogWeek(current);
                  trackFeedLogEvent("feed_log_row_removed", { row_count: next.weeks.length });
                  return next;
                });
              }}
            >
              Remove week
            </button>
            <button
              type="button"
              className="rounded-md bg-emerald-800 px-3 py-2 text-sm text-white"
              onClick={downloadCsv}
            >
              Download CSV
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => void copyLog()}
            >
              Copy log
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => printLog(false)}
            >
              Print / Save as PDF
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => printLog(true)}
            >
              Print blank template
            </button>
            <button
              type="button"
              className="rounded-md border border-red-700 px-3 py-2 text-sm text-red-800"
              onClick={() => setConfirmClear(true)}
            >
              Clear log
            </button>
          </div>

          {confirmClear ? (
            <div
              role="region"
              aria-label="Confirm clear log"
              className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm"
            >
              <p>Clear the numbers on this page? This page does not store them.</p>
              <button
                type="button"
                className="mr-2 mt-2 rounded-md bg-red-800 px-3 py-1 text-white"
                onClick={() => {
                  setState(createDefaultFeedLogState());
                  setConfirmClear(false);
                  announce("Cleared. Nothing was stored.");
                }}
              >
                Yes, clear everything
              </button>
              <button
                type="button"
                className="mt-2 rounded-md border px-3 py-1"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
            </div>
          ) : null}

          <div aria-live="polite" role="status" className="mt-3 text-sm">
            {status}
          </div>

          <section
            aria-label="Log summary"
            className="mt-4 rounded-xl bg-white p-4"
            data-testid="feed-log-summary"
          >
            <h3 className="font-semibold">Summary</h3>
            <p>Weeks with an actual amount: {summary.weeksFilled}</p>
            <p>Weeks outside your tolerance: {summary.weeksFlagged}</p>
            <ul className="mt-2 grid gap-2 md:grid-cols-3">
              {summary.products.map((product) => {
                const difference = product.totalActual - product.totalPlanned;
                const formatted =
                  difference > 0
                    ? `+${difference.toFixed(2)}`
                    : difference < 0
                      ? `\u2212${Math.abs(difference).toFixed(2)}`
                      : "0.00";
                return (
                  <li key={product.name} className="rounded-md border p-2 text-sm">
                    <p className="font-semibold">{product.name}</p>
                    <p>
                      Total planned: {product.totalPlanned.toFixed(2)} {state.amountUnit}
                    </p>
                    <p>
                      Total actual: {product.totalActual.toFixed(2)} {state.amountUnit}
                    </p>
                    <p>
                      Total difference: {formatted} {state.amountUnit}
                    </p>
                    <p>Weeks flagged: {product.weeksFlagged}</p>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-emerald-900 p-4 text-white md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Ready to keep a continuous timeline?</p>
              <p className="text-sm">
                Log every feeding, reading and photo in one place, across every grow.
              </p>
            </div>
            <Link
              to={PUBLIC_FEED_LOG_SIGNUP_PATH}
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-emerald-950"
              data-cta-location="tool"
              onClick={() => onCta("tool")}
            >
              Keep this log in Verdant&apos;s Quick Log
            </Link>
          </div>
        </section>

        <article className="mt-10 max-w-3xl space-y-8 leading-7">
          <section aria-labelledby="where-official-chart">
            <h2 id="where-official-chart" className="text-2xl font-semibold">
              Where to get the official Advanced Nutrients feeding chart
            </h2>
            <p>
              Before filling in your log, grab the reference sheet that matches the bottles on your
              shelf. An advanced nutrients feeding schedule differs by product line—for example pH
              Perfect, Sensi, Connoisseur, or Grow Micro Bloom—and also varies by growing medium
              (soil, coco, or hydro). Pick the chart built for your line and substrate.
            </p>
            <p>
              You can view and download the current charts from the{" "}
              <a
                className="underline"
                href="https://www.advancednutrients.com/feeding/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Advanced Nutrients feeding charts page
              </a>{" "}
              or build a custom schedule with the{" "}
              <a
                className="underline"
                href="https://www.advancednutrients.com/nutrient-calculator/"
                target="_blank"
                rel="noopener noreferrer"
              >
                advanced nutrients calculator
              </a>
              . Advanced Nutrients also offers the{" "}
              <a
                className="underline"
                href="https://budlabsapp.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                BudLabs
              </a>{" "}
              app, a nutrient calculator for Advanced Nutrients products plus crops, tasks, daily
              notes and photos.
            </p>
          </section>
          <section aria-labelledby="why-log-heading">
            <h2 id="why-log-heading" className="text-2xl font-semibold">
              Why log planned vs actual
            </h2>
            <p>
              Every manufacturer feeding chart is a starting plan rather than a rigid rulebook. Your
              water, medium, cultivar, and tent differ from the rooms where a chart was written.
            </p>
            <p>
              When you record both the chart&apos;s planned value and the actual amount you mixed,
              the log shows where you deviated and what happened next, next to pH, EC or PPM, and
              plant response.
            </p>
          </section>
          <section aria-labelledby="how-to-fill-heading">
            <h2 id="how-to-fill-heading" className="text-2xl font-semibold">
              How to fill in your feed log, week by week
            </h2>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Copy your planned values from the official chart or calculator into Planned.</li>
              <li>
                Enter what you actually fed so the table can show the difference and percent of
                plan.
              </li>
              <li>Record pH and EC or PPM going in, plus runoff if you measure it.</li>
              <li>
                Enter average temperature in °F and relative humidity, and check the{" "}
                <Link to="/tools/vpd-calculator" className="underline">
                  VPD calculator
                </Link>{" "}
                for the same week.
              </li>
              <li>
                Select a neutral observation label and add notes on leaf color, posture, or water
                uptake.
              </li>
              <li>
                Download CSV or copy the log before you close the tab if you want the numbers on
                your device. This page does not keep them.
              </li>
            </ol>
          </section>
          <section aria-labelledby="reading-log-heading">
            <h2 id="reading-log-heading" className="text-2xl font-semibold">
              Reading your log: spotting patterns
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Weeks flagged outside your tolerance: compare those rows with the notes from the
                following week.
              </li>
              <li>
                Runoff readings changing over time: compare input pH and EC/PPM with runoff across
                consecutive weeks.
              </li>
              <li>
                Notes that repeat: look for the same plant-response label or °F / RH swings next to
                feeding changes.
              </li>
            </ul>
          </section>
          <section aria-labelledby="autoflowers-media-heading">
            <h2 id="autoflowers-media-heading" className="text-2xl font-semibold">
              Feeding autoflowers and soil vs coco vs hydro
            </h2>
            <p>
              Advanced Nutrients publishes guidance for different media and plant types. Check the{" "}
              <a
                className="underline"
                href="https://www.advancednutrients.com/feeding/"
                target="_blank"
                rel="noopener noreferrer"
              >
                official feeding charts
              </a>{" "}
              and{" "}
              <a
                className="underline"
                href="https://www.advancednutrients.com/nutrient-calculator/"
                target="_blank"
                rel="noopener noreferrer"
              >
                nutrient calculator
              </a>{" "}
              when switching among soil, coco, and hydro, or when looking up an autoflower schedule.
            </p>
            <p>
              For autoflowers, use Date and Notes to record days from sprout next to the stage
              selector.
            </p>
          </section>
          <section aria-labelledby="keep-log-verdant-heading">
            <h2 id="keep-log-verdant-heading" className="text-2xl font-semibold">
              Keep your feeding log in Verdant
            </h2>
            <p>
              Continue the weekly record in the app, next to environment snapshots and the plant
              timeline.
            </p>
            <Link
              to={PUBLIC_FEED_LOG_SIGNUP_PATH}
              className="mt-3 inline-block underline"
              data-cta-location="article"
              onClick={() => onCta("article")}
            >
              Keep this log in Verdant&apos;s Quick Log
            </Link>
          </section>
          <section aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="text-2xl font-semibold">
              FAQ
            </h2>
            {FEED_LOG_FAQ.map((item) => (
              <details key={item.question} className="mt-3 rounded-md border bg-white p-3">
                <summary>{item.question}</summary>
                <p className="mt-2">{item.answer}</p>
              </details>
            ))}
          </section>
        </article>
      </main>

      <footer className="border-t border-emerald-900/10 bg-emerald-950 px-4 py-8 text-emerald-50">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-lg font-semibold">Sources</h2>
          <ul className="mt-2 space-y-1 text-sm underline">
            <li>
              <a href="https://www.advancednutrients.com/feeding/">
                https://www.advancednutrients.com/feeding/
              </a>
            </li>
            <li>
              <a href="https://www.advancednutrients.com/nutrient-calculator/">
                https://www.advancednutrients.com/nutrient-calculator/
              </a>
            </li>
            <li>
              <a href="https://www.advancednutrients.com/articles/feeding-tips/3/">
                https://www.advancednutrients.com/articles/feeding-tips/3/
              </a>
            </li>
            <li>
              <a href="https://budlabsapp.com/">https://budlabsapp.com/</a>
            </li>
          </ul>
          <Link
            to={PUBLIC_FEED_LOG_SIGNUP_PATH}
            className="mt-4 inline-block underline"
            data-cta-location="footer"
            onClick={() => onCta("footer")}
          >
            Continue this log across grows in Verdant
          </Link>
          <p className="mt-4 text-sm">
            Advanced Nutrients, pH Perfect, Sensi, Connoisseur and BudLabs are trademarks of their
            respective owners. Verdant Grow Diary is not affiliated with, sponsored by, or endorsed
            by Advanced Nutrients. Always follow the official feeding chart and product labels.
          </p>
          <nav aria-label="Footer internal links" className="mt-4 flex gap-4 text-sm underline">
            <Link to="/guides">All grow guides</Link>
            <Link to="/tools/vpd-calculator">VPD calculator</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
