/**
 * AutoPot reservoir & feed log. Pure: no React, no storage, no clock.
 * Readings are kept as the grower typed them. EC/PPM is never converted between units:
 * a difference is computed only when the planned and actual units are the same.
 */

import { escapeCsvField } from "@/lib/athenaFeedLogRules";

export const AUTOPOT_LOG_PATH = "/guides/autopot-stash-nutrients-feed-log" as const;

export const AUTOPOT_LOG_TITLE =
  "AutoPot Feed Log: Track Reservoir Refills, pH & EC (Stash Nutrients)" as const;

export const AUTOPOT_LOG_H1 =
  "AutoPot + Stash Nutrients Feed Log: Track Every Reservoir Refill" as const;

export const AUTOPOT_LOG_DESCRIPTION =
  "Log every AutoPot reservoir refill: date, tent, volume, mix, pH and EC or PPM with the unit, planned vs your feed chart. How Stash dry amendments fit. Free." as const;

export const AUTOPOT_LOG_CTA_HREF =
  "/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=autopot-stash-nutrients-feed-log" as const;

export const AUTOPOT_LOG_DATE_MODIFIED = "2026-10-28" as const;

export const AUTOPOT_SOURCE_URLS = {
  nutrientInfo:
    "https://autopot-usa.com/wp-content/uploads/AutoPot_Growers_Guides_Nutrient_Information_US.pdf",
  brochure:
    "https://autopot.co.uk/wp-content/uploads/2025/06/AutoPot_UK_USA_Brochure_48pp_2025_WEB-compressed_T_29940_June_24_2025_12_19_pm.pdf",
  tray2grow: "https://autopot-usa.com/wp-content/uploads/Tray2Grow-Instructions.pdf",
  stashFaq: "https://stashnutrients.com/faq/",
  stashHome: "https://stashnutrients.com/",
} as const;

export const AUTOPOT_SOURCES = [
  {
    label: "AutoPot USA — Growers Guides Nutrient Information Sheet (PDF)",
    url: AUTOPOT_SOURCE_URLS.nutrientInfo,
    type: "autopot",
  },
  {
    label: "AutoPot UK/USA — 2025 Product Brochure (PDF)",
    url: AUTOPOT_SOURCE_URLS.brochure,
    type: "autopot",
  },
  {
    label: "AutoPot USA — Tray2Grow Instructions (PDF)",
    url: AUTOPOT_SOURCE_URLS.tray2grow,
    type: "autopot",
  },
  {
    label: "Stash Nutrients — Official FAQ & Feeding Guide",
    url: AUTOPOT_SOURCE_URLS.stashFaq,
    type: "stash",
  },
  { label: "Stash Nutrients — Official Site", url: AUTOPOT_SOURCE_URLS.stashHome, type: "stash" },
] as const;

export const AUTOPOT_QUICK_ANSWER =
  "AutoPot says to add mineral nutrients to the reservoir following your nutrient producer's guidelines. Organic growers can mix dry amendments such as Stash Base or Stash Bloom into the pot and run water from the reservoir. Either way, log each refill's date, volume, mix, pH and EC or PPM with its unit." as const;

export const AUTOPOT_UNIT_RULE =
  "Write down the unit your meter shows. 1.2 mS/cm, 1,200 µS/cm and 600 PPM are different ways of writing readings, and PPM scales differ between meters." as const;

export const AUTOPOT_LOG_FAQ = [
  {
    question: "How do you feed with AutoPots?",
    answer:
      "AutoPot says to add mineral nutrients to the reservoir following the nutrient producer's guidelines. The AQUAvalve fills the tray to about an inch deep, closes, and refills once the plants have used it, so feeding follows how fast your plants drink.",
  },
  {
    question: "Can you use Stash Nutrients in an AutoPot?",
    answer:
      "Stash Base and Stash Bloom are dry amendments rated per gallon of growing media, so they fit AutoPot's pot-feeding approach: mix them into the media and run water from the reservoir. Use the rates on Stash's official feeding guide.",
  },
  {
    question: "What is the difference between AutoPot Classic and Tray2Grow?",
    answer:
      "Classic systems use individual pot modules, each with its own tray. Tray2Grow uses one AQUAvalve5 to feed a shared tray through capillary matting or spikes. Both are power-free and gravity-fed.",
  },
  {
    question: "Can you run liquid organic nutrients through an AutoPot reservoir?",
    answer:
      "AutoPot says reservoir feeding of liquid organics applies only to AQUAvalve5 systems with 9mm (3/8 inch) pipe and fittings, and its guide describes flushing the lines between feeds.",
  },
  {
    question: "Should I log EC or PPM?",
    answer:
      "Either works, as long as you write down the unit your meter shows. PPM scales differ between meters, so a PPM number without its scale can't be compared.",
  },
  {
    question: "What should I record at each AutoPot refill?",
    answer:
      "The date, the tent, how many gallons you added, what you mixed, pH, and EC or PPM with its unit. Over a few refills you can see how fast each tent drinks.",
  },
] as const;

