/**
 * Athena planned-vs-actual feed log. Pure: no React, no storage, no clock.
 * Planned amounts stay blank. This module never stores an Athena dosage.
 */

export const ATHENA_FEED_LOG_PATH = "/guides/athena-feed-chart-log" as const;

export const ATHENA_FEED_LOG_TITLE =
  "Athena Feed Chart Log: Pro Line & Blended, Planned vs Actual" as const;

export const ATHENA_FEED_LOG_H1 = "Athena Feed Chart Log: Track What You Actually Fed" as const;

export const ATHENA_FEED_LOG_DESCRIPTION =
  "Running the Athena feed chart? Log what you actually fed each week vs the Pro Line or Blended schedule, plus EC, pH and runoff. Free printable log." as const;

export const ATHENA_FEED_LOG_CTA_HREF = "/auth?mode=signup" as const;

export const ATHENA_FEED_LOG_DISCLAIMER =
  "Athena, Athena Pro Line and Athena Blended are trademarks of their respective owners. Verdant Grow Diary is not affiliated with, sponsored by, or endorsed by Athena. Always follow the official feed schedule and product labels." as const;

export const ATHENA_PRO_LINE_SCHEDULE_URL =
  "https://support.athenaag.com/hc/en-us/articles/17190427112859-Pro-Line-Feed-Schedules" as const;

export const ATHENA_BLENDED_SCHEDULE_URL =
  "https://support.athenaag.com/hc/en-us/articles/17189523484443-Blended-Line-Feed-Schedules" as const;

export const ATHENA_BLENDED_ALL_LANGUAGES_URL =
  "https://support.athenaag.com/hc/en-us/articles/17292543636251-Blended-Line-Feed-Schedules-all-languages" as const;

export const ATHENA_PRO_LINE_PRODUCT_URL = "https://www.athenaag.com/pro-line" as const;

export const ATHENA_RELATED_FEED_LOG_PATH = "/guides/advanced-nutrients-feeding-chart-log" as const;

export const FEED_LOG_MIN_PRODUCTS = 1;
export const FEED_LOG_MAX_PRODUCTS = 8;
export const FEED_LOG_MIN_WEEKS = 1;
export const FEED_LOG_MAX_WEEKS = 30;
export const FEED_LOG_DEFAULT_WEEKS = 12;
export const FEED_LOG_DEFAULT_TOLERANCE = "10";

export const FEED_LOG_STAGES = [
  "Clone/Seedling",
  "Veg",
  "Early Flower",
  "Late Flower",
  "Flush/Other",
] as const;

export const FEED_LOG_RESPONSES = [
  "Not noted",
  "Looks good",
  "Tip burn",
  "Pale or yellowing",
  "Clawing",
  "Drooping",
  "Other",
] as const;

export const ATHENA_LINES = ["pro_line", "blended"] as const;
export const ATHENA_MEASURING_METHODS = ["by_concentrate", "by_weight"] as const;
export const FEED_LOG_MEDIA = ["Coco", "Rockwool", "Peat-based or soil", "Other"] as const;
export const FEED_LOG_AMOUNT_UNITS = ["ml/gal", "ml/L", "g/gal", "g/L", "Other"] as const;
export const FEED_LOG_WATER_UNITS = ["gal", "L"] as const;
export const FEED_LOG_READING_TYPES = ["EC (mS/cm)", "PPM 500 scale", "PPM 700 scale"] as const;

export type AthenaLine = (typeof ATHENA_LINES)[number];
export type AthenaMeasuringMethod = (typeof ATHENA_MEASURING_METHODS)[number];
export type FeedLogStage = (typeof FEED_LOG_STAGES)[number];
export type FeedLogResponse = (typeof FEED_LOG_RESPONSES)[number];
export type FeedLogMedium = (typeof FEED_LOG_MEDIA)[number];
export type FeedLogAmountUnit = (typeof FEED_LOG_AMOUNT_UNITS)[number];
export type FeedLogWaterUnit = (typeof FEED_LOG_WATER_UNITS)[number];
export type FeedLogReadingType = (typeof FEED_LOG_READING_TYPES)[number];

