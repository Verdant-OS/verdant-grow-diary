import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@/lib/react-router-compat";

import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  trackFloweringPlannerEvent,
  type FloweringPlannerCtaLocation,
  type FloweringPlannerPlantType,
} from "@/lib/floweringWeekPlanAnalytics";
import {
  addFloweringDays,
  buildFloweringPlanCsv,
  buildFloweringPlanTsv,
  computeFloweringMilestoneDifference,
  computeFloweringSchedule,
  computeFloweringStretchSummary,
  countLoggedFloweringMilestones,
  createDefaultFloweringPlan,
  FLOWERING_EVENT_DEBOUNCE_MS,
  FLOWERING_MILESTONE_DEFS,
  FLOWERING_PLAN_CTA_HREF,
  FLOWERING_PLAN_DESCRIPTION,
  FLOWERING_PLAN_FAQ,
  FLOWERING_PLAN_H1,
  FLOWERING_PLAN_PATH,
  FLOWERING_PLAN_TITLE,
  FLOWERING_QUICK_ANSWER,
  FLOWERING_SHORT_MESSAGE,
  FLOWERING_SOURCE_URLS,
  FLOWERING_SOURCES,
  FLOWERING_STAGE_GUIDANCE,
  floweringLocalIsoDate,
  floweringPlanCsvFilename,
  floweringStageForWeek,
  getDefaultFloweringOutline,
  getPlannedFloweringMilestones,
  lookupFloweringCurrentWeek,
  parseFloweringIsoDate,
  validateFloweringStages,
  type FloweringMilestoneKey,
  type FloweringPlanState,
  type FloweringStages,
} from "@/lib/floweringWeekPlanRules";

const SRC = FLOWERING_SOURCE_URLS;

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

const GWE = () => <Ext href={SRC.growWeedEasy}>Grow Weed Easy</Ext>;
const BT = () => <Ext href={SRC.budTrainer}>BudTrainer</Ext>;
const RQS = () => <Ext href={SRC.royalQueen}>Royal Queen Seeds</Ext>;
const ATH = () => <Ext href={SRC.athena}>Athena Ag</Ext>;
const SENSI = () => <Ext href={SRC.sensi}>Sensi Seeds</Ext>;

type StageKey = keyof FloweringStages;

const STAGE_FIELDS: { key: StageKey; title: string; label: string }[] = [
  { key: "transition", title: "Transition & stretch", label: "Transition" },
  { key: "budset", title: "Bud set", label: "Bud set" },
  { key: "bulking", title: "Bulking", label: "Bulking" },
  { key: "ripening", title: "Ripening", label: "Ripening" },
];

type StageDrafts = Record<StageKey, { start: string; end: string }> & { trichome: string };

function toDrafts(stages: FloweringStages, trichomeWeek: number): StageDrafts {
  const pair = (key: StageKey) => ({
    start: String(stages[key].start),
    end: String(stages[key].end),
  });
  return {
    transition: pair("transition"),
    budset: pair("budset"),
    bulking: pair("bulking"),
    ripening: pair("ripening"),
    trichome: String(trichomeWeek),
  };
}

function fromDrafts(drafts: StageDrafts): { stages: FloweringStages; trichomeWeek: number } {
  const pair = (key: StageKey) => ({
    start: Number(drafts[key].start),
    end: Number(drafts[key].end),
  });
  return {
    stages: {
      transition: pair("transition"),
      budset: pair("budset"),
      bulking: pair("bulking"),
      ripening: pair("ripening"),
    },
    trichomeWeek: Number(drafts.trichome),
  };
}

const OUTLINE_ROWS = [
  {
    stage: "Transition & stretch",
    weeks: "Weeks 1–3",
    watch:
      "New growth after the flip, first white pistils at the top nodes, the plant getting taller",
    log: "Flip date, height at flip, date of first pistils",
  },
  {
    stage: "Bud set",
    weeks: "Weeks 4–5",
    watch: "Stretch slowing, bud sites forming along the colas",
    log: "Height when stretch slows, bud-site photos",
  },
  {
    stage: "Bulking",
    weeks: "Weeks 6–7",
    watch: "Buds fattening, stronger smell, more visible resin",
    log: "Feeding vs your chart, climate, weekly photos",
  },
  {
    stage: "Ripening",
    weeks: "Weeks 8–9",
    watch: "Pistils darkening and curling in, trichomes turning cloudy then amber",
    log: "Trichome checks every few days, harvest date",
  },
] as const;

