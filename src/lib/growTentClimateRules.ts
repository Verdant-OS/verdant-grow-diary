/**
 * growTentClimateRules — pure logic for /guides/grow-tent-temperature-humidity-chart.
 *
 * Stage bands and the SVP/VPD formula are imported from the /vpd-chart rules
 * (`publicVpdChartRules`); this module never restates a band number. No React,
 * no I/O, no clock: callers pass `nowMs` into `shouldEmitThrottled`.
 */
import {
  PUBLIC_VPD_CHART_STAGES,
  calculatePublicVpdChartFromFahrenheit,
  publicVpdChartFahrenheitToCelsius,
  publicVpdChartOffsetFahrenheitToCelsius,
  publicVpdChartSaturationVaporPressureKpa,
  type PublicVpdChartStage,
  type PublicVpdChartStageId,
} from "@/lib/publicVpdChartRules";
import { escapeCsvField } from "@/lib/athenaFeedLogRules";

export const GROW_TENT_CLIMATE_PATH = "/guides/grow-tent-temperature-humidity-chart" as const;

export const GROW_TENT_CLIMATE_TITLE =
  "Grow Tent Temperature & Humidity Chart + Humidity Fixer (°F)" as const;

export const GROW_TENT_CLIMATE_H1 =
  "Grow Tent Temperature & Humidity Chart: Check Your Tent and Fix RH" as const;

export const GROW_TENT_CLIMATE_DESCRIPTION =
  "Enter your tent's °F and RH to see if you're in range for your growth stage, then get fixes for humidity that's too high or too low. Free, no sign-up." as const;

export const GROW_TENT_CLIMATE_CTA_HREF =
  "/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=grow-tent-temperature-humidity-chart" as const;

export const GROW_TENT_CLIMATE_DATE_MODIFIED = "2026-10-28" as const;

export const GROW_TENT_CLIMATE_SOURCE_URLS = {
  spiderFarmerVpd: "https://www.spider-farmer.com/blog/vpd-chart-in-celsius-and-fahrenheit/",
  gorilla: "https://www.gorillagrowtent.com/blogs/news/vpd-chart",
  aroya: "https://aroya.io/vpd-chart",
  vivosun: "https://vivosun.com/growing_guide/temperature-and-humidity/",
  trimleaf:
    "https://trimleaf.com/blogs/articles/grow-room-temp-and-humidity-chart-for-perfect-climate-control",
  spiderFarmerIdeal:
    "https://www.spider-farmer.com/blog/what-is-the-ideal-temp-and-humidity-for-your-grow-tent/",
} as const;

export const GROW_TENT_CLIMATE_SOURCES = [
  {
    label: "Spider Farmer — VPD Chart in Celsius and Fahrenheit",
    url: GROW_TENT_CLIMATE_SOURCE_URLS.spiderFarmerVpd,
  },
  { label: "Gorilla Grow Tent — VPD Chart", url: GROW_TENT_CLIMATE_SOURCE_URLS.gorilla },
  { label: "Aroya — VPD Chart", url: GROW_TENT_CLIMATE_SOURCE_URLS.aroya },
  {
    label: "Vivosun — Temperature and Humidity Guide",
    url: GROW_TENT_CLIMATE_SOURCE_URLS.vivosun,
  },
  {
    label: "Trimleaf — Grow Room Temp and Humidity Chart",
    url: GROW_TENT_CLIMATE_SOURCE_URLS.trimleaf,
  },
  {
    label: "Spider Farmer — Ideal Temp and Humidity for Your Grow Tent",
    url: GROW_TENT_CLIMATE_SOURCE_URLS.spiderFarmerIdeal,
  },
] as const;

export const GROW_TENT_CLIMATE_QUICK_ANSWER =
  "It depends on the growth stage, and growers usually judge temperature and humidity together through VPD. Common grower VPD targets are 0.4–0.8 kPa for clones and seedlings, 0.8–1.2 for veg, 1.0–1.5 for early flower and 1.2–1.6 for late flower. Enter your °F and RH to see where you land." as const;

