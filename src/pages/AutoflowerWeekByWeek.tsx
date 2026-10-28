import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@/lib/react-router-compat";

import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  trackAutoflowerPlannerEvent,
  type AutoflowerPlannerCtaLocation,
} from "@/lib/autoflowerWeekPlanAnalytics";
import {
  AUTOFLOWER_SHORT_ESTIMATE_MESSAGE,
  AUTOFLOWER_SOURCES,
  AUTOFLOWER_WEEK_PLAN_CTA_HREF,
  AUTOFLOWER_WEEK_PLAN_DESCRIPTION,
  AUTOFLOWER_WEEK_PLAN_FAQ,
  AUTOFLOWER_WEEK_PLAN_H1,
  AUTOFLOWER_WEEK_PLAN_PATH,
  AUTOFLOWER_WEEK_PLAN_TITLE,
  autoflowerPlanCsvFilename,
  buildAutoflowerPlanCsv,
  buildAutoflowerPlanTsv,
  computeMilestoneDifference,
  computePlanSchedule,
  countLoggedMilestones,
  createDefaultAutoflowerPlan,
  getDefaultStageOutline,
  getLightDisplayLabel,
  getPlannedMilestoneMeta,
  getStageForWeek,
  lookupCurrentWeekStatus,
  MILESTONE_DEFS,
  parseIsoDateUtc,
  plannedMilestoneStartIso,
  shouldEmitThrottled,
  STAGE_GUIDANCE,
  stagesFromOutline,
  validateStageWeeks,
  type AutoflowerPlanState,
  type LightCode,
  type MilestoneKey,
  type StageWeeks,
} from "@/lib/autoflowerWeekPlanRules";

const ILGM = AUTOFLOWER_SOURCES[0].url;
const SEEDSUPREME = AUTOFLOWER_SOURCES[1].url;
const AUTOSEEDS = AUTOFLOWER_SOURCES[2].url;

const inputClass =
  "mt-1 w-full min-w-0 rounded-md border border-emerald-900/20 bg-white px-2 py-1.5 text-sm text-emerald-950";
const buttonClass = "min-h-11 rounded-md border border-emerald-900/20 bg-white px-3 text-sm";
const sectionClass = "mt-8 max-w-3xl leading-7";
const tableWrapClass =
  "mt-4 max-w-full overflow-x-auto rounded-md border bg-white print:overflow-visible";
const cellClass = "border-b border-emerald-900/10 px-2 py-2 text-left align-top";

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="underline" href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

const IL = () => <Ext href={ILGM}>ILGM</Ext>;
const SS = () => <Ext href={SEEDSUPREME}>SeedSupreme</Ext>;
const AS = () => <Ext href={AUTOSEEDS}>Auto Seeds</Ext>;

/** The grower's local calendar date. Read in the component, never in rules. */
function todayLocalIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type StageKey = keyof StageWeeks;

const STAGE_FIELDS: { key: StageKey; title: string; label: string }[] = [
  { key: "seedling", title: "Seedling", label: "Seedling" },
  { key: "veg", title: "Veg", label: "Veg" },
  { key: "preflower", title: "Pre-flower", label: "Pre-flower" },
  { key: "flower", title: "Flower", label: "Flower" },
  { key: "ripening", title: "Ripening & harvest window", label: "Ripening" },
];

const LIGHT_OPTIONS: { code: LightCode; label: string }[] = [
  { code: "18_6", label: "18/6 (18 hours on, 6 off)" },
  { code: "20_4", label: "20/4 (20 hours on, 4 off)" },
  { code: "other", label: "Other (enter your own)" },
];

type StageDrafts = Record<StageKey, { start: string; end: string }> & { trichome: string };

function toDrafts(stages: StageWeeks, trichomeWeek: number): StageDrafts {
  const pair = (key: StageKey) => ({
    start: String(stages[key].start),
    end: String(stages[key].end),
  });
  return {
    seedling: pair("seedling"),
    veg: pair("veg"),
    preflower: pair("preflower"),
    flower: pair("flower"),
    ripening: pair("ripening"),
    trichome: String(trichomeWeek),
  };
}

