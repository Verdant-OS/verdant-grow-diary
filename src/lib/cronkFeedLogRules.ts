/**
 * Cronk planned-vs-actual feed log. Pure: no React, no storage, no clock.
 * Planned amounts stay blank. This module never stores a Cronk dosage, EC, PPM, or pH target.
 */

export const CRONK_FEED_LOG_PATH = "/guides/cronk-nutrients-grow-diary" as const;

export const CRONK_FEED_LOG_TITLE = "Cronk Nutrients Feeding Chart Log & Grow Diary" as const;

export const CRONK_FEED_LOG_H1 =
  "Cronk Nutrients Grow Diary: Log Your Feeding Chart, Planned vs Actual" as const;

export const CRONK_FEED_LOG_DESCRIPTION =
  "Using Cronk Nutrients? Log what you actually fed vs your Classic, Bonnie & Clyde or PuurOrganics feed chart, plus EC, pH and runoff. Free log." as const;

export const CRONK_FEED_LOG_CTA_HREF = "/auth?mode=signup" as const;
export const CRONK_FEED_LOG_CTA_LABEL = "Keep this log in Verdant →" as const;

/** Original publish commit 137241b7, 2026-07-16. Sitemap lastmod matched that day. */
export const CRONK_FEED_LOG_DATE_PUBLISHED = "2026-07-16" as const;
export const CRONK_FEED_LOG_DATE_MODIFIED = "2026-10-26" as const;

export const CRONK_FEED_LOG_DISCLAIMER =
  "Cronk Nutrients, Bonnie & Clyde and PuurOrganics are trademarks of their respective owners. Verdant Grow Diary is not affiliated with, sponsored by, or endorsed by Cronk Nutrients. Always follow the official feeding chart and product labels." as const;

export const CRONK_CHARTS_HUB_URL =
  "https://growers.cronknutrients.com/en-US/feeding-charts-for-cronk-nutrients-lines-2641633" as const;
export const CRONK_CALCULATOR_URL =
  "https://growers.cronknutrients.com/tools/cannabis-nutrient-calculator" as const;
export const CRONK_CLASSIC_CHART_URL =
  "https://cdn.shopify.com/s/files/1/0843/6527/9543/files/3-Part_Nutrient_System_Feed_Program_Imperial_April_2024.pdf" as const;
export const CRONK_BONNIE_CLYDE_CHART_URL =
  "https://cdn.shopify.com/s/files/1/0843/6527/9543/files/Autoflower-Nutrient-System-Feed-Program-Soil-Imperial.pdf" as const;
export const CRONK_RETAILERS_URL =
  "https://www.cronknutrients.com/pages/authorized-retailers" as const;
export const CRONK_STORE_URL = "https://www.cronknutrients.com/" as const;

export const CRONK_VPD_TRACKER_PATH = "/guides/grow-room-vpd-tracker" as const;
export const CRONK_VPD_CALCULATOR_PATH = "/tools/vpd-calculator" as const;

export const CRONK_RELATED_FEED_LOGS = [
  {
    href: "/guides/advanced-nutrients-feeding-chart-log",
    label: "Advanced Nutrients feeding chart log",
  },
  { href: "/guides/athena-feed-chart-log", label: "Athena feed chart log" },
] as const;

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

export const CRONK_LINES = ["classic", "bonnie_clyde", "puurorganics"] as const;
export const FEED_LOG_MEDIA = [
  "Soil",
  "Coco",
  "Hydro",
  "Coco & Pro-Mix HP",
  "Bagged soil",
  "AutoPots",
  "Living soil",
  "Other",
] as const;
export const FEED_LOG_AMOUNT_UNITS = ["ml/gal", "ml/L", "Other"] as const;
export const FEED_LOG_WATER_UNITS = ["gal", "L"] as const;
export const FEED_LOG_READING_TYPES = ["EC (mS/cm)", "PPM 500 scale", "PPM 700 scale"] as const;

export type CronkLine = (typeof CRONK_LINES)[number];
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
  line: CronkLine;
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

