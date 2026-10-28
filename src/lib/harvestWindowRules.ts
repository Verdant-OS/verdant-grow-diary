/**
 * Harvest Window Tracker. Pure: no React, no storage, no clock.
 * Ranges summarize how grow guides describe trichome stages. They are not lab measurements.
 */

import { escapeCsvField } from "@/lib/athenaFeedLogRules";

export const HARVEST_WINDOW_PATH = "/guides/when-to-harvest-cannabis" as const;

export const HARVEST_WINDOW_TITLE =
  "When to Harvest Cannabis: Trichome Chart + Free Harvest Tracker" as const;

export const HARVEST_WINDOW_H1 =
  "When to Harvest Cannabis: Track Your Trichomes and Harvest Window" as const;

export const HARVEST_WINDOW_DESCRIPTION =
  "Clear, cloudy or amber? Learn when to harvest cannabis, then log trichome checks for each plant and watch your harvest window close in. Free, no sign-up needed." as const;

export const HARVEST_WINDOW_CTA_HREF =
  "/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=when-to-harvest-cannabis" as const;

export const HARVEST_WINDOW_DATE_MODIFIED = "2026-10-28" as const;

export const HARVEST_SOURCES = [
  {
    label: "Grow Weed Easy — When to Harvest Cannabis",
    url: "https://www.growweedeasy.com/harvest",
  },
  {
    label: "Weedmaps Learn — When to Harvest Cannabis",
    url: "https://weedmaps.com/learn/the-plant/when-to-harvest-cannabis",
  },
  {
    label: "Zamnesia Grow Guide — When to Harvest Cannabis Plants",
    url: "https://www.zamnesia.com/grow-weed/503-when-to-harvest-cannabis-plants",
  },
] as const;

export const HARVEST_WINDOW_FAQ = [
  {
    question: "How can I tell if my buds are ready to harvest?",
    answer:
      "Most grow guides point to the trichomes on the buds: mostly cloudy with some amber is the commonly described window. Pistils darkening and curling in are a secondary sign. Check several bud sites over several days rather than relying on one look.",
  },
  {
    question: "What do clear, cloudy and amber trichomes mean?",
    answer:
      "Grow guides describe clear trichomes as not ready yet, cloudy as approaching peak, and amber as past peak with the effect shifting toward body. The percentages you see are rough estimates, so track the trend over several checks.",
  },
  {
    question: "Is it better to harvest early or late?",
    answer:
      "It depends on the effect you want. Guides describe earlier harvests, with less amber, as more energetic, and later harvests, with more amber, as heavier and more body-focused. Pick a target and log checks until you reach it.",
  },
  {
    question: "When should I harvest autoflowers?",
    answer:
      "Use the breeder's estimated time from seed as a starting point, then confirm with trichomes the same way you would for a photoperiod plant. Autoflowers can finish before or after that estimate.",
  },
  {
    question: "Should I flush before harvest?",
    answer:
      "Growers disagree and the evidence is debated. Follow your nutrient line's official chart and log what you actually did, so you can compare results across grows.",
  },
  {
    question: "Does this tracker tell me exactly when to harvest?",
    answer:
      "No. It compares your own logged checks with the window you chose and shows the trend. You make the call after confirming on several bud sites.",
  },
] as const;

export const HARVEST_TARGETS = ["energetic", "peak", "body"] as const;
export type HarvestTarget = (typeof HARVEST_TARGETS)[number];

export const HARVEST_TARGET_LABELS: Record<HarvestTarget, string> = {
  energetic: "Energetic / earlier",
  peak: "Peak / balanced",
  body: "Body / later",
};

export type HarvestWindowStatus = "Before window" | "In window" | "Past window";

export interface HarvestRange {
  cloudyMin: number;
  amberMin: number;
  amberMax: number;
}

export type HarvestRanges = Record<HarvestTarget, HarvestRange>;

export const DEFAULT_HARVEST_RANGES: Readonly<Record<HarvestTarget, Readonly<HarvestRange>>> =
  Object.freeze({
    energetic: Object.freeze({ cloudyMin: 70, amberMin: 0, amberMax: 10 }),
    peak: Object.freeze({ cloudyMin: 70, amberMin: 10, amberMax: 30 }),
    body: Object.freeze({ cloudyMin: 0, amberMin: 30, amberMax: 50 }),
  });

export interface HarvestCheck {
  id: number;
  date: string;
  plant: string;
  clear: number;
  cloudy: number;
  amber: number;
  pistils: string;
  photoNote: string;
}