/**
 * First-hand example run. Stays null, and the section stays hidden and out of JSON-LD and
 * CSV, until the grower confirms the numbers (the brief's EC unit is still unconfirmed).
 */
export interface AutopotGrowExample {
  readonly intro?: string;
  readonly rows: readonly {
    date?: string;
    tent?: string;
    system?: string;
    volume_gal?: number;
    mix?: string;
    ph?: number;
    ec?: number | string;
    ec_unit?: string;
    note?: string;
  }[];
}
export const GROW_EXAMPLE: AutopotGrowExample | null = null;

export const AUTOPOT_UNITS = ["mS/cm", "µS/cm", "PPM (500 scale)", "PPM (700 scale)"] as const;
export type AutopotUnit = (typeof AUTOPOT_UNITS)[number];

export const AUTOPOT_SYSTEMS = ["AutoPot Classic", "Tray2Grow", "Other gravity-fed"] as const;
export type AutopotSystem = (typeof AUTOPOT_SYSTEMS)[number];

export const AUTOPOT_ENTRY_TYPES = [
  "Reservoir fill",
  "Refill / top-up",
  "Repot (media mix)",
] as const;
export type AutopotEntryType = (typeof AUTOPOT_ENTRY_TYPES)[number];

export const AUTOPOT_DIFFERENT_UNITS = "Different units — no comparison" as const;
export const AUTOPOT_MIXED_UNITS_WARNING =
  "Mixed EC/PPM units in this tent. Readings can't be compared." as const;
export const AUTOPOT_UNASSIGNED_TENT = "Unassigned tent" as const;

/** autopot_log_plan_compared fires after this quiet period, as in the source. */
export const AUTOPOT_COMPARE_DEBOUNCE_MS = 2000;

const DAY_MS = 86_400_000;

function isBlank(value: unknown): boolean {
  return value === "" || value === null || value === undefined;
}

