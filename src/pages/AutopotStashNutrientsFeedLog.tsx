import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@/lib/react-router-compat";

import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { trackAutopotLogEvent, type AutopotLogCtaLocation } from "@/lib/autopotFeedLogAnalytics";
import {
  AUTOPOT_COMPARE_DEBOUNCE_MS,
  AUTOPOT_ENTRY_TYPES,
  AUTOPOT_LOG_CTA_HREF,
  AUTOPOT_LOG_DESCRIPTION,
  AUTOPOT_LOG_FAQ,
  AUTOPOT_LOG_H1,
  AUTOPOT_LOG_PATH,
  AUTOPOT_LOG_TITLE,
  AUTOPOT_MIXED_UNITS_WARNING,
  AUTOPOT_QUICK_ANSWER,
  AUTOPOT_SOURCE_URLS,
  AUTOPOT_SOURCES,
  AUTOPOT_SYSTEM_ENUM,
  AUTOPOT_SYSTEMS,
  AUTOPOT_UNIT_ENUM,
  AUTOPOT_UNIT_RULE,
  AUTOPOT_UNITS,
  GROW_EXAMPLE,
  autopotCsvFilename,
  autopotLocalIsoDate,
  buildAutopotCsv,
  buildAutopotEntry,
  buildAutopotTsv,
  countComparedAutopotEntries,
  describeAutopotTent,
  formatAutopotEcCell,
  formatAutopotPhCell,
  isAutopotEntryCompared,
  sortAutopotEntries,
  sumAutopotGallons,
  summarizeAutopotTents,
  validateAutopotEntry,
  type AutopotEntry,
  type AutopotEntryType,
  type AutopotRawEntry,
  type AutopotSystem,
  type AutopotUnit,
} from "@/lib/autopotFeedLogRules";

const SRC = AUTOPOT_SOURCE_URLS;

const inputClass =
  "mt-1 w-full min-w-0 rounded-md border border-emerald-900/20 bg-white px-2 py-1.5 text-sm text-emerald-950";
const buttonClass = "min-h-11 rounded-md border border-emerald-900/20 bg-white px-3 text-sm";
const sectionClass = "mt-8 max-w-3xl leading-7";
const tableWrapClass =
  "mt-4 max-w-full overflow-x-auto rounded-md border bg-white print:overflow-visible";
const cellClass = "border-b border-emerald-900/10 px-2 py-2 text-left align-top";

/** External source link; clicks report only "autopot" or "stash". */
function Src({
  href,
  type,
  children,
}: {
  href: string;
  type: "autopot" | "stash";
  children: ReactNode;
}) {
  return (
    <a
      className="underline"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      data-source-type={type}
      onClick={() => trackAutopotLogEvent("autopot_log_source_click", { source: type })}
    >
      {children}
    </a>
  );
}

const Brochure = () => (
  <Src href={SRC.brochure} type="autopot">
    AutoPot brochure
  </Src>
);
const Tray2GrowDoc = () => (
  <Src href={SRC.tray2grow} type="autopot">
    Tray2Grow instructions
  </Src>
);
const StashGuide = () => (
  <Src href={SRC.stashFaq} type="stash">
    Stash&apos;s official feeding guide
  </Src>
);

const LOG_HEADERS = [
  "Date",
  "Tent",
  "System",
  "Type",
  "Volume (gal)",
  "Mix",
  "pH (planned → actual, diff)",
  "EC/PPM (planned → actual, diff, unit)",
  "°F",
  "Note",
] as const;

type FormState = Omit<AutopotRawEntry, "date">;

const EMPTY_FORM: FormState = {
  tent: "",
  system: "AutoPot Classic",
  entryType: "Refill / top-up",
  volumeGal: "",
  waterTempF: "",
  mix: "",
  actualPh: "",
  actualEc: "",
  actualUnit: "mS/cm",
  plannedPh: "",
  plannedEc: "",
  plannedUnit: "mS/cm",
  note: "",
};

/** Fields cleared after each entry; date, tent, system, type and units stay for the next refill. */
const PER_ENTRY_RESET: Partial<FormState> = {
  volumeGal: "",
  waterTempF: "",
  mix: "",
  actualPh: "",
  actualEc: "",
  plannedPh: "",
  plannedEc: "",
  note: "",
};

