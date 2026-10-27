import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/react-router-compat";

import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { trackFeedLogEvent, type FeedLogCtaLocation } from "@/lib/cronkFeedLogAnalytics";
import {
  addFeedLogProduct,
  addFeedLogWeek,
  buildFeedLogCsv,
  buildFeedLogTsv,
  CRONK_CALCULATOR_URL,
  CRONK_CHARTS_HUB_URL,
  CRONK_FEED_LOG_CTA_HREF,
  CRONK_FEED_LOG_CTA_LABEL,
  CRONK_FEED_LOG_DESCRIPTION,
  CRONK_FEED_LOG_DISCLAIMER,
  CRONK_FEED_LOG_FAQ,
  CRONK_FEED_LOG_H1,
  CRONK_FEED_LOG_PATH,
  CRONK_FEED_LOG_TITLE,
  CRONK_LINES,
  CRONK_RELATED_FEED_LOGS,
  CRONK_RETAILERS_URL,
  CRONK_STORE_URL,
  CRONK_VPD_CALCULATOR_PATH,
  CRONK_VPD_TRACKER_PATH,
  createDefaultFeedLogState,
  cronkLineLabel,
  cronkPlannedHelper,
  cronkScheduleUrl,
  evaluateProductCell,
  FEED_LOG_AMOUNT_UNITS,
  FEED_LOG_MEDIA,
  FEED_LOG_READING_TYPES,
  FEED_LOG_RESPONSES,
  FEED_LOG_STAGES,
  FEED_LOG_WATER_UNITS,
  feedLogCsvFilename,
  removeFeedLogProduct,
  removeFeedLogWeek,
  summarizeFeedLog,
  type CronkLine,
  type FeedLogState,
} from "@/lib/cronkFeedLogRules";

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

const inputClass =
  "mt-1 w-full max-w-full rounded-md border border-emerald-900/20 bg-white px-2 py-1.5 text-sm text-emerald-950";
const radioClass = "inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md px-2 text-sm";