export const GROW_TENT_CLIMATE_FAQ = [
  {
    question: "What temperature and humidity should a grow tent be?",
    answer:
      "It depends on the growth stage, and growers usually judge both together through VPD. Common grower VPD targets are 0.4–0.8 kPa for clones and seedlings, 0.8–1.2 for veg, 1.0–1.5 for early flower and 1.2–1.6 for late flower. Use the check above with your own °F and RH.",
  },
  {
    question: "Is 82 degrees too hot for a grow tent?",
    answer:
      "Temperature alone doesn't tell you. At 82°F, the humidity and your stage decide whether the VPD lands in a common band. Enter 82°F with your RH in the check above to see where you are.",
  },
  {
    question: "Is 70% humidity too high for flowering?",
    answer:
      "At typical tent temperatures, 70% RH usually puts VPD below the common flowering bands, which means the air is on the humid side. Enter your exact °F and RH to check, and see the fixes for high humidity.",
  },
  {
    question: "Will a fan lower humidity in a grow tent?",
    answer:
      "An exhaust fan that swaps humid tent air for drier room air is one of the most common fixes. A circulating fan helps move air through the canopy but doesn't remove moisture on its own.",
  },
  {
    question: "How do I raise humidity in a grow tent?",
    answer:
      "Common fixes include lowering exhaust speed, adding a humidifier, or for small tents placing a damp towel or a tray of water near the intake. Change one thing at a time and log the result.",
  },
  {
    question: "Why does humidity spike when the lights go off?",
    answer:
      "When the lights go off the air cools, and cooler air at the same moisture shows a higher relative humidity. Log lights-on and lights-off readings separately to see your swing.",
  },
] as const;

/**
 * Example °F/RH pairs for the chart (0 °F leaf offset). Examples, not targets. The page
 * computes each VPD with the shared formula; the source HTML printed the 75 °F values
 * 0.01–0.02 kPa high, and 75 °F / 60 % late flower (1.19 kPa) fell outside its band, so
 * that pair is 59 % here.
 */
export const GROW_TENT_CLIMATE_EXAMPLE_PAIRS: Readonly<
  Record<PublicVpdChartStageId, readonly { airF: number; rh: number }[]>
> = {
  clone: [
    { airF: 75, rh: 85 },
    { airF: 75, rh: 80 },
    { airF: 75, rh: 75 },
    { airF: 80, rh: 85 },
    { airF: 80, rh: 82 },
    { airF: 80, rh: 78 },
  ],
  veg: [
    { airF: 75, rh: 72 },
    { airF: 75, rh: 66 },
    { airF: 75, rh: 60 },
    { airF: 80, rh: 76 },
    { airF: 80, rh: 71 },
    { airF: 80, rh: 66 },
  ],
  early_flower: [
    { airF: 75, rh: 66 },
    { airF: 75, rh: 58 },
    { airF: 75, rh: 50 },
    { airF: 80, rh: 70 },
    { airF: 80, rh: 64 },
    { airF: 80, rh: 58 },
  ],
  late_flower: [
    { airF: 75, rh: 59 },
    { airF: 75, rh: 53 },
    { airF: 75, rh: 47 },
    { airF: 80, rh: 65 },
    { airF: 80, rh: 60 },
    { airF: 80, rh: 55 },
  ],
};

/** "At 75°F: 85% RH (0.44 kPa), …" lines for one stage, VPD from the shared formula. */
export function growTentExampleLines(stageId: PublicVpdChartStageId): string[] {
  const pairs = GROW_TENT_CLIMATE_EXAMPLE_PAIRS[stageId];
  const temps = [...new Set(pairs.map((p) => p.airF))];
  return temps.map(
    (airF) =>
      `At ${airF}°F: ` +
      pairs
        .filter((p) => p.airF === airF)
        .map((p) => `${p.rh}% RH (${calculateGrowTentVpd(airF, p.rh, 0).toFixed(2)} kPa)`)
        .join(", "),
  );
}