function fromDrafts(drafts: StageDrafts): { stages: StageWeeks; trichomeWeek: number } {
  const pair = (key: StageKey) => ({
    start: Number(drafts[key].start),
    end: Number(drafts[key].end),
  });
  return {
    stages: {
      seedling: pair("seedling"),
      veg: pair("veg"),
      preflower: pair("preflower"),
      flower: pair("flower"),
      ripening: pair("ripening"),
    },
    trichomeWeek: Number(drafts.trichome),
  };
}

export default function AutoflowerWeekByWeek() {
  const [today, setToday] = useState("");
  const [plan, setPlan] = useState<AutoflowerPlanState>(() => createDefaultAutoflowerPlan(""));
  const [estimateDraft, setEstimateDraft] = useState("10");
  const [stageDrafts, setStageDrafts] = useState<StageDrafts>(() =>
    toDrafts(plan.stages, plan.trichomeWeek),
  );
  const [stageError, setStageError] = useState("");
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const lastGeneratedAt = useRef<number | null>(null);

  usePageSeo({
    title: `${AUTOFLOWER_WEEK_PLAN_TITLE} | Verdant Grow Diary`,
    description: AUTOFLOWER_WEEK_PLAN_DESCRIPTION,
    path: AUTOFLOWER_WEEK_PLAN_PATH,
  });

  useEffect(() => {
    const iso = todayLocalIso();
    setToday(iso);
    setPlan((current) => (current.sproutDate ? current : { ...current, sproutDate: iso }));
  }, []);

  const schedule = useMemo(
    () => computePlanSchedule(plan.sproutDate, plan.estimateWeeks),
    [plan.sproutDate, plan.estimateWeeks],
  );
  const milestoneMeta = useMemo(() => getPlannedMilestoneMeta(plan), [plan]);
  const lightLabel = getLightDisplayLabel(plan.lightCode, plan.lightCustomText);
  const current = today
    ? lookupCurrentWeekStatus(plan.sproutDate, today, plan.estimateWeeks, plan.stages)
    : null;
  const plantTitle = plan.plantName.trim();

  function announce(message: string) {
    setStatus("");
    window.setTimeout(() => setStatus(message), 20);
  }

  function trackGenerated(next: AutoflowerPlanState) {
    const now = performance.now();
    if (!shouldEmitThrottled(lastGeneratedAt.current, now)) return;
    lastGeneratedAt.current = now;
    trackAutoflowerPlannerEvent("autoflower_planner_generated", {
      estimate_weeks: next.estimateWeeks,
      light: next.lightCode,
    });
  }

  function updatePlan(partial: Partial<AutoflowerPlanState>, generated = false) {
    const next = { ...plan, ...partial };
    setPlan(next);
    if (generated) trackGenerated(next);
  }

  function changeSprout(value: string) {
    const trimmed = value.trim();
    if (trimmed && parseIsoDateUtc(trimmed) !== null) updatePlan({ sproutDate: trimmed }, true);
  }

  function changeEstimate(value: string) {
    setEstimateDraft(value);
    const raw = Number(value);
    if (!Number.isInteger(raw) || raw < 6 || raw > 16) return;
    const outline = getDefaultStageOutline(raw);
    const stages = stagesFromOutline(outline);
    setStageDrafts(toDrafts(stages, outline.trichomeWeek));
    setStageError("");
    updatePlan({ estimateWeeks: raw, stages, trichomeWeek: outline.trichomeWeek }, true);
  }

  function changeStageDraft(next: StageDrafts) {
    setStageDrafts(next);
    const candidate = fromDrafts(next);
    const check = validateStageWeeks(candidate.stages, plan.estimateWeeks, candidate.trichomeWeek);
    if (!check.valid) {
      setStageError(check.error);
      return;
    }
    setStageError("");
    updatePlan(candidate);
    trackAutoflowerPlannerEvent("autoflower_planner_stage_edited", {});
  }

  function changeMilestone(key: MilestoneKey, partial: { actualDate?: string; note?: string }) {
    const milestones = {
      ...plan.milestones,
      [key]: { ...plan.milestones[key], ...partial },
    };
    updatePlan({ milestones });
    if (partial.actualDate !== undefined) {
      trackAutoflowerPlannerEvent("autoflower_planner_milestone_logged", {
        milestone_count: countLoggedMilestones({ milestones }),
      });
    }
  }

  function downloadCsv() {
    const filename = autoflowerPlanCsvFilename(todayLocalIso());
    let url: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      const blob = new Blob([buildAutoflowerPlanCsv(plan)], { type: "text/csv;charset=utf-8" });
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
    announce(`Exported ${plan.estimateWeeks}-week autoflower plan to ${filename}.`);
    trackAutoflowerPlannerEvent("autoflower_planner_export_csv", {
      week_count: plan.estimateWeeks,
    });
  }

  async function copyPlan() {
    const tsv = buildAutoflowerPlanTsv(plan);
    trackAutoflowerPlannerEvent("autoflower_planner_copy", { week_count: plan.estimateWeeks });
    try {
      await navigator.clipboard.writeText(tsv);
      setCopyFallback(null);
      announce(`Copied ${plan.estimateWeeks}-week autoflower plan and milestones to clipboard.`);
    } catch {
      setCopyFallback(tsv);
      announce("Clipboard unavailable. Select and copy the tab-separated plan shown below.");
    }
  }

  function printPlan() {
    announce("Opening print dialog for your autoflower week-by-week plan.");
    trackAutoflowerPlannerEvent("autoflower_planner_print", {});
    window.print();
  }

  function clearPlan() {
    const reset = createDefaultAutoflowerPlan(todayLocalIso());
    setPlan(reset);
    setEstimateDraft("10");
    setStageDrafts(toDrafts(reset.stages, reset.trichomeWeek));
    setStageError("");
    setCopyFallback(null);
    setConfirmClear(false);
    announce("Reset autoflower planner to defaults.");
    trackAutoflowerPlannerEvent("autoflower_planner_clear", {});
  }

  const cta = (location: AutoflowerPlannerCtaLocation) => (
    <div className="mt-4 rounded-lg border border-emerald-900/15 bg-emerald-50 p-4 print:hidden">
      <Link
        className="inline-flex min-h-11 items-center rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
        to={AUTOFLOWER_WEEK_PLAN_CTA_HREF}
        data-cta-location={location}
        onClick={() =>
          trackAutoflowerPlannerEvent("autoflower_planner_cta_click", { cta_location: location })
        }
      >
        Keep this log in Verdant →
      </Link>
      <p className="mt-2 text-sm">
        Free to start. Track your autoflower&apos;s real timeline, feeds, climate and photos in one
        place.
      </p>
    </div>
  );

  return (
    <div
      data-testid="autoflower-week-page"
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
              <li aria-current="page">Autoflower Week by Week</li>
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
          {AUTOFLOWER_WEEK_PLAN_H1}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7">
          Every autoflower runs on its own clock. Put in your sprout date and your breeder&apos;s
          estimate, and get a week-by-week plan you can check off and compare against what actually
          happens.
        </p>

        <section id="quick-answer" className="mt-6 max-w-3xl print:hidden">
          <h2 className="text-2xl font-semibold">Quick answer</h2>
          <div className="mt-2 rounded-xl bg-white p-4 shadow-sm">
            <p className="leading-7">
              Autoflowers move from seedling to harvest on their own clock, without a light change.
              Grow guides most often describe running 18/6 or 20/4 the whole way. Expect the first
              pistils a few weeks after sprout, then follow your nutrient brand&apos;s autoflower
              chart and confirm harvest by checking trichomes, not the calendar.
            </p>
          </div>
        </section>

        <section id="autoflower-week-by-week-planner" className="mt-8">
          <h2 className="text-2xl font-semibold">Autoflower Week-by-Week Planner</h2>
          <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
            <p className="rounded-md bg-amber-50 p-3 text-sm print:hidden" role="note">
              Nothing is saved in your browser. Download CSV or copy your plan before leaving this
              page.
            </p>

            <div className="mt-4 print:hidden">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="min-w-0">
                  <label htmlFor="input-sprout-date" className="text-sm">
                    Sprout date
                  </label>
                  <input
                    id="input-sprout-date"
                    type="date"
                    required
                    className={inputClass}
                    value={plan.sproutDate}
                    onChange={(event) => changeSprout(event.target.value)}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="input-estimate-weeks" className="text-sm">
                    Breeder&apos;s estimated seed-to-harvest time (weeks)
                  </label>
                  <input
                    id="input-estimate-weeks"
                    type="number"
                    min={6}
                    max={16}
                    step={1}
                    required
                    className={inputClass}
                    value={estimateDraft}
                    onChange={(event) => changeEstimate(event.target.value)}
                  />
                  <p className="mt-1 text-xs">
                    Use the number on your seed pack or breeder&apos;s page.
                  </p>
                </div>
                <div className="min-w-0">
                  <label htmlFor="input-plant-name" className="text-sm">
                    Plant name (optional)
                  </label>
                  <input
                    id="input-plant-name"
                    type="text"
                    placeholder="e.g., Auto #1"
                    className={inputClass}
                    value={plan.plantName}
                    onChange={(event) => updatePlan({ plantName: event.target.value })}
                  />
                </div>
              </div>

              <fieldset className="mt-4 min-w-0">
                <legend className="font-semibold">Light schedule</legend>
                <div className="mt-2 grid gap-1">
                  {LIGHT_OPTIONS.map((option) => (
                    <label key={option.code} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="lightSchedule"
                        value={option.code}
                        checked={plan.lightCode === option.code}
                        onChange={() => updatePlan({ lightCode: option.code }, true)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {plan.lightCode === "other" ? (
                  <div className="mt-2 max-w-sm">
                    <label htmlFor="input-light-custom" className="text-sm">
                      Custom light schedule
                    </label>
                    <input
                      id="input-light-custom"
                      type="text"
                      className={inputClass}
                      value={plan.lightCustomText}
                      onChange={(event) => updatePlan({ lightCustomText: event.target.value })}
                    />
                  </div>
                ) : null}
                <p className="mt-2 text-sm leading-6">
                  Autoflowers don&apos;t need a light change to start flowering. Grow guides most
                  often describe 18/6 or 20/4 from seed to harvest. Pick one and keep it consistent.
                </p>
              </fieldset>

              <fieldset className="mt-4 min-w-0">
                <legend className="font-semibold">Stage weeks editor</legend>
                <p className="mt-1 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs">
                  Default outline based on common grow-guide descriptions. Edit the weeks to match
                  your breeder.
                </p>
                {plan.estimateWeeks < 8 ? (
                  <p role="status" className="mt-2 rounded-md bg-amber-50 p-3 text-sm">
                    {AUTOFLOWER_SHORT_ESTIMATE_MESSAGE}
                  </p>
                ) : null}
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {STAGE_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      className="min-w-0 rounded-lg border border-emerald-900/15 p-3"
                    >
                      <p className="text-sm font-semibold">{field.title}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {(["start", "end"] as const).map((edge) => {
                          const id = `stage-${field.key}-${edge}`;
                          return (
                            <div key={id} className="min-w-0">
                              <label htmlFor={id} className="text-xs">
                                {field.label} {edge} wk
                              </label>
                              <input
                                id={id}
                                type="number"
                                min={1}
                                max={16}
                                step={1}
                                className={inputClass}
                                value={stageDrafts[field.key][edge]}
                                onChange={(event) =>
                                  changeStageDraft({
                                    ...stageDrafts,
                                    [field.key]: {
                                      ...stageDrafts[field.key],
                                      [edge]: event.target.value,
                                    },
                                  })
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="min-w-0 rounded-lg border border-emerald-900/15 p-3">
                    <p className="text-sm font-semibold">Planning reminder</p>
                    <label htmlFor="stage-trichome-week" className="mt-2 block text-xs">
                      Start checking trichomes (wk)
                    </label>
                    <input
                      id="stage-trichome-week"
                      type="number"
                      min={1}
                      max={16}
                      step={1}
                      className={inputClass}
                      value={stageDrafts.trichome}
                      onChange={(event) =>
                        changeStageDraft({ ...stageDrafts, trichome: event.target.value })
                      }
                    />
                  </div>
                </div>
                {stageError ? (
                  <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-900">
                    {stageError}
                  </p>
                ) : null}
              </fieldset>
            </div>

            <div className="mt-6" aria-live="polite">
              <h3 className="text-lg font-semibold">Autoflower schedule summary</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-emerald-900/15 p-3">
                  <p className="text-xs">Estimated finish date (end of week E)</p>
                  <p className="mt-1 font-semibold">{schedule.estimatedFinish || "—"}</p>
                </div>
                <div className="rounded-lg border border-emerald-900/15 p-3">
                  <p className="text-xs">Current week &amp; stage for today</p>
                  <p className="mt-1 font-semibold">{current?.status ?? "—"}</p>
                </div>
                <div className="rounded-lg border border-emerald-900/15 p-3">
                  <p className="text-xs">Milestones logged</p>
                  <p className="mt-1 font-semibold">{countLoggedMilestones(plan)} of 5</p>
                </div>
              </div>
            </div>

            <p className="sr-only print:hidden" aria-live="polite">
              {status}
            </p>

            <div
              className={tableWrapClass}
              tabIndex={0}
              role="region"
              aria-label="Week-by-week plan table"
            >
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <caption className="p-2 text-left">
                  {plantTitle
                    ? `Week-by-week autoflower schedule for ${plantTitle}`
                    : "Week-by-week autoflower schedule"}
                </caption>
                <thead>
                  <tr>
                    {["Week", "Dates", "Stage", "Light", "What to check and log", "Done"].map(
                      (header) => (
                        <th key={header} scope="col" className={cellClass}>
                          {header}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {schedule.weeks.map((week) => {
                    const stage = getStageForWeek(week.week, plan.stages);
                    const isTrichome = week.week === plan.trichomeWeek;
                    return (
                      <tr key={week.week} className={isTrichome ? "bg-amber-50" : undefined}>
                        <th scope="row" className={`${cellClass} whitespace-nowrap`}>
                          Week {week.week}
                        </th>
                        <td className={cellClass}>
                          {week.labelRange} ({week.startIso} to {week.endIso})
                        </td>
                        <td className={cellClass}>{stage}</td>
                        <td className={cellClass}>{lightLabel}</td>
                        <td className={cellClass}>
                          <div>{STAGE_GUIDANCE[stage]}</div>
                          {isTrichome ? (
                            <div className="mt-1 font-medium">
                              <span>Milestone reminder: </span>
                              <Link
                                className="underline"
                                to="/guides/when-to-harvest-cannabis"
                                data-trichome-link="true"
                                onClick={() =>
                                  trackAutoflowerPlannerEvent(
                                    "autoflower_planner_trichome_link_click",
                                    {},
                                  )
                                }
                              >
                                Start checking trichomes
                              </Link>
                            </div>
                          ) : null}
                        </td>
                        <td className={cellClass}>
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            aria-label={`Week ${week.week} done`}
                            checked={Boolean(plan.doneWeeks[week.week])}
                            onChange={(event) =>
                              updatePlan({
                                doneWeeks: { ...plan.doneWeeks, [week.week]: event.target.checked },
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              className={tableWrapClass}
              tabIndex={0}
              role="region"
              aria-label="Milestone log table"
            >
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <caption className="p-2 text-left">
                  Planned vs. actual autoflower milestone log
                </caption>
                <thead>
                  <tr>
                    {["Milestone", "Planned", "Actual date", "Difference", "Note"].map((header) => (
                      <th key={header} scope="col" className={cellClass}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MILESTONE_DEFS.map((def) => {
                    const meta = milestoneMeta[def.key];
                    const entry = plan.milestones[def.key];
                    return (
                      <tr key={def.key}>
                        <th scope="row" className={cellClass}>
                          {def.label}
                        </th>
                        <td className={cellClass}>
                          {meta.weekLabel} (starts{" "}
                          {plannedMilestoneStartIso(plan.sproutDate, meta.startWeek)})
                        </td>
                        <td className={cellClass}>
                          <label htmlFor={`milestone-date-${def.key}`} className="block text-xs">
                            Actual date for {def.label}
                          </label>
                          <input
                            id={`milestone-date-${def.key}`}
                            type="date"
                            className={inputClass}
                            value={entry.actualDate}
                            onChange={(event) =>
                              changeMilestone(def.key, { actualDate: event.target.value.trim() })
                            }
                          />
                        </td>
                        <td className={`${cellClass} font-bold`}>
                          {computeMilestoneDifference(
                            plan.sproutDate,
                            meta.startWeek,
                            entry.actualDate,
                          )}
                        </td>
                        <td className={cellClass}>
                          <label htmlFor={`milestone-note-${def.key}`} className="block text-xs">
                            Note for {def.label}
                          </label>
                          <input
                            id={`milestone-note-${def.key}`}
                            type="text"
                            className={inputClass}
                            value={entry.note}
                            onChange={(event) =>
                              changeMilestone(def.key, { note: event.target.value })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 print:hidden">
              <button type="button" className={buttonClass} onClick={downloadCsv}>
                Download CSV
              </button>
              <button type="button" className={buttonClass} onClick={() => void copyPlan()}>
                Copy plan
              </button>
              <button type="button" className={buttonClass} onClick={printPlan}>
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
                aria-label="Confirm clearing planner"
              >
                <span>
                  Reset your autoflower week-by-week plan, stage edits, and logged milestone dates?
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${buttonClass} border-red-300 text-red-900`}
                    onClick={clearPlan}
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
                  Clipboard access was unavailable. Select and copy your tab-separated plan below:
                </label>
                <textarea
                  id="copy-fallback-textarea"
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

        <div className="print:hidden">
          <section id="autoflower-stages-week-by-week" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Autoflower stages, week by week</h2>
            <p className="mt-2">
              Following an <strong>autoflower week by week</strong> outline is much easier when you
              treat stage lengths relative to your seed pack&apos;s total timeline rather than
              assuming every cultivar follows the exact same calendar. Cultivation guides from{" "}
              <IL />, <SS />, and <AS /> describe five broad stages in the autoflower life cycle.
              Use the planner above to map these stages onto your own sprout date and adjust the
              week ranges to match your breeder&apos;s description.
            </p>
            <h3 className="mt-6 text-xl font-semibold">Seedling</h3>
            <p className="mt-2">
              Once your germinated seed breaks the surface and opens its rounded cotyledons, the
              seedling focuses on establishing a taproot and unfolding its first serrated true
              leaves (<IL />, <AS />
              ). Because autoflowers have a limited vegetative window before flowering begins on its
              own internal clock, grow guides commonly advise starting seeds directly in their final
              airy pot or transplanting very early so root establishment continues smoothly. During
              the seedling stage, watch for steady leaf expansion and log your sprout date, the date
              the first true leaves appear, small waterings around the base, and your tent&apos;s
              temperature in °F and relative humidity.
            </p>
            <h3 className="mt-6 text-xl font-semibold">Veg</h3>
            <p className="mt-2">
              As the seedling establishes several nodes of fan leaves, the plant enters vegetative
              growth and speeds up stem, root, and foliage development (<SS />, <IL />
              ). If you plan to use gentle low-stress training to open the canopy, grow guides note
              that early vegetative growth—while stems are still pliable—is the window growers use.
              In your diary each veg week, log new node counts, canopy height, watering frequency,
              your planned versus actual feeding from your nutrient brand&apos;s autoflower chart,
              and any training notes alongside room °F and humidity.
            </p>
            <h3 className="mt-6 text-xl font-semibold">Pre-flower</h3>
            <p className="mt-2">
              Pre-flower is the bridge between vegetative leafy growth and full bloom. Grow guides (
              <AS />, <SS />) describe two hallmark signs during pre-flower: the first fine white
              pistils emerging where upper branches meet the main stem, and the start of the
              flowering stretch as internodes lengthen rapidly. Watch the top nodes closely, log the
              exact date you spot the first pistils, and note how much vertical height the plant
              gains so you can keep your grow light at an appropriate hanging distance.
            </p>
            <h3 className="mt-6 text-xl font-semibold">Flower</h3>
            <p className="mt-2">
              Once vertical stretch slows down, the autoflower puts its energy into stacking bud
              sites, swelling calyxes, and producing trichome resin across the flowers (<IL />,{" "}
              <SS />
              ). Dense foliage and heavier transpiration can raise tent humidity during mid and late
              bloom, so keeping airflow moving through the canopy and logging your climate in °F and
              RH is especially helpful. Each flower week, log your feeding against your brand&apos;s
              autoflower chart, note when upward stretch slows, and record bud development notes and
              photos.
            </p>
            <h3 className="mt-6 text-xl font-semibold">Ripening &amp; harvest</h3>
            <p className="mt-2">
              In the final weeks of the <strong>autoflower grow schedule</strong>, fan leaves often
              fade naturally as buds finish swelling, pistils darken and curl inward, and trichome
              heads transition from clear to cloudy and amber (<AS />, <IL />
              ). Use the planner&apos;s trichome reminder week to begin inspecting several bud sites
              with a loupe every few days and logging when you spot the first amber trichomes and
              when you harvest.
            </p>
          </section>

          <section id="when-do-autoflowers-start-flowering" className={sectionClass}>
            <h2 className="text-2xl font-semibold">When do autoflowers start flowering?</h2>
            <p className="mt-2">
              One of the most common questions new growers ask is{" "}
              <strong>when do autoflowers start flowering</strong>. Unlike photoperiod cultivars
              that wait for a timer switch to twelve hours of darkness, autoflowers contain{" "}
              <em>Cannabis ruderalis</em> lineage and transition into bloom based on age. Grow
              guides (<IL />, <SS />, <AS />) commonly describe autoflowers showing their first
              wispy white pistils at the upper stem nodes a few weeks after sprouting.
            </p>
            <p className="mt-3">
              The exact week depends heavily on genetics, container size, root-zone conditions, and
              tent temperatures in °F. Fast-finishing compact cultivars may show pre-flower pistils
              earlier than tall, longer-running sativa-leaning autoflowers. Even two seeds from the
              same pack planted on the same morning can show their first pistils several days apart.
              Because that transition sets the pace for the rest of bloom, log the actual date you
              first see pistils at the top nodes in the milestone table above and compare it against
              your planned pre-flower week.
            </p>
          </section>

          <section id="autoflower-light-schedule" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Autoflower light schedule: 18/6 vs 20/4</h2>
            <p className="mt-2">
              Because autoflowers do not rely on long dark periods to initiate or maintain
              flowering, you can run a single <strong>autoflower light schedule</strong> from the
              day the seedling sprouts until harvest day. Across cultivation guides from <IL />,{" "}
              <SS />, and <AS />, the two schedules described most often are{" "}
              <strong>18/6 (18 hours on, 6 off)</strong> and{" "}
              <strong>20/4 (20 hours on, 4 off)</strong>, with some growers choosing other custom
              schedules depending on their tent climate.
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-6">
              <li>
                <strong>18/6 (18 hours on, 6 off):</strong> Grow guides describe 18/6 as a widely
                used schedule that gives plants eighteen hours of daily light alongside a six-hour
                dark rest period. Guides note that the six-hour lights-off window can help manage
                electricity usage and give tents in warmer rooms a break from daytime heat in °F.
              </li>
              <li>
                <strong>20/4 (20 hours on, 4 off):</strong> Grow guides describe 20/4 as another
                popular option that provides twenty hours of daily light with a shorter four-hour
                dark window. Guides note that a shorter dark period can help keep tent temperatures
                in °F from dropping as much in cool basements or winter rooms.
              </li>
            </ul>
            <p className="mt-3">
              Grow guides do not establish that one schedule universally outperforms the other
              across all setups; what matters most is picking the option that keeps your tent&apos;s
              °F temperature and humidity stable and keeping that timer consistent throughout the
              grow. For help balancing fixture hanging height with daily light hours, see our guide
              on{" "}
              <Link className="underline" to="/guides/cannabis-grow-light-distance-and-schedule">
                grow light distance and schedule
              </Link>
              , and check our{" "}
              <Link className="underline" to="/vpd-chart">
                VPD chart
              </Link>{" "}
              to keep your room climate in range during both lights-on and lights-off hours.
            </p>
          </section>

          <section id="autoflower-feeding-schedule" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Autoflower feeding schedule</h2>
            <p className="mt-2">
              When planning an <strong>autoflower feeding schedule</strong>, grow guides (<IL />,{" "}
              <SS />, <AS />) emphasize that autoflowers move through their stages briskly and often
              have smaller root systems than long-veg photoperiod plants, and pre-fertilized soils
              can already carry nutrients for the early weeks. Because every nutrient line is
              formulated differently and every medium holds nutrients differently, Verdant never
              invents generic feeding doses.
            </p>
            <p className="mt-3">
              Always follow your nutrient brand&apos;s official autoflower chart and log what you
              planned to feed alongside what you actually fed each week. If you run a mineral or
              two-part program, see how growers record their weekly chart in our{" "}
              <Link className="underline" to="/guides/athena-feed-chart-log">
                Athena feed chart log
              </Link>{" "}
              and our{" "}
              <Link className="underline" to="/guides/cronk-nutrients-grow-diary">
                Cronk Nutrients grow diary
              </Link>
              —for example, Cronk&apos;s Bonnie &amp; Clyde is its 2-part autoflower line. Logging
              your planned chart week next to your plant&apos;s actual stage and leaf response lets
              you adjust smoothly when your autoflower flowers a week earlier or later than the
              printed schedule.
            </p>
          </section>

          <section id="how-long-do-autoflowers-take" className={sectionClass}>
            <h2 className="text-2xl font-semibold">How long do autoflowers take?</h2>
            <p className="mt-2">
              When growers ask <strong>how long do autoflowers take</strong> from seed to harvest,
              the number printed on the seed packet is the best starting point for building your
              calendar plan (<IL />, <AS />
              ). Breeders estimate total weeks under their own test environment, container volume,
              and lighting setup.
            </p>
            <p className="mt-3">
              In a home grow tent, autoflowers commonly finish a little earlier or a week or two
              later than the breeder&apos;s estimate depending on phenotype, pot size, watering
              habits, and canopy temperature in °F (<SS />
              ). Treat the breeder&apos;s week count as your planning horizon rather than a fixed
              chop date, and always confirm readiness by inspecting the trichomes on the buds over
              several days. Use our{" "}
              <Link className="underline" to="/guides/when-to-harvest-cannabis">
                when to harvest cannabis
              </Link>{" "}
              guide and trichome tracker when your planner reaches its trichome check milestone.
            </p>
          </section>

          <section id="why-is-my-autoflower-so-small" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Why is my autoflower so small?</h2>
            <p className="mt-2">
              Because an autoflower starts flowering on an internal schedule whether it has grown
              tall or stayed compact, anything that slows growth during the first few weeks can
              result in a smaller finished plant. Cultivation guides (<IL />, <SS />, <AS />) list
              several common factors worth tracking in your grow journal:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-6">
              <li>
                <strong>Early root or watering stress:</strong> Overwatering a tiny seedling in a
                large saturated pot or letting a young root zone get too cold in °F can pause early
                leaf expansion during the brief veg window.
              </li>
              <li>
                <strong>Container changes and transplant timing:</strong> Waiting too long to repot
                a root-bound seedling or disturbing roots right as pre-flower begins can stall
                vegetative momentum.
              </li>
              <li>
                <strong>Light distance and intensity:</strong> Hanging a fixture too far away can
                cause weak, stretchy stems, while placing intense light too close to a young plant
                can keep internodes tightly compressed.
              </li>
              <li>
                <strong>Genetics and phenotype:</strong> Some autoflower lines are bred specifically
                to stay short and compact for small tents, while others naturally stretch much
                taller.
              </li>
            </ul>
            <p className="mt-3">
              Rather than guessing from a single snapshot, log your watering volumes, container
              size, light height, and °F/RH readings week by week so you can see what happened
              during the first month. If you want a cautious second look at your logged observations
              and plant photos, visit our{" "}
              <Link className="underline" to="/guides/ai-grow-doctor">
                AI grow doctor
              </Link>{" "}
              guide.
            </p>
          </section>

          <section id="keep-your-autoflower-log-in-verdant" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Keep your autoflower log in Verdant</h2>
            <p className="mt-2">
              Download or copy your week-by-week plan above, then bring your autoflower schedule
              into Verdant Grow Diary so your planned weeks sit right next to your daily Quick Logs,
              feed records, °F climate snapshots, and plant photos.
            </p>
            {cta("article")}
          </section>

          <section id="autoflower-week-by-week-faq" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Autoflower week by week FAQ</h2>
            {AUTOFLOWER_WEEK_PLAN_FAQ.map((entry) => (
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
                <Link className="underline" to="/guides/when-to-harvest-cannabis">
                  When to harvest cannabis
                </Link>
              </li>
              <li>
                <Link className="underline" to="/guides/grow-stage-care-guide">
                  Grow stage care guide
                </Link>
              </li>
              <li>
                <Link className="underline" to="/guides/athena-feed-chart-log">
                  Athena feed chart log
                </Link>
              </li>
              <li>
                <Link className="underline" to="/guides/cronk-nutrients-grow-diary">
                  Cronk Nutrients grow diary
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
        className="border-t border-emerald-900/10 bg-white px-4 py-8 print:hidden"
      >
        <div className="mx-auto max-w-5xl">
          <h2 className="text-lg font-semibold">Sources</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {AUTOFLOWER_SOURCES.map((source) => (
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