export interface FeedLogProductCell {
  planned: string;
  actual: string;
}

export interface FeedLogWeek {
  stage: FeedLogStage;
  date: string;
  products: FeedLogProductCell[];
  feedPh: string;
  feedEcPpm: string;
  runoffPh: string;
  runoffEcPpm: string;
  avgTempF: string;
  avgRh: string;
  vpd: string;
  response: FeedLogResponse;
  notes: string;
}

export interface FeedLogState {
  growName: string;
  line: AthenaLine;
  measuringMethod: AthenaMeasuringMethod;
  medium: FeedLogMedium;
  amountUnit: FeedLogAmountUnit;
  waterVol: string;
  waterUnit: FeedLogWaterUnit;
  readingType: FeedLogReadingType;
  tolerance: string;
  products: string[];
  weeks: FeedLogWeek[];
}

export interface FeedLogCellResult {
  plannedNum: number | null;
  actualNum: number | null;
  diffNum: number | null;
  diffFormatted: string;
  pctFormatted: string;
  flag: "Over plan" | "Under plan" | null;
}

export const ATHENA_FEED_LOG_FAQ = [
  {
    question: "Where is the official Athena feed chart?",
    answer:
      "On Athena's support site: Pro Line Feed Schedules and Blended Line Feed Schedules, as Imperial and Metric PDFs.",
  },
  {
    question: "What's the difference between the Pro Line and Blended feed charts?",
    answer:
      "Pro Line is Athena's dry soluble program, with charts for measuring by concentrate or by weight. Blended is its liquid program, with a separate Fade version of the chart.",
  },
  {
    question: "Is this an official Athena chart?",
    answer:
      "No. It's a free log for recording what you fed against the official chart. Verdant Grow Diary is not affiliated with Athena.",
  },
  {
    question: "Does Athena have a feed calculator?",
    answer:
      "We didn't find an official Athena calculator. Use the official feed schedule PDFs for your line and medium.",
  },
  {
    question: "What should I record each week?",
    answer:
      "Planned and actual amounts per product, EC or PPM and pH going in and in the runoff, temperature (°F), RH and VPD, and plant response notes.",
  },
] as const;

export function athenaLineLabel(line: AthenaLine): string {
  return line === "pro_line" ? "Pro Line" : "Blended";
}

export function athenaScheduleUrl(line: AthenaLine): string {
  return line === "pro_line" ? ATHENA_PRO_LINE_SCHEDULE_URL : ATHENA_BLENDED_SCHEDULE_URL;
}

export function athenaPlannedHelper(state: Pick<FeedLogState, "line" | "measuringMethod">): string {
  if (state.line === "blended") {
    return "Copy Planned from your official Blended Line feed schedule.";
  }
  const method =
    state.measuringMethod === "by_weight" ? "measuring by weight" : "measuring by concentrate";
  return `Copy Planned from your official Pro Line feed schedule (${method}).`;
}

export function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "") return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

export function formatSignedDifference(diff: number): string {
  if (diff > 0) return `+${diff.toFixed(2)}`;
  if (diff < 0) return `\u2212${Math.abs(diff).toFixed(2)}`;
  return "0.00";
}