export default function CannabisFloweringStagesWeekByWeek() {
  const [today, setToday] = useState("");
  const [plantType, setPlantType] = useState<FloweringPlannerPlantType>("photoperiod");
  const [plan, setPlan] = useState<FloweringPlanState>(() => createDefaultFloweringPlan(""));
  const [weeksDraft, setWeeksDraft] = useState("9");
  const [stageDrafts, setStageDrafts] = useState<StageDrafts>(() =>
    toDrafts(plan.stages, plan.trichomeWeek),
  );
  const [stageError, setStageError] = useState("");
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const generatedTimer = useRef<number | null>(null);
  const stageEditedTimer = useRef<number | null>(null);

  usePageSeo({
    title: `${FLOWERING_PLAN_TITLE} | Verdant Grow Diary`,
    description: FLOWERING_PLAN_DESCRIPTION,
    path: FLOWERING_PLAN_PATH,
  });

  useEffect(() => {
    const iso = floweringLocalIsoDate(new Date());
    setToday(iso);
    setPlan((current) => (current.flipDate ? current : { ...current, flipDate: iso }));
  }, []);

  useEffect(
    () => () => {
      if (generatedTimer.current !== null) window.clearTimeout(generatedTimer.current);
      if (stageEditedTimer.current !== null) window.clearTimeout(stageEditedTimer.current);
    },
    [],
  );

  const schedule = useMemo(
    () => computeFloweringSchedule(plan.flipDate, plan.flowerWeeks),
    [plan.flipDate, plan.flowerWeeks],
  );
  const planned = useMemo(
    () => getPlannedFloweringMilestones(plan.stages, plan.trichomeWeek, plan.flowerWeeks),
    [plan.stages, plan.trichomeWeek, plan.flowerWeeks],
  );
  const current = today
    ? lookupFloweringCurrentWeek(plan.flipDate, today, plan.flowerWeeks, plan.stages)
    : null;
  const stretch = computeFloweringStretchSummary(plan.flipHeight, plan.stretchSlowsHeight);
  const plantTitle = plan.plantName.trim();

  function announce(message: string) {
    setStatus("");
    window.setTimeout(() => setStatus(message), 20);
  }

  /** Trailing 2 s debounce, as in the source: one event after the grower stops editing. */
  function debounceEvent(timer: { current: number | null }, fire: () => void) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      fire();
    }, FLOWERING_EVENT_DEBOUNCE_MS);
  }

  function scheduleGenerated(flowerWeeks: number) {
    debounceEvent(generatedTimer, () =>
      trackFloweringPlannerEvent("flowering_planner_generated", { flower_weeks: flowerWeeks }),
    );
  }

  function updatePlan(partial: Partial<FloweringPlanState>) {
    setPlan((currentPlan) => ({ ...currentPlan, ...partial }));
    setCopyFallback(null);
  }

  function changePlantType(next: FloweringPlannerPlantType) {
    setPlantType(next);
    trackFloweringPlannerEvent("flowering_planner_plant_type", { type: next });
  }

  function changeFlip(value: string) {
    const trimmed = value.trim();
    if (!trimmed || parseFloweringIsoDate(trimmed) === null) return;
    updatePlan({ flipDate: trimmed });
    scheduleGenerated(plan.flowerWeeks);
  }

  function changeWeeks(value: string) {
    setWeeksDraft(value);
    const raw = Number(value);
    if (!Number.isInteger(raw) || raw < 6 || raw > 16) return;
    const outline = getDefaultFloweringOutline(raw);
    setStageDrafts(toDrafts(outline.stages, outline.trichomeWeek));
    setStageError("");
    updatePlan({
      flowerWeeks: outline.flowerWeeks,
      stages: outline.stages,
      trichomeWeek: outline.trichomeWeek,
    });
    scheduleGenerated(outline.flowerWeeks);
  }

  function changeStageDraft(next: StageDrafts) {
    setStageDrafts(next);
    const candidate = fromDrafts(next);
    const check = validateFloweringStages(
      candidate.stages,
      plan.flowerWeeks,
      candidate.trichomeWeek,
    );
    if (!check.valid) {
      setStageError(check.error);
      return;
    }
    setStageError("");
    updatePlan(candidate);
    debounceEvent(stageEditedTimer, () =>
      trackFloweringPlannerEvent("flowering_planner_stage_edited", {}),
    );
  }

  function changeMilestone(
    key: FloweringMilestoneKey,
    partial: { actualDate?: string; note?: string },
  ) {
    const milestones = { ...plan.milestones, [key]: { ...plan.milestones[key], ...partial } };
    updatePlan({ milestones });
    if (partial.actualDate !== undefined) {
      trackFloweringPlannerEvent("flowering_planner_milestone_logged", {
        milestone_count: countLoggedFloweringMilestones(milestones),
      });
    }
  }

  function downloadCsv() {
    const filename = floweringPlanCsvFilename(floweringLocalIsoDate(new Date()));
    let url: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      const blob = new Blob([buildFloweringPlanCsv(plan)], { type: "text/csv;charset=utf-8" });
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
    announce(`Exported ${plan.flowerWeeks}-week flowering plan to ${filename}.`);
    trackFloweringPlannerEvent("flowering_planner_export_csv", { week_count: plan.flowerWeeks });
  }

  async function copyPlan() {
    const tsv = buildFloweringPlanTsv(plan);
    trackFloweringPlannerEvent("flowering_planner_copy", { week_count: plan.flowerWeeks });
    try {
      await navigator.clipboard.writeText(tsv);
      setCopyFallback(null);
      announce(`Copied ${plan.flowerWeeks}-week flowering plan and milestones to clipboard.`);
    } catch {
      setCopyFallback(tsv);
      announce(
        "Clipboard unavailable. Select and copy the tab-separated flowering plan shown below.",
      );
    }
  }

  function printPlan() {
    announce("Opening print dialog for your flowering week-by-week plan.");
    trackFloweringPlannerEvent("flowering_planner_print", {});
    window.setTimeout(() => window.print(), 30);
  }

  function clearPlan() {
    const reset = createDefaultFloweringPlan(today || floweringLocalIsoDate(new Date()));
    setPlan(reset);
    setWeeksDraft(String(reset.flowerWeeks));
    setStageDrafts(toDrafts(reset.stages, reset.trichomeWeek));
    setStageError("");
    setCopyFallback(null);
    setConfirmClear(false);
    announce("Reset flowering planner to defaults.");
    trackFloweringPlannerEvent("flowering_planner_clear", {});
  }

  const cta = (location: FloweringPlannerCtaLocation) => (
    <div className="mt-4 rounded-lg border border-emerald-900/15 bg-emerald-50 p-4 print:hidden">
      <Link
        className="inline-flex min-h-11 items-center rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
        to={FLOWERING_PLAN_CTA_HREF}
        data-cta-location={location}
        onClick={() =>
          trackFloweringPlannerEvent("flowering_planner_cta_click", { cta_location: location })
        }
      >
        Keep this log in Verdant →
      </Link>
      <p className="mt-2 text-sm">
        Free to start. Track your flower week by week with feeds, climate and photos in one place.
      </p>
    </div>
  );

  return (
    <div
      data-testid="flowering-plan-page"
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
              <li aria-current="page">Cannabis Flowering Stages Week by Week</li>
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
          {FLOWERING_PLAN_H1}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7">
          Every flower run follows the same broad stages, but your plant keeps its own clock. Put in
          your flip date and your breeder&apos;s flowering time, and get a dated week-by-week plan
          you can compare against what actually happens.
        </p>
        <p className="mt-2 max-w-3xl text-base leading-7">
          Growing an autoflower? Use the{" "}
          <Link className="underline" to="/guides/autoflower-week-by-week">
            autoflower week-by-week planner
          </Link>
          .
        </p>

        <section id="quick-answer" className="mt-6 max-w-3xl" aria-labelledby="quick-answer-h">
          <h2 id="quick-answer-h" className="text-2xl font-semibold">
            Quick answer
          </h2>
          <div className="mt-2 rounded-xl bg-white p-4 shadow-sm">
            <p className="leading-7">{FLOWERING_QUICK_ANSWER}</p>
          </div>
        </section>

        <section id="flowering-week-by-week-planner" className="mt-8" aria-labelledby="planner-h">
          <h2 id="planner-h" className="text-2xl font-semibold">
            Flowering Week-by-Week Planner
          </h2>
          <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
            <p className="rounded-md bg-amber-50 p-3 text-sm print:hidden" role="note">
              Nothing is saved in your browser. Download CSV or copy your plan before leaving this
              page.
            </p>

            <fieldset className="mt-4 min-w-0 print:hidden">
              <legend className="font-semibold">Plant type</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {(
                  [
                    ["photoperiod", "Photoperiod (flipped to 12/12)"],
                    ["autoflower", "Autoflower"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="plantType"
                      value={value}
                      checked={plantType === value}
                      onChange={() => changePlantType(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {plantType === "autoflower" ? (
              <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm" role="status">
                Autoflowers don&apos;t need a flip, so they&apos;re planned from the sprout date
                instead. Use the{" "}
                <Link className="underline" to="/guides/autoflower-week-by-week">
                  autoflower week-by-week planner
                </Link>
                .
              </p>
            ) : (
              <div data-testid="photoperiod-planner-body">
                <div className="mt-4 grid gap-3 sm:grid-cols-2 print:hidden">
                  <label className="min-w-0 text-sm font-medium">
                    Flip to 12/12 date
                    <input
                      type="date"
                      required
                      className={inputClass}
                      value={plan.flipDate}
                      onChange={(event) => changeFlip(event.target.value)}
                    />
                  </label>
                  <div className="min-w-0">
                    <label className="text-sm font-medium" htmlFor="flower-weeks">
                      Breeder&apos;s flowering time (weeks from flip)
                    </label>
                    <input
                      id="flower-weeks"
                      type="number"
                      min={6}
                      max={16}
                      step={1}
                      required
                      className={inputClass}
                      value={weeksDraft}
                      aria-describedby="flower-weeks-help"
                      onChange={(event) => changeWeeks(event.target.value)}
                    />
                    <p id="flower-weeks-help" className="mt-1 text-xs">
                      Use the flowering time on your seed pack or breeder&apos;s page.
                    </p>
                  </div>
                  <label className="min-w-0 text-sm font-medium">
                    Plant name (optional)
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="e.g., Tent 1 – Plant A"
                      value={plan.plantName}
                      onChange={(event) => updatePlan({ plantName: event.target.value })}
                    />
                  </label>
                  <label className="min-w-0 text-sm font-medium">
                    Height at flip (inches, optional)
                    <input
                      type="number"
                      min={1}
                      max={120}
                      step={0.5}
                      className={inputClass}
                      value={plan.flipHeight}
                      onChange={(event) => updatePlan({ flipHeight: event.target.value.trim() })}
                    />
                  </label>
                </div>

                <fieldset className="mt-4 min-w-0 print:hidden">
                  <legend className="font-semibold">Stage weeks editor</legend>
                  <p className="mt-1 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs">
                    Planning default based on common grow-guide outlines. Edit the weeks to match
                    your breeder and your plant.
                  </p>
                  {plan.flowerWeeks < 8 ? (
                    <p role="status" className="mt-2 rounded-md bg-amber-50 p-3 text-sm">
                      {FLOWERING_SHORT_MESSAGE}
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

                <div className="mt-6" aria-live="polite">
                  <h3 className="text-lg font-semibold">Flowering schedule summary</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-emerald-900/15 p-3">
                      <p className="text-xs">Estimated finish date (end of week F)</p>
                      <p className="mt-1 font-semibold">{schedule.estimatedFinish || "—"}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-900/15 p-3">
                      <p className="text-xs">Current week &amp; stage for today</p>
                      <p className="mt-1 font-semibold">{current?.status ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-900/15 p-3">
                      <p className="text-xs">Milestones logged</p>
                      <p className="mt-1 font-semibold">
                        {countLoggedFloweringMilestones(plan.milestones)} of 4
                      </p>
                    </div>
                    <div className="rounded-lg border border-emerald-900/15 p-3">
                      <p className="text-xs">Logged stretch result</p>
                      <p className="mt-1 font-semibold">
                        {stretch || "Enter flip & stretch-slows heights"}
                      </p>
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
                  aria-label="Flower plan table"
                >
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <caption className="p-2 text-left">
                      {plantTitle
                        ? `Dated week-by-week photoperiod flowering schedule for ${plantTitle}`
                        : "Dated week-by-week photoperiod flowering schedule"}
                    </caption>
                    <thead>
                      <tr>
                        {["Week", "Dates", "Stage", "What to watch and log", "Done"].map(
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
                        const stage = floweringStageForWeek(week.week, plan.stages);
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
                            <td className={cellClass}>
                              <div>{FLOWERING_STAGE_GUIDANCE[stage]}</div>
                              {isTrichome ? (
                                <div className="mt-1 font-medium">
                                  <span>Milestone: </span>
                                  <Link
                                    className="underline"
                                    to="/guides/when-to-harvest-cannabis"
                                    data-trichome-link="true"
                                    onClick={() =>
                                      trackFloweringPlannerEvent(
                                        "flowering_planner_trichome_link_click",
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
                                    doneWeeks: {
                                      ...plan.doneWeeks,
                                      [week.week]: event.target.checked,
                                    },
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
                      Planned vs. actual flowering milestone &amp; stretch log
                    </caption>
                    <thead>
                      <tr>
                        {["Milestone", "Planned", "Actual date", "Difference", "Note"].map(
                          (header) => (
                            <th key={header} scope="col" className={cellClass}>
                              {header}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {FLOWERING_MILESTONE_DEFS.map((def) => {
                        const meta = planned[def.key];
                        const entry = plan.milestones[def.key];
                        return (
                          <tr key={def.key}>
                            <th scope="row" className={cellClass}>
                              {def.label}
                            </th>
                            <td className={cellClass}>
                              {meta.weekLabel} (starts{" "}
                              {addFloweringDays(plan.flipDate, 7 * (meta.startWeek - 1))})
                            </td>
                            <td className={cellClass}>
                              <label
                                htmlFor={`milestone-date-${def.key}`}
                                className="block text-xs"
                              >
                                Actual date for {def.label}
                              </label>
                              <input
                                id={`milestone-date-${def.key}`}
                                type="date"
                                className={inputClass}
                                value={entry.actualDate}
                                onChange={(event) =>
                                  changeMilestone(def.key, {
                                    actualDate: event.target.value.trim(),
                                  })
                                }
                              />
                            </td>
                            <td className={`${cellClass} font-bold`}>
                              {computeFloweringMilestoneDifference(
                                plan.flipDate,
                                meta.startWeek,
                                entry.actualDate,
                              )}
                            </td>
                            <td className={cellClass}>
                              <label
                                htmlFor={`milestone-note-${def.key}`}
                                className="block text-xs"
                              >
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
                              {def.key === "stretch_slows" ? (
                                <div className="mt-2 rounded-md bg-emerald-50 p-2">
                                  <label
                                    htmlFor="stretch-slows-height"
                                    className="block text-xs font-bold"
                                  >
                                    Height when stretch slows (inches)
                                  </label>
                                  <input
                                    id="stretch-slows-height"
                                    type="number"
                                    min={1}
                                    max={120}
                                    step={0.5}
                                    className={inputClass}
                                    value={plan.stretchSlowsHeight}
                                    onChange={(event) =>
                                      updatePlan({ stretchSlowsHeight: event.target.value.trim() })
                                    }
                                  />
                                  {stretch ? (
                                    <p className="mt-1 text-xs font-semibold">{stretch}</p>
                                  ) : null}
                                </div>
                              ) : null}
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
                    aria-label="Confirm clearing flowering planner"
                  >
                    <span>
                      Reset your flowering week-by-week plan, stage edits, heights, and logged
                      milestone dates?
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
                    <label htmlFor="flowering-copy-fallback" className="text-sm">
                      Clipboard access was unavailable. Select and copy your tab-separated flowering
                      plan below:
                    </label>
                    <textarea
                      id="flowering-copy-fallback"
                      rows={6}
                      readOnly
                      className={inputClass}
                      value={copyFallback}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </div>
                ) : null}
              </div>
            )}

            {cta("tool")}
          </div>
        </section>

        <section id="cannabis-flowering-stages-week-by-week" className={sectionClass}>
          <h2 className="text-2xl font-semibold">Cannabis flowering stages week by week</h2>
          <div
            className={tableWrapClass}
            tabIndex={0}
            role="region"
            aria-label="Common 9-week flower outline table"
          >
            <table className="w-full border-collapse text-sm">
              <caption className="p-2 text-left">
                Common 9-week flower outline (a planning example, not a rule)
              </caption>
              <thead>
                <tr>
                  {[
                    "Stage",
                    "Typical weeks in a 9-week flower",
                    "What growers watch for",
                    "What to log",
                  ].map((header) => (
                    <th key={header} scope="col" className={cellClass}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {OUTLINE_ROWS.map((row) => (
                  <tr key={row.stage}>
                    <th scope="row" className={cellClass}>
                      {row.stage}
                    </th>
                    <td className={`${cellClass} whitespace-nowrap`}>{row.weeks}</td>
                    <td className={cellClass}>{row.watch}</td>
                    <td className={cellClass}>{row.log}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3">
            Following the <strong>flowering stage week by week</strong> helps you connect what you
            see in the tent with your cultivar&apos;s timeline rather than treating every
            photoperiod plant as an identical eight-week clock (<GWE />, <BT />, <RQS />, <ATH />,{" "}
            <SENSI />
            ). Below is how cultivation guides commonly describe each part of a typical nine-week
            flower outline and what to record in your diary.
          </p>

          <h3 className="mt-6 text-xl font-semibold">Week 1 of flower</h3>
          <p className="mt-2">
            <strong>Week 1 of flower</strong> is the transition week right after you switch your
            timer to a 12/12 light cycle, when the plant shifts hormonally toward bloom while
            continuing rapid vegetative-style stem and leaf growth. Instead of stopping growth
            overnight, branches lengthen and upper shoots push upward toward the fixture (<GWE />,{" "}
            <BT />
            ). Watch your canopy evenness, gently tuck branches if you use a trellis net, and make
            sure your dark period has zero light leaks. Log your exact flip date, your plant&apos;s
            starting height in inches, and your baseline watering and feeding notes.
          </p>

          <h3 className="mt-6 text-xl font-semibold">Week 2 of flower</h3>
          <p className="mt-2">
            <strong>Week 2 of flower</strong> is when most photoperiod cultivars display their first
            distinct clusters of fine white pistils at the upper nodes where fan leaf petioles meet
            the stem (<BT />, <RQS />
            ). Vertical stretch is typically in full swing during this second week as internodes
            space out to make room for future flower clusters. Watch the top growth tips daily so
            surging branches do not grow too close to your grow light. Log the exact date you spot
            the first pistils, record any light height adjustments, and note how fast your pots or
            reservoir are drying down.
          </p>

          <h3 className="mt-6 text-xl font-semibold">Week 3 of flower</h3>
          <p className="mt-2">
            In a typical outline, <strong>week 3 of flower</strong> is when the post-flip stretch
            reaches its peak and begins slowing down while early &quot;pom-pom&quot; pistil clusters
            gather along the upper branches (<BT />, <SENSI />
            ). While longer-flowering sativa-leaning genetics may keep stretching past week three,
            most hybrid cultivars start redirecting energy from stem elongation into node stacking.
            Watch for tight leaf clusters that block airflow through the middle of the canopy. Log
            your plant&apos;s height in inches at the end of the stretch so the planner can
            calculate your total stretch percentage.
          </p>

          <h3 className="mt-6 text-xl font-semibold">Weeks 4–5 of flower</h3>
          <p className="mt-2">
            Weeks 4 and 5 mark the bud set phase, when vertical upward growth largely stops and
            distinct flowerlets form and link together along the main colas (<RQS />, <ATH />
            ). Grow guides commonly point to <strong>week 5 of flower</strong> as the turning point
            where calyxes visibly swell, pistils multiply into thick white crowns, and trichome
            frost becomes noticeable across the bracts (<BT />
            ). Watch how much water your plants drink each day and keep oscillating fans moving air
            gently around the thickening tops. Log your final post-stretch height in inches, your
            weekly feeding against your brand&apos;s chart, and close-up bud-site photos.
          </p>

          <h3 className="mt-6 text-xl font-semibold">Weeks 6–7 of flower</h3>
          <p className="mt-2">
            Weeks 6 and 7 in a nine-week outline represent the main bulking stage, when flower
            bracts stack weight, resin glands coat the buds, and room aroma intensifies (<GWE />,{" "}
            <BT />, <SENSI />
            ). Because dense, heavy colas trap moisture between tightly packed flowers, grow guides
            emphasize watching closely for{" "}
            <Link className="underline" to="/guides/bud-rot-prevention-identification">
              bud rot
            </Link>{" "}
            and supporting heavy branches with stakes or trellis netting. Log your planned versus
            actual feeding, your lights-on and lights-off climate readings in °F and RH, and weekly
            comparison photos.
          </p>

          <h3 className="mt-6 text-xl font-semibold">Week 8 to harvest</h3>
          <p className="mt-2">
            From week 8 through harvest in a typical nine-week run, the plant enters ripening as
            white pistils darken and curl inward and trichome heads transition from clear to milky
            cloudy and amber (<RQS />, <ATH />
            ). Lower fan leaves often fade naturally while the plant finishes maturing its flowers,
            and water uptake may taper compared with peak bulking. Watch the trichome heads on the
            bud calyxes—not the sugar leaves—with a jeweler&apos;s loupe every few days, and follow
            our guide on{" "}
            <Link className="underline" to="/guides/when-to-harvest-cannabis">
              when to harvest cannabis
            </Link>{" "}
            to log your clear, cloudy, and amber checks until you reach your chosen harvest window.
          </p>
        </section>

        <section id="how-long-is-the-flowering-stage" className={sectionClass}>
          <h2 className="text-2xl font-semibold">How long is the flowering stage?</h2>
          <p className="mt-2">
            When growers ask <strong>how long is flowering stage</strong> across different{" "}
            <strong>weed flowering stages</strong>, the honest answer starts with the
            cultivar&apos;s genetics. Most indoor photoperiod seed packs list a breeder flowering
            time of roughly seven to eleven weeks counted from the day you flip the lights to 12/12,
            while certain equatorial or haze-leaning lines can run longer (<GWE />, <SENSI />
            ).
          </p>
          <p className="mt-2">
            Just as important, cultivation guides (<BT />, <RQS />) stress that a breeder&apos;s
            week count is a planning estimate rather than an exact calendar promise. Phenotype
            variation between seeds, container size, root-zone health, and tent temperatures in °F
            can all cause a plant to finish a week earlier or a week or two later than the printed
            number. Use the breeder&apos;s flowering time to set up your planner above, and let your
            trichome checks confirm the actual harvest day.
          </p>
        </section>

        <section id="the-flip-to-12-12-and-the-stretch" className={sectionClass}>
          <h2 className="text-2xl font-semibold">The flip to 12/12 and the stretch</h2>
          <p className="mt-2">
            Photoperiod cannabis plants stay in vegetative growth as long as they receive long days
            and short nights. Switching your timer to a <strong>12/12 light cycle</strong>—twelve
            hours of light followed by twelve hours of uninterrupted darkness every twenty-four
            hours—signals that autumn has arrived and triggers flowering (<GWE />, <SENSI />
            ). Keeping the twelve-hour dark period completely dark is critical; grow guides note
            that light leaks from open vents, power-strip indicator LEDs, or tent zipper gaps during
            lights-off can confuse photoperiod hormones, delay flowering, or cause stress responses.
          </p>
          <p className="mt-2">
            During the first two to three weeks after the flip, almost every photoperiod plant goes
            through the flowering <strong>stretch</strong>, surging upward and outward to build the
            scaffolding that will hold its colas (<BT />, <ATH />
            ). Because plants can easily double in height during this transition, logging your
            plant&apos;s height in inches on the day of the flip and again when the stretch slows
            gives you hard data for your next run of that cultivar. To keep surging tops from
            outgrowing your fixture headroom, review our guide on{" "}
            <Link className="underline" to="/guides/cannabis-grow-light-distance-and-schedule">
              grow light distance and schedule
            </Link>
            .
          </p>
        </section>

        <section id="feeding-during-flower" className={sectionClass}>
          <h2 className="text-2xl font-semibold">Feeding during flower</h2>
          <p className="mt-2">
            As photoperiod plants move from the post-flip stretch into bud set, bulking, and
            ripening, their nutritional balance shifts away from heavy vegetative leaf growth toward
            flower formation (<ATH />, <GWE />, <RQS />
            ). Because every nutrient line is formulated around its own concentration and ratio
            across stages, Verdant never prints generic feeding doses. Instead, follow your nutrient
            brand&apos;s official flowering chart and log what you planned to feed alongside what
            you actually mixed each week. You can see how structured weekly logs work in our{" "}
            <Link className="underline" to="/guides/athena-feed-chart-log">
              Athena feed chart log
            </Link>{" "}
            and our{" "}
            <Link className="underline" to="/guides/cronk-nutrients-grow-diary">
              Cronk Nutrients grow diary
            </Link>
            .
          </p>
          <p className="mt-2">
            Many growers also ask whether to remove fan leaves during flowering. Grow guides (
            <GWE />, <BT />) describe an ongoing debate: some growers selectively thin overlapping
            interior fan leaves around the end of stretch to open airflow and light penetration,
            while others prefer tucking leaves and removing only shaded lower growth so the plant
            keeps its solar panels intact. Whichever approach you choose, log the date and a quick
            before-and-after photo note.
          </p>
          <p className="mt-3 rounded-md bg-white p-3 text-sm leading-6">
            Running a gravity-fed reservoir system such as AutoPot? Log each reservoir top-up or
            refill (date, volume added and the mix you used) instead of runoff, so you can see how
            fast your plants drink as flower goes on.
          </p>
        </section>

        <section id="climate-in-flower" className={sectionClass}>
          <h2 className="text-2xl font-semibold">Climate in flower</h2>
          <p className="mt-2">
            Rather than chasing a single rigid temperature or humidity number that ignores how air
            warmth in °F and moisture interact, growers commonly track flowering climate through
            vapor pressure deficit (<ATH />, <BT />
            ). On Verdant&apos;s{" "}
            <Link className="underline" to="/vpd-chart">
              VPD chart
            </Link>
            , the flowering stage bands—described as common grower targets rather than strict
            rules—are <strong>Early Flower 1.0–1.5 kPa</strong> and{" "}
            <strong>Late Flower 1.2–1.6 kPa</strong>.
          </p>
          <p className="mt-2">
            As colas thicken during bulking and ripening, transpiration from a full tent plus
            cooling air in °F when the lights turn off can push relative humidity upward and drop
            VPD below the target band. Log both lights-on and lights-off readings so dark-period
            humidity swings never catch you off guard, and use our{" "}
            <Link className="underline" to="/guides/grow-tent-temperature-humidity-chart">
              grow tent temperature and humidity chart
            </Link>{" "}
            to check your tent&apos;s °F and RH and see step-by-step adjustments.
          </p>
        </section>

        <section id="keep-your-flower-log-in-verdant" className={sectionClass}>
          <h2 className="text-2xl font-semibold">Keep your flower log in Verdant</h2>
          <p className="mt-2">
            Download or copy your flowering schedule above, then continue your log in Verdant Grow
            Diary so your flip date, stretch measurements in inches, weekly feedings, °F climate
            readings, and trichome checks stay organized on your plant&apos;s permanent timeline.
          </p>
          {cta("article")}
        </section>

        <section id="cannabis-flowering-stages-faq" className={sectionClass}>
          <h2 className="text-2xl font-semibold">Cannabis flowering stages FAQ</h2>
          {FLOWERING_PLAN_FAQ.map((entry) => (
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
              ["/guides/when-to-harvest-cannabis", "When to harvest cannabis"],
              ["/guides/autoflower-week-by-week", "Autoflower week by week"],
              ["/guides/grow-stage-care-guide", "Grow stage care guide"],
              ["/guides/athena-feed-chart-log", "Athena feed chart log"],
              ["/guides/cronk-nutrients-grow-diary", "Cronk Nutrients grow diary"],
              ["/vpd-chart", "VPD chart by growth stage"],
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
            {FLOWERING_SOURCES.map((source) => (
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
