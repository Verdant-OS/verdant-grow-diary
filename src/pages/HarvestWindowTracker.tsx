import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@/lib/react-router-compat";

import BrandLogo from "@/components/BrandLogo";
import {
  harvestHandoffCountBucket,
  harvestHandoffSignupHref,
  saveHarvestCheckHandoff,
} from "@/lib/harvestCheckHandoffStore";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  trackHarvestTrackerEvent,
  type HarvestTrackerCtaLocation,
} from "@/lib/harvestWindowAnalytics";
import {
  addKnownPlant,
  buildHarvestCsv,
  buildHarvestTsv,
  countUniquePlants,
  createDefaultHarvestRanges,
  evaluateHarvestWindowStatus,
  clampHarvestRangeValue,
  HARVEST_SOURCES,
  HARVEST_TARGET_LABELS,
  HARVEST_WINDOW_CTA_HREF,
  HARVEST_WINDOW_DESCRIPTION,
  HARVEST_WINDOW_FAQ,
  HARVEST_WINDOW_H1,
  HARVEST_WINDOW_PATH,
  HARVEST_WINDOW_TITLE,
  harvestCsvFilename,
  localIsoDate,
  sortHarvestChecks,
  summarizeHarvestPlants,
  validateTrichomePercentages,
  isFutureHarvestCheckDate,
  HARVEST_FUTURE_DATE_MESSAGE,
  type HarvestCheck,
  type HarvestRange,
  type HarvestRanges,
  type HarvestTarget,
  type HarvestWindowStatus,
} from "@/lib/harvestWindowRules";

const GROW_WEED_EASY = HARVEST_SOURCES[0].url;
const WEEDMAPS = HARVEST_SOURCES[1].url;
const ZAMNESIA = HARVEST_SOURCES[2].url;

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

const GWE = () => <Ext href={GROW_WEED_EASY}>Grow Weed Easy</Ext>;
const WM = () => <Ext href={WEEDMAPS}>Weedmaps</Ext>;
const ZAM = () => <Ext href={ZAMNESIA}>Zamnesia</Ext>;

interface RangeField {
  key: keyof HarvestRange;
  label: string;
}

const TARGET_OPTIONS: { target: HarvestTarget; label: string; fields: RangeField[] }[] = [
  {
    target: "energetic",
    label: "Energetic / earlier (default: cloudy ≥ 70%, amber 0–10%)",
    fields: [
      { key: "cloudyMin", label: "Energetic minimum cloudy %" },
      { key: "amberMin", label: "Energetic minimum amber %" },
      { key: "amberMax", label: "Energetic maximum amber %" },
    ],
  },
  {
    target: "peak",
    label: "Peak / balanced (default: cloudy ≥ 70%, amber 10–30%)",
    fields: [
      { key: "cloudyMin", label: "Peak minimum cloudy %" },
      { key: "amberMin", label: "Peak minimum amber %" },
      { key: "amberMax", label: "Peak maximum amber %" },
    ],
  },
  {
    target: "body",
    label: "Body / later (default: amber 30–50%)",
    fields: [
      { key: "amberMin", label: "Body minimum amber %" },
      { key: "amberMax", label: "Body maximum amber %" },
    ],
  },
];

type RangeDrafts = Record<HarvestTarget, Record<keyof HarvestRange, string>>;

function rangesToDrafts(ranges: HarvestRanges): RangeDrafts {
  const toDraft = (range: HarvestRange) => ({
    cloudyMin: String(range.cloudyMin),
    amberMin: String(range.amberMin),
    amberMax: String(range.amberMax),
  });
  return {
    energetic: toDraft(ranges.energetic),
    peak: toDraft(ranges.peak),
    body: toDraft(ranges.body),
  };
}

function draftsToRanges(drafts: RangeDrafts): HarvestRanges {
  const defaults = createDefaultHarvestRanges();
  const read = (target: HarvestTarget): HarvestRange => ({
    cloudyMin: clampHarvestRangeValue(drafts[target].cloudyMin, defaults[target].cloudyMin),
    amberMin: clampHarvestRangeValue(drafts[target].amberMin, defaults[target].amberMin),
    amberMax: clampHarvestRangeValue(drafts[target].amberMax, defaults[target].amberMax),
  });
  return { energetic: read("energetic"), peak: read("peak"), body: read("body") };
}

