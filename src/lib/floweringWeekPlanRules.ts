/**
 * Cannabis flowering stages week-by-week planner (photoperiod, from the 12/12 flip).
 * Pure: no React, no storage, no clock. Dates are ISO `YYYY-MM-DD` and computed at UTC
 * midnight so month ends, year ends and leap days never drift with the viewer's time zone.
 * The stage split is a planning default from common grow-guide outlines, not a rule.
 */

import { escapeCsvField } from "@/lib/athenaFeedLogRules";

export const FLOWERING_PLAN_PATH = "/guides/cannabis-flowering-stages-week-by-week" as const;

export const FLOWERING_PLAN_TITLE =
  "Cannabis Flowering Stages Week by Week: Free Flower Planner & Log" as const;

export const FLOWERING_PLAN_H1 =
  "Cannabis Flowering Stages Week by Week: Plan and Log Your Flower" as const;

export const FLOWERING_PLAN_DESCRIPTION =
  "Cannabis flowering stages week by week: enter your 12/12 flip date and the breeder's flowering time to get dated weeks, what to watch, and a trichome reminder. Free." as const;

export const FLOWERING_PLAN_CTA_HREF =
  "/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=cannabis-flowering-stages-week-by-week" as const;

export const FLOWERING_PLAN_DATE_MODIFIED = "2026-10-28" as const;

export const FLOWERING_SOURCE_URLS = {
  growWeedEasy: "https://www.growweedeasy.com/cannabis-flowering-stage",
  budTrainer: "https://www.budtrainer.com/blogs/learn/flowering-stage",
  royalQueen:
    "https://www.royalqueenseeds.com/us/blog-the-flowering-stage-of-cannabis-week-by-week-n611",
  athena: "https://www.athenaag.com/blog/cannabis-flowering-stage",
  sensi: "https://sensiseeds.com/en/blog/the-flowering-stage-of-cannabis-week-by-week-guide/",
} as const;

export const FLOWERING_SOURCES = [
  { label: "Grow Weed Easy — Cannabis Flowering Stage", url: FLOWERING_SOURCE_URLS.growWeedEasy },
  {
    label: "BudTrainer — Cannabis Flowering Stage Week by Week",
    url: FLOWERING_SOURCE_URLS.budTrainer,
  },
  {
    label: "Royal Queen Seeds — The Flowering Stage of Cannabis Week by Week",
    url: FLOWERING_SOURCE_URLS.royalQueen,
  },
  { label: "Athena Ag — Cannabis Flowering Stage", url: FLOWERING_SOURCE_URLS.athena },
  {
    label: "Sensi Seeds — The Flowering Stage of Cannabis Week-by-Week Guide",
    url: FLOWERING_SOURCE_URLS.sensi,
  },
] as const;

export const FLOWERING_QUICK_ANSWER =
  "Grow guides commonly describe four cannabis flowering stages after the flip to 12/12: transition and stretch, bud set, bulking, and ripening. In a typical 9-week flower they land around weeks 1–3, 4–5, 6–7 and 8–9. Your strain's flowering time sets the length, and trichomes, not the calendar, confirm harvest." as const;

export const FLOWERING_PLAN_FAQ = [
  {
    question: "What are the stages of cannabis flowering?",
    answer:
      "Grow guides commonly describe four stages after the flip to 12/12: transition and stretch, bud set, bulking, and ripening. In a typical 9-week flower they land around weeks 1–3, 4–5, 6–7 and 8–9, but your strain's flowering time sets the real length.",
  },
  {
    question: "How long is the flowering stage?",
    answer:
      "It depends on the strain. Use the breeder's flowering time counted from the day you flip to 12/12, then confirm harvest by checking trichomes rather than the calendar.",
  },
  {
    question: "What should week 3 of flowering look like?",
    answer:
      "Grow guides commonly describe week 3 as the point where the stretch peaks and starts to slow, with pistils clustering where bud sites will form. Log the plant's height so you can see your own stretch.",
  },
  {
    question: "When does the stretch stop in flower?",
    answer:
      "Grow guides commonly describe the stretch slowing by around the third week after the flip, though it varies by strain. Log the height at the flip and again when growth slows.",
  },
  {
    question: "Should you water more or less during flowering?",
    answer:
      "Plants often drink more as buds bulk up, but the right amount depends on your pot, medium and climate. Log each watering or reservoir refill so you can see the trend instead of guessing.",
  },
  {
    question: "When should I start checking trichomes?",
    answer:
      "A practical habit is to start checking a couple of weeks before the breeder's flowering time ends and keep checking every few days. The planner adds a reminder you can move to match your plant.",
  },
] as const;