export const CRONK_FEED_LOG_FAQ = [
  {
    question: "Are Cronk Nutrients any good?",
    answer:
      "We don't rate nutrient brands. The way to judge any line in your own grow is to log what you planned, what you actually fed and how your plants responded over a full run. That's what this log is for.",
  },
  {
    question: "Where can I buy Cronk Nutrients?",
    answer:
      "From Cronk's own store at cronknutrients.com, which also lists authorized retailers on its Authorized Retailers page.",
  },
  {
    question: "Who owns Cronk Nutrients?",
    answer:
      "We couldn't find a public ownership statement. Cronk Nutrients lists its address in Rosenberg, Texas, and its Growers Hub says it has been growing since 2019.",
  },
  {
    question: "Where is the official Cronk Nutrients feeding chart?",
    answer:
      "On Cronk's Growers Hub, as PDFs for the Classic, Bonnie & Clyde and PuurOrganics lines. Cronk also has a nutrient calculator there.",
  },
  {
    question: "Does Verdant provide a Cronk feeding chart?",
    answer:
      "No. Use Cronk's official chart for your line and medium. Verdant records what you planned, what you actually mixed and how your plants responded.",
  },
  {
    question: "Can one runoff reading prove Cronk Nutrients is burning my plant?",
    answer:
      "No. One reading is a clue, not proof. Look for a pattern across several feeds alongside your input EC or PPM, pH, environment and plant response.",
  },
] as const;

export function cronkLineLabel(line: CronkLine): string {
  if (line === "classic") return "Classic";
  if (line === "bonnie_clyde") return "Bonnie & Clyde (autoflower)";
  return "PuurOrganics";
}

export function cronkScheduleUrl(line: CronkLine): string {
  if (line === "classic") return CRONK_CLASSIC_CHART_URL;
  if (line === "bonnie_clyde") return CRONK_BONNIE_CLYDE_CHART_URL;
  return CRONK_CHARTS_HUB_URL;
}

export function cronkPlannedHelper(line: CronkLine): string {
  if (line === "classic") return "Copy Planned from your official Cronk Classic feeding chart.";
  if (line === "bonnie_clyde") {
    return "Copy Planned from your official Bonnie & Clyde feeding chart.";
  }
  return "Copy Planned from the official PuurOrganics chart for your medium.";
}

export function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "" || Number.isNaN(Number(str))) return null;
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
  if (tolerance === null) tolerance = 10;

  let diffNum: number | null = null;
  let diffFormatted = "";
  if (plannedNum !== null && actualNum !== null) {
    diffNum = actualNum - plannedNum;
    diffFormatted = formatSignedDifference(diffNum);
  }

  let pctFormatted = "";
  let flag: FeedLogCellResult["flag"] = null;
  if (plannedNum !== null && plannedNum > 0 && actualNum !== null) {
    pctFormatted = String(Math.round((actualNum / plannedNum) * 100));
    const relDiffPct = (Math.abs(actualNum - plannedNum) / plannedNum) * 100;
    if (relDiffPct > tolerance + 1e-9) {
      flag = actualNum > plannedNum ? "Over plan" : "Under plan";
    }
  }

  return { plannedNum, actualNum, diffNum, diffFormatted, pctFormatted, flag };
}

export function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function parseCsvSingleField(escapedField: string): string {
  if (escapedField.length >= 2 && escapedField.startsWith('"') && escapedField.endsWith('"')) {
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

export function createEmptyWeek(productCount: number, index = 0): FeedLogWeek {
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
  return {
    growName: "",
    line: "classic",
    medium: "Soil",
    amountUnit: "ml/gal",
    waterVol: "",
    waterUnit: "gal",
    readingType: "EC (mS/cm)",
    tolerance: FEED_LOG_DEFAULT_TOLERANCE,
    products: ["Product 1", "Product 2", "Product 3"],
    weeks: Array.from({ length: FEED_LOG_DEFAULT_WEEKS }, (_, index) =>
      createEmptyWeek(productCount, index),
    ),
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
  return `cronk-feed-log-${year}-${month}-${day}.csv`;
}

export function buildFeedLogExportMatrix(state: FeedLogState): string[][] {
  const headers = [
    "Grow Name",
    "Cronk Line",
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
      state.line,
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
  const next = state.products.length + 1;
  return {
    ...state,
    products: [...state.products, `Product ${next}`],
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
    weeks: state.weeks.map((week) => ({ ...week, products: week.products.slice(0, -1) })),
  };
}

export function cronkFeedLogWebApplicationJsonLd(pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Feed Log: Planned vs Actual (Cronk Nutrients)",
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

const DOSE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:ml|mL|tsp|tbsp|g|ppm|ec|ph)\b/i;

export function cronkPublicCopyHasDoseNumbers(copy: string): boolean {
  return DOSE_PATTERN.test(copy);
}