export default function AutopotStashNutrientsFeedLog() {
  const [date, setDate] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [entries, setEntries] = useState<AutopotEntry[]>([]);
  const [nextId, setNextId] = useState(1);
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const compareTimer = useRef<number | null>(null);
  const entriesRef = useRef<AutopotEntry[]>([]);
  entriesRef.current = entries;

  usePageSeo({
    title: `${AUTOPOT_LOG_TITLE} | Verdant Grow Diary`,
    description: AUTOPOT_LOG_DESCRIPTION,
    path: AUTOPOT_LOG_PATH,
  });

  useEffect(() => {
    setDate((current) => current || autopotLocalIsoDate(new Date()));
    return () => {
      if (compareTimer.current !== null) window.clearTimeout(compareTimer.current);
    };
  }, []);

  const sorted = useMemo(() => sortAutopotEntries(entries), [entries]);
  const tents = useMemo(
    () => summarizeAutopotTents(entries, autopotLocalIsoDate(new Date())),
    [entries],
  );

  function announce(message: string) {
    setStatus("");
    window.setTimeout(() => setStatus(message), 20);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeSystem(value: AutopotSystem) {
    set("system", value);
    trackAutopotLogEvent("autopot_log_system_selected", { system: AUTOPOT_SYSTEM_ENUM[value] });
  }

  function changeUnit(key: "actualUnit" | "plannedUnit", value: string) {
    set(key, value);
    if (value in AUTOPOT_UNIT_ENUM) {
      trackAutopotLogEvent("autopot_log_unit_selected", {
        unit: AUTOPOT_UNIT_ENUM[value as AutopotUnit],
      });
    }
  }

  function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw: AutopotRawEntry = { ...form, date: date.trim() };
    const check = validateAutopotEntry(raw);
    if (!check.valid) {
      setFormError(check.error);
      return;
    }
    setFormError("");
    const added = buildAutopotEntry(nextId, raw);
    const next = [...entries, added];
    setEntries(next);
    setNextId((id) => id + 1);
    setForm((current) => ({ ...current, ...PER_ENTRY_RESET }));
    setCopyFallback(null);
    announce(`Added AutoPot ${added.entryType.toLowerCase()} entry for ${added.date}.`);
    trackAutopotLogEvent("autopot_log_refill_added", { refill_count: next.length });
    if (isAutopotEntryCompared(added)) {
      if (compareTimer.current !== null) window.clearTimeout(compareTimer.current);
      compareTimer.current = window.setTimeout(() => {
        compareTimer.current = null;
        trackAutopotLogEvent("autopot_log_plan_compared", {
          compared_count: countComparedAutopotEntries(entriesRef.current),
        });
      }, AUTOPOT_COMPARE_DEBOUNCE_MS);
    }
  }

  function deleteEntry(item: AutopotEntry) {
    const remaining = entries.filter((e) => e.id !== item.id);
    setEntries(remaining);
    setCopyFallback(null);
    announce(`Deleted entry from ${item.date}.`);
    trackAutopotLogEvent("autopot_log_refill_deleted", { refill_count: remaining.length });
  }

  function downloadCsv() {
    const filename = autopotCsvFilename(autopotLocalIsoDate(new Date()));
    let url: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      const blob = new Blob([buildAutopotCsv(entries)], { type: "text/csv;charset=utf-8" });
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
    announce(`Exported ${entries.length} entry(s) to ${filename}.`);
    trackAutopotLogEvent("autopot_log_export_csv", { refill_count: entries.length });
  }

  async function copyLog() {
    const tsv = buildAutopotTsv(entries);
    trackAutopotLogEvent("autopot_log_copy", { refill_count: entries.length });
    try {
      await navigator.clipboard.writeText(tsv);
      setCopyFallback(null);
      announce(`Copied ${entries.length} AutoPot log entry(s) to clipboard.`);
    } catch {
      setCopyFallback(tsv);
      announce("Clipboard unavailable. Select and copy the tab-separated AutoPot log shown below.");
    }
  }

  function printLog() {
    announce("Opening print dialog for your AutoPot reservoir & feed log.");
    trackAutopotLogEvent("autopot_log_print", {});
    window.setTimeout(() => window.print(), 30);
  }

  function clearLog() {
    setEntries([]);
    setDate(autopotLocalIsoDate(new Date()));
    setForm(EMPTY_FORM);
    setFormError("");
    setCopyFallback(null);
    setConfirmClear(false);
    announce("Cleared all logged AutoPot entries.");
    trackAutopotLogEvent("autopot_log_clear", {});
  }

  const cta = (location: AutopotLogCtaLocation) => (
    <div className="mt-4 rounded-lg border border-emerald-900/15 bg-emerald-50 p-4 print:hidden">
      <Link
        className="inline-flex min-h-11 items-center rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
        to={AUTOPOT_LOG_CTA_HREF}
        data-cta-location={location}
        onClick={() => trackAutopotLogEvent("autopot_log_cta_click", { cta_location: location })}
      >
        Keep this log in Verdant →
      </Link>
      <p className="mt-2 text-sm">
        Free to start. Keep refills, readings and photos for every tent in one place.
      </p>
    </div>
  );

  const textField = (
    key: "tent" | "volumeGal" | "waterTempF" | "actualPh" | "actualEc" | "plannedPh" | "plannedEc",
    label: string,
    numeric: { min?: number; max?: number; step: string } | null,
    extra?: { placeholder?: string; helper?: string },
  ) => {
    const id = `autopot-${key}`;
    return (
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <input
          id={id}
          type={numeric ? "number" : "text"}
          min={numeric?.min}
          max={numeric?.max}
          step={numeric?.step}
          placeholder={extra?.placeholder}
          className={inputClass}
          value={form[key]}
          aria-describedby={extra?.helper ? `${id}-help` : undefined}
          onChange={(event) => set(key, event.target.value)}
        />
        {extra?.helper ? (
          <p id={`${id}-help`} className="mt-1 text-xs">
            {extra.helper}
          </p>
        ) : null}
      </div>
    );
  };

  const unitSelect = (key: "actualUnit" | "plannedUnit", label: string) => (
    <label className="min-w-0 text-sm font-medium">
      {label}
      <select
        className={inputClass}
        value={form[key]}
        onChange={(event) => changeUnit(key, event.target.value)}
      >
        <option value="">Select unit…</option>
        {AUTOPOT_UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div
      data-testid="autopot-feed-log-page"
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
              <li aria-current="page">AutoPot + Stash Nutrients Feed Log</li>
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
          {AUTOPOT_LOG_H1}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7">
          An AutoPot waters itself, which makes it easy to forget what actually went into the
          reservoir. Log every fill and refill here, with the volume, the mix, pH and EC or PPM in
          the unit your meter shows, and check it against your feed chart.
        </p>

        <section id="quick-answer" className="mt-6 max-w-3xl" aria-labelledby="quick-answer-h">
          <h2 id="quick-answer-h" className="text-2xl font-semibold">
            Quick answer
          </h2>
          <div className="mt-2 rounded-xl bg-white p-4 shadow-sm">
            <p className="leading-7">{AUTOPOT_QUICK_ANSWER}</p>
          </div>
        </section>

        <section id="autopot-reservoir-and-feed-log" className="mt-8" aria-labelledby="tool-h">
          <h2 id="tool-h" className="text-2xl font-semibold">
            AutoPot Reservoir &amp; Feed Log
          </h2>
          <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
            <p className="rounded-md bg-amber-50 p-3 text-sm print:hidden" role="note">
              Nothing is saved in your browser. Download CSV or copy your log before leaving this
              page.
            </p>
            <p className="mt-2 rounded-md bg-emerald-50 p-3 text-sm print:hidden" role="note">
              {AUTOPOT_UNIT_RULE}
            </p>

            <form className="mt-4 print:hidden" noValidate onSubmit={addEntry}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="min-w-0 text-sm font-medium">
                  Date
                  <input
                    type="date"
                    required
                    className={inputClass}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                {textField("tent", "Tent (optional)", null, { placeholder: "e.g., Flower tent" })}
                <label className="min-w-0 text-sm font-medium">
                  System
                  <select
                    className={inputClass}
                    value={form.system}
                    onChange={(event) => changeSystem(event.target.value as AutopotSystem)}
                  >
                    {AUTOPOT_SYSTEMS.map((system) => (
                      <option key={system} value={system}>
                        {system}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0 text-sm font-medium">
                  Entry type
                  <select
                    className={inputClass}
                    value={form.entryType}
                    onChange={(event) => set("entryType", event.target.value as AutopotEntryType)}
                  >
                    {AUTOPOT_ENTRY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                {textField(
                  "volumeGal",
                  "Volume added (gal)",
                  { min: 0, max: 500, step: "0.1" },
                  { helper: "Gallons added to the reservoir (optional for Repot entries)." },
                )}
                {textField("waterTempF", "Reservoir water temp (°F, optional)", {
                  min: 32,
                  max: 120,
                  step: "0.5",
                })}
              </div>

              <div className="mt-3 min-w-0">
                <label htmlFor="autopot-mix" className="text-sm font-medium">
                  Mix (optional)
                </label>
                <textarea
                  id="autopot-mix"
                  rows={2}
                  className={inputClass}
                  value={form.mix}
                  aria-describedby="autopot-mix-help"
                  onChange={(event) => set("mix", event.target.value)}
                />
                <p id="autopot-mix-help" className="mt-1 text-xs">
                  What you added and how much, as written on your chart.
                </p>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <fieldset className="min-w-0 rounded-lg border border-emerald-900/15 p-3">
                  <legend className="px-1 text-sm font-semibold">
                    Actual meter readings (optional)
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {textField("actualPh", "pH (actual)", { min: 0, max: 14, step: "0.01" })}
                    {textField("actualEc", "EC/PPM (actual)", { min: 0, step: "any" })}
                    {unitSelect("actualUnit", "Actual EC/PPM unit")}
                  </div>
                </fieldset>
                <fieldset className="min-w-0 rounded-lg border border-emerald-900/15 p-3">
                  <legend className="px-1 text-sm font-semibold">
                    Planned chart values (optional)
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {textField("plannedPh", "Planned pH", { min: 0, max: 14, step: "0.01" })}
                    {textField("plannedEc", "Planned EC/PPM", { min: 0, step: "any" })}
                    {unitSelect("plannedUnit", "Planned EC/PPM unit")}
                  </div>
                  <p className="mt-1 text-xs">Copy these from your nutrient brand&apos;s chart.</p>
                </fieldset>
              </div>

              <label className="mt-3 block min-w-0 text-sm font-medium">
                Note (optional)
                <input
                  type="text"
                  className={inputClass}
                  value={form.note}
                  onChange={(event) => set("note", event.target.value)}
                />
              </label>

              {formError ? (
                <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-900">
                  {formError}
                </p>
              ) : null}

              <button
                type="submit"
                className="mt-3 min-h-11 rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
              >
                Add entry
              </button>
            </form>

            <p className="sr-only print:hidden" aria-live="polite">
              {status}
            </p>

            <div
              className={tableWrapClass}
              tabIndex={0}
              role="region"
              aria-label="AutoPot feed log table"
            >
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <caption className="p-2 text-left">
                  Logged AutoPot reservoir fills, refills, and media mixes (newest first)
                </caption>
                <thead>
                  <tr>
                    {LOG_HEADERS.map((header) => (
                      <th key={header} scope="col" className={cellClass}>
                        {header}
                      </th>
                    ))}
                    <th scope="col" className={`${cellClass} print:hidden`}>
                      Delete
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <th scope="row" colSpan={11} className={`${cellClass} font-normal`}>
                        No AutoPot entries logged yet. Add a reservoir fill, refill, or repot mix
                        above to track your gallons and meter readings.
                      </th>
                    </tr>
                  ) : (
                    sorted.map((item) => {
                      const ec = formatAutopotEcCell(item);
                      return (
                        <tr key={item.id}>
                          <th scope="row" className={`${cellClass} whitespace-nowrap`}>
                            {item.date}
                          </th>
                          <td className={`${cellClass} break-words`}>
                            {item.tent || "Unassigned tent"}
                          </td>
                          <td className={cellClass}>{item.system}</td>
                          <td className={cellClass}>{item.entryType}</td>
                          <td className={cellClass}>
                            {item.volumeGal !== "" ? `${Number(item.volumeGal)} gal` : "—"}
                          </td>
                          <td className={`${cellClass} break-words`}>{item.mix || "—"}</td>
                          <td className={cellClass}>{formatAutopotPhCell(item)}</td>
                          <td className={cellClass}>
                            {ec.text || "—"}
                            {ec.differentUnits ? (
                              <>
                                {" "}
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                                  Different units — no comparison
                                </span>
                              </>
                            ) : null}
                          </td>
                          <td className={cellClass}>
                            {item.waterTempF !== "" ? `${item.waterTempF}°F` : "—"}
                          </td>
                          <td className={`${cellClass} break-words`}>{item.note || "—"}</td>
                          <td className={`${cellClass} print:hidden`}>
                            <button
                              type="button"
                              className="min-h-11 underline"
                              aria-label={`Delete entry from ${item.date}`}
                              onClick={() => deleteEntry(item)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6" aria-live="polite">
              <h3 className="text-lg font-semibold">Reservoir &amp; feed log summary</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-emerald-900/15 p-3">
                  <p className="text-xs">Entries logged</p>
                  <p className="mt-1 font-semibold">{entries.length}</p>
                </div>
                <div className="rounded-lg border border-emerald-900/15 p-3">
                  <p className="text-xs">Total gallons added</p>
                  <p className="mt-1 font-semibold">
                    {sumAutopotGallons(entries.map((e) => e.volumeGal))} gal
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-900/15 p-3">
                  <p className="text-xs">Entries compared against plan</p>
                  <p className="mt-1 font-semibold">{countComparedAutopotEntries(entries)}</p>
                </div>
              </div>
              {tents.length === 0 ? (
                <p className="mt-3 text-sm leading-6">
                  Log reservoir fills or refills above to see per-tent gallon totals, days since
                  last refill, and average days between refills.
                </p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {tents.map((tent) => (
                    <div
                      key={tent.name}
                      className="min-w-0 rounded-lg border border-emerald-900/15 p-3 text-sm [overflow-wrap:anywhere]"
                    >
                      <strong>{tent.name}: </strong>
                      {describeAutopotTent(tent)}
                      {tent.mixedUnits ? (
                        <p className="mt-1 rounded-md bg-amber-50 p-2 text-amber-900">
                          {AUTOPOT_MIXED_UNITS_WARNING}
                        </p>
                      ) : null}
                    </div>
                  ))}
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
              <button type="button" className={buttonClass} onClick={printLog}>
                Print / Save as PDF
              </button>
              <button
                type="button"
                className={`${buttonClass} border-red-300 text-red-900`}
                onClick={() => setConfirmClear(true)}
              >
                Clear
              </button>
            </div>

            {confirmClear ? (
              <div
                className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm print:hidden"
                role="region"
                aria-label="Confirm clearing AutoPot log"
              >
                <span>Clear all logged AutoPot reservoir and feed entries from this page?</span>
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
                <label htmlFor="autopot-copy-fallback" className="text-sm">
                  Clipboard access was unavailable. Select and copy your tab-separated AutoPot log
                  below:
                </label>
                <textarea
                  id="autopot-copy-fallback"
                  rows={6}
                  readOnly
                  className={inputClass}
                  value={copyFallback}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
            ) : null}

            {cta("tool")}
          </div>
        </section>

        <section id="how-an-autopot-feeds" className={sectionClass}>
          <h2 className="text-2xl font-semibold">How an AutoPot feeds</h2>
          <p className="mt-2">
            Understanding how an <strong>autopot</strong> system delivers water explains why
            reservoir logging looks different from top-watering pots by hand. According to the{" "}
            <Brochure />, the AQUAvalve5 sits inside the base tray and is completely power-free and
            gravity-fed from your <strong>autopot reservoir</strong>. No pumps, electricity, or
            timers are needed to operate the valve cycle.
          </p>
          <p className="mt-2">
            When the AQUAvalve5 opens, gravity feeds solution from the elevated reservoir through
            the supply line into the tray to a depth of about 1 inch (20mm). Once the tray reaches
            that level, the float mechanism closes the valve and cuts off incoming flow. The valve
            stays closed while the plants draw that water up into the growing media from below. Only
            after the plants have used the water in the tray does the AQUAvalve5 reopen to refill
            the tray to about 1 inch (20mm) again (<Brochure />
            ).
          </p>
          <p className="mt-2">
            Because there is no drain-to-waste runoff to measure at each watering, your reservoir
            refill log becomes your primary window into plant appetite. When you record the date and
            gallons added every time you top up or refill the reservoir, the summary automatically
            calculates your total gallons per tent, the number of days since your last refill, and
            the average days between refills. Over a multi-week run, those intervals show you how
            fast your plants drink as canopy size and growth stage change.
          </p>
        </section>

        <section id="autopot-classic-vs-tray2grow" className={sectionClass}>
          <h2 className="text-2xl font-semibold">AutoPot Classic vs Tray2Grow</h2>
          <p className="mt-2">
            Whether you prefer individual pot modules or a shared flat bed, both setups in the{" "}
            <strong>autopot system</strong> lineup use the same power-free, gravity-fed AQUAvalve5
            demand cycle (<Brochure />, <Tray2GrowDoc />
            ):
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              <strong>Classic AutoPot systems:</strong> Built around individual pot modules. Each
              pot sits in its own separate module base with its own AQUAvalve5 connected to the
              reservoir line, allowing each module to cycle at its own plant&apos;s pace and be
              spaced around the tent floor.
            </li>
            <li>
              <strong>AutoPot Tray2Grow:</strong> Uses a single AQUAvalve5 to feed one shared tray.
              According to the <Tray2GrowDoc />, an <strong>autopot tray2grow</strong> can be set up
              with capillary matting inside the tray to feed multiple pots, seed trays, or planters
              resting on the mat, or configured with capillary spikes inside the tray that pierce
              the underside of grow bags or planter bags to wick moisture upward.
            </li>
          </ul>
          <p className="mt-2">
            Many home growers run Classic individual pot modules in one tent and a Tray2Grow in
            another tent—or compare both styles side by side. The AutoPot Reservoir &amp; Feed Log
            above lets you select the system on every refill entry and assign a tent name so your
            gallon totals and refill intervals stay separated by tent.
          </p>
        </section>

        <section id="autopot-nutrients-pot-feeding-vs-reservoir-feeding" className={sectionClass}>
          <h2 className="text-2xl font-semibold">
            AutoPot nutrients: pot feeding vs reservoir feeding
          </h2>
          <p className="mt-2">
            When selecting <strong>autopot nutrients</strong> and planning your{" "}
            <strong>autopot feeding</strong> routine,{" "}
            <Src href={SRC.nutrientInfo} type="autopot">
              AutoPot&apos;s nutrient information sheet
            </Src>{" "}
            outlines how mineral and organic programs work with gravity-fed valves and supply
            tubing:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              <strong>Mineral nutrients in the reservoir:</strong> AutoPot states that mineral
              nutrients are added directly to the reservoir and fed according to the nutrient
              producer&apos;s guidelines. Because mineral salts dissolve in water, you mix your
              batch in the reservoir, check your meter readings, and let the AQUAvalve5 deliver the
              solution to the trays.
            </li>
            <li>
              <strong>
                Organic pot feeding (amendments in the pot, plain water in the reservoir):
              </strong>{" "}
              AutoPot notes that organic growers can &quot;pot feed&quot; by placing amendments or
              time-release feeds directly into the pot media and supplying plain water from the
              reservoir. This keeps organic solids out of the reservoir tank and tubing while the
              gravity valve maintains bottom moisture.
            </li>
            <li>
              <strong>Organic reservoir feeding (liquid organics in the reservoir):</strong> AutoPot
              states that reservoir feeding of liquid organics applies only to AQUAvalve5 systems
              equipped with 9mm (3/8&quot;) pipe and fittings, along with periodic flushing of the
              lines to keep the tubing and valve seats clear.
            </li>
          </ul>
          <p className="mt-2">
            Using the entry type selector in the log above—choosing between a full{" "}
            <strong>Reservoir fill</strong>, a <strong>Refill / top-up</strong>, or a{" "}
            <strong>Repot (media mix)</strong>—lets you keep both pot-fed amendment events and
            reservoir refills organized in the same chronological table.
          </p>
        </section>

        <section id="using-stash-nutrients-in-an-autopot" className={sectionClass}>
          <h2 className="text-2xl font-semibold">Using Stash Nutrients in an AutoPot</h2>
          <p className="mt-2">
            Home growers who want to pair bottom-fed trays with dry amendments often look at{" "}
            <strong>stash nutrients</strong>. According to the{" "}
            <Src href={SRC.stashHome} type="stash">
              Stash Nutrients official site
            </Src>{" "}
            and <StashGuide />, the product family centres on stage-specific dry media amendments
            plus a weekly water-mixed additive:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              <strong>Stash Base:</strong> A dry amendment designed for the vegetative stage, rated
              per gallon of growing media.
            </li>
            <li>
              <strong>Stash Bloom:</strong> A dry amendment designed for the flowering stage, rated
              per gallon of growing media.
            </li>
            <li>
              <strong>Stash Blend:</strong> An additive mixed into water, which Stash recommends
              once per week.
            </li>
          </ul>
          <p className="mt-2">
            Because Stash Base and Stash Bloom are dry amendments rated per gallon of growing media,
            they align naturally with AutoPot&apos;s pot-feeding method: you mix the dry amendment
            into your growing media in the pot and run water from the reservoir so the AQUAvalve5
            keeps the root zone watered. Always use the rates on <StashGuide /> for your media
            volume, and record what you mixed into each pot alongside your ongoing reservoir
            refills.
          </p>
        </section>

        <section id="repotting-before-the-flip" className={sectionClass}>
          <h2 className="text-2xl font-semibold">Repotting before the flip</h2>
          <p className="mt-2">
            Some growers repot right before flipping to flower and mix their flower amendments into
            the fresh media at that point. If you do, log the repot as an entry with the mix and the
            pot size, so later refills have a starting point.
          </p>
          <p className="mt-2">
            Logging that pre-flip transplant as a <strong>Repot (media mix)</strong> entry gives
            your flowering timeline a clear anchor date in your grow journal. When you move a
            vegetative plant into its final AutoPot module pot or planter bag and blend your
            flowering dry amendment into the fresh growing media, writing down the date, the tent
            name, the container size, and the exact mix from your nutrient chart creates a baseline
            record before you open the reservoir tap. Weeks later, as flowers bulk up and you review
            your refill history, you can see the exact day the fresh media mix went into the pots,
            how many refills have cycled through the trays since that transplant, and when you added
            any weekly water-mixed additives along the way.
          </p>
        </section>

        <section id="checking-ph-and-ec-or-ppm" className={sectionClass}>
          <h2 className="text-2xl font-semibold">Checking pH and EC or PPM</h2>
          <p className="mt-2">
            Whether you mix mineral nutrients into your tank or check the water going into a pot-fed
            reservoir, measuring <strong>pH</strong> and <strong>EC</strong> or <strong>PPM</strong>{" "}
            after mixing and before connecting the reservoir helps you confirm that what you mixed
            matches what your nutrient brand&apos;s chart describes. Stir the reservoir thoroughly,
            let the solution settle for a moment, and take your meter readings before opening the
            line to the AQUAvalve5 trays. Recording the optional reservoir water temperature in °F
            at the same time also helps you spot seasonal swings between summer and winter tap
            water. Whenever you log a conductivity or total dissolved solids reading, follow this
            rule:
          </p>
          <p className="mt-2">{AUTOPOT_UNIT_RULE}</p>
          <p className="mt-2">
            A bare conductivity figure without its unit cannot be interpreted reliably later,
            because handheld digital pens can display electrical conductivity in millisiemens per
            centimeter, microsiemens per centimeter, or parts per million calculated with different
            manufacturer conversion scales. Two different meters dipped into the exact same
            reservoir batch can show completely different numbers if they are set to different units
            or scales. The AutoPot Reservoir &amp; Feed Log above stores the explicit unit alongside
            both your planned chart value and your actual meter reading. It never guesses or
            converts between units: when your planned unit and actual unit match, it calculates the
            exact difference; when they differ, it displays{" "}
            <strong>Different units — no comparison</strong>, and if a single tent logs entries with
            more than one unit, the summary warns you right away so you can keep your records
            consistent. If you also run liquid mineral schedules in other tents, see our{" "}
            <Link className="underline" to="/guides/athena-feed-chart-log">
              Athena feed chart log
            </Link>{" "}
            and our{" "}
            <Link className="underline" to="/guides/cronk-nutrients-grow-diary">
              Cronk Nutrients grow diary
            </Link>{" "}
            as other brand logs.
          </p>
        </section>

        {/* Hidden until the grower confirms the example run; never in JSON-LD or the CSV. */}
        <section id="example-from-our-grow" className={sectionClass} hidden={GROW_EXAMPLE === null}>
          {GROW_EXAMPLE !== null ? (
            <>
              <h2 className="text-2xl font-semibold">Example from our grow</h2>
              {GROW_EXAMPLE.intro ? <p className="mt-2">{GROW_EXAMPLE.intro}</p> : null}
              {GROW_EXAMPLE.rows.length > 0 ? (
                <div
                  className={tableWrapClass}
                  tabIndex={0}
                  role="region"
                  aria-label="Example from our grow table"
                >
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <caption className="p-2 text-left">Logged refills from our grow</caption>
                    <thead>
                      <tr>
                        {[
                          "Date",
                          "Tent",
                          "System",
                          "Volume (gal)",
                          "Mix",
                          "pH",
                          "EC/PPM",
                          "Note",
                        ].map((header) => (
                          <th key={header} scope="col" className={cellClass}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {GROW_EXAMPLE.rows.map((row, index) => (
                        <tr key={index}>
                          {[
                            row.date ?? "",
                            row.tent ?? "",
                            row.system ?? "",
                            row.volume_gal !== undefined ? String(row.volume_gal) : "",
                            row.mix ?? "",
                            row.ph !== undefined ? String(row.ph) : "",
                            row.ec !== undefined && row.ec !== ""
                              ? `${row.ec} ${row.ec_unit ?? ""}`
                              : "",
                            row.note ?? "",
                          ].map((cell, cellIndex) => (
                            <td key={cellIndex} className={cellClass}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section id="keep-your-autopot-log-in-verdant" className={sectionClass}>
          <h2 className="text-2xl font-semibold">Keep your AutoPot log in Verdant</h2>
          <p className="mt-2">
            Download or copy your reservoir log above, then bring your entries into Verdant Grow
            Diary so your AutoPot refills, media repots, meter readings, °F climate snapshots, and
            plant photos stay linked on one timeline.
          </p>
          {cta("article")}
        </section>

        <section id="autopot-feeding-faq" className={sectionClass}>
          <h2 className="text-2xl font-semibold">AutoPot feeding FAQ</h2>
          {AUTOPOT_LOG_FAQ.map((entry) => (
            <details key={entry.question} className="mt-3 rounded-md border bg-white p-3">
              <summary className="min-h-11 cursor-pointer font-medium">{entry.question}</summary>
              <p className="mt-2 leading-7">{entry.answer}</p>
            </details>
          ))}
        </section>

        <section id="keep-reading" className={sectionClass}>
          <h2 className="text-2xl font-semibold">Keep reading</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {[
              ["/guides/cannabis-nutrient-schedule", "Cannabis nutrient schedule"],
              ["/guides/athena-feed-chart-log", "Athena feed chart log"],
              ["/guides/cronk-nutrients-grow-diary", "Cronk Nutrients grow diary"],
              ["/vpd-chart", "VPD chart by growth stage"],
              ["/guides/grow-stage-care-guide", "Grow stage care guide"],
            ].map(([to, label]) => (
              <li key={to}>
                <Link className="underline" to={to}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer id="sources" className="border-t border-emerald-900/10 bg-white px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-lg font-semibold">Sources</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {AUTOPOT_SOURCES.map((source) => (
              <li key={source.url} className="break-words">
                {source.label}:{" "}
                <Src href={source.url} type={source.type}>
                  {source.url}
                </Src>
              </li>
            ))}
          </ul>
          {cta("footer")}
          <p className="mt-4 text-sm">
            Educational content for home growers. Follow the laws where you live. AutoPot and Stash
            Nutrients are trademarks of their owners; this page is not affiliated with them.
          </p>
        </div>
      </footer>
    </div>
  );
}