export const GROW_TENT_CLIMATE_STAGES = PUBLIC_VPD_CHART_STAGES;
export const GROW_TENT_CLIMATE_DEFAULT_STAGE_ID: PublicVpdChartStageId = "veg";

export const GROW_TENT_CLIMATE_AIR_F_MIN = 50;
export const GROW_TENT_CLIMATE_AIR_F_MAX = 100;
export const GROW_TENT_CLIMATE_RH_MIN = 0;
export const GROW_TENT_CLIMATE_RH_MAX = 100;
export const GROW_TENT_CLIMATE_OFFSET_F_MIN = -10;
export const GROW_TENT_CLIMATE_OFFSET_F_MAX = 5;
export const GROW_TENT_CLIMATE_DEFAULT_OFFSET_F = -2;

/** climate_tool_checked fires at most once per this window. */
export const GROW_TENT_CLIMATE_CHECKED_THROTTLE_MS = 2000;

export function growTentClimateStageById(stageId: string | null | undefined): PublicVpdChartStage {
  const found = GROW_TENT_CLIMATE_STAGES.find((stage) => stage.id === stageId);
  return (
    found ?? GROW_TENT_CLIMATE_STAGES.find((s) => s.id === GROW_TENT_CLIMATE_DEFAULT_STAGE_ID)!
  );
}

/** Leaf VPD in kPa, rounded to 2 decimals, via the shared /vpd-chart formula. */
export function calculateGrowTentVpd(airF: number, rhPercent: number, leafOffsetF: number): number {
  return calculatePublicVpdChartFromFahrenheit(airF, rhPercent, leafOffsetF).vpdRounded;
}

export type GrowTentBandStatusCode = "below" | "in_band" | "above";

export interface GrowTentBandStatus {
  readonly code: GrowTentBandStatusCode;
  readonly shortLabel: "Below" | "Within" | "Above";
  readonly fullText: string;
}

export function evaluateGrowTentBandStatus(
  vpdRounded: number,
  stageId: string,
): GrowTentBandStatus {
  const band = growTentClimateStageById(stageId);
  const v = Number(vpdRounded.toFixed(2));
  if (v < band.min) {
    return {
      code: "below",
      shortLabel: "Below",
      fullText: `Below your ${band.name} band: air is on the humid side`,
    };
  }
  if (v > band.max) {
    return {
      code: "above",
      shortLabel: "Above",
      fullText: `Above your ${band.name} band: air is on the dry side`,
    };
  }
  return { code: "in_band", shortLabel: "Within", fullText: `Within your ${band.name} band` };
}

export interface GrowTentNudge {
  readonly rhWhole: number;
  readonly rawRh: number;
  readonly midpoint: number;
  /** False when no RH from 0 to 100% reaches the midpoint at this temperature. */
  readonly reachable: boolean;
}

/** RH (clamped 0–100, whole %) that centres VPD on the stage band midpoint. */
export function calculateGrowTentNudgeRh(
  airF: number,
  leafOffsetF: number,
  stageId: string,
): GrowTentNudge {
  const band = growTentClimateStageById(stageId);
  const midpoint = (band.min + band.max) / 2;
  const airC = publicVpdChartFahrenheitToCelsius(airF);
  const leafC = airC + publicVpdChartOffsetFahrenheitToCelsius(leafOffsetF);
  const svpLeaf = publicVpdChartSaturationVaporPressureKpa(leafC);
  const svpAir = publicVpdChartSaturationVaporPressureKpa(airC);
  const solvedRh = ((svpLeaf - midpoint) / svpAir) * 100;
  const clamped = Math.max(0, Math.min(100, solvedRh));
  return {
    rhWhole: Math.round(clamped),
    rawRh: clamped,
    midpoint: Number(midpoint.toFixed(2)),
    reachable: solvedRh >= 0 && solvedRh <= 100,
  };
}

