/**
 * Planned-vs-actual feed log. Pure: no React, no storage, no clock.
 * Planned amounts stay blank. This module never stores a chart dosage.
 */

export const PUBLIC_FEED_LOG_PATH = "/guides/advanced-nutrients-feeding-chart-log" as const;

export const PUBLIC_FEED_LOG_TITLE =
  "Advanced Nutrients Feeding Chart Log: Planned vs Actual" as const;

export const PUBLIC_FEED_LOG_H1 =
  "Advanced Nutrients Feeding Chart Log: Track What You Actually Fed" as const;

export const PUBLIC_FEED_LOG_DESCRIPTION =
  "Using the Advanced Nutrients feeding chart? Log what you actually fed each week vs the chart, plus pH, EC and plant response. Free printable log." as const;

export const PUBLIC_FEED_LOG_SIGNUP_PATH = "/auth?mode=signup" as const;

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

export const FEED_LOG_MEDIA = ["Soil", "Coco", "Hydro", "Other"] as const;
export const FEED_LOG_AMOUNT_UNITS = ["ml/L", "ml/gal"] as const;
export const FEED_LOG_WATER_UNITS = ["L", "gal"] as const;
export const FEED_LOG_READING_TYPES = ["EC (mS/cm)", "PPM 500 scale", "PPM 700 scale"] as const;

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
  productLine: string;
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

export const FEED_LOG_FAQ = [
  {
    question: "Where is the official Advanced Nutrients feeding chart?",
    answer:
      "On advancednutrients.com/feeding/ (downloadable charts), and the nutrient calculator is at advancednutrients.com/nutrient-calculator/.",
  },
  {
    question: "Is this an official Advanced Nutrients chart?",
    answer:
      "No. It's a free log template for recording what you fed against the official chart. Verdant Grow Diary is not affiliated with Advanced Nutrients.",
  },
  {
    question: "Why log what I actually fed?",
    answer:
      "So you can see where you deviated from the plan and how plants responded, and adjust your next grow.",
  },
  {
    question: "Does BudLabs already do this?",
    answer:
      "BudLabs offers a nutrient calculator for Advanced Nutrients products plus crops, tasks, daily notes and photos. Verdant's log is brand-neutral and sits next to your environment readings like VPD.",
  },
  {
    question: "What should I record each week?",
    answer:
      "Planned and actual amounts per product, pH and EC/PPM going in and in the runoff, temperature (°F), RH and VPD, and plant response notes.",
  },
] as const;

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

const PLAIN_SPREADSHEET_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/** Prefix formula-leading text. Plain signed numbers stay unchanged. */
export function guardSpreadsheetFormula(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  const leadingSignIsFormula = /^[+-]/.test(str) && !PLAIN_SPREADSHEET_NUMBER.test(str);
  if (/^[=@\t\r]/.test(str) || leadingSignIsFormula) str = `'${str}`;
  return str;
}

export function escapeCsvField(value: unknown): string {
  const str = guardSpreadsheetFormula(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function escapeTsvField(value: unknown): string {
  return guardSpreadsheetFormula(value).replace(/[\t\r\n]+/g, " ");
}

export function parseCsvSingleField(escapedField: string): string {
  if (
    escapedField.length >= 2 &&
    escapedField.charAt(0) === '"' &&
    escapedField.charAt(escapedField.length - 1) === '"'
  ) {
    return escapedField.slice(1, -1).replace(/""/g, '"');
  }
  return escapedField;
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
    productLine: "",
    medium: "Soil",
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

export function buildFeedLogExportMatrix(state: FeedLogState): string[][] {
  const headers = [
    "Grow Name",
    "Product Line",
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

  const rows: string[][] = [headers];
  state.weeks.forEach((week, weekIndex) => {
    const line = [
      state.growName,
      state.productLine,
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
    .map((row) => row.map((cell) => escapeTsvField(cell)).join("\t"))
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

export function feedLogWebApplicationJsonLd(pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Feed Log: Planned vs Actual",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    url: pageUrl,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  } as const;
}