export default function CronkFeedLog() {
  const [state, setState] = useState<FeedLogState>(() => createDefaultFeedLogState());
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [blankPrint, setBlankPrint] = useState(false);
  const [calcTick, setCalcTick] = useState(0);
  const [copyFallback, setCopyFallback] = useState("");
  const layout = useViewportLayout();
  const summary = useMemo(
    () => summarizeFeedLog(blankPrint ? createDefaultFeedLogState() : state),
    [blankPrint, state],
  );
  const display = blankPrint ? createDefaultFeedLogState() : state;

  usePageSeo({
    title: `${CRONK_FEED_LOG_TITLE} | Verdant Grow Diary`,
    description: CRONK_FEED_LOG_DESCRIPTION,
    path: CRONK_FEED_LOG_PATH,
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

  function updateWeek(index: number, partial: Partial<FeedLogState["weeks"][number]>) {
    setState((current) => ({
      ...current,
      weeks: current.weeks.map((week, weekIndex) =>
        weekIndex === index ? { ...week, ...partial } : week,
      ),
    }));
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
    try {
      const csv = buildFeedLogCsv(state);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = feedLogCsvFilename(new Date());
      document.body.appendChild(link);
      link.click();
      link.remove();
      const objectUrl = url;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      trackFeedLogEvent("feed_log_csv_exported", { row_count: state.weeks.length });
      announce("CSV downloaded. Nothing is saved in your browser.");
    } catch {
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function copyLog() {
    const text = buildFeedLogTsv(state);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFallback("");
      trackFeedLogEvent("feed_log_copied", { row_count: state.weeks.length });
      announce("Copied. Paste it into a spreadsheet. Nothing is saved in your browser.");
    } catch {
      setCopyFallback(text);
      announce("Copy is unavailable in this browser. Select the log below.");
    }
  }

  function printLog(blank: boolean) {
    setBlankPrint(blank);
    trackFeedLogEvent("feed_log_printed", {});
    window.setTimeout(() => {
      window.print();
      setBlankPrint(false);
    }, 30);
  }

  function onCta(location: FeedLogCtaLocation) {
    trackFeedLogEvent("feed_log_cta_click", { cta_location: location });
  }

  function setLine(line: CronkLine) {
    if (line === state.line) return;
    patch({ line });
    trackFeedLogEvent("feed_log_line_changed", { line });
  }

  const cta = (location: FeedLogCtaLocation) => (
    <Link
      className="inline-flex min-h-11 items-center rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
      to={CRONK_FEED_LOG_CTA_HREF}
      data-cta-location={location}
      onClick={() => onCta(location)}
    >
      {CRONK_FEED_LOG_CTA_LABEL}
    </Link>
  );

  return (
    <div
      data-testid="cronk-feed-log-page"
      data-layout={layout}
      className="min-h-screen overflow-x-hidden bg-[#f4f7f2] text-emerald-950"
    >
      <header className="border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link to="/welcome" aria-label="Verdant Grow Diary home">
            <BrandLogo />
          </Link>
          <nav aria-label="Breadcrumb" className="text-sm">
            <Link className="underline" to="/welcome">
              Home
            </Link>
            {" / "}
            <Link to="/guides" className="underline">
              Grower Guides
            </Link>
            {" / "}
            Cronk Nutrients Grow Diary
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
          {CRONK_FEED_LOG_H1}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7">
          Cronk Nutrients is the first brand Verdant covers in depth because growers use it
          consistently in real grows. Here&apos;s how to log your feeds against its chart.
        </p>
        <p className="mt-3 text-sm leading-6" role="note">
          {CRONK_FEED_LOG_DISCLAIMER}
        </p>

        <section
          className="mt-6 rounded-xl bg-white p-4 shadow-sm"
          aria-labelledby="h2-quick-answer"
        >
          <h2 id="h2-quick-answer" className="text-lg font-semibold">
            Quick answer
          </h2>
          <p className="mt-2 leading-7">
            Cronk&apos;s official{" "}
            <a
              className="underline"
              href={CRONK_CHARTS_HUB_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              feeding charts
            </a>{" "}
            for its Classic, Bonnie &amp; Clyde and PuurOrganics lines are free PDFs on its Growers
            Hub, and Cronk also has a{" "}
            <a
              className="underline"
              href={CRONK_CALCULATOR_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              nutrient calculator
            </a>
            . Use your chart as the plan, then log what you actually fed, your EC or PPM and pH
            going in and in the runoff, and how your plants responded.
          </p>
        </section>

        <section
          className="mt-8"
          aria-labelledby="h2-feed-log-tool"
          data-testid="cronk-feed-log-tool"
        >
          <h2 id="h2-feed-log-tool" className="text-lg font-semibold">
            Planned vs Actual Feed Log
          </h2>
          <p className="mt-2 text-sm" role="note">
            Nothing is saved in your browser. Download CSV or copy your log before leaving this
            page.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-sm">
              Grow name (optional)
              <input
                className={inputClass}
                value={display.growName}
                autoComplete="off"
                onChange={(event) => patch({ growName: event.target.value })}
              />
            </label>
            <fieldset>
              <legend className="text-sm">Cronk line</legend>
              {CRONK_LINES.map((line) => (
                <label key={line} className={radioClass}>
                  <input
                    type="radio"
                    name="cronk-line"
                    checked={state.line === line}
                    onChange={() => setLine(line)}
                  />
                  {cronkLineLabel(line)}
                </label>
              ))}
            </fieldset>
            <label className="text-sm">
              Medium
              <select
                className={inputClass}
                value={display.medium}
                onChange={(event) =>
                  patch({ medium: event.target.value as FeedLogState["medium"] })
                }
              >
                {FEED_LOG_MEDIA.map((medium) => (
                  <option key={medium}>{medium}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs leading-5">
                Cronk lists pH targets by medium, and PuurOrganics has a separate chart for each
                medium. Use the one that matches yours.
              </span>
            </label>
            <label className="text-sm">
              Amount unit (all product columns)
              <select
                className={inputClass}
                value={display.amountUnit}
                onChange={(event) =>
                  patch({ amountUnit: event.target.value as FeedLogState["amountUnit"] })
                }
              >
                {FEED_LOG_AMOUNT_UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Water volume per feed
              <span className="mt-1 flex gap-2">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={display.waterVol}
                  onChange={(event) => patch({ waterVol: event.target.value })}
                />
                <select
                  aria-label="Water volume unit"
                  className={inputClass}
                  value={display.waterUnit}
                  onChange={(event) =>
                    patch({ waterUnit: event.target.value as FeedLogState["waterUnit"] })
                  }
                >
                  {FEED_LOG_WATER_UNITS.map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </span>
            </label>
            <fieldset>
              <legend className="text-sm">Nutrient reading type</legend>
              {FEED_LOG_READING_TYPES.map((reading) => (
                <label key={reading} className={radioClass}>
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
              Your tolerance (flag when actual differs from planned by more than this)
              <input
                className={inputClass}
                type="number"
                min="1"
                max="100"
                aria-label="Tolerance percent"
                value={display.tolerance}
                onChange={(event) => patch({ tolerance: event.target.value }, true)}
              />
            </label>
          </div>

          <div className="mt-4">
            <p className="text-sm font-semibold">Products tracked in your log</p>
            <p className="text-xs">
              Rename generic columns to match the items on your Cronk Nutrients feeding chart.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-11 rounded-md border px-3 text-sm"
                onClick={() => {
                  const next = addFeedLogProduct(state);
                  setState(next);
                  trackFeedLogEvent("feed_log_row_added", { row_count: next.products.length });
                }}
              >
                + Add product
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border px-3 text-sm"
                onClick={() => {
                  const next = removeFeedLogProduct(state);
                  setState(next);
                  trackFeedLogEvent("feed_log_row_removed", { row_count: next.products.length });
                }}
              >
                − Remove product
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {display.products.map((name, index) => (
                <input
                  key={index}
                  aria-label={`Product ${index + 1} name`}
                  className={inputClass}
                  placeholder="e.g., a base or additive from your chart"
                  value={name}
                  onChange={(event) => {
                    const products = display.products.map((product, productIndex) =>
                      productIndex === index ? event.target.value : product,
                    );
                    patch({ products });
                  }}
                />
              ))}
            </div>
          </div>

          <p className="mt-4 text-sm" data-testid="planned-helper">
            <a
              className="font-semibold underline"
              href={cronkScheduleUrl(state.line)}
              rel="noopener noreferrer"
              target="_blank"
            >
              {cronkPlannedHelper(state.line)}
            </a>
            {" · "}
            <a
              className="underline"
              href={CRONK_CHARTS_HUB_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              All Cronk feeding charts
            </a>
          </p>
          <p className="mt-1 text-sm">
            Environment tools:{" "}
            <Link className="underline" to={CRONK_VPD_TRACKER_PATH}>
              VPD chart by growth stage
            </Link>
            {" · "}
            <Link className="underline" to={CRONK_VPD_CALCULATOR_PATH}>
              VPD calculator
            </Link>
          </p>

          {layout === "desktop" ? (
            <div
              className="mt-4 max-w-full overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Weekly feed log table"
              data-testid="cronk-feed-log-table-scroll"
            >
              <table className="min-w-[64rem] text-left text-sm">
                <caption className="mb-2 text-left">
                  Weekly Planned vs Actual Feed Log (all Planned fields start empty; temperatures in
                  °F)
                </caption>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Stage</th>
                    {display.products.map((name, index) => (
                      <th key={index} colSpan={4}>
                        {name || `Product ${index + 1}`}
                      </th>
                    ))}
                    <th>Feed pH</th>
                    <th>Feed {display.readingType}</th>
                    <th>Runoff pH</th>
                    <th>Runoff {display.readingType}</th>
                    <th>Avg temp (°F)</th>
                    <th>Avg RH (%)</th>
                    <th>
                      VPD (kPa){" "}
                      <Link className="underline" to={CRONK_VPD_CALCULATOR_PATH}>
                        Calculate VPD
                      </Link>
                    </th>
                    <th>Response</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {display.weeks.map((week, weekIndex) => (
                    <tr key={weekIndex}>
                      <th scope="row">{weekIndex + 1}</th>
                      <td>
                        <select
                          aria-label={`Week ${weekIndex + 1} stage`}
                          className={inputClass}
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
                      {week.products.map((cell, productIndex) => {
                        const result = evaluateProductCell(
                          cell.planned,
                          cell.actual,
                          display.tolerance,
                        );
                        const productName =
                          display.products[productIndex] || `Product ${productIndex + 1}`;
                        return (
                          <td key={productIndex} colSpan={4}>
                            <div className="grid grid-cols-2 gap-1">
                              <input
                                aria-label={`Week ${weekIndex + 1}, ${productName}, planned`}
                                className={inputClass}
                                inputMode="decimal"
                                value={cell.planned}
                                onChange={(event) =>
                                  updateCell(weekIndex, productIndex, "planned", event.target.value)
                                }
                              />
                              <input
                                aria-label={`Week ${weekIndex + 1}, ${productName}, actual`}
                                className={inputClass}
                                inputMode="decimal"
                                value={cell.actual}
                                onChange={(event) =>
                                  updateCell(weekIndex, productIndex, "actual", event.target.value)
                                }
                              />
                              <span>{result.diffFormatted || "—"}</span>
                              <span>
                                {result.pctFormatted ? `${result.pctFormatted}%` : ""}
                                {result.flag ? ` ⚠ ${result.flag}` : ""}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                      <td>
                        <input
                          aria-label={`Week ${weekIndex + 1} feed pH`}
                          className={inputClass}
                          value={week.feedPh}
                          onChange={(event) =>
                            updateWeek(weekIndex, { feedPh: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Week ${weekIndex + 1} feed reading`}
                          className={inputClass}
                          value={week.feedEcPpm}
                          onChange={(event) =>
                            updateWeek(weekIndex, { feedEcPpm: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Week ${weekIndex + 1} runoff pH`}
                          className={inputClass}
                          value={week.runoffPh}
                          onChange={(event) =>
                            updateWeek(weekIndex, { runoffPh: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Week ${weekIndex + 1} runoff reading`}
                          className={inputClass}
                          value={week.runoffEcPpm}
                          onChange={(event) =>
                            updateWeek(weekIndex, { runoffEcPpm: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Week ${weekIndex + 1} temperature °F`}
                          className={inputClass}
                          value={week.avgTempF}
                          onChange={(event) =>
                            updateWeek(weekIndex, { avgTempF: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Week ${weekIndex + 1} relative humidity`}
                          className={inputClass}
                          value={week.avgRh}
                          onChange={(event) => updateWeek(weekIndex, { avgRh: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Week ${weekIndex + 1} VPD`}
                          className={inputClass}
                          value={week.vpd}
                          onChange={(event) => updateWeek(weekIndex, { vpd: event.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Week ${weekIndex + 1} response`}
                          className={inputClass}
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
                          className={inputClass}
                          value={week.notes}
                          onChange={(event) => updateWeek(weekIndex, { notes: event.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 space-y-4" data-testid="cronk-feed-log-phone-cards">
              {display.weeks.map((week, weekIndex) => (
                <article
                  key={weekIndex}
                  className="rounded-lg border border-emerald-900/10 bg-white p-3"
                >
                  <h3 className="text-sm font-semibold">Week {weekIndex + 1}</h3>
                  <label className="mt-2 block text-sm">
                    Stage
                    <select
                      aria-label={`Week ${weekIndex + 1} stage`}
                      className={inputClass}
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
                  </label>
                  {week.products.map((cell, productIndex) => {
                    const result = evaluateProductCell(
                      cell.planned,
                      cell.actual,
                      display.tolerance,
                    );
                    const productName =
                      display.products[productIndex] || `Product ${productIndex + 1}`;
                    return (
                      <div key={productIndex} className="mt-2 grid grid-cols-1 gap-2">
                        <label className="text-sm">
                          {productName} planned
                          <input
                            aria-label={`Week ${weekIndex + 1}, ${productName}, planned`}
                            className={inputClass}
                            inputMode="decimal"
                            value={cell.planned}
                            onChange={(event) =>
                              updateCell(weekIndex, productIndex, "planned", event.target.value)
                            }
                          />
                        </label>
                        <label className="text-sm">
                          {productName} actual
                          <input
                            aria-label={`Week ${weekIndex + 1}, ${productName}, actual`}
                            className={inputClass}
                            inputMode="decimal"
                            value={cell.actual}
                            onChange={(event) =>
                              updateCell(weekIndex, productIndex, "actual", event.target.value)
                            }
                          />
                        </label>
                        <p className="text-sm">
                          Difference {result.diffFormatted || "—"}
                          {result.pctFormatted ? ` · ${result.pctFormatted}%` : ""}
                          {result.flag ? ` · ⚠ ${result.flag}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </article>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm"
              onClick={() => {
                const next = addFeedLogWeek(state);
                setState(next);
                trackFeedLogEvent("feed_log_row_added", { row_count: next.weeks.length });
              }}
            >
              + Add week
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm"
              onClick={() => {
                const next = removeFeedLogWeek(state);
                setState(next);
                trackFeedLogEvent("feed_log_row_removed", { row_count: next.weeks.length });
              }}
            >
              − Remove week
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md bg-emerald-900 px-3 text-sm text-white"
              onClick={downloadCsv}
            >
              Download CSV
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm"
              onClick={() => void copyLog()}
            >
              Copy log
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm"
              onClick={() => printLog(false)}
            >
              Print / Save as PDF
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm"
              onClick={() => printLog(true)}
            >
              Print blank template
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border border-red-700 px-3 text-sm text-red-800"
              onClick={() => setConfirmClear(true)}
            >
              Clear log
            </button>
          </div>
          <div className="sr-only" role="status" aria-live="polite">
            {status}
          </div>
          {confirmClear ? (
            <div role="alertdialog" aria-label="Clear log" className="mt-3 rounded-md border p-3">
              <p>
                Are you sure you want to clear all entered log values and reset the table to
                defaults?
              </p>
              <button
                type="button"
                className="mr-2 min-h-11"
                onClick={() => {
                  setState(createDefaultFeedLogState());
                  setConfirmClear(false);
                  announce("Log cleared. Nothing is saved in your browser.");
                }}
              >
                Yes, clear log
              </button>
              <button type="button" className="min-h-11" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </div>
          ) : null}
          {copyFallback ? (
            <label className="mt-3 block text-sm">
              Clipboard access was unavailable. Select and copy your tab-separated log below:
              <textarea className={`${inputClass} min-h-24`} readOnly value={copyFallback} />
            </label>
          ) : null}
          <div className="mt-4" aria-live="polite">
            <h3 className="font-semibold">Log Summary</h3>
            <p>
              Weeks filled: {summary.weeksFilled} / {display.weeks.length}. Weeks flagged:{" "}
              {summary.weeksFlagged}.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4">
            <div>
              <p className="font-semibold">Continue your Cronk Nutrients grow diary in Verdant</p>
              <p className="text-sm">
                Log every feeding, reading and photo in one place, across every grow.
              </p>
            </div>
            {cta("tool")}
          </div>
        </section>

        <section className="mt-8" aria-labelledby="h2-which-chart">
          <h2 id="h2-which-chart" className="text-lg font-semibold">
            Which Cronk Nutrients feeding chart? Classic vs Bonnie &amp; Clyde vs PuurOrganics
          </h2>
          <p className="mt-2 leading-7">
            Pick the official cronk nutrients feeding chart (also searched as the cronk nutrients
            feed chart or cronk nutrients feeding schedule) that matches your product line and
            medium on Cronk&apos;s Growers Hub.
          </p>
          <div className="mt-3 overflow-x-hidden">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Comparison of Cronk Nutrients lines and official feeding charts
              </caption>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>What Cronk says it is</th>
                  <th>Which chart to use</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Classic</th>
                  <td>
                    Classic is a 3-part line (Micro, Grow, Bloom); the Big Bud Kit is Cronk&apos;s
                    5-part Classic-line kit.
                  </td>
                  <td>Use the Classic chart.</td>
                </tr>
                <tr>
                  <th scope="row">Bonnie &amp; Clyde</th>
                  <td>Bonnie &amp; Clyde is Cronk&apos;s 2-part autoflower line.</td>
                  <td>Use the Bonnie &amp; Clyde (autoflower) chart.</td>
                </tr>
                <tr>
                  <th scope="row">PuurOrganics</th>
                  <td>
                    PuurOrganics is Cronk&apos;s OMRI-certified organic line, with separate charts
                    by medium.
                  </td>
                  <td>
                    Cronk publishes separate charts for Coco &amp; Pro-Mix HP, Bagged Soil, AutoPots
                    and Living Soil, so pick the one for your medium.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8" aria-labelledby="h2-exact-chart">
          <h2 id="h2-exact-chart" className="text-lg font-semibold">
            Start with the exact chart you actually followed
          </h2>
          <p className="mt-2 leading-7">
            In your cronk nutrients grow diary, record the line you ran, the chart version or date,
            your growing medium, the plant stage, and the chart week you were on. If you changed
            anything from the printed schedule, write down what you changed and why so you can
            review that decision later.
          </p>
        </section>
        <section className="mt-8" aria-labelledby="h2-log-actual">
          <h2 id="h2-log-actual" className="text-lg font-semibold">
            Log what went into the feed, not what the chart intended
          </h2>
          <p className="mt-2 leading-7">
            The official chart is the plan; your log should capture the amount you actually mixed,
            your water volume, and your input EC or PPM and pH going into the container. If you
            didn&apos;t measure a field on a given feed, leave it blank rather than guessing.
          </p>
        </section>
        <section className="mt-8" aria-labelledby="h2-pair-context">
          <h2 id="h2-pair-context" className="text-lg font-semibold">
            Pair the input with root-zone and room context
          </h2>
          <p className="mt-2 leading-7">
            Alongside what went into the container, record your runoff EC or PPM and pH if you
            measure them, your watering volume, and your room&apos;s average temperature (°F),
            relative humidity (RH), and VPD using the{" "}
            <Link className="underline" to={CRONK_VPD_TRACKER_PATH}>
              VPD chart by growth stage
            </Link>{" "}
            and the{" "}
            <Link className="underline" to={CRONK_VPD_CALCULATOR_PATH}>
              VPD calculator
            </Link>
            . One runoff number or one photo is not proof of a problem.
          </p>
        </section>
        <section className="mt-8" aria-labelledby="h2-compare-response">
          <h2 id="h2-compare-response" className="text-lg font-semibold">
            Compare chart adherence with your plant&apos;s response
          </h2>
          <p className="mt-2 leading-7">
            When reviewing your log, look at weeks flagged outside your own tolerance setting,
            runoff readings drifting away from your input over consecutive feeds, and plant response
            notes that repeat over several days before you change anything.
          </p>
        </section>
        <section className="mt-8" aria-labelledby="h2-keep-in-verdant">
          <h2 id="h2-keep-in-verdant" className="text-lg font-semibold">
            Keep your Cronk Nutrients log in Verdant
          </h2>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p>Want your weekly feedings saved alongside your plant timeline?</p>
            {cta("article")}
          </div>
        </section>
        <section className="mt-8" aria-labelledby="h2-faq">
          <h2 id="h2-faq" className="text-lg font-semibold">
            Cronk Nutrients FAQ
          </h2>
          {CRONK_FEED_LOG_FAQ.map((entry) => (
            <details key={entry.question} open className="mt-3">
              <summary className="font-medium">{entry.question}</summary>
              <p className="mt-1 leading-7">{faqAnswer(entry.question, entry.answer)}</p>
            </details>
          ))}
        </section>
        <section className="mt-8" aria-labelledby="h2-keep-reading">
          <h2 id="h2-keep-reading" className="text-lg font-semibold">
            Keep reading
          </h2>
          <ul className="mt-2 list-disc pl-5">
            <li>
              <Link className="underline" to="/guides/what-to-log-in-a-grow-journal">
                What to log in a grow journal
              </Link>
            </li>
            <li>
              <Link className="underline" to="/guides/plant-watering-log">
                Plant watering log
              </Link>
            </li>
            <li>
              <Link className="underline" to="/guides/grow-room-vpd-tracker">
                Grow room VPD tracker
              </Link>
            </li>
            <li>
              <Link className="underline" to="/guides/ai-grow-doctor">
                AI grow doctor
              </Link>
            </li>
          </ul>
        </section>
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="text-lg font-semibold">Sources</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {[
            CRONK_CHARTS_HUB_URL,
            CRONK_CALCULATOR_URL,
            cronkScheduleUrl("classic"),
            cronkScheduleUrl("bonnie_clyde"),
            CRONK_RETAILERS_URL,
          ].map((href) => (
            <li key={href}>
              <a
                className="break-all underline"
                href={href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {href}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-6" role="note">
          {CRONK_FEED_LOG_DISCLAIMER}
        </p>
        <p className="mt-4 text-sm">
          <strong>Related logs:</strong>{" "}
          {CRONK_RELATED_FEED_LOGS.map((item, index) => (
            <span key={item.href}>
              {index > 0 ? " · " : null}
              <Link className="underline" to={item.href}>
                {item.label}
              </Link>
            </span>
          ))}
          {" · "}
          <Link className="underline" to="/guides">
            All grow guides
          </Link>
        </p>
        <div className="mt-4">{cta("footer")}</div>
      </footer>
    </div>
  );
}

function faqAnswer(question: string, answer: string) {
  if (question.startsWith("Where can I buy")) {
    return (
      <>
        From Cronk&apos;s own store at{" "}
        <a className="underline" href={CRONK_STORE_URL} rel="noopener noreferrer" target="_blank">
          cronknutrients.com
        </a>
        , which also lists authorized retailers on its{" "}
        <a
          className="underline"
          href={CRONK_RETAILERS_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Authorized Retailers page
        </a>
        .
      </>
    );
  }
  if (question.startsWith("Who owns")) {
    return (
      <>
        We couldn&apos;t find a public ownership statement. Cronk Nutrients lists its address in
        Rosenberg, Texas, and its{" "}
        <a
          className="underline"
          href={CRONK_CHARTS_HUB_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Growers Hub
        </a>{" "}
        says it has been growing since 2019.
      </>
    );
  }
  if (question.startsWith("Where is the official")) {
    return (
      <>
        On Cronk&apos;s{" "}
        <a
          className="underline"
          href={CRONK_CHARTS_HUB_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Growers Hub
        </a>
        , as PDFs for the Classic, Bonnie &amp; Clyde and PuurOrganics lines. Cronk also has a{" "}
        <a
          className="underline"
          href={CRONK_CALCULATOR_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          nutrient calculator
        </a>{" "}
        there.
      </>
    );
  }
  return answer;
}
