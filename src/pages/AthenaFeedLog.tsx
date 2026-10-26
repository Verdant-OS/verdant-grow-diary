import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/react-router-compat";

import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { trackFeedLogEvent, type FeedLogCtaLocation } from "@/lib/athenaFeedLogAnalytics";
import {
  addFeedLogProduct,
  addFeedLogWeek,
  ATHENA_BLENDED_ALL_LANGUAGES_URL,
  ATHENA_BLENDED_SCHEDULE_URL,
  ATHENA_FEED_LOG_CTA_HREF,
  ATHENA_FEED_LOG_DESCRIPTION,
  ATHENA_FEED_LOG_DISCLAIMER,
  ATHENA_FEED_LOG_FAQ,
  ATHENA_FEED_LOG_H1,
  ATHENA_FEED_LOG_PATH,
  ATHENA_FEED_LOG_TITLE,
  ATHENA_LINES,
  ATHENA_MEASURING_METHODS,
  ATHENA_PRO_LINE_PRODUCT_URL,
  ATHENA_PRO_LINE_SCHEDULE_URL,
  ATHENA_RELATED_FEED_LOG_PATH,
  athenaLineLabel,
  athenaPlannedHelper,
  athenaScheduleUrl,
  buildFeedLogCsv,
  buildFeedLogTsv,
  createDefaultFeedLogState,
  evaluateProductCell,
  FEED_LOG_AMOUNT_UNITS,
  FEED_LOG_MAX_PRODUCTS,
  FEED_LOG_MAX_WEEKS,
  FEED_LOG_MEDIA,
  FEED_LOG_MIN_PRODUCTS,
  FEED_LOG_MIN_WEEKS,
  FEED_LOG_READING_TYPES,
  FEED_LOG_RESPONSES,
  FEED_LOG_STAGES,
  FEED_LOG_WATER_UNITS,
  feedLogCsvFilename,
  formatSignedDifference,
  removeFeedLogProduct,
  removeFeedLogWeek,
  summarizeFeedLog,
  type AthenaLine,
  type AthenaMeasuringMethod,
  type FeedLogState,
} from "@/lib/athenaFeedLogRules";

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
  "mt-1 w-full rounded-md border border-emerald-900/20 bg-white px-2 py-1.5 text-sm text-emerald-950";

const radioClass = "inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md px-2 text-sm";