export interface GrowTentClimateInputs {
  readonly valid: boolean;
  readonly airF: number;
  readonly rh: number;
  readonly offsetF: number;
  readonly stageId: PublicVpdChartStageId;
}

function parseFieldNumber(raw: string | null | undefined): number {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Mirrors the source: every field required; air 50–100 °F, RH 0–100 %, offset −10…+5 °F. */
export function parseGrowTentClimateInputs(
  airRaw: string | null | undefined,
  rhRaw: string | null | undefined,
  offsetRaw: string | null | undefined,
  stageRaw: string | null | undefined,
): GrowTentClimateInputs {
  const airF = parseFieldNumber(airRaw);
  const rh = parseFieldNumber(rhRaw);
  const offsetF = parseFieldNumber(offsetRaw);
  const valid =
    inRange(airF, GROW_TENT_CLIMATE_AIR_F_MIN, GROW_TENT_CLIMATE_AIR_F_MAX) &&
    inRange(rh, GROW_TENT_CLIMATE_RH_MIN, GROW_TENT_CLIMATE_RH_MAX) &&
    inRange(offsetF, GROW_TENT_CLIMATE_OFFSET_F_MIN, GROW_TENT_CLIMATE_OFFSET_F_MAX);
  return { valid, airF, rh, offsetF, stageId: growTentClimateStageById(stageRaw).id };
}

/** True when an event may fire: never emitted, or at least `windowMs` since the last one. */
export function shouldEmitThrottled(
  lastEmittedAtMs: number | null,
  nowMs: number,
  windowMs: number = GROW_TENT_CLIMATE_CHECKED_THROTTLE_MS,
): boolean {
  if (lastEmittedAtMs === null) return true;
  return nowMs - lastEmittedAtMs >= windowMs;
}

export type GrowTentLights = "Lights on" | "Lights off";

export interface GrowTentClimateReading {
  readonly id: number;
  readonly dateTime: string;
  readonly lights: GrowTentLights;
  readonly airF: number;
  readonly rh: number;
  readonly offsetF: number;
  readonly stageId: PublicVpdChartStageId;
  readonly stageLabel: string;
  readonly vpd: number;
  readonly statusCode: GrowTentBandStatusCode;
  readonly statusText: string;
  readonly note: string;
  /** Every reading on this page is typed in by the grower; never live sensor data. */
  readonly source: "manual";
}

/** `YYYY-MM-DDTHH:mm` in the caller's local time, for a datetime-local input. */
export function growTentLocalDateTimeInput(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
    now.getHours(),
  )}:${pad(now.getMinutes())}`;
}

/** Table/CSV display: the input value with a space for the `T`; blank falls back to `now`. */
export function formatGrowTentDateTime(value: string | null | undefined, now: Date): string {
  const raw = (value ?? "").trim() || growTentLocalDateTimeInput(now);
  return raw.replace("T", " ");
}

export function buildGrowTentClimateReading(
  id: number,
  inputs: GrowTentClimateInputs,
  lights: GrowTentLights,
  dateTime: string,
  note: string,
): GrowTentClimateReading {
  const vpd = calculateGrowTentVpd(inputs.airF, inputs.rh, inputs.offsetF);
  const status = evaluateGrowTentBandStatus(vpd, inputs.stageId);
  return {
    id,
    dateTime,
    lights,
    airF: inputs.airF,
    rh: inputs.rh,
    offsetF: inputs.offsetF,
    stageId: inputs.stageId,
    stageLabel: growTentClimateStageById(inputs.stageId).name,
    vpd,
    statusCode: status.code,
    statusText: status.fullText,
    note: note.trim(),
    source: "manual",
  };
}

export interface GrowTentAverages {
  readonly count: number;
  readonly avgF: string;
  readonly avgRh: number;
  readonly avgVpd: string;
}

function averagesOf(items: readonly GrowTentClimateReading[]): GrowTentAverages {
  const n = items.length;
  const sum = (pick: (r: GrowTentClimateReading) => number) =>
    items.reduce((total, r) => total + pick(r), 0);
  return {
    count: n,
    avgF: (sum((r) => r.airF) / n).toFixed(1),
    avgRh: Math.round(sum((r) => r.rh) / n),
    avgVpd: (sum((r) => r.vpd) / n).toFixed(2),
  };
}

export interface GrowTentClimateSummary {
  readonly total: number;
  readonly inBand: number;
  readonly below: number;
  readonly above: number;
  readonly overall: GrowTentAverages | null;
  /** Only when both lights-on and lights-off readings exist, as in the source. */
  readonly lightsOn: GrowTentAverages | null;
  readonly lightsOff: GrowTentAverages | null;
}

export function summarizeGrowTentClimateLog(
  readings: readonly GrowTentClimateReading[],
): GrowTentClimateSummary {
  const on = readings.filter((r) => r.lights !== "Lights off");
  const off = readings.filter((r) => r.lights === "Lights off");
  const split = on.length > 0 && off.length > 0;
  return {
    total: readings.length,
    inBand: readings.filter((r) => r.statusCode === "in_band").length,
    below: readings.filter((r) => r.statusCode === "below").length,
    above: readings.filter((r) => r.statusCode === "above").length,
    overall: readings.length > 0 ? averagesOf(readings) : null,
    lightsOn: split ? averagesOf(on) : null,
    lightsOff: split ? averagesOf(off) : null,
  };
}

const EXPORT_HEADERS = [
  "Date & Time",
  "Lights",
  "Air Temp (°F)",
  "RH (%)",
  "Leaf Offset (°F)",
  "Stage",
  "VPD (kPa)",
  "Status",
  "Note",
  "Source",
] as const;

function exportMatrix(readings: readonly GrowTentClimateReading[]): string[][] {
  return [
    [...EXPORT_HEADERS],
    ...readings.map((r) => [
      r.dateTime,
      r.lights,
      String(r.airF),
      String(r.rh),
      String(r.offsetF),
      r.stageLabel,
      r.vpd.toFixed(2),
      r.statusText,
      r.note,
      r.source,
    ]),
  ];
}

export function buildGrowTentClimateCsv(readings: readonly GrowTentClimateReading[]): string {
  return exportMatrix(readings)
    .map((row) => row.map((cell) => escapeCsvField(cell)).join(","))
    .join("\r\n");
}

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/**
 * TSV cell for pasting into a spreadsheet: one line, never a live formula, and
 * a double quote can't open a quoted field that swallows the following cells.
 */
function tsvCell(value: string): string {
  const flat = String(value ?? "").replace(/[\t\r\n]+/g, " ");
  const leadingSignIsFormula = /^[+-]/.test(flat) && !PLAIN_NUMBER.test(flat);
  const safe = /^[=@]/.test(flat) || leadingSignIsFormula ? `'${flat}` : flat;
  return safe.includes('"') ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildGrowTentClimateTsv(readings: readonly GrowTentClimateReading[]): string {
  return exportMatrix(readings)
    .map((row) => row.map((cell) => tsvCell(cell)).join("\t"))
    .join("\n");
}

export function growTentClimateCsvFilename(isoDate: string): string {
  return `tent-climate-log-${isoDate}.csv`;
}

/** Band bar geometry on the source's 0–2.2 kPa scale, in percent. */
export function growTentBandBarGeometry(vpd: number, stageId: string) {
  const band = growTentClimateStageById(stageId);
  const scaleMax = 2.2;
  const left = Math.max(0, Math.min(100, (band.min / scaleMax) * 100));
  const width = Math.max(2, Math.min(100 - left, ((band.max - band.min) / scaleMax) * 100));
  const marker = Math.max(0, Math.min(100, (vpd / scaleMax) * 100));
  return { left, width, marker };
}

export function growTentClimateWebApplicationJsonLd(pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Tent Climate Check & Log",
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