export type FloweringStageName = "Transition & stretch" | "Bud set" | "Bulking" | "Ripening";

export const FLOWERING_STAGE_GUIDANCE: Readonly<Record<FloweringStageName, string>> = {
  "Transition & stretch":
    "Watch for first pistils at the top nodes. Log height and the date you see them.",
  "Bud set": "Watch the stretch slow and bud sites form. Log height and photos.",
  Bulking:
    "Log feeding vs your brand's chart, climate and weekly photos. Check dense buds for rot.",
  Ripening: "Check trichomes every few days and log them.",
};

export const FLOWERING_MILESTONE_DEFS = [
  { key: "first_pistils", label: "First pistils" },
  { key: "stretch_slows", label: "Stretch slows" },
  { key: "first_amber", label: "First amber trichomes" },
  { key: "harvest", label: "Harvest" },
] as const;

export type FloweringMilestoneKey = (typeof FLOWERING_MILESTONE_DEFS)[number]["key"];

export const FLOWERING_SHORT_MESSAGE =
  "Short flowering time: adjust the stage weeks to your breeder's description." as const;

export const FLOWERING_WEEKS_MIN = 6;
export const FLOWERING_WEEKS_MAX = 16;
export const FLOWERING_WEEKS_DEFAULT = 9;

/** flowering_planner_generated / stage_edited fire after this quiet period, as in the source. */
export const FLOWERING_EVENT_DEBOUNCE_MS = 2000;