export function evaluateProductCell(
  plannedRaw: unknown,
  actualRaw: unknown,
  toleranceRaw: unknown,
): FeedLogCellResult {
  const plannedNum = parseOptionalNumber(plannedRaw);
  const actualNum = parseOptionalNumber(actualRaw);
  let tolerance = parseOptionalNumber(toleranceRaw);
  if (tolerance === null || tolerance < 1) tolerance = 10;

  let diffNum: number | null = null;
  let diffFormatted = "";
  if (plannedNum !== null && actualNum !== null) {
    diffNum = actualNum - plannedNum;
    diffFormatted = formatSignedDifference(diffNum);
  }

  let pctFormatted = "";
  let flag: FeedLogCellResult["flag"] = null;
  if (plannedNum !== null && plannedNum > 0 && actualNum !== null) {
    const pct = (actualNum / plannedNum) * 100;
    pctFormatted = String(Math.round(pct));
    const relDiffPct = (Math.abs(actualNum - plannedNum) / plannedNum) * 100;
    const roundedRelDiff = Math.round(relDiffPct * 1e6) / 1e6;
    if (roundedRelDiff > tolerance) {
      flag = actualNum > plannedNum ? "Over plan" : "Under plan";
    }
  }

  return { plannedNum, actualNum, diffNum, diffFormatted, pctFormatted, flag };
}

export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function emptyProducts(count: number): FeedLogProductCell[] {
  return Array.from({ length: count }, () => ({ planned: "", actual: "" }));
}

function defaultStageForWeek(index: number): FeedLogStage {
  if (index === 0) return "Clone/Seedling";
  if (index >= 1 && index <= 3) return "Veg";
  if (index >= 4 && index <= 7) return "Early Flower";
  if (index >= 8 && index <= 10) return "Late Flower";
  return "Flush/Other";
}

export function createEmptyWeek(productCount: number, index = 1): FeedLogWeek {
  return {
    stage: defaultStageForWeek(index),
    date: "",
    products: emptyProducts(productCount),
    feedPh: "",
    feedEcPpm: "",
    runoffPh: "",
    runoffEcPpm: "",
    avgTempF: "",
    avgRh: "",
    vpd: "",
    response: "Not noted",
    notes: "",
  };
}

export function createDefaultFeedLogState(): FeedLogState {
  const productCount = 3;
  const weeks = Array.from({ length: FEED_LOG_DEFAULT_WEEKS }, (_, index) =>
    createEmptyWeek(productCount, index),
  );
  return {
    growName: "",
    line: "pro_line",
    measuringMethod: "by_concentrate",
    medium: "Coco",
    amountUnit: "ml/gal",
    waterVol: "",
    waterUnit: "gal",
    readingType: "EC (mS/cm)",
    tolerance: FEED_LOG_DEFAULT_TOLERANCE,
    products: ["Product 1", "Product 2", "Product 3"],
    weeks,
  };
}

export interface FeedLogProductSummary {
  name: string;
  totalPlanned: number;
  totalActual: number;
  weeksFlagged: number;
}

export interface FeedLogSummary {
  weeksFilled: number;
  weeksFlagged: number;
  products: FeedLogProductSummary[];
}

export function summarizeFeedLog(state: FeedLogState): FeedLogSummary {
  const products: FeedLogProductSummary[] = state.products.map((name, index) => ({
    name: name.trim() || `Product ${index + 1}`,
    totalPlanned: 0,
    totalActual: 0,
    weeksFlagged: 0,
  }));
  let weeksFilled = 0;
  let weeksFlagged = 0;

  for (const week of state.weeks) {
    let rowHasActual = false;
    let rowFlagged = false;
    state.products.forEach((_, index) => {
      const cell = week.products[index] ?? { planned: "", actual: "" };
      const result = evaluateProductCell(cell.planned, cell.actual, state.tolerance);
      if (result.plannedNum !== null) products[index].totalPlanned += result.plannedNum;
      if (result.actualNum !== null) {
        products[index].totalActual += result.actualNum;
        rowHasActual = true;
      }
      if (result.flag) {
        products[index].weeksFlagged += 1;
        rowFlagged = true;
      }
    });
    if (rowHasActual) weeksFilled += 1;
    if (rowFlagged) weeksFlagged += 1;
  }

  return { weeksFilled, weeksFlagged, products };
}

export function feedLogCsvFilename(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `feed-log-${year}-${month}-${day}.csv`;
}

