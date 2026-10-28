/**
 * Pure rules for the /guides/autoflower-week-by-week planner.
 *
 * Calendar dates are "YYYY-MM-DD" strings from <input type="date">. All
 * arithmetic is UTC-midnight based (Date.UTC), so results never depend on the
 * runtime timezone or DST. No clock reads: "today" and "now" are parameters.
 */

import { escapeCsvField } from "@/lib/athenaFeedLogRules";

export { escapeCsvField };

export const AUTOFLOWER_WEEK_PLAN_PATH = "/guides/autoflower-week-by-week" as const;

export const AUTOFLOWER_WEEK_PLAN_TITLE =
  "Autoflower Week by Week: Free Schedule Planner (Light, Feeding, Timeline)" as const;

export const AUTOFLOWER_WEEK_PLAN_H1 =
  "Autoflower Week by Week: Your Schedule, Light and Feeding Planner" as const;

export const AUTOFLOWER_WEEK_PLAN_DESCRIPTION =
  "Enter your sprout date and the breeder's estimate to get a week-by-week autoflower plan: stages, light schedule options, what to check, and a harvest reminder. Free." as const;

export const AUTOFLOWER_WEEK_PLAN_CTA_HREF =
  "/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=autoflower-week-by-week" as const;

export const AUTOFLOWER_WEEK_PLAN_DATE_MODIFIED = "2026-10-28" as const;

export const AUTOFLOWER_SOURCES = [
  {
    label: "ILGM — Autoflower Week-by-Week Guide",
    url: "https://ilgm.com/resources/guides/autoflower-week-by-week",
  },
  {
    label: "SeedSupreme — Autoflower Week by Week",
    url: "https://seedsupreme.com/blog/autoflower-week-by-week-pictures",
  },
  {
    label: "Auto Seeds — The Autoflower Life Cycle Week by Week",
    url: "https://www.autoseeds.com/autoflower-life-cycle/",
  },
] as const;

export const AUTOFLOWER_WEEK_PLAN_FAQ = [
  {
    question: "When do autoflowers start flowering?",
    answer:
      "Grow guides commonly describe autoflowers showing their first pistils a few weeks after sprouting, but the exact week depends on the strain. Log the date you first see pistils at the top nodes; that's your plant's real flowering start.",
  },
  {
    question: "What light schedule is best for autoflowers?",
    answer:
      "Autoflowers don't need a light change to flower. Grow guides most often describe 18/6 or 20/4 from seed to harvest. Pick one, keep it consistent, and log it so you can compare grows.",
  },
  {
    question: "How long do autoflowers take from seed to harvest?",
    answer:
      "Start with the breeder's estimated seed-to-harvest time, then confirm the finish by checking trichomes rather than the calendar. Plants often run a little earlier or later than the estimate.",
  },
  {
    question: "What should I feed my autoflower each week?",
    answer:
      "Follow your nutrient brand's official autoflower chart and log what you planned and what you actually fed. Verdant doesn't publish doses; our feed logs help you track your chart.",
  },
  {
    question: "Why is my autoflower so small?",
    answer:
      "Grow guides list early stress, container changes, light distance and genetics among common factors. Log your conditions week by week so you can spot what changed, rather than guessing from one look.",
  },
  {
    question: "When should I start checking trichomes on an autoflower?",
    answer:
      "A practical habit is to start checking a couple of weeks before the breeder's estimate and keep checking every few days. The planner adds a reminder you can move to match your plant.",
  },
] as const;

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

export const AUTOFLOWER_SHORT_ESTIMATE_MESSAGE =
  "Short estimate: adjust the stage weeks to your breeder's description." as const;

export type StageName = "Seedling" | "Veg" | "Pre-flower" | "Flower" | "Ripening & harvest window";

export interface WeekRange {
  start: number;
  end: number;
}

export interface StageWeeks {
  seedling: WeekRange;
  veg: WeekRange;
  preflower: WeekRange;
  flower: WeekRange;
  ripening: WeekRange;
}

export interface StageOutline extends StageWeeks {
  estimateWeeks: number;
  isShort: boolean;
  shortMessage: string;
  trichomeWeek: number;
}