/** UTC-midnight ms for a real calendar date, or null. */
export function parseAutopotIsoDate(value: string | null | undefined): number | null {
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

export function autopotLocalIsoDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function countDecimals(value: string): number {
  const s = String(value ?? "").trim();
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Actual minus planned pH, signed, 2 decimals; "" unless both are numbers. */
export function computeAutopotPhDiff(planned: string, actual: string): string {
  if (isBlank(planned) || isBlank(actual)) return "";
  const p = Number(planned);
  const a = Number(actual);
  if (!Number.isFinite(p) || !Number.isFinite(a)) return "";
  const diff = a - p;
  const abs = Math.abs(diff).toFixed(2);
  if (diff > 0.000001) return `+${abs}`;
  if (diff < -0.000001) return `−${abs}`;
  return "0.00";
}

/** EC/PPM difference in the shared unit; never converts. Different units say so. */
export function computeAutopotEcDiff(
  planned: string,
  plannedUnit: string,
  actual: string,
  actualUnit: string,
): string {
  if (isBlank(planned) || isBlank(actual)) return "";
  if (!plannedUnit || !actualUnit) return "";
  if (plannedUnit !== actualUnit) return AUTOPOT_DIFFERENT_UNITS;
  const p = Number(planned);
  const a = Number(actual);
  if (!Number.isFinite(p) || !Number.isFinite(a)) return "";
  const decimals = Math.max(countDecimals(planned), countDecimals(actual));
  const diff = a - p;
  const abs = Math.abs(diff).toFixed(decimals);
  const signed = diff > 0.0000001 ? `+${abs}` : diff < -0.0000001 ? `−${abs}` : abs;
  return `${signed} ${actualUnit}`;
}

export interface AutopotRawEntry {
  readonly date: string;
  readonly tent: string;
  readonly system: AutopotSystem;
  readonly entryType: AutopotEntryType;
  readonly volumeGal: string;
  readonly waterTempF: string;
  readonly mix: string;
  readonly actualPh: string;
  readonly actualEc: string;
  readonly actualUnit: string;
  readonly plannedPh: string;
  readonly plannedEc: string;
  readonly plannedUnit: string;
  readonly note: string;
}

export interface AutopotEntry extends AutopotRawEntry {
  readonly id: number;
}

const isUnit = (unit: string): unit is AutopotUnit =>
  (AUTOPOT_UNITS as readonly string[]).includes(unit);

function outside(raw: string, min: number, max: number): boolean {
  const n = Number(raw);
  return !Number.isFinite(n) || n < min || n > max;
}

/** The source's field checks, in order, with its messages. */
export function validateAutopotEntry(
  raw: Partial<AutopotRawEntry>,
): { valid: true } | { valid: false; error: string } {
  const fail = (error: string) => ({ valid: false as const, error });
  if (parseAutopotIsoDate(raw.date) === null) {
    return fail("Please enter a valid date for this entry.");
  }
  if (!isBlank(raw.volumeGal) && outside(raw.volumeGal!, 0, 500)) {
    return fail("Volume added must be between 0 and 500 gallons (cannot be negative).");
  }
  if (!isBlank(raw.actualPh) && outside(raw.actualPh!, 0, 14)) {
    return fail("Actual pH must be between 0 and 14.");
  }
  if (!isBlank(raw.plannedPh) && outside(raw.plannedPh!, 0, 14)) {
    return fail("Planned pH must be between 0 and 14.");
  }
  if (!isBlank(raw.actualEc)) {
    if (outside(raw.actualEc!, 0, Infinity)) return fail("Actual EC/PPM must be 0 or greater.");
    if (!isUnit(raw.actualUnit ?? "")) {
      return fail("Please select the unit shown on your meter for Actual EC/PPM.");
    }
  }
  if (!isBlank(raw.plannedEc)) {
    if (outside(raw.plannedEc!, 0, Infinity)) return fail("Planned EC/PPM must be 0 or greater.");
    if (!isUnit(raw.plannedUnit ?? "")) return fail("Please select a unit for Planned EC/PPM.");
  }
  if (!isBlank(raw.waterTempF) && outside(raw.waterTempF!, 32, 120)) {
    return fail("Reservoir water temperature must be between 32°F and 120°F.");
  }
  return { valid: true };
}

/** Builds the stored entry: trimmed text, and a unit kept only when its reading exists. */
export function buildAutopotEntry(id: number, raw: AutopotRawEntry): AutopotEntry {
  const t = (s: string) => s.trim();
  return {
    id,
    date: t(raw.date),
    tent: t(raw.tent),
    system: raw.system,
    entryType: raw.entryType,
    volumeGal: t(raw.volumeGal),
    waterTempF: t(raw.waterTempF),
    mix: t(raw.mix),
    actualPh: t(raw.actualPh),
    actualEc: t(raw.actualEc),
    actualUnit: t(raw.actualEc) !== "" ? raw.actualUnit : "",
    plannedPh: t(raw.plannedPh),
    plannedEc: t(raw.plannedEc),
    plannedUnit: t(raw.plannedEc) !== "" ? raw.plannedUnit : "",
    note: t(raw.note),
  };
}

/** Newest date first; ties go to the later-added entry. */
export function sortAutopotEntries(entries: readonly AutopotEntry[]): AutopotEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

/** Positive volumes summed and rounded half-up to one decimal, as a string. */
export function sumAutopotGallons(volumes: readonly string[]): string {
  const total = volumes.reduce((sum, v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? sum + n : sum;
  }, 0);
  return (Math.round(total * 10) / 10).toFixed(1);
}

export function computeAutopotRefillStats(
  dates: readonly string[],
  todayIso: string,
): { daysSinceLast: number | null; avgIntervalDays: string | null } {
  const valid = dates
    .map((d) => parseAutopotIsoDate(d))
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b);
  if (valid.length === 0) return { daysSinceLast: null, avgIntervalDays: null };
  const latest = valid[valid.length - 1];
  const today = parseAutopotIsoDate(todayIso);
  const daysSinceLast = today === null ? null : Math.round((today - latest) / DAY_MS);
  const avgIntervalDays =
    valid.length >= 2
      ? (Math.round(((latest - valid[0]) / DAY_MS / (valid.length - 1)) * 10) / 10).toFixed(1)
      : null;
  return { daysSinceLast, avgIntervalDays };
}

/** True when a tent's readings use more than one EC/PPM unit. */
export function hasMixedAutopotUnits(
  entries: readonly Pick<AutopotEntry, "actualEc" | "actualUnit" | "plannedEc" | "plannedUnit">[],
): boolean {
  const units = new Set<string>();
  for (const e of entries) {
    if (!isBlank(e.actualEc) && e.actualUnit) units.add(e.actualUnit);
    if (!isBlank(e.plannedEc) && e.plannedUnit) units.add(e.plannedUnit);
  }
  return units.size > 1;
}

export function isAutopotEntryCompared(e: AutopotEntry): boolean {
  const ph = e.plannedPh !== "" && e.actualPh !== "";
  const ec = e.plannedEc !== "" && e.actualEc !== "" && Boolean(e.plannedUnit && e.actualUnit);
  return ph || ec;
}

export function countComparedAutopotEntries(entries: readonly AutopotEntry[]): number {
  return entries.filter(isAutopotEntryCompared).length;
}

export function formatAutopotPhCell(e: AutopotEntry): string {
  const hasP = e.plannedPh !== "";
  const hasA = e.actualPh !== "";
  if (!hasP && !hasA) return "—";
  if (hasP && !hasA) return `Planned: ${e.plannedPh}`;
  if (!hasP) return e.actualPh;
  return `${e.plannedPh} → ${e.actualPh} (${computeAutopotPhDiff(e.plannedPh, e.actualPh)})`;
}

/** Table cell text and whether the units differ (rendered as a badge). */
export function formatAutopotEcCell(
  e: AutopotEntry,
  arrow: "→" | "->" = "→",
): { text: string; differentUnits: boolean } {
  const hasP = e.plannedEc !== "";
  const hasA = e.actualEc !== "";
  if (!hasP && !hasA) return { text: "", differentUnits: false };
  if (hasP && !hasA)
    return { text: `Planned: ${e.plannedEc} ${e.plannedUnit}`, differentUnits: false };
  if (!hasP) return { text: `${e.actualEc} ${e.actualUnit}`, differentUnits: false };
  const diff = computeAutopotEcDiff(e.plannedEc, e.plannedUnit, e.actualEc, e.actualUnit);
  const pair = `${e.plannedEc} ${e.plannedUnit} ${arrow} ${e.actualEc} ${e.actualUnit}`;
  if (diff === AUTOPOT_DIFFERENT_UNITS && arrow === "→") {
    return { text: pair, differentUnits: true };
  }
  return { text: `${pair} (${diff})`, differentUnits: false };
}

export interface AutopotTentSummary {
  readonly name: string;
  readonly gallons: string;
  readonly entryCount: number;
  readonly daysSinceLast: number | null;
  readonly avgIntervalDays: string | null;
  readonly mixedUnits: boolean;
}

/** Per-tent totals in first-seen order; tent names group case-insensitively. Repots are not refills. */
export function summarizeAutopotTents(
  entries: readonly AutopotEntry[],
  todayIso: string,
): AutopotTentSummary[] {
  const groups = new Map<string, { name: string; items: AutopotEntry[] }>();
  for (const e of entries) {
    const name = e.tent.trim() || AUTOPOT_UNASSIGNED_TENT;
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, items: [] });
    groups.get(key)!.items.push(e);
  }
  return [...groups.values()].map(({ name, items }) => {
    const stats = computeAutopotRefillStats(
      items.filter((e) => e.entryType !== "Repot (media mix)").map((e) => e.date),
      todayIso,
    );
    return {
      name,
      gallons: sumAutopotGallons(items.map((e) => e.volumeGal)),
      entryCount: items.length,
      daysSinceLast: stats.daysSinceLast,
      avgIntervalDays: stats.avgIntervalDays,
      mixedUnits: hasMixedAutopotUnits(items),
    };
  });
}