const DAY_MS = 86_400_000;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** UTC-midnight ms for a real calendar date, or null (rejects 2026-02-30 and junk). */
export function parseFloweringIsoDate(value: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

function formatIso(ms: number): string {
  const dt = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addFloweringDays(iso: string, days: number): string {
  const ms = parseFloweringIsoDate(iso);
  return ms === null ? "" : formatIso(ms + days * DAY_MS);
}

function monDay(iso: string): string {
  const ms = parseFloweringIsoDate(iso);
  if (ms === null) return "";
  const dt = new Date(ms);
  return `${MONTH_SHORT[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

/** Local calendar date of `now` as ISO; the caller injects the clock. */
export function floweringLocalIsoDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function clampFloweringWeeks(value: unknown): number {
  const n = Math.round(Number(value) || FLOWERING_WEEKS_DEFAULT);
  return Math.max(FLOWERING_WEEKS_MIN, Math.min(FLOWERING_WEEKS_MAX, n));
}

export interface WeekRange {
  readonly start: number;
  readonly end: number;
}

export interface FloweringStages {
  readonly transition: WeekRange;
  readonly budset: WeekRange;
  readonly bulking: WeekRange;
  readonly ripening: WeekRange;
}

export interface FloweringOutline {
  readonly flowerWeeks: number;
  readonly isShort: boolean;
  readonly shortMessage: string;
  readonly stages: FloweringStages;
  readonly trichomeWeek: number;
}

/** The source's default split; under 8 weeks it compresses transition and bud set. */
export function getDefaultFloweringOutline(flowerWeeks: unknown): FloweringOutline {
  const F = clampFloweringWeeks(flowerWeeks);
  const isShort = F < 8;
  return {
    flowerWeeks: F,
    isShort,
    shortMessage: isShort ? FLOWERING_SHORT_MESSAGE : "",
    stages: isShort
      ? {
          transition: { start: 1, end: 2 },
          budset: { start: 3, end: 3 },
          bulking: { start: 4, end: F - 2 },
          ripening: { start: F - 1, end: F },
        }
      : {
          transition: { start: 1, end: 3 },
          budset: { start: 4, end: 5 },
          bulking: { start: 6, end: F - 2 },
          ripening: { start: F - 1, end: F },
        },
    trichomeWeek: F - 2,
  };
}

export interface FloweringWeek {
  readonly week: number;
  readonly startIso: string;
  readonly endIso: string;
  readonly labelRange: string;
}

export function computeFloweringWeek(flipIso: string, week: number): FloweringWeek {
  const startIso = addFloweringDays(flipIso, 7 * (week - 1));
  const endIso = addFloweringDays(flipIso, 7 * week - 1);
  const labelRange = startIso && endIso ? `${monDay(startIso)}–${monDay(endIso)}` : "";
  return { week, startIso, endIso, labelRange };
}

export function computeFloweringSchedule(
  flipIso: string,
  flowerWeeks: unknown,
): { weeks: FloweringWeek[]; estimatedFinish: string } {
  const F = clampFloweringWeeks(flowerWeeks);
  const weeks = Array.from({ length: F }, (_, i) => computeFloweringWeek(flipIso, i + 1));
  return { weeks, estimatedFinish: weeks[weeks.length - 1]?.endIso ?? "" };
}

const STAGE_ORDER: readonly { key: keyof FloweringStages; name: FloweringStageName }[] = [
  { key: "transition", name: "Transition & stretch" },
  { key: "budset", name: "Bud set" },
  { key: "bulking", name: "Bulking" },
  { key: "ripening", name: "Ripening" },
];

/** In order, no overlaps, no gaps, weeks 1..F; trichome week within 1..F. Source messages. */
export function validateFloweringStages(
  stages: FloweringStages,
  flowerWeeks: number,
  trichomeWeek: number,
): { valid: true } | { valid: false; error: string } {
  const F = Number(flowerWeeks);
  const ordered = STAGE_ORDER.map(({ key, name }) => ({
    name,
    start: Number(stages[key].start),
    end: Number(stages[key].end),
  }));
  for (let i = 0; i < ordered.length; i++) {
    const st = ordered[i];
    if (!Number.isInteger(st.start) || !Number.isInteger(st.end)) {
      return { valid: false, error: `${st.name} start and end weeks must be whole numbers.` };
    }
    if (st.start < 1 || st.end > F) {
      return { valid: false, error: `${st.name} weeks must fit within weeks 1 to ${F}.` };
    }
    if (st.start > st.end) {
      return {
        valid: false,
        error: `${st.name} start week (${st.start}) cannot be after its end week (${st.end}).`,
      };
    }
    if (i > 0) {
      const prev = ordered[i - 1];
      if (st.start <= prev.end) {
        return {
          valid: false,
          error: `${prev.name} (weeks ${prev.start}–${prev.end}) overlaps or is out of order with ${st.name} (weeks ${st.start}–${st.end}). Stages must be in order without overlapping.`,
        };
      }
      if (st.start !== prev.end + 1) {
        return {
          valid: false,
          error: `Leave no gap between ${prev.name} (ends week ${prev.end}) and ${st.name} (starts week ${st.start}).`,
        };
      }
    }
  }
  if (ordered[0].start !== 1 || ordered[ordered.length - 1].end !== F) {
    return { valid: false, error: `Stage weeks must start at week 1 and end at week ${F}.` };
  }
  const tw = Number(trichomeWeek);
  if (!Number.isInteger(tw) || tw < 1 || tw > F) {
    return {
      valid: false,
      error: `Start checking trichomes week must be between week 1 and week ${F}.`,
    };
  }
  return { valid: true };
}

export function floweringStageForWeek(week: number, stages: FloweringStages): FloweringStageName {
  for (const { key, name } of STAGE_ORDER.slice(0, 3)) {
    if (week >= stages[key].start && week <= stages[key].end) return name;
  }
  return "Ripening";
}

/** "+4 days", "−3 days", "0 days" from the planned week's start; "" when not comparable. */
export function computeFloweringMilestoneDifference(
  flipIso: string,
  plannedWeek: number,
  actualIso: string,
): string {
  if (!actualIso) return "";
  const planned = parseFloweringIsoDate(addFloweringDays(flipIso, 7 * (plannedWeek - 1)));
  const actual = parseFloweringIsoDate(actualIso);
  if (planned === null || actual === null) return "";
  const diff = Math.round((actual - planned) / DAY_MS);
  const unit = Math.abs(diff) === 1 ? " day" : " days";
  if (diff > 0) return `+${diff}${unit}`;
  if (diff < 0) return `−${Math.abs(diff)}${unit}`;
  return "0 days";
}

/** "Stretch: +16.0 in (+80%)", or "" until both heights are positive numbers. */
export function computeFloweringStretchSummary(flipHeight: unknown, laterHeight: unknown): string {
  const blank = (v: unknown) => v === "" || v === null || v === undefined;
  if (blank(flipHeight) || blank(laterHeight)) return "";
  const h1 = Number(flipHeight);
  const h2 = Number(laterHeight);
  if (!Number.isFinite(h1) || !Number.isFinite(h2) || h1 <= 0 || h2 <= 0) return "";
  const diff = h2 - h1;
  const pct = Math.round((diff / h1) * 100);
  const sign = (n: number) => (n >= 0 ? "+" : "−");
  return `Stretch: ${sign(diff)}${Math.abs(diff).toFixed(1)} in (${sign(pct)}${Math.abs(pct)}%)`;
}

export interface FloweringCurrentWeek {
  readonly status: string;
  readonly week: number | null;
  readonly stage: FloweringStageName | null;
}

export function lookupFloweringCurrentWeek(
  flipIso: string,
  todayIso: string,
  flowerWeeks: number,
  stages: FloweringStages,
): FloweringCurrentWeek {
  const flip = parseFloweringIsoDate(flipIso);
  const today = parseFloweringIsoDate(todayIso);
  if (flip === null || today === null) return { status: "Invalid date", week: null, stage: null };
  const days = Math.floor((today - flip) / DAY_MS);
  if (days < 0) return { status: "Not flipped yet", week: null, stage: null };
  const week = Math.floor(days / 7) + 1;
  if (week > flowerWeeks) {
    return { status: "Past your breeder's estimate", week, stage: null };
  }
  const stage = floweringStageForWeek(week, stages);
  return { status: `Week ${week}, ${stage}`, week, stage };
}

export interface FloweringMilestoneEntry {
  readonly actualDate: string;
  readonly note: string;
}

export type FloweringMilestones = Readonly<Record<FloweringMilestoneKey, FloweringMilestoneEntry>>;

export function createEmptyFloweringMilestones(): FloweringMilestones {
  return {
    first_pistils: { actualDate: "", note: "" },
    stretch_slows: { actualDate: "", note: "" },
    first_amber: { actualDate: "", note: "" },
    harvest: { actualDate: "", note: "" },
  };
}

export function countLoggedFloweringMilestones(milestones: FloweringMilestones): number {
  return FLOWERING_MILESTONE_DEFS.filter((def) => milestones[def.key].actualDate).length;
}

/** Planned week per milestone: pistils week 2, stretch at transition end, amber at the reminder, harvest at F. */
export function getPlannedFloweringMilestones(
  stages: FloweringStages,
  trichomeWeek: number,
  flowerWeeks: number,
): Record<FloweringMilestoneKey, { weekLabel: string; startWeek: number }> {
  const at = (week: number) => ({ weekLabel: `Week ${week}`, startWeek: week });
  return {
    first_pistils: at(2),
    stretch_slows: at(stages.transition.end),
    first_amber: at(trichomeWeek),
    harvest: at(flowerWeeks),
  };
}

export interface FloweringPlanState {
  readonly flipDate: string;
  readonly flowerWeeks: number;
  readonly plantName: string;
  readonly flipHeight: string;
  readonly stretchSlowsHeight: string;
  readonly stages: FloweringStages;
  readonly trichomeWeek: number;
  readonly doneWeeks: Readonly<Record<number, boolean>>;
  readonly milestones: FloweringMilestones;
}

export function createDefaultFloweringPlan(flipDate: string): FloweringPlanState {
  const outline = getDefaultFloweringOutline(FLOWERING_WEEKS_DEFAULT);
  return {
    flipDate,
    flowerWeeks: outline.flowerWeeks,
    plantName: "",
    flipHeight: "",
    stretchSlowsHeight: "",
    stages: outline.stages,
    trichomeWeek: outline.trichomeWeek,
    doneWeeks: {},
    milestones: createEmptyFloweringMilestones(),
  };
}

const EXPORT_HEADERS = [
  "Section",
  "Plant",
  "Week / Milestone",
  "Dates / Planned Week",
  "Stage / Actual Date",
  "What to Watch and Log / Difference",
  "Done / Note",
  "Stretch Summary",
] as const;

function exportMatrix(plan: FloweringPlanState): string[][] {
  const plant = plan.plantName.trim() || "Photoperiod Plant";
  const stretch = computeFloweringStretchSummary(plan.flipHeight, plan.stretchSlowsHeight);
  const rows: string[][] = [[...EXPORT_HEADERS]];
  for (const w of computeFloweringSchedule(plan.flipDate, plan.flowerWeeks).weeks) {
    const stage = floweringStageForWeek(w.week, plan.stages);
    const guidance =
      FLOWERING_STAGE_GUIDANCE[stage] +
      (w.week === plan.trichomeWeek ? " (Milestone: Start checking trichomes)" : "");
    rows.push([
      "Plan",
      plant,
      `Week ${w.week}`,
      `${w.startIso} to ${w.endIso}`,
      stage,
      guidance,
      plan.doneWeeks[w.week] ? "Yes" : "No",
      "",
    ]);
  }
  const planned = getPlannedFloweringMilestones(plan.stages, plan.trichomeWeek, plan.flowerWeeks);
  for (const def of FLOWERING_MILESTONE_DEFS) {
    const meta = planned[def.key];
    const entry = plan.milestones[def.key];
    rows.push([
      "Milestone",
      plant,
      def.label,
      `${meta.weekLabel} (starts ${addFloweringDays(plan.flipDate, 7 * (meta.startWeek - 1))})`,
      entry.actualDate,
      computeFloweringMilestoneDifference(plan.flipDate, meta.startWeek, entry.actualDate),
      entry.note,
      def.key === "stretch_slows" ? stretch : "",
    ]);
  }
  return rows;
}

export function buildFloweringPlanCsv(plan: FloweringPlanState): string {
  return exportMatrix(plan)
    .map((row) => row.map((cell) => escapeCsvField(cell)).join(","))
    .join("\r\n");
}

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/** TSV cell for pasting into a spreadsheet: one line, and never a live formula. */
function tsvCell(value: string): string {
  const flat = String(value ?? "").replace(/[\t\r\n]+/g, " ");
  const leadingSignIsFormula = /^[+-]/.test(flat) && !PLAIN_NUMBER.test(flat);
  return /^[=@]/.test(flat) || leadingSignIsFormula ? `'${flat}` : flat;
}

export function buildFloweringPlanTsv(plan: FloweringPlanState): string {
  return exportMatrix(plan)
    .map((row) => row.map((cell) => tsvCell(cell)).join("\t"))
    .join("\n");
}

export function floweringPlanCsvFilename(isoDate: string): string {
  return `flowering-plan-${isoDate}.csv`;
}

export function floweringPlanWebApplicationJsonLd(pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Flowering Week-by-Week Planner",
    url: pageUrl,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: {
      "@type": "Organization",
      name: "Verdant Grow Diary",
      url: "https://verdantgrowdiary.com",
    },
  } as const;
}