/** Parses a strict "YYYY-MM-DD" calendar date to UTC-midnight ms, or null. */
export function parseIsoDateUtc(dateStr: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  // Reject rollovers such as 2027-02-29 or 2026-04-31.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

export function formatIsoDateUtc(ms: number): string {
  const dt = new Date(ms);
  const y = String(dt.getUTCFullYear()).padStart(4, "0");
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Adds whole days to a calendar date. Returns "" for invalid input. */
export function addDaysIso(dateStr: string | null | undefined, days: number): string {
  const ms = parseIsoDateUtc(dateStr);
  if (ms === null || !Number.isInteger(days)) return "";
  return formatIsoDateUtc(ms + days * DAY_MS);
}

export function addWeeksIso(dateStr: string | null | undefined, weeks: number): string {
  if (!Number.isInteger(weeks)) return "";
  return addDaysIso(dateStr, weeks * 7);
}

/** Whole days from `fromIso` to `toIso` (negative when `toIso` is earlier), or null. */
export function daysBetweenIso(fromIso: string, toIso: string): number | null {
  const a = parseIsoDateUtc(fromIso);
  const b = parseIsoDateUtc(toIso);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

/** 1-based week index of a date relative to sprout (day 0-6 = week 1), or null before sprout/invalid. */
export function weekIndexForDate(sproutIso: string, dateIso: string): number | null {
  const diff = daysBetweenIso(sproutIso, dateIso);
  if (diff === null || diff < 0) return null;
  return Math.floor(diff / 7) + 1;
}

export function formatMonDayRange(startIso: string, endIso: string): string {
  const a = parseIsoDateUtc(startIso);
  const b = parseIsoDateUtc(endIso);
  if (a === null || b === null) return "";
  const d1 = new Date(a);
  const d2 = new Date(b);
  return `${MONTH_SHORT[d1.getUTCMonth()]} ${d1.getUTCDate()}–${MONTH_SHORT[d2.getUTCMonth()]} ${d2.getUTCDate()}`;
}

/** Clamps a breeder estimate to whole weeks 6..16 (default 10), as the source tool does. */
export function clampEstimateWeeks(estimateWeeks: unknown): number {
  const n = Math.round(Number(estimateWeeks) || 10);
  return Math.max(6, Math.min(16, n));
}

/** Editable, guide-based default stage split for a breeder estimate. */
export function getDefaultStageOutline(estimateWeeks: unknown): StageOutline {
  const E = clampEstimateWeeks(estimateWeeks);
  if (E === 6) {
    return {
      estimateWeeks: E,
      isShort: true,
      shortMessage: AUTOFLOWER_SHORT_ESTIMATE_MESSAGE,
      seedling: { start: 1, end: 1 },
      veg: { start: 2, end: 2 },
      preflower: { start: 3, end: 3 },
      flower: { start: 4, end: 4 },
      ripening: { start: 5, end: 6 },
      trichomeWeek: 4,
    };
  }
  if (E === 7) {
    return {
      estimateWeeks: E,
      isShort: true,
      shortMessage: AUTOFLOWER_SHORT_ESTIMATE_MESSAGE,
      seedling: { start: 1, end: 1 },
      veg: { start: 2, end: 3 },
      preflower: { start: 4, end: 4 },
      flower: { start: 5, end: 5 },
      ripening: { start: 6, end: 7 },
      trichomeWeek: 5,
    };
  }
  return {
    estimateWeeks: E,
    isShort: false,
    shortMessage: "",
    seedling: { start: 1, end: 2 },
    veg: { start: 3, end: 4 },
    preflower: { start: 5, end: 5 },
    flower: { start: 6, end: E - 2 },
    ripening: { start: E - 1, end: E },
    trichomeWeek: E - 2,
  };
}

export interface WeekDates {
  week: number;
  startIso: string;
  endIso: string;
  labelRange: string;
}

export function computeWeekDates(sproutIso: string, weekNumber: number): WeekDates {
  const startIso = addDaysIso(sproutIso, 7 * (weekNumber - 1));
  const endIso = addDaysIso(sproutIso, 7 * weekNumber - 1);
  return { week: weekNumber, startIso, endIso, labelRange: formatMonDayRange(startIso, endIso) };
}

export interface PlanSchedule {
  weeks: WeekDates[];
  estimatedFinish: string;
}

/** Week-by-week dates for a sprout date. Empty plan for an invalid sprout date. */
export function computePlanSchedule(sproutIso: string, estimateWeeks: unknown): PlanSchedule {
  if (parseIsoDateUtc(sproutIso) === null) return { weeks: [], estimatedFinish: "" };
  const E = clampEstimateWeeks(estimateWeeks);
  const weeks: WeekDates[] = [];
  for (let w = 1; w <= E; w++) weeks.push(computeWeekDates(sproutIso, w));
  return { weeks, estimatedFinish: weeks[weeks.length - 1].endIso };
}

export interface StageValidation {
  valid: boolean;
  error: string;
}

/** Stages must be whole weeks, in order, gap-free, and cover weeks 1..E. */
export function validateStageWeeks(
  stages: StageWeeks,
  estimateWeeks: number,
  trichomeWeek: number,
): StageValidation {
  const E = Number(estimateWeeks);
  const ordered: { name: StageName; start: number; end: number }[] = [
    { name: "Seedling", start: Number(stages.seedling.start), end: Number(stages.seedling.end) },
    { name: "Veg", start: Number(stages.veg.start), end: Number(stages.veg.end) },
    {
      name: "Pre-flower",
      start: Number(stages.preflower.start),
      end: Number(stages.preflower.end),
    },
    { name: "Flower", start: Number(stages.flower.start), end: Number(stages.flower.end) },
    {
      name: "Ripening & harvest window",
      start: Number(stages.ripening.start),
      end: Number(stages.ripening.end),
    },
  ];
  for (let i = 0; i < ordered.length; i++) {
    const st = ordered[i];
    if (!Number.isInteger(st.start) || !Number.isInteger(st.end)) {
      return { valid: false, error: `${st.name} start and end weeks must be whole numbers.` };
    }
    if (st.start < 1 || st.end > E) {
      return { valid: false, error: `${st.name} weeks must fit within weeks 1 to ${E}.` };
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
  if (ordered[0].start !== 1 || ordered[ordered.length - 1].end !== E) {
    return { valid: false, error: `Stage weeks must start at week 1 and end at week ${E}.` };
  }
  const tw = Number(trichomeWeek);
  if (!Number.isInteger(tw) || tw < 1 || tw > E) {
    return {
      valid: false,
      error: `Start checking trichomes week must be between week 1 and week ${E}.`,
    };
  }
  return { valid: true, error: "" };
}

export function getStageForWeek(weekNum: number, stages: StageWeeks): StageName {
  const within = (r: WeekRange) => weekNum >= r.start && weekNum <= r.end;
  if (within(stages.seedling)) return "Seedling";
  if (within(stages.veg)) return "Veg";
  if (within(stages.preflower)) return "Pre-flower";
  if (within(stages.flower)) return "Flower";
  return "Ripening & harvest window";
}

/** Signed day difference between an actual milestone date and its planned week's start. */
export function computeMilestoneDifference(
  sproutIso: string,
  plannedWeekStart: number,
  actualDateIso: string,
): string {
  if (!actualDateIso) return "";
  const plannedStartIso = addDaysIso(sproutIso, 7 * (plannedWeekStart - 1));
  const diff = plannedStartIso ? daysBetweenIso(plannedStartIso, actualDateIso) : null;
  if (diff === null) return "";
  const unit = (n: number) => (n === 1 ? " day" : " days");
  if (diff > 0) return `+${diff}${unit(diff)}`;
  if (diff < 0) return `−${Math.abs(diff)}${unit(Math.abs(diff))}`;
  return "0 days";
}

export interface CurrentWeekStatus {
  status: string;
  week: number | null;
  stage: StageName | null;
}

/** Current-week lookup; `todayIso` is injected by the caller (never read here). */
export function lookupCurrentWeekStatus(
  sproutIso: string,
  todayIso: string,
  estimateWeeks: number,
  stages: StageWeeks,
): CurrentWeekStatus {
  const diff = daysBetweenIso(sproutIso, todayIso);
  if (diff === null) return { status: "Invalid date", week: null, stage: null };
  if (diff < 0) return { status: "Not started yet", week: null, stage: null };
  const weekNum = Math.floor(diff / 7) + 1;
  if (weekNum > Number(estimateWeeks)) {
    return { status: "Past your estimate", week: weekNum, stage: null };
  }
  const stage = getStageForWeek(weekNum, stages);
  return { status: `Week ${weekNum} (${stage})`, week: weekNum, stage };
}

/** True when an event may fire: first time, or `windowMs` or more since the last emit. */
export function shouldEmitThrottled(
  lastEmittedAtMs: number | null,
  nowMs: number,
  windowMs = 2000,
): boolean {
  if (lastEmittedAtMs === null) return true;
  return nowMs - lastEmittedAtMs >= windowMs;
}

export const STAGE_GUIDANCE: Record<StageName, string> = {
  Seedling: "Log sprout, first true leaves, watering and room °F/RH.",
  Veg: "Log new nodes, watering and feeding (planned vs actual), and climate.",
  "Pre-flower": "Watch the top nodes for first pistils and log the date.",
  Flower: "Log feeding vs your brand's autoflower chart, climate and photos.",
  "Ripening & harvest window": "Check trichomes every few days and log them.",
};

export const MILESTONE_DEFS = [
  { key: "true_leaves", label: "First true leaves" },
  { key: "first_pistils", label: "First pistils" },
  { key: "stretch_slows", label: "Stretch slows" },
  { key: "first_amber", label: "First amber trichomes" },
  { key: "harvest", label: "Harvest" },
] as const;

export type MilestoneKey = (typeof MILESTONE_DEFS)[number]["key"];

export const LIGHT_CODES = ["18_6", "20_4", "other"] as const;
export type LightCode = (typeof LIGHT_CODES)[number];

export interface MilestoneEntry {
  actualDate: string;
  note: string;
}

export interface AutoflowerPlanState {
  sproutDate: string;
  estimateWeeks: number;
  plantName: string;
  lightCode: LightCode;
  lightCustomText: string;
  stages: StageWeeks;
  trichomeWeek: number;
  doneWeeks: Record<number, boolean>;
  milestones: Record<MilestoneKey, MilestoneEntry>;
}

export function stagesFromOutline(outline: StageOutline): StageWeeks {
  return {
    seedling: { ...outline.seedling },
    veg: { ...outline.veg },
    preflower: { ...outline.preflower },
    flower: { ...outline.flower },
    ripening: { ...outline.ripening },
  };
}

function emptyMilestones(): Record<MilestoneKey, MilestoneEntry> {
  return {
    true_leaves: { actualDate: "", note: "" },
    first_pistils: { actualDate: "", note: "" },
    stretch_slows: { actualDate: "", note: "" },
    first_amber: { actualDate: "", note: "" },
    harvest: { actualDate: "", note: "" },
  };
}

/** Default planner state; `sproutDate` is injected (the page passes today's local date). */
export function createDefaultAutoflowerPlan(
  sproutDate: string,
  estimateWeeks: unknown = 10,
): AutoflowerPlanState {
  const outline = getDefaultStageOutline(estimateWeeks);
  return {
    sproutDate,
    estimateWeeks: outline.estimateWeeks,
    plantName: "",
    lightCode: "18_6",
    lightCustomText: "24/0 (custom)",
    stages: stagesFromOutline(outline),
    trichomeWeek: outline.trichomeWeek,
    doneWeeks: {},
    milestones: emptyMilestones(),
  };
}

export function getLightDisplayLabel(lightCode: LightCode, customText: string): string {
  if (lightCode === "18_6") return "18/6 (18 hours on, 6 off)";
  if (lightCode === "20_4") return "20/4 (20 hours on, 4 off)";
  const custom = customText.trim();
  return custom ? `Other: ${custom}` : "Other (custom)";
}

export interface PlannedMilestone {
  weekLabel: string;
  startWeek: number;
}

export function getPlannedMilestoneMeta(
  state: Pick<AutoflowerPlanState, "stages" | "estimateWeeks" | "trichomeWeek">,
): Record<MilestoneKey, PlannedMilestone> {
  const s = state.stages;
  const E = state.estimateWeeks;
  // Never before flower starts, even after the grower edits the stage weeks.
  const stretchWeek = Math.max(s.flower.start, Math.min(s.flower.start + 2, Math.max(1, E - 2)));
  return {
    true_leaves: {
      weekLabel:
        s.seedling.start === s.seedling.end
          ? `Week ${s.seedling.start}`
          : `Weeks ${s.seedling.start}–${s.seedling.end}`,
      startWeek: s.seedling.start,
    },
    first_pistils: { weekLabel: `Week ${s.preflower.start}`, startWeek: s.preflower.start },
    stretch_slows: { weekLabel: `Week ${stretchWeek}`, startWeek: stretchWeek },
    first_amber: { weekLabel: `Week ${state.trichomeWeek}`, startWeek: state.trichomeWeek },
    harvest: { weekLabel: `Week ${E}`, startWeek: E },
  };
}

export function countLoggedMilestones(state: Pick<AutoflowerPlanState, "milestones">): number {
  return MILESTONE_DEFS.filter((def) => Boolean(state.milestones[def.key]?.actualDate)).length;
}

export function plannedMilestoneStartIso(sproutIso: string, startWeek: number): string {
  return addDaysIso(sproutIso, 7 * (startWeek - 1));
}

const EXPORT_HEADERS = [
  "Section",
  "Plant",
  "Week / Milestone",
  "Dates / Planned Week",
  "Stage / Actual Date",
  "Light / Difference",
  "What to Check and Log / Note",
  "Done",
] as const;

function buildExportMatrix(state: AutoflowerPlanState, trichomeSuffix: string): string[][] {
  const light = getLightDisplayLabel(state.lightCode, state.lightCustomText);
  const plant = state.plantName.trim() || "Autoflower";
  const rows: string[][] = [[...EXPORT_HEADERS]];
  for (const week of computePlanSchedule(state.sproutDate, state.estimateWeeks).weeks) {
    const stage = getStageForWeek(week.week, state.stages);
    const guidance =
      STAGE_GUIDANCE[stage] + (week.week === state.trichomeWeek ? trichomeSuffix : "");
    rows.push([
      "Plan",
      plant,
      `Week ${week.week}`,
      `${week.startIso} to ${week.endIso}`,
      stage,
      light,
      guidance,
      state.doneWeeks[week.week] ? "Yes" : "No",
    ]);
  }
  const meta = getPlannedMilestoneMeta(state);
  for (const def of MILESTONE_DEFS) {
    const entry = state.milestones[def.key];
    const planned = meta[def.key];
    rows.push([
      "Milestone",
      plant,
      def.label,
      `${planned.weekLabel} (starts ${plannedMilestoneStartIso(state.sproutDate, planned.startWeek)})`,
      entry.actualDate || "",
      computeMilestoneDifference(state.sproutDate, planned.startWeek, entry.actualDate),
      entry.note || "",
      "",
    ]);
  }
  return rows;
}

export function buildAutoflowerPlanCsv(state: AutoflowerPlanState): string {
  return buildExportMatrix(state, " [Milestone: Start checking trichomes]")
    .map((row) => row.map((cell) => escapeCsvField(cell)).join(","))
    .join("\r\n");
}

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/** TSV cell for pasting into a spreadsheet: one line, and never a live formula. */
function tsvCell(value: string): string {
  const flat = value.replace(/[\t\r\n]+/g, " ");
  const leadingSignIsFormula = /^[+-]/.test(flat) && !PLAIN_NUMBER.test(flat);
  return /^[=@]/.test(flat) || leadingSignIsFormula ? `'${flat}` : flat;
}

export function buildAutoflowerPlanTsv(state: AutoflowerPlanState): string {
  return buildExportMatrix(state, " (Milestone: Start checking trichomes)")
    .map((row) => row.map((cell) => tsvCell(cell)).join("\t"))
    .join("\n");
}

export function autoflowerPlanCsvFilename(isoDate: string): string {
  return `autoflower-plan-${isoDate}.csv`;
}

export function autoflowerWeekPlanWebApplicationJsonLd(pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Autoflower Week-by-Week Planner",
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