export function describeAutopotTent(tent: AutopotTentSummary): string {
  const parts = [
    `${tent.gallons} gal added across ${tent.entryCount} ${tent.entryCount === 1 ? "entry" : "entries"}`,
  ];
  if (tent.daysSinceLast !== null) parts.push(`Days since last refill: ${tent.daysSinceLast}`);
  if (tent.avgIntervalDays !== null) {
    parts.push(`Average days between refills: ${tent.avgIntervalDays} days`);
  }
  return parts.join(" · ");
}

const CSV_HEADERS = [
  "Date",
  "Tent",
  "System",
  "Type",
  "Volume (gal)",
  "Mix",
  "Planned pH",
  "Actual pH",
  "pH Diff",
  "Planned EC/PPM",
  "Planned Unit",
  "Actual EC/PPM",
  "Actual Unit",
  "EC/PPM Diff",
  "Water Temp (°F)",
  "Note",
] as const;

/** Grower entries only; the hidden grow example never enters the export. */
export function buildAutopotCsv(entries: readonly AutopotEntry[]): string {
  const rows: string[][] = [[...CSV_HEADERS]];
  for (const e of sortAutopotEntries(entries)) {
    rows.push([
      e.date,
      e.tent,
      e.system,
      e.entryType,
      e.volumeGal,
      e.mix,
      e.plannedPh,
      e.actualPh,
      computeAutopotPhDiff(e.plannedPh, e.actualPh),
      e.plannedEc,
      e.plannedEc !== "" ? e.plannedUnit : "",
      e.actualEc,
      e.actualEc !== "" ? e.actualUnit : "",
      computeAutopotEcDiff(e.plannedEc, e.plannedUnit, e.actualEc, e.actualUnit),
      e.waterTempF,
      e.note,
    ]);
  }
  return rows.map((row) => row.map((cell) => escapeCsvField(cell)).join(",")).join("\r\n");
}

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/** TSV cell for pasting into a spreadsheet: one line, and never a live formula. */
function tsvCell(value: string): string {
  const flat = String(value ?? "").replace(/[\t\r\n]+/g, " ");
  const leadingSignIsFormula = /^[+-]/.test(flat) && !PLAIN_NUMBER.test(flat);
  return /^[=@]/.test(flat) || leadingSignIsFormula ? `'${flat}` : flat;
}