export function buildFeedLogExportMatrix(state: FeedLogState): string[][] {
  const headers = [
    "Grow Name",
    "Athena Line",
    "Measuring Method",
    "Medium",
    "Amount Unit",
    "Water Volume Per Feed",
    "Water Unit",
    "Nutrient Reading Type",
    "Tolerance %",
    "Week",
    "Stage",
    "Date",
  ];
  state.products.forEach((name, index) => {
    const label = name.trim() || `Product ${index + 1}`;
    headers.push(
      `${label} Planned (${state.amountUnit})`,
      `${label} Actual (${state.amountUnit})`,
      `${label} Difference`,
      `${label} % of Plan`,
      `${label} Flag`,
    );
  });
  headers.push(
    "Feed pH",
    `Feed ${state.readingType}`,
    "Runoff pH",
    `Runoff ${state.readingType}`,
    "Avg Temp (°F)",
    "Avg RH (%)",
    "VPD (kPa)",
    "Plant Response",
    "Notes",
  );

  const method = state.line === "pro_line" ? state.measuringMethod : "";
  const rows: string[][] = [headers];
  state.weeks.forEach((week, weekIndex) => {
    const line = [
      state.growName,
      state.line,
      method,
      state.medium,
      state.amountUnit,
      state.waterVol,
      state.waterUnit,
      state.readingType,
      state.tolerance,
      String(weekIndex + 1),
      week.stage,
      week.date,
    ];
    state.products.forEach((_, index) => {
      const cell = week.products[index] ?? { planned: "", actual: "" };
      const result = evaluateProductCell(cell.planned, cell.actual, state.tolerance);
      line.push(
        cell.planned,
        cell.actual,
        result.diffFormatted,
        result.pctFormatted === "" ? "" : `${result.pctFormatted}%`,
        result.flag ?? "",
      );
    });
    line.push(
      week.feedPh,
      week.feedEcPpm,
      week.runoffPh,
      week.runoffEcPpm,
      week.avgTempF,
      week.avgRh,
      week.vpd,
      week.response,
      week.notes,
    );
    rows.push(line);
  });
  return rows;
}

export function buildFeedLogCsv(state: FeedLogState): string {
  return buildFeedLogExportMatrix(state)
    .map((row) => row.map((cell) => escapeCsvField(cell)).join(","))
    .join("\r\n");
}

export function buildFeedLogTsv(state: FeedLogState): string {
  return buildFeedLogExportMatrix(state)
    .map((row) => row.map((cell) => String(cell ?? "").replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

export function addFeedLogWeek(state: FeedLogState): FeedLogState {
  if (state.weeks.length >= FEED_LOG_MAX_WEEKS) return state;
  return {
    ...state,
    weeks: [...state.weeks, createEmptyWeek(state.products.length, state.weeks.length)],
  };
}

export function removeFeedLogWeek(state: FeedLogState): FeedLogState {
  if (state.weeks.length <= FEED_LOG_MIN_WEEKS) return state;
  return { ...state, weeks: state.weeks.slice(0, -1) };
}

export function addFeedLogProduct(state: FeedLogState): FeedLogState {
  if (state.products.length >= FEED_LOG_MAX_PRODUCTS) return state;
  const nextIndex = state.products.length + 1;
  return {
    ...state,
    products: [...state.products, `Product ${nextIndex}`],
    weeks: state.weeks.map((week) => ({
      ...week,
      products: [...week.products, { planned: "", actual: "" }],
    })),
  };
}

export function removeFeedLogProduct(state: FeedLogState): FeedLogState {
  if (state.products.length <= FEED_LOG_MIN_PRODUCTS) return state;
  return {
    ...state,
    products: state.products.slice(0, -1),
    weeks: state.weeks.map((week) => ({
      ...week,
      products: week.products.slice(0, -1),
    })),
  };
}

export function athenaFeedLogWebApplicationJsonLd(pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Feed Log: Planned vs Actual (Athena)",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    url: pageUrl,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: {
      "@type": "Organization",
      name: "Verdant Grow Diary",
      url: "https://verdantgrowdiary.com",
    },
  } as const;
}