const EMPTY_FORM = { clear: "", cloudy: "", amber: "", pistils: "", photoNote: "" };

const STATUS_CLASS: Record<HarvestWindowStatus, string> = {
  "In window": "bg-emerald-100 text-emerald-900",
  "Past window": "bg-amber-100 text-amber-900",
  "Before window": "bg-slate-100 text-slate-800",
};

const LOG_HEADERS = [
  "Date",
  "Plant",
  "Clear %",
  "Cloudy %",
  "Amber %",
  "Window status",
  "Pistil notes",
  "Photo note",
] as const;

export default function HarvestWindowTracker() {
  const [target, setTarget] = useState<HarvestTarget>("peak");
  const [rangeDrafts, setRangeDrafts] = useState<RangeDrafts>(() =>
    rangesToDrafts(createDefaultHarvestRanges()),
  );
  const [checks, setChecks] = useState<HarvestCheck[]>([]);
  const [knownPlants, setKnownPlants] = useState<string[]>([]);
  const [nextId, setNextId] = useState(1);
  const [date, setDate] = useState("");
  // Set after mount, like the default date, so SSR and the first client render match.
  const [maxDate, setMaxDate] = useState<string | undefined>(undefined);
  const [plant, setPlant] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [handoffFailedAt, setHandoffFailedAt] = useState<HarvestTrackerCtaLocation | null>(null);
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<"log" | "blank">("log");

  usePageSeo({
    title: `${HARVEST_WINDOW_TITLE} | Verdant Grow Diary`,
    description: HARVEST_WINDOW_DESCRIPTION,
    path: HARVEST_WINDOW_PATH,
  });

  useEffect(() => {
    const today = localIsoDate(new Date());
    setDate((current) => current || today);
    setMaxDate(today);
  }, []);

  const ranges = useMemo(() => draftsToRanges(rangeDrafts), [rangeDrafts]);
  const sortedChecks = useMemo(() => sortHarvestChecks(checks), [checks]);
  const summaries = useMemo(
    () => summarizeHarvestPlants(checks, target, ranges),
    [checks, target, ranges],
  );

  // Timers that update state or call window are cleared on unmount, so none fires after the page is gone.
  const pendingTimers = useRef(new Set<number>());
  // A copy started before the log changed (or the page closed) must not report or restore an outdated log.
  const copyGeneration = useRef(0);
  useEffect(() => {
    copyGeneration.current += 1;
  }, [checks, target, ranges]);
  useEffect(() => {
    const timers = pendingTimers.current;
    const generation = copyGeneration;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      generation.current += 1;
    };
  }, []);

  function later(callback: () => void, delayMs: number) {
    const id = window.setTimeout(() => {
      pendingTimers.current.delete(id);
      callback();
    }, delayMs);
    pendingTimers.current.add(id);
  }

  function announce(message: string) {
    setStatus("");
    later(() => setStatus(message), 20);
  }

  function changeTarget(next: HarvestTarget) {
    if (next === target) return;
    setTarget(next);
    setCopyFallback(null);
    announce(`Target window updated to ${HARVEST_TARGET_LABELS[next]}.`);
    trackHarvestTrackerEvent("harvest_tracker_target_changed", { target: next });
  }

  function updateRange(rangeTarget: HarvestTarget, key: keyof HarvestRange, value: string) {
    setRangeDrafts((current) => ({
      ...current,
      [rangeTarget]: { ...current[rangeTarget], [key]: value },
    }));
    setCopyFallback(null);
  }

  function addCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dateValue = date.trim() || localIsoDate(new Date());
    const plantValue = plant.trim() || "Plant A";
    if (isFutureHarvestCheckDate(dateValue, new Date())) {
      setFormError(HARVEST_FUTURE_DATE_MESSAGE);
      return;
    }
    const validation = validateTrichomePercentages(form.clear, form.cloudy, form.amber);
    if (!validation.valid) {
      setFormError(validation.reason);
      return;
    }
    setFormError("");
    const nextChecks = [
      ...checks,
      {
        id: nextId,
        date: dateValue,
        plant: plantValue,
        clear: validation.clear,
        cloudy: validation.cloudy,
        amber: validation.amber,
        pistils: form.pistils.trim(),
        photoNote: form.photoNote.trim(),
      },
    ];
    setChecks(nextChecks);
    setNextId((id) => id + 1);
    setKnownPlants((current) => addKnownPlant(current, plantValue));
    setForm(EMPTY_FORM);
    setCopyFallback(null);
    announce(`Added trichome check for ${plantValue} on ${dateValue}.`);
    trackHarvestTrackerEvent("harvest_tracker_check_added", {
      check_count: nextChecks.length,
      plant_count: countUniquePlants(nextChecks),
    });
  }

  function removeCheck(item: HarvestCheck) {
    const remaining = checks.filter((entry) => entry.id !== item.id);
    setChecks(remaining);
    setCopyFallback(null);
    announce(`Removed check for ${item.plant} on ${item.date}.`);
    trackHarvestTrackerEvent("harvest_tracker_check_removed", { check_count: remaining.length });
  }

  function downloadCsv() {
    const filename = harvestCsvFilename(localIsoDate(new Date()));
    let url: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      const blob = new Blob([buildHarvestCsv(checks, target, ranges)], {
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
    announce(`Exported ${checks.length} check(s) to ${filename}.`);
    trackHarvestTrackerEvent("harvest_tracker_export_csv", { check_count: checks.length });
  }

  async function copyLog() {
    const tsv = buildHarvestTsv(checks, target, ranges);
    trackHarvestTrackerEvent("harvest_tracker_copy", { check_count: checks.length });
    const generation = copyGeneration.current;
    try {
      await navigator.clipboard.writeText(tsv);
      if (generation !== copyGeneration.current) return;
      setCopyFallback(null);
      announce(`Copied ${checks.length} check(s) to clipboard as tab-separated text.`);
    } catch {
      if (generation !== copyGeneration.current) return;
      setCopyFallback(tsv);
      announce("Clipboard unavailable. Select and copy the tab-separated log shown below.");
    }
  }

  function printLog(mode: "log" | "blank") {
    setPrintMode(mode);
    announce(
      mode === "blank"
        ? "Opening print dialog for a 10-row blank check sheet."
        : "Opening print dialog for your trichome check log.",
    );
    trackHarvestTrackerEvent("harvest_tracker_print", {});
    window.addEventListener("afterprint", () => setPrintMode("log"), { once: true });
    later(() => window.print(), 30);
  }

  function clearLog() {
    setChecks([]);
    setKnownPlants([]);
    setTarget("peak");
    setRangeDrafts(rangesToDrafts(createDefaultHarvestRanges()));
    setFormError("");
    setCopyFallback(null);
    setConfirmClear(false);
    announce("Cleared all logged trichome checks and restored default target ranges.");
    trackHarvestTrackerEvent("harvest_tracker_clear", {});
  }

  const cta = (location: HarvestTrackerCtaLocation) => (
    <div className="mt-4 rounded-lg border border-emerald-900/15 bg-emerald-50 p-4 print:hidden">
      <Link
        className="inline-flex min-h-11 items-center rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
        to={
          checks.length > 0
            ? harvestHandoffSignupHref(HARVEST_WINDOW_CTA_HREF)
            : HARVEST_WINDOW_CTA_HREF
        }
        data-cta-location={location}
        onClick={(event) => {
          trackHarvestTrackerEvent("harvest_tracker_cta_click", { cta_location: location });
          // Only a non-empty log is carried through signup, and only on this click.
          if (checks.length === 0) return;
          if (!saveHarvestCheckHandoff({ target, ranges, checks }, new Date())) {
            // Never leave for signup implying the log came along when it did not.
            event.preventDefault();
            setHandoffFailedAt(location);
            return;
          }
          setHandoffFailedAt(null);
          trackHarvestTrackerEvent("harvest_tracker_handoff_saved", {
            count_bucket: harvestHandoffCountBucket(checks.length),
          });
        }}
      >
        Keep this log in Verdant →
      </Link>
      <p className="mt-2 text-sm">
        Free to start. Log harvest checks next to your plant&apos;s full timeline, feeds and
        environment.
      </p>
      {checks.length > 0 ? (
        <p className="mt-1 text-xs">
          This button keeps your logged checks in this browser tab for up to 24 hours, so you can
          import them onto a plant after you sign up. Nothing is sent until you choose a plant. If
          you confirm your email in another tab, come back to this tab and sign in to import them.
        </p>
      ) : null}
      {handoffFailedAt === location && checks.length > 0 ? (
        <p role="alert" className="mt-1 text-xs text-red-800">
          Your log could not be kept for signup in this browser. Download CSV first, then{" "}
          <Link className="underline" to={HARVEST_WINDOW_CTA_HREF}>
            continue to signup without it
          </Link>
          .
        </p>
      ) : null}
    </div>
  );

  const hideForBlankPrint = printMode === "blank" ? "print:hidden" : "";

  return (
    <div
      data-testid="harvest-window-page"
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
              <li aria-current="page">When to Harvest Cannabis</li>
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className={hideForBlankPrint}>
          <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
            {HARVEST_WINDOW_H1}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7">
            Checking trichomes once tells you little. Checking them every few days, and writing it
            down, shows you where your harvest window actually is.
          </p>

          <section id="quick-answer" className="mt-6 max-w-3xl" aria-labelledby="quick-answer-h">
            <h2 id="quick-answer-h" className="text-2xl font-semibold">
              Quick answer
            </h2>
            <div className="mt-2 rounded-xl bg-white p-4 shadow-sm">
              <p className="leading-7">
                Most grow guides say to harvest when most trichomes on the buds, not the sugar
                leaves, have turned from clear to cloudy, with some amber. Fewer amber trichomes is
                described as a more energetic effect, and more amber as a heavier, body-focused
                effect. Check several bud sites over several days and log what you see before you
                chop.
              </p>
            </div>
          </section>
        </div>

        <section id="harvest-window-tracker" className="mt-8" aria-labelledby="tracker-h">
          <h2 id="tracker-h" className={`text-2xl font-semibold ${hideForBlankPrint}`}>
            Harvest Window Tracker
          </h2>
          <div className={`mt-3 rounded-xl bg-white p-4 shadow-sm ${hideForBlankPrint}`}>
            <p className="rounded-md bg-amber-50 p-3 text-sm print:hidden" role="note">
              Nothing is saved in your browser unless you click &ldquo;Keep this log in
              Verdant&rdquo;. Download CSV or copy your log before leaving this page.
            </p>

            <fieldset className="mt-4 min-w-0 print:hidden">
              <legend className="font-semibold">Target effect</legend>
              <p className="mt-1 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs">
                Common guide description, adjust to your preference
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {TARGET_OPTIONS.map((option) => (
                  <div
                    key={option.target}
                    className={`min-w-0 rounded-lg border p-3 ${
                      target === option.target
                        ? "border-emerald-700 bg-emerald-50"
                        : "border-emerald-900/15"
                    }`}
                  >
                    <label className="flex min-h-11 items-start gap-2 text-sm font-medium">
                      <input
                        type="radio"
                        name="targetEffect"
                        className="mt-1"
                        value={option.target}
                        checked={target === option.target}
                        onChange={() => changeTarget(option.target)}
                      />
                      <span>{option.label}</span>
                    </label>
                    <div className="mt-2 grid gap-2">
                      {option.fields.map((field) => {
                        const id = `${option.target}-${field.key}`;
                        return (
                          <div key={id}>
                            <label htmlFor={id} className="text-sm">
                              {field.label}
                            </label>
                            <input
                              id={id}
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              className={inputClass}
                              value={rangeDrafts[option.target][field.key]}
                              onChange={(event) =>
                                updateRange(option.target, field.key, event.target.value)
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6">
                These ranges summarize how grow guides commonly describe trichome stages. They are
                not lab measurements. Your plant, strain and loupe may differ.
              </p>
            </fieldset>

            <form className="mt-6 print:hidden" noValidate onSubmit={addCheck}>
              <h3 className="text-lg font-semibold">Log a trichome check</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="check-date" className="text-sm">
                    Date
                  </label>
                  <input
                    id="check-date"
                    type="date"
                    required
                    max={maxDate}
                    // A tab left open past midnight would otherwise grey out the real today.
                    onFocus={() => setMaxDate(localIsoDate(new Date()))}
                    className={inputClass}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="check-plant" className="text-sm">
                    Plant
                  </label>
                  <input
                    id="check-plant"
                    type="text"
                    required
                    list="plant-datalist"
                    placeholder="e.g., Plant A"
                    className={inputClass}
                    value={plant}
                    onChange={(event) => setPlant(event.target.value)}
                  />
                  <datalist id="plant-datalist">
                    {knownPlants.map((name) => (
                      <option key={name.toLowerCase()} value={name} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {(
                  [
                    ["check-clear", "% Clear", "clear"],
                    ["check-cloudy", "% Cloudy", "cloudy"],
                    ["check-amber", "% Amber", "amber"],
                  ] as const
                ).map(([id, label, key]) => (
                  <div key={id} className="min-w-0">
                    <label htmlFor={id} className="text-sm">
                      {label}
                    </label>
                    <input
                      id={id}
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      required
                      className={inputClass}
                      value={form[key]}
                      onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="check-pistils" className="text-sm">
                    Pistil notes
                  </label>
                  <input
                    id="check-pistils"
                    type="text"
                    placeholder="e.g., most hairs orange and curled in"
                    className={inputClass}
                    value={form.pistils}
                    onChange={(event) => setForm({ ...form, pistils: event.target.value })}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="check-photo-note" className="text-sm">
                    Photo note
                  </label>
                  <input
                    id="check-photo-note"
                    type="text"
                    placeholder="e.g., top cola, 60x loupe"
                    className={inputClass}
                    value={form.photoNote}
                    onChange={(event) => setForm({ ...form, photoNote: event.target.value })}
                  />
                </div>
              </div>
              {formError ? (
                <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-900">
                  {formError}
                </p>
              ) : null}
              <button
                type="submit"
                className="mt-3 min-h-11 rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
              >
                Add check
              </button>
            </form>

            <p className="sr-only print:hidden" aria-live="polite">
              {status}
            </p>

            <div
              className={tableWrapClass}
              tabIndex={0}
              role="region"
              aria-label="Trichome check log table"
            >
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <caption className="p-2 text-left text-sm">
                  Logged trichome observations by plant and date
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
                  {sortedChecks.length === 0 ? (
                    <tr>
                      <th scope="row" colSpan={9} className={`${cellClass} font-normal`}>
                        No trichome checks logged yet. Enter a check above to compare your
                        observations with your chosen window.
                      </th>
                    </tr>
                  ) : (
                    sortedChecks.map((item) => {
                      const itemStatus = evaluateHarvestWindowStatus(item, target, ranges);
                      return (
                        <tr key={item.id}>
                          <td className={`${cellClass} whitespace-nowrap`}>{item.date}</td>
                          <th scope="row" className={`${cellClass} break-words`}>
                            {item.plant}
                          </th>
                          <td className={cellClass}>{item.clear}%</td>
                          <td className={cellClass}>{item.cloudy}%</td>
                          <td className={cellClass}>{item.amber}%</td>
                          <td className={cellClass}>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[itemStatus]}`}
                            >
                              {itemStatus}
                            </span>
                          </td>
                          <td className={`${cellClass} break-words`}>{item.pistils || "—"}</td>
                          <td className={`${cellClass} break-words`}>{item.photoNote || "—"}</td>
                          <td className={`${cellClass} print:hidden`}>
                            <button
                              type="button"
                              className="min-h-11 underline"
                              aria-label={`Remove check for ${item.plant} on ${item.date}`}
                              onClick={() => removeCheck(item)}
                            >
                              Remove
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
              <h3 className="text-lg font-semibold">Plant harvest window summary</h3>
              {summaries.length === 0 ? (
                <p className="mt-2 leading-7">
                  Log checks above to see per-plant changes in cloudy and amber percentages and
                  compare your latest check with the target window you chose.
                </p>
              ) : (
                <div className="mt-2 grid gap-3">
                  {summaries.map((summary) => (
                    <div
                      key={summary.key}
                      className="min-w-0 rounded-lg border border-emerald-900/15 p-3 [overflow-wrap:anywhere]"
                    >
                      <h4 className="font-semibold">{summary.heading}</h4>
                      {summary.lines.map((line) => (
                        <p key={line} className="mt-1 text-sm leading-6">
                          {line}
                        </p>
                      ))}
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
              <button type="button" className={buttonClass} onClick={() => printLog("log")}>
                Print / Save as PDF
              </button>
              <button type="button" className={buttonClass} onClick={() => printLog("blank")}>
                Print blank check sheet
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
                aria-label="Confirm clearing log"
              >
                <span>Clear all logged trichome checks and reset your target ranges?</span>
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
                <label htmlFor="copy-fallback-textarea" className="text-sm">
                  Clipboard access was unavailable. Select and copy your tab-separated log below:
                </label>
                <textarea
                  id="copy-fallback-textarea"
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
              Verdant Grow Diary — Blank Trichome Check Sheet
            </h3>
            <p className="mt-2 text-sm">
              Check several bud sites (top and lower calyxes, not sugar leaves) at a consistent
              light and time of day. Percentages are rough estimates totaling about 100%.
            </p>
            <table className="mt-2 w-full border-collapse text-sm">
              <caption className="p-2 text-left">Tent-side trichome check sheet (10 rows)</caption>
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
                {Array.from({ length: 10 }, (_, row) => (
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
          <section id="how-to-check-trichomes" className={sectionClass}>
            <h2 className="text-2xl font-semibold">How to check trichomes</h2>
            <p className="mt-2">
              Learning <strong>how to check trichomes</strong> starts with inspecting the resin
              glands on your flowers under magnification rather than judging maturity from across
              the tent. Because individual capitate-stalked trichome heads are tiny, grow guides
              from <GWE />, <WM />, and <ZAM /> recommend using a jeweler&apos;s loupe, a clip-on
              phone macro lens, or a handheld magnifier. When growers search for{" "}
              <strong>when to harvest cannabis</strong> or <strong>when to harvest weed</strong>,
              the biggest upgrade is moving from a single glance to a repeatable routine across the
              final weeks of flower.
            </p>
            <p className="mt-3">
              Always inspect the trichome heads on the bud calyxes and bracts, never on the small
              sugar leaves sticking out from the flowers. As guides on <GWE /> and <WM /> commonly
              describe, trichomes on sugar leaves turn amber much earlier than the trichomes on the
              buds themselves. Focus on the rounded head at the tip of each stalk, where colour
              changes appear most clearly.
            </p>
            <p className="mt-3">
              Check several bud sites on each plant every time you look. Top colas sit closer to
              your grow lights and experience warmer canopy temperatures in °F than lower branches,
              so upper buds often cloud over or show amber ahead of mid-canopy and lower flowers.
              Sampling both top and lower bud sites gives you a balanced readout of the whole plant.
            </p>
            <p className="mt-3">
              Inspect at a similar time of day and under consistent, neutral white light each check,
              since warm-spectrum grow lights can make clear or milky heads look artificially amber.
              Estimate your clear, cloudy, and amber percentages roughly—consistency from check to
              check matters far more than precision.
            </p>
          </section>

          <section id="trichome-color-chart" className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              Trichome color chart: clear vs cloudy vs amber
            </h2>
            <p className="mt-2">
              A <strong>trichome color chart</strong> summarizes the visual transition resin glands
              go through as flowers mature. Home growers use a <strong>trichome chart</strong> to
              compare what they see through a loupe against the stages described in cultivation
              guides (<GWE />, <WM />, <ZAM />
              ).
            </p>
            <div
              className={tableWrapClass}
              tabIndex={0}
              role="region"
              aria-label="Trichome color chart table"
            >
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <caption className="p-2 text-left">
                  Trichome stages and how grow guides commonly describe them
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={cellClass}>
                      Stage
                    </th>
                    <th scope="col" className={cellClass}>
                      What it looks like
                    </th>
                    <th scope="col" className={cellClass}>
                      How grow guides describe it
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className={cellClass}>
                      Clear
                    </th>
                    <td className={cellClass}>
                      Glassy, see-through resin heads that look like tiny drops of clear water
                    </td>
                    <td className={cellClass}>
                      Described as not ready yet; guides note the flower is still developing
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className={cellClass}>
                      Cloudy
                    </th>
                    <td className={cellClass}>
                      Milky, opaque white heads that look like frosted glass under magnification
                    </td>
                    <td className={cellClass}>
                      Described as approaching peak; guides point to mostly cloudy heads as the core
                      harvest window
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className={cellClass}>
                      Amber
                    </th>
                    <td className={cellClass}>
                      Golden to brown heads that are no longer translucent or white
                    </td>
                    <td className={cellClass}>
                      Described as past peak, with effect shifting toward body
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 className="mt-6 text-xl font-semibold">Amber vs cloudy trichomes</h3>
            <p className="mt-2">
              When comparing <strong>amber vs cloudy trichomes</strong>, grow guides such as <GWE />
              , <WM />, and <ZAM /> describe the shift in terms of the perceived effect. Harvesting
              when buds show mostly <strong>cloudy trichomes</strong> with very little amber is
              commonly described in those guides as leaning toward a more energetic, head-focused
              experience, while waiting until a larger share of heads turn amber is described as
              shifting toward a heavier, body-focused effect. Logging your estimates every few days
              helps you see your plant move toward the part of the <strong>harvest window</strong>{" "}
              you prefer.
            </p>
          </section>

          <section id="pistil-method" className={sectionClass}>
            <h2 className="text-2xl font-semibold">The pistil method (a backup check)</h2>
            <p className="mt-2">
              Before handheld loupes became standard tent gear, many home growers relied on the
              pistil method to judge <strong>when to harvest cannabis</strong>. Pistils—the
              hair-like stigmas growing out of the flower bracts—begin flowering bright white and
              straight, then darken to orange, rust, or brown and curl inward against the swollen
              calyxes as buds mature (<GWE />, <ZAM />
              ).
            </p>
            <p className="mt-3">
              Grow guides treat the pistil method as less reliable than checking trichomes because
              everyday tent conditions—strong fan airflow, low humidity, warm canopy temperatures in
              °F, pollination, or brushing against colas during maintenance—can cause white hairs to
              shrivel and darken long before trichomes cloud over (<WM />
              ). Conversely, certain cultivars keep pushing clusters of fresh white pistils near
              intense grow lights even after trichomes across the rest of the flower have turned
              mostly cloudy and amber. Log pistil notes alongside your trichome checks as a
              secondary backup check rather than relying on hair colour alone.
            </p>
          </section>

          <section id="when-to-harvest-autoflowers" className={sectionClass}>
            <h2 className="text-2xl font-semibold">When to harvest autoflowers</h2>
            <p className="mt-2">
              Deciding <strong>when to harvest autoflowers</strong> follows the same
              magnifying-glass routine: use the breeder&apos;s estimated time from seed as a
              starting point, then confirm with trichomes on the buds (<GWE />, <ZAM />
              ). Because autoflowers transition into flower by age rather than a change in light
              schedule, container volume, root-zone watering habits, daily light hours, canopy
              temperature in °F, and phenotype variation between seeds all influence how quickly a
              plant matures.
            </p>
            <p className="mt-3">
              In practice, autoflowers can finish before or after the breeder&apos;s printed
              estimate, and two autoflower seeds sprouted on the same day in the same tent often
              reach their harvest window several days apart. Treat the seed pack timeline as your
              reminder to pull out your loupe and begin logging trichome checks for each plant under
              its own name so you harvest each autoflower when its own buds match your chosen
              target.
            </p>
          </section>

          <section id="harvesting-early-vs-late" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Harvesting early vs late</h2>
            <p className="mt-2">
              Every grower weighing <strong>when to harvest weed</strong> eventually considers the
              tradeoffs between chopping on the earlier side of the window or waiting several more
              days for a later finish. Cultivation guides (<GWE />, <WM />, <ZAM />) describe this
              decision as a balance of flower development and personal preference once the plant
              moves past the immature clear-trichome stage:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-6">
              <li>
                <strong>Before the window (mostly clear trichomes):</strong> Guides commonly
                describe buds harvested while most trichomes are still glassy and clear—and while
                pistils remain straight and white—as underdeveloped. Flowers cut this early have not
                finished swelling, and guides note the resulting experience is frequently described
                as thin, brief, or edgy compared with fully matured buds.
              </li>
              <li>
                <strong>Earlier in the window (mostly cloudy, minimal amber):</strong> Once most
                trichomes on the buds have turned milky opaque white with only a small trace of
                amber, grow guides commonly describe the effect as brighter, brisker, and more
                head-focused.
              </li>
              <li>
                <strong>Middle of the window (mostly cloudy with moderate amber):</strong> Standard
                grow guides point to a mostly cloudy canopy with a balanced share of amber heads as
                the classic middle ground where calyxes have swollen and resin heads are opaque.
              </li>
              <li>
                <strong>Later in the window (cloudy with higher amber):</strong> Waiting until a
                larger share of cloudy heads turn golden or brown is commonly described in grow
                guides as shifting the effect toward a heavier, slower, body-focused experience,
                though leaving plants far past your target window can lead to over-ripening and
                extra moisture risk inside dense colas.
              </li>
            </ul>
            <p className="mt-3">
              If you want to compare both ends of the <strong>harvest window</strong> on the same
              cultivar, grow guides often suggest a staggered harvest: harvesting a few upper
              branches when trichomes reach your earlier target, recording the date, and leaving
              lower branches for several additional days so you can compare both batches side by
              side in your journal.
            </p>
          </section>

          <section id="flush-before-harvest" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Should you flush before harvest?</h2>
            <p className="mt-2">
              Whether to <strong>flush before harvest</strong>—running plain water without added
              nutrients through the medium during the final days or weeks before chopping—remains
              one of the most debated practices in home cultivation. As <GWE /> and <WM /> note,
              growers disagree strongly on pre-harvest flushing and the evidence is debated across
              the community.
            </p>
            <p className="mt-3">
              Some growers in coco coir, hydroponics, or mineral salt programs taper or flush late
              in flower to reduce root-zone build-up while the plant senesces, whereas living-soil
              and organic growers typically continue watering normally without leaching the medium.
              Rather than treating flushing as a universal rule, follow your nutrient line&apos;s
              official chart for late flower and log exactly what you did—dates, feed strength, and
              runoff notes—so you can compare results across grows. You can see how structured
              programs handle late-flower tapering in our{" "}
              <Link className="underline" to="/guides/athena-feed-chart-log">
                Athena feed chart log
              </Link>{" "}
              and our{" "}
              <Link className="underline" to="/guides/cronk-nutrients-grow-diary">
                Cronk Nutrients grow diary
              </Link>
              .
            </p>
          </section>

          <section id="harvest-day-basics" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Harvest day basics</h2>
            <p className="mt-2">
              When your logged trichome observations sit within your chosen target window across
              several bud sites, harvest day comes down to a few practical workflow choices. Grow
              guides (<GWE />, <WM />, <ZAM />) present these options as common grower choices
              shaped by your room climate and tent layout rather than a single verdict:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-6">
              <li>
                <strong>Time of day:</strong> Some growers prefer chopping right before lights-on at
                the end of the dark period, while others harvest whenever their schedule gives them
                unhurried time to work cleanly and label branches accurately.
              </li>
              <li>
                <strong>Fan leaves:</strong> Growers drying in lower-humidity spaces often leave
                more fan leaves attached to slow moisture loss, whereas growers in more humid rooms
                or with thick colas often strip large non-resinous fan leaves right away to improve
                airflow around the flowers.
              </li>
              <li>
                <strong>Hanging whole plants vs branches:</strong> Cutting at the base and hanging
                the whole plant upside down is a common choice to slow the dry when space allows;
                cutting the plant into individual branches is a common choice when hanging space is
                tight, colas are dense, or you are harvesting in stages.
              </li>
            </ul>
            <p className="mt-3">
              Keep the room in range while drying by monitoring room temperature in °F and relative
              humidity closely with gentle indirect air circulation that never blows straight onto
              hanging buds. Check our{" "}
              <Link className="underline" to="/vpd-chart">
                VPD chart
              </Link>{" "}
              to see how room temperature in °F and humidity interact across your space, and review
              our guide to{" "}
              <Link className="underline" to="/guides/bud-rot-prevention-identification">
                bud rot prevention
              </Link>{" "}
              so you know what to inspect inside thick flowers before and during the dry.
            </p>
          </section>

          <section id="keep-your-harvest-log-in-verdant" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Keep your harvest log in Verdant</h2>
            <p className="mt-2">
              Instead of losing loose harvest notes between runs, save your trichome checks inside
              Verdant Grow Diary next to your plant&apos;s watering, feeding, and °F environment
              history.
            </p>
            {cta("article")}
          </section>

          <section id="when-to-harvest-cannabis-faq" className={sectionClass}>
            <h2 className="text-2xl font-semibold">When to harvest cannabis FAQ</h2>
            {HARVEST_WINDOW_FAQ.map((entry) => (
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
                <Link className="underline" to="/guides/grow-stage-care-guide">
                  Grow stage care guide
                </Link>
              </li>
              <li>
                <Link className="underline" to="/guides/what-to-log-in-a-grow-journal">
                  What to log in a grow journal
                </Link>
              </li>
              <li>
                <Link className="underline" to="/guides/daily-grow-log-checklist">
                  Daily grow log checklist
                </Link>
              </li>
              <li>
                <Link className="underline" to="/guides/ai-grow-doctor">
                  AI grow doctor
                </Link>
              </li>
              <li>
                <Link className="underline" to="/vpd-chart">
                  VPD chart by growth stage
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
            {HARVEST_SOURCES.map((source) => (
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