const TSV_HEADERS = [
  "Date",
  "Tent",
  "System",
  "Type",
  "Volume (gal)",
  "Mix",
  "pH (planned -> actual, diff)",
  "EC/PPM (planned -> actual, diff, unit)",
  "Water Temp (°F)",
  "Note",
] as const;

export function buildAutopotTsv(entries: readonly AutopotEntry[]): string {
  const lines = [TSV_HEADERS.join("\t")];
  for (const e of sortAutopotEntries(entries)) {
    lines.push(
      [
        e.date,
        e.tent,
        e.system,
        e.entryType,
        e.volumeGal,
        e.mix,
        formatAutopotPhCell(e),
        formatAutopotEcCell(e, "->").text,
        e.waterTempF !== "" ? `${e.waterTempF}°F` : "",
        e.note,
      ]
        .map(tsvCell)
        .join("\t"),
    );
  }
  return lines.join("\n");
}

export function autopotCsvFilename(isoDate: string): string {
  return `autopot-feed-log-${isoDate}.csv`;
}

export const AUTOPOT_UNIT_ENUM: Readonly<
  Record<AutopotUnit, "ms_cm" | "us_cm" | "ppm500" | "ppm700">
> = {
  "mS/cm": "ms_cm",
  "µS/cm": "us_cm",
  "PPM (500 scale)": "ppm500",
  "PPM (700 scale)": "ppm700",
};

export const AUTOPOT_SYSTEM_ENUM: Readonly<
  Record<AutopotSystem, "classic" | "tray2grow" | "other">
> = {
  "AutoPot Classic": "classic",
  Tray2Grow: "tray2grow",
  "Other gravity-fed": "other",
};

export function autopotLogWebApplicationJsonLd(pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "AutoPot Reservoir & Feed Log",
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