export default function AthenaFeedLog() {
  const [state, setState] = useState<FeedLogState>(() => createDefaultFeedLogState());
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [blankPrint, setBlankPrint] = useState(false);
  const [calcTick, setCalcTick] = useState(0);
  const layout = useViewportLayout();
  const summary = useMemo(
    () => summarizeFeedLog(blankPrint ? createDefaultFeedLogState() : state),
    [blankPrint, state],
  );
  const display = blankPrint ? createDefaultFeedLogState() : state;

  usePageSeo({
    title: `${ATHENA_FEED_LOG_TITLE} | Verdant Grow Diary`,
    description: ATHENA_FEED_LOG_DESCRIPTION,
    path: ATHENA_FEED_LOG_PATH,
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
    const csv = buildFeedLogCsv(state);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = feedLogCsvFilename(new Date());
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();
    URL.revokeObjectURL(url);
    trackFeedLogEvent("feed_log_csv_exported", { row_count: state.weeks.length });
    announce("CSV downloaded. Nothing is saved in your browser.");
  }

  async function copyLog() {
    const text = buildFeedLogTsv(state);
    try {
      await navigator.clipboard.writeText(text);
      trackFeedLogEvent("feed_log_copied", { row_count: state.weeks.length });
      announce("Copied. Paste it into a spreadsheet. Nothing is saved in your browser.");
    } catch {
      announce("Copy is unavailable in this browser.");
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

  function setLine(line: AthenaLine) {
    if (line === state.line) return;
    patch({ line });
    trackFeedLogEvent("feed_log_line_changed", { line });
  }

  const cta = (location: FeedLogCtaLocation) => (
    <Link
      className="inline-flex min-h-11 items-center rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
      to={ATHENA_FEED_LOG_CTA_HREF}
      data-cta-location={location}
      onClick={() => onCta(location)}
    >
      Keep this log in Verdant&apos;s Quick Log →
    </Link>
  );

  return (
    <div
      data-testid="athena-feed-log-page"
      data-layout={layout}
      className="min-h-screen bg-[#f4f7f2] text-emerald-950"
    >
      <header className="border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <a href="https://verdantgrowdiary.com/" aria-label="Verdant Grow Diary">
            <BrandLogo />
          </a>
          <nav aria-label="Breadcrumb" className="text-sm">
            <a className="underline" href="https://verdantgrowdiary.com/">
              Home
            </a>
            {" / "}
            <Link to="/guides" className="underline">
              Guides
            </Link>
            {" / "}
            Athena Feed Chart Log
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
          {ATHENA_FEED_LOG_H1}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7">
          Use this free interactive log alongside your official Athena feed chart to record your
          planned schedule versus what you actually mixed and fed each week, including input and
          runoff readings and plant observations.
        </p>
        <p className="mt-3 text-sm leading-6" role="note">
          {ATHENA_FEED_LOG_DISCLAIMER}
        </p>

        <section className="mt-6 rounded-xl bg-white p-4 shadow-sm" aria-labelledby="quick-answer">
          <h2 id="quick-answer" className="text-lg font-semibold">
            Quick answer
          </h2>
          <p className="mt-2 leading-7">
            Athena&apos;s official{" "}
            <a
              className="underline"
              href={ATHENA_PRO_LINE_SCHEDULE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Pro Line
            </a>{" "}
            and{" "}
            <a
              className="underline"
              href={ATHENA_BLENDED_SCHEDULE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Blended
            </a>{" "}
            feed schedules are free PDFs on Athena&apos;s support site. Use your chart as the plan,
            then log what you actually fed each week, your EC or PPM and pH going in and in the
            runoff, and how your plants responded, so you can adjust next run.
          </p>
        </section>

        <section className="mt-8" aria-labelledby="log-heading" data-testid="athena-feed-log-tool">
          <h2 id="log-heading" className="text-2xl font-semibold">
            Planned vs Actual Feed Log
          </h2>
          <p className="mt-2 text-sm">
            Nothing is saved in your browser. Download CSV or copy your log before leaving this
            page.
          </p>
          <p className="mt-2 text-sm" data-testid="planned-helper">
            {athenaPlannedHelper(state)}{" "}
            <a
              className="underline"
              href={athenaScheduleUrl(state.line)}
              rel="noopener noreferrer"
              target="_blank"
            >
              Official {athenaLineLabel(state.line)} schedule
            </a>
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
            <fieldset className="text-sm">
              <legend>Athena line</legend>
              {ATHENA_LINES.map((line) => (
                <label key={line} className={radioClass}>
                  <input
                    type="radio"
                    name="athena-line"
                    checked={state.line === line}
                    onChange={() => setLine(line)}
                  />
                  {athenaLineLabel(line)}
                </label>
              ))}
            </fieldset>
            {state.line === "pro_line" ? (
              <label className="text-sm">
                Measuring method
                <select
                  className={inputClass}
                  aria-label="Measuring method"
                  value={state.measuringMethod}
                  onChange={(event) =>
                    patch({ measuringMethod: event.target.value as AthenaMeasuringMethod })
                  }
                >
                  {ATHENA_MEASURING_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method === "by_concentrate" ? "By concentrate" : "By weight"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
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
              <span className="mt-1 block text-xs text-emerald-900/70">
                Athena&apos;s charts list different pH ranges for coco/rockwool and peat-based
                media. Use the one that matches yours.
              </span>
            </label>
            <label className="text-sm">
              Amount unit
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
              Water volume per feed
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
                inputMode="decimal"
                aria-describedby="tolerance-help"
                value={state.tolerance}
                onChange={(event) => patch({ tolerance: event.target.value }, true)}
              />
              <span id="tolerance-help" className="mt-1 block text-xs text-emerald-900/70">
                This is your own setting, not a recommendation. Default 10%.
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {state.products.map((name, index) => (
              <label key={index} className="text-sm">
                Product {index + 1} name
                <input
                  className={inputClass}
                  aria-label={`Product ${index + 1} name`}
                  value={name}
                  placeholder="e.g., your Grow or Bloom product"
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
              className="min-h-11 self-end rounded-md border px-3 text-sm"
              disabled={state.products.length >= FEED_LOG_MAX_PRODUCTS}
              onClick={() => setState((current) => addFeedLogProduct(current))}
            >
              Add product
            </button>
            <button
              type="button"
              className="min-h-11 self-end rounded-md border px-3 text-sm"
              disabled={state.products.length <= FEED_LOG_MIN_PRODUCTS}
              onClick={() => setState((current) => removeFeedLogProduct(current))}
            >
              Remove product
            </button>
          </div>

          <div
            className="mt-4 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Weekly feed log table"
            data-testid="athena-feed-log-table-scroll"
          >
            <table className="min-w-[960px] border-collapse text-left text-sm">
              <caption className="sr-only">Weekly planned versus actual Athena feed log</caption>
              <thead>
                <tr className="bg-emerald-900 text-white">
                  <th scope="col" className="sticky left-0 bg-emerald-900 px-2 py-2">
                    Week #
                  </th>
                  <th scope="col">Stage</th>
                  <th scope="col">Date</th>
                  {display.products.map((name, index) => (
                    <th key={`${name}-${index}`} scope="col" colSpan={4}>
                      {name.trim() || `Product ${index + 1}`} ({display.amountUnit})
                    </th>
                  ))}
                  <th scope="col">Feed pH</th>
                  <th scope="col">Feed {display.readingType}</th>
                  <th scope="col">Runoff pH</th>
                  <th scope="col">Runoff {display.readingType}</th>
                  <th scope="col">Avg temp (°F)</th>
                  <th scope="col">Avg RH (%)</th>
                  <th scope="col">VPD (kPa)</th>
                  <th scope="col">Plant response</th>
                  <th scope="col">Notes</th>
                </tr>
                <tr className="bg-emerald-800 text-xs text-white">
                  <th scope="col" className="sticky left-0 bg-emerald-800" />
                  <th scope="col" />
                  <th scope="col" />
                  {display.products.map((_, index) => (
                    <Fragment key={`heads-${index}`}>
                      <th scope="col">Planned</th>
                      <th scope="col">Actual</th>
                      <th scope="col">Difference</th>
                      <th scope="col">% of plan</th>
                    </Fragment>
                  ))}
                  <th scope="col" colSpan={9} />
                </tr>
              </thead>
              <tbody>
                {display.weeks.map((week, weekIndex) => (
                  <tr key={weekIndex} className="border-b border-emerald-900/10 bg-white align-top">
                    <th scope="row" className="sticky left-0 bg-white px-2">
                      {weekIndex + 1}
                    </th>
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
                    {display.products.map((productName, productIndex) => {
                      const cell = week.products[productIndex] ?? { planned: "", actual: "" };
                      const result = blankPrint
                        ? evaluateProductCell("", "", state.tolerance)
                        : evaluateProductCell(cell.planned, cell.actual, state.tolerance);
                      const label = productName.trim() || `Product ${productIndex + 1}`;
                      return (
                        <Fragment key={`cells-${weekIndex}-${productIndex}`}>
                          <td>
                            <input
                              aria-label={`Week ${weekIndex + 1}, ${label}, planned`}
                              className="w-20"
                              inputMode="decimal"
                              value={blankPrint ? "" : cell.planned}
                              onChange={(event) =>
                                updateCell(weekIndex, productIndex, "planned", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Week ${weekIndex + 1}, ${label}, actual`}
                              className="w-20"
                              inputMode="decimal"
                              value={blankPrint ? "" : cell.actual}
                              onChange={(event) =>
                                updateCell(weekIndex, productIndex, "actual", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            {result.diffFormatted
                              ? formatSignedDifference(result.diffNum ?? 0)
                              : ""}
                          </td>
                          <td
                            className={result.flag ? "bg-amber-100" : undefined}
                            aria-label={
                              result.flag
                                ? `Week ${weekIndex + 1}, ${label}, ${result.flag}`
                                : undefined
                            }
                          >
                            {result.pctFormatted}
                            {result.flag ? (
                              <span className="mt-1 block text-xs">⚠ {result.flag}</span>
                            ) : null}
                          </td>
                        </Fragment>
                      );
                    })}
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} feed pH`}
                        className="w-16"
                        inputMode="decimal"
                        value={week.feedPh}
                        onChange={(event) =>
                          updateWeek(weekIndex, { feedPh: event.target.value }, true)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} feed ${display.readingType}`}
                        className="w-16"
                        inputMode="decimal"
                        value={week.feedEcPpm}
                        onChange={(event) =>
                          updateWeek(weekIndex, { feedEcPpm: event.target.value }, true)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} runoff pH`}
                        className="w-16"
                        inputMode="decimal"
                        value={week.runoffPh}
                        onChange={(event) =>
                          updateWeek(weekIndex, { runoffPh: event.target.value }, true)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} runoff ${display.readingType}`}
                        className="w-16"
                        inputMode="decimal"
                        value={week.runoffEcPpm}
                        onChange={(event) =>
                          updateWeek(weekIndex, { runoffEcPpm: event.target.value }, true)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} average temperature Fahrenheit`}
                        className="w-16"
                        inputMode="decimal"
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
                        inputMode="decimal"
                        value={week.avgRh}
                        onChange={(event) => updateWeek(weekIndex, { avgRh: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Week ${weekIndex + 1} VPD`}
                        className="w-16"
                        inputMode="decimal"
                        value={week.vpd}
                        onChange={(event) => updateWeek(weekIndex, { vpd: event.target.value })}
                      />
                      <Link className="block text-xs underline" to="/tools/vpd-calculator">
                        VPD calculator
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

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm"
              disabled={state.weeks.length >= FEED_LOG_MAX_WEEKS}
              onClick={() => {
                const next = addFeedLogWeek(state);
                setState(next);
                trackFeedLogEvent("feed_log_row_added", { row_count: next.weeks.length });
              }}
            >
              Add week
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm"
              disabled={state.weeks.length <= FEED_LOG_MIN_WEEKS}
              onClick={() => {
                const next = removeFeedLogWeek(state);
                setState(next);
                trackFeedLogEvent("feed_log_row_removed", { row_count: next.weeks.length });
              }}
            >
              Remove week
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm"
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
              className="min-h-11 rounded-md border px-3 text-sm"
              onClick={() => setConfirmClear(true)}
            >
              Clear log
            </button>
          </div>
          {confirmClear ? (
            <p className="mt-2 text-sm">
              Clear every entered value?
              <button
                type="button"
                className="ml-2 min-h-11 underline"
                onClick={() => {
                  setState(createDefaultFeedLogState());
                  setConfirmClear(false);
                  announce("Log cleared. Nothing was stored in the browser.");
                }}
              >
                Confirm clear
              </button>
            </p>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {status}
          </p>
          <div className="mt-4 rounded-xl bg-white p-4" aria-live="polite">
            <p>
              Weeks filled: {summary.weeksFilled}. Weeks flagged: {summary.weeksFlagged}.
            </p>
            <ul>
              {summary.products.map((product, index) => (
                <li key={index}>
                  {product.name}: planned {product.totalPlanned}, actual {product.totalActual},
                  difference {formatSignedDifference(product.totalActual - product.totalPlanned)},
                  weeks flagged {product.weeksFlagged}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4">
            {cta("tool")}
            <p className="mt-2 text-sm">
              Log every feeding, reading and photo in one place, across every grow.
            </p>
          </div>
        </section>

        <section className="mt-10 max-w-3xl space-y-3 leading-7">
          <h2 className="text-2xl font-semibold">
            Where to get the official Athena feed chart: Pro Line vs Blended
          </h2>
          <p>
            Pro Line is Athena&apos;s dry soluble program. Its feed schedules come in two versions,
            measuring by concentrate (Athena marks this one recommended) and measuring by weight,
            each in Imperial and Metric. Blended is Athena&apos;s liquid program. Its feed schedules
            come in Imperial and Metric, and there is also a Fade version of the Blended chart. Pick
            the chart for your line, measuring method, and medium.
          </p>
          <p>
            <a
              className="underline"
              href={ATHENA_PRO_LINE_SCHEDULE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Pro Line Feed Schedules
            </a>
            {" · "}
            <a
              className="underline"
              href={ATHENA_BLENDED_SCHEDULE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Blended Line Feed Schedules
            </a>
            {" · "}
            <a
              className="underline"
              href={ATHENA_PRO_LINE_PRODUCT_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Athena Pro Line
            </a>
          </p>
        </section>

        <section className="mt-8 max-w-3xl leading-7">
          <h2 className="text-2xl font-semibold">Why log planned vs actual</h2>
          <p className="mt-2">
            The chart is a starting plan. Your water, medium, strain, and environment differ. A log
            shows where you deviated and what happened next, without turning one week into a
            diagnosis.
          </p>
        </section>

        <section className="mt-8 max-w-3xl leading-7">
          <h2 className="text-2xl font-semibold">
            How to fill in your Athena feed log, week by week
          </h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>Choose your line (Pro Line or Blended) and medium in the setup.</li>
            <li>
              Copy the planned amount for your week from your official Athena PDF into Planned.
            </li>
            <li>Enter what you actually fed.</li>
            <li>
              Record EC or PPM and pH going in, and runoff if you measure it. Athena&apos;s charts
              list different pH ranges for coco/rockwool and peat-based media, so use the one for
              your medium.
            </li>
            <li>
              Record average temperature (°F) and RH, and check VPD on the{" "}
              <Link className="underline" to="/guides/grow-room-vpd-tracker">
                VPD chart by growth stage
              </Link>
              .
            </li>
            <li>Note plant response.</li>
            <li>Download CSV or copy your log.</li>
          </ol>
        </section>

        <section className="mt-8 max-w-3xl leading-7">
          <h2 className="text-2xl font-semibold">Reading your log: spotting patterns</h2>
          <p className="mt-2">
            Look at weeks flagged outside your own tolerance, runoff EC or pH drifting from the feed
            you recorded, and notes that repeat. This page does not diagnose a problem or recommend
            a dose.
          </p>
        </section>

        <section className="mt-8 max-w-3xl leading-7">
          <h2 className="text-2xl font-semibold">Cleanse, Balance and Stack on your chart</h2>
          <p className="mt-2">
            Cleanse, Balance, and Stack appear on Athena&apos;s feed charts. Follow the chart and
            the product label for when and how to use them. Add a product column for each one you
            use. This page states no rates and describes no effects.
          </p>
        </section>

        <section className="mt-8 max-w-3xl">
          <h2 className="text-2xl font-semibold">Keep your feeding log in Verdant</h2>
          <p className="mt-2 text-sm">
            Log every feeding, reading and photo in one place, across every grow.
          </p>
          <div className="mt-3">{cta("article")}</div>
        </section>

        <section className="mt-8 max-w-3xl">
          <h2 className="text-2xl font-semibold">FAQ</h2>
          {ATHENA_FEED_LOG_FAQ.map((entry) => (
            <details key={entry.question} className="mt-3 rounded-md border bg-white p-3">
              <summary className="min-h-11 cursor-pointer font-medium">{entry.question}</summary>
              <p className="mt-2 leading-7">{entry.answer}</p>
            </details>
          ))}
        </section>
      </main>

      <footer className="border-t border-emerald-900/10 bg-white px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-lg font-semibold">Sources</h2>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              <a
                className="underline"
                href={ATHENA_PRO_LINE_SCHEDULE_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                {ATHENA_PRO_LINE_SCHEDULE_URL}
              </a>
            </li>
            <li>
              <a
                className="underline"
                href={ATHENA_BLENDED_SCHEDULE_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                {ATHENA_BLENDED_SCHEDULE_URL}
              </a>
            </li>
            <li>
              <a
                className="underline"
                href={ATHENA_BLENDED_ALL_LANGUAGES_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                {ATHENA_BLENDED_ALL_LANGUAGES_URL}
              </a>
            </li>
            <li>
              <a
                className="underline"
                href={ATHENA_PRO_LINE_PRODUCT_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                {ATHENA_PRO_LINE_PRODUCT_URL}
              </a>
            </li>
          </ul>
          <p className="mt-4 text-sm leading-6" role="note">
            {ATHENA_FEED_LOG_DISCLAIMER}
          </p>
          <p className="mt-4 text-sm">
            Related logs:{" "}
            <Link className="underline" to={ATHENA_RELATED_FEED_LOG_PATH}>
              Advanced Nutrients feeding chart log
            </Link>
            {" · "}
            <Link className="underline" to="/guides">
              All grow guides
            </Link>
            {" · "}
            <Link className="underline" to="/guides/grow-room-vpd-tracker">
              VPD chart by growth stage
            </Link>
          </p>
          <div className="mt-4">{cta("footer")}</div>
        </div>
      </footer>
    </div>
  );
}