export function isHarvestTarget(value: unknown): value is HarvestTarget {
  return typeof value === "string" && (HARVEST_TARGETS as readonly string[]).includes(value);
}

export function createDefaultHarvestRanges(): HarvestRanges {
  return {
    energetic: { ...DEFAULT_HARVEST_RANGES.energetic },
    peak: { ...DEFAULT_HARVEST_RANGES.peak },
    body: { ...DEFAULT_HARVEST_RANGES.body },
  };
}

/** Range inputs clamp to 0–100; a non-number keeps the fallback. */
export function clampHarvestRangeValue(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

export type TrichomeValidation =
  | { valid: false; reason: string }
  | { valid: true; clear: number; cloudy: number; amber: number; total: number };

function isBlank(value: unknown): boolean {
  return value === "" || value === null || value === undefined;
}

export function validateTrichomePercentages(
  clearValue: unknown,
  cloudyValue: unknown,
  amberValue: unknown,
): TrichomeValidation {
  if (isBlank(clearValue) || isBlank(cloudyValue) || isBlank(amberValue)) {
    return {
      valid: false,
      reason: "Please enter all three trichome percentages (Clear %, Cloudy %, and Amber %).",
    };
  }
  const clear = Number(clearValue);
  const cloudy = Number(cloudyValue);
  const amber = Number(amberValue);
  if (!Number.isFinite(clear) || !Number.isFinite(cloudy) || !Number.isFinite(amber)) {
    return { valid: false, reason: "All three trichome percentages must be valid numbers." };
  }
  if ([clear, cloudy, amber].some((value) => value < 0 || value > 100)) {
    return { valid: false, reason: "Each trichome percentage must be between 0 and 100." };
  }
  const total = clear + cloudy + amber;
  if (Math.abs(total - 100) > 5) {
    return {
      valid: false,
      reason: `Clear %, Cloudy % and Amber % currently total ${total}%. They must total 100% (±5% allowed for rough estimates, so 95% to 105%).`,
    };
  }
  return { valid: true, clear, cloudy, amber, total };
}

export function evaluateHarvestWindowStatus(
  entry: Pick<HarvestCheck, "cloudy" | "amber">,
  target: HarvestTarget,
  ranges: Readonly<Record<HarvestTarget, Readonly<HarvestRange>>>,
): HarvestWindowStatus {
  const range = ranges[target] ?? DEFAULT_HARVEST_RANGES.peak;
  const cloudy = Number(entry.cloudy);
  const amber = Number(entry.amber);
  if (amber > range.amberMax) return "Past window";
  const amberInRange = amber >= range.amberMin && amber <= range.amberMax;
  if (target === "body") return amberInRange ? "In window" : "Before window";
  return cloudy >= range.cloudyMin && amberInRange ? "In window" : "Before window";
}

const DAY_MS = 86_400_000;

function parseIsoDateUtc(value: string): number {
  const parts = String(value).split("-");
  if (parts.length !== 3) return Number.NaN;
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatIsoDateUtc(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The grower's local calendar date for an injected instant. */
export function localIsoDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export interface AmberProjection {
  hasProjection: boolean;
  projectedDate: string | null;
  text: string;
}

/** Linear projection from first to latest check of when amber reaches the window's lower edge. */
export function projectAmberDate(
  checks: readonly Pick<HarvestCheck, "date" | "amber">[],
  targetAmberMin: number,
): AmberProjection {
  const none: AmberProjection = { hasProjection: false, projectedDate: null, text: "" };
  if (!Array.isArray(checks) || checks.length < 2) return none;
  const sorted = [...checks].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const t1 = parseIsoDateUtc(first.date);
  const t2 = parseIsoDateUtc(last.date);
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t2 <= t1) return none;
  const amberDelta = Number(last.amber) - Number(first.amber);
  if (amberDelta <= 0) {
    return { hasProjection: true, projectedDate: null, text: "Not enough change yet to project." };
  }
  const ratePerDay = amberDelta / ((t2 - t1) / DAY_MS);
  const daysFromFirst = Math.round((Number(targetAmberMin) - Number(first.amber)) / ratePerDay);
  const projectedDate = formatIsoDateUtc(t1 + daysFromFirst * DAY_MS);
  return {
    hasProjection: true,
    projectedDate,
    text: `At the pace you've logged, amber would reach the lower edge of your window around ${projectedDate}. This is a rough projection from your own entries, not a prediction.`,
  };
}

/** Plant (case-insensitive), then date, then entry order. */
export function sortHarvestChecks(checks: readonly HarvestCheck[]): HarvestCheck[] {
  return [...checks].sort((a, b) => {
    const plant = a.plant.localeCompare(b.plant, undefined, { sensitivity: "base" });
    if (plant !== 0) return plant;
    const date = a.date.localeCompare(b.date);
    if (date !== 0) return date;
    return a.id - b.id;
  });
}

export function countUniquePlants(checks: readonly Pick<HarvestCheck, "plant">[]): number {
  return new Set(checks.map((item) => item.plant.toLowerCase())).size;
}

export function addKnownPlant(known: readonly string[], plant: string): string[] {
  const exists = known.some((name) => name.toLowerCase() === plant.toLowerCase());
  return exists ? [...known] : [...known, plant];
}

function formatSignedPoints(delta: number): string {
  return `${delta >= 0 ? `+${delta}` : String(delta)} points`;
}

export interface HarvestPlantSummary {
  key: string;
  heading: string;
  lines: string[];
}

export function summarizeHarvestPlants(
  checks: readonly HarvestCheck[],
  target: HarvestTarget,
  ranges: HarvestRanges,
): HarvestPlantSummary[] {
  const groups = new Map<string, { name: string; items: HarvestCheck[] }>();
  for (const item of sortHarvestChecks(checks)) {
    const key = item.plant.toLowerCase();
    const group = groups.get(key) ?? { name: item.plant, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, { name, items }]) => {
    const first = items[0];
    const latest = items[items.length - 1];
    const status = evaluateHarvestWindowStatus(latest, target, ranges);
    const checkWord = items.length === 1 ? "1 check" : `${items.length} checks`;
    const position =
      status === "In window" ? "within" : status === "Past window" ? "past" : "before";
    const lines = [
      `Latest check (${latest.date}): ${status} — Clear ${latest.clear}%, Cloudy ${latest.cloudy}%, Amber ${latest.amber}%.`,
      `Change between first and latest check: Amber ${formatSignedPoints(latest.amber - first.amber)} over ${checkWord}; Cloudy ${formatSignedPoints(latest.cloudy - first.cloudy)} over ${checkWord}.`,
      `Your latest check is ${position} the window you chose. Confirm on several bud sites before you harvest.`,
    ];
    const projection = projectAmberDate(items, ranges[target].amberMin);
    if (projection.hasProjection && projection.text) lines.push(projection.text);
    return { key, heading: `${name} (${checkWord})`, lines };
  });
}

const EXPORT_HEADERS = [
  "Target Effect",
  "Target Cloudy Min %",
  "Target Amber Min %",
  "Target Amber Max %",
  "Date",
  "Plant",
  "Clear %",
  "Cloudy %",
  "Amber %",
  "Window Status",
  "Pistil Notes",
  "Photo Note",
] as const;

export function buildHarvestExportMatrix(
  checks: readonly HarvestCheck[],
  target: HarvestTarget,
  ranges: HarvestRanges,
): string[][] {
  const range = ranges[target];
  const cloudyMin = target === "body" ? "N/A" : String(range.cloudyMin);
  const rows: string[][] = [[...EXPORT_HEADERS]];
  for (const item of sortHarvestChecks(checks)) {
    rows.push([
      HARVEST_TARGET_LABELS[target],
      cloudyMin,
      String(range.amberMin),
      String(range.amberMax),
      item.date,
      item.plant,
      String(item.clear),
      String(item.cloudy),
      String(item.amber),
      evaluateHarvestWindowStatus(item, target, ranges),
      item.pistils,
      item.photoNote,
    ]);
  }
  return rows;
}

export function buildHarvestCsv(
  checks: readonly HarvestCheck[],
  target: HarvestTarget,
  ranges: HarvestRanges,
): string {
  return buildHarvestExportMatrix(checks, target, ranges)
    .map((row) => row.map((cell) => escapeCsvField(cell)).join(","))
    .join("\r\n");
}

export function buildHarvestTsv(
  checks: readonly HarvestCheck[],
  target: HarvestTarget,
  ranges: HarvestRanges,
): string {
  return buildHarvestExportMatrix(checks, target, ranges)
    .map((row) => row.map((cell) => String(cell ?? "").replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

export function harvestCsvFilename(isoDate: string): string {
  return `harvest-checks-${isoDate}.csv`;
}

export function harvestWindowWebApplicationJsonLd(pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Harvest Window Tracker",
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
