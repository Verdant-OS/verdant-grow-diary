/**
 * Public /vpd-chart math and stage bands.
 *
 * These formulas and ranges are copied from the SEO desk's vpd-calculator-v2
 * page. They are intentionally separate from src/lib/vpdRules.ts and
 * src/lib/publicVpdCalculatorRules.ts. Do not replace them with the app's
 * canonical VPD modules.
 */

export const PUBLIC_VPD_CHART_PATH = "/vpd-chart" as const;
export const PUBLIC_VPD_CHART_URL = "https://verdantgrowdiary.com/vpd-chart" as const;
export const PUBLIC_VPD_CHART_TITLE =
  "VPD Chart by Growth Stage + Calculator (°F & °C) | Verdant Grow Diary" as const;
export const PUBLIC_VPD_CHART_DESCRIPTION =
  "Free VPD calculator in °F or °C with leaf temp offset, plus a VPD chart for clones, veg, early and late flower. Then log your own readings in Verdant." as const;
export const PUBLIC_VPD_CHART_H1 = "VPD Chart and Calculator for Every Growth Stage" as const;

export const PUBLIC_VPD_CALCULATOR_CROSS_LINK_PATH = "/tools/vpd-calculator" as const;

export type PublicVpdChartUnit = "F" | "C";

export type PublicVpdChartStageId = "clone" | "veg" | "early_flower" | "late_flower";

export interface PublicVpdChartStage {
  readonly id: PublicVpdChartStageId;
  readonly name: string;
  readonly code: string;
  readonly min: number;
  readonly max: number;
  readonly cssClass: string;
  readonly source: string;
}

export const PUBLIC_VPD_CHART_STAGES: readonly PublicVpdChartStage[] = Object.freeze([
  Object.freeze({
    id: "clone",
    name: "Clone/Seedling",
    code: "CLN",
    min: 0.4,
    max: 0.8,
    cssClass: "band-clone",
    source: "Spider Farmer blog",
  }),
  Object.freeze({
    id: "veg",
    name: "Veg",
    code: "VEG",
    min: 0.8,
    max: 1.2,
    cssClass: "band-veg",
    source: "Spider Farmer blog",
  }),
  Object.freeze({
    id: "early_flower",
    name: "Early Flower",
    code: "EFL",
    min: 1.0,
    max: 1.5,
    cssClass: "band-eflower",
    source: "Gorilla Grow Tent VPD chart guide",
  }),
  Object.freeze({
    id: "late_flower",
    name: "Late Flower",
    code: "LFL",
    min: 1.2,
    max: 1.6,
    cssClass: "band-lflower",
    source: "Aroya VPD chart",
  }),
]);

export function publicVpdChartStageRangeKpa(stage: PublicVpdChartStage): string {
  return `${stage.min.toFixed(1)}–${stage.max.toFixed(1)} kPa`;
}

export function publicVpdChartStageHeading(stage: PublicVpdChartStage): string {
  return `${stage.name} (${publicVpdChartStageRangeKpa(stage)})`;
}

function joinPublicVpdChartClauses(clauses: readonly string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? "";
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
}

/** Intro targets. Names and kPa bounds come from PUBLIC_VPD_CHART_STAGES. */
export function publicVpdChartCommonTargetsSentence(): string {
  const clauses = PUBLIC_VPD_CHART_STAGES.map(
    (stage) => `${publicVpdChartStageRangeKpa(stage)} for ${stage.name}`,
  );
  return `Common grower targets are ${joinPublicVpdChartClauses(clauses)}.`;
}

/** Heatmap source line. Groups stages that share one source string. */
export function publicVpdChartSourcesSentence(): string {
  const groups: { source: string; labels: string[] }[] = [];
  for (const stage of PUBLIC_VPD_CHART_STAGES) {
    const label = `${stage.name} ${publicVpdChartStageRangeKpa(stage)}`;
    const last = groups[groups.length - 1];
    if (last && last.source === stage.source) last.labels.push(label);
    else groups.push({ source: stage.source, labels: [label] });
  }
  const parts = groups.map((group) => `${group.source} (${group.labels.join(", ")})`);
  return `Sources: ${parts.join(", ")}. Common grower targets, not strict rules. Updated Oct 2026.`;
}

export const PUBLIC_VPD_CHART_FAQ = Object.freeze([
  Object.freeze({
    question: "What is a good VPD for veg?",
    answer: "Common grower target is 0.8–1.2 kPa (Spider Farmer).",
  }),
  Object.freeze({
    question: "What VPD should I run in early flower?",
    answer: "Common target is 1.0–1.5 kPa (Gorilla Grow Tent).",
  }),
  Object.freeze({
    question: "What VPD is best for late flower?",
    answer: "Common target is 1.2–1.6 kPa (Aroya).",
  }),
  Object.freeze({
    question: "Does leaf temperature change VPD?",
    answer:
      "Yes. VPD uses leaf temperature for the saturation side, so a cooler leaf lowers VPD at the same air temperature and humidity.",
  }),
]);

/** Matches the uploaded page's WebApplication node, including the canonical URL. */
export const PUBLIC_VPD_CHART_WEB_APPLICATION_JSON_LD = Object.freeze({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "VPD Calculator",
  url: PUBLIC_VPD_CHART_URL,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: Object.freeze({
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  }),
  publisher: Object.freeze({
    "@type": "Organization",
    name: "Verdant Grow Diary",
  }),
});

export const PUBLIC_VPD_CHART_HEATMAP_F_ROWS: readonly number[] = Object.freeze(
  Array.from({ length: (90 - 60) / 2 + 1 }, (_, index) => 60 + index * 2),
);

export const PUBLIC_VPD_CHART_HEATMAP_RH_COLS: readonly number[] = Object.freeze(
  Array.from({ length: (90 - 30) / 5 + 1 }, (_, index) => 30 + index * 5),
);

export const PUBLIC_VPD_CHART_DEFAULTS = Object.freeze({
  unit: "F" as PublicVpdChartUnit,
  airTempF: 77,
  rh: 60,
  offsetF: -2,
  stageId: "veg" as PublicVpdChartStageId,
});

export function publicVpdChartClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function publicVpdChartFahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) / 1.8;
}

export function publicVpdChartCelsiusToFahrenheit(celsius: number): number {
  return celsius * 1.8 + 32;
}

/** Fahrenheit air-temperature bounds. Canonical state stays in °F. */
export const PUBLIC_VPD_CHART_AIR_FAHRENHEIT_MIN = 50;
export const PUBLIC_VPD_CHART_AIR_FAHRENHEIT_MAX = 100;
export const PUBLIC_VPD_CHART_AIR_CELSIUS_MIN = 10;
/**
 * One-decimal display of 100 °F. 38 °C is 100.4 °F, which the Fahrenheit
 * ceiling would pull back down, so the Celsius control stops at 37.8.
 */
export const PUBLIC_VPD_CHART_AIR_CELSIUS_MAX = Number(
  publicVpdChartFahrenheitToCelsius(PUBLIC_VPD_CHART_AIR_FAHRENHEIT_MAX).toFixed(1),
);

/** Offset conversion multiplies by 5/9. It does not subtract 32. */
export function publicVpdChartOffsetFahrenheitToCelsius(offsetF: number): number {
  return offsetF * (5 / 9);
}

export function publicVpdChartOffsetCelsiusToFahrenheit(offsetC: number): number {
  return offsetC * (9 / 5);
}

export function publicVpdChartSaturationVaporPressureKpa(tempC: number): number {
  return 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

export interface PublicVpdChartCalculation {
  readonly vpd: number;
  readonly vpdRounded: number;
  readonly vpdFormatted: string;
  readonly leafTempC: number;
  readonly svpLeaf: number;
  readonly svpAir: number;
  readonly avpAir: number;
}

export function calculatePublicVpdChartFromCelsius(
  airTempC: number,
  rhPercent: number,
  offsetC: number,
): PublicVpdChartCalculation {
  const leafTempC = airTempC + offsetC;
  const svpLeaf = publicVpdChartSaturationVaporPressureKpa(leafTempC);
  const svpAir = publicVpdChartSaturationVaporPressureKpa(airTempC);
  const avpAir = (svpAir * rhPercent) / 100;
  const vpd = svpLeaf - avpAir;
  return {
    vpd,
    vpdRounded: Number(vpd.toFixed(2)),
    vpdFormatted: vpd.toFixed(2),
    leafTempC,
    svpLeaf,
    svpAir,
    avpAir,
  };
}

export function calculatePublicVpdChartFromFahrenheit(
  airTempF: number,
  rhPercent: number,
  offsetF: number,
): PublicVpdChartCalculation {
  return calculatePublicVpdChartFromCelsius(
    publicVpdChartFahrenheitToCelsius(airTempF),
    rhPercent,
    publicVpdChartOffsetFahrenheitToCelsius(offsetF),
  );
}

export function publicVpdChartMatchingStages(vpdVal: number): PublicVpdChartStage[] {
  const rounded = Number(vpdVal.toFixed(2));
  return PUBLIC_VPD_CHART_STAGES.filter((stage) => rounded >= stage.min && rounded <= stage.max);
}

export function publicVpdChartStageById(stageId: string): PublicVpdChartStage {
  return (
    PUBLIC_VPD_CHART_STAGES.find((stage) => stage.id === stageId) ?? PUBLIC_VPD_CHART_STAGES[1]
  );
}

export interface PublicVpdChartBand {
  readonly cssClass: string;
  readonly code: string;
  readonly label: string;
  readonly matchesSelected: boolean;
}

export function classifyPublicVpdChartCell(
  vpdVal: number,
  selectedStageId: string,
): PublicVpdChartBand {
  const rounded = Number(vpdVal.toFixed(2));
  const selectedStage = publicVpdChartStageById(selectedStageId);

  if (rounded < 0.4) {
    return {
      cssClass: "band-low",
      code: "LOW",
      label: "very low (damp, mold risk)",
      matchesSelected: false,
    };
  }
  if (rounded > 1.6) {
    return {
      cssClass: "band-high",
      code: "HIGH",
      label: "very high (plant stress)",
      matchesSelected: false,
    };
  }
  if (rounded >= selectedStage.min && rounded <= selectedStage.max) {
    return {
      cssClass: selectedStage.cssClass,
      code: `${selectedStage.code} ★`,
      label: `${selectedStage.name} target`,
      matchesSelected: true,
    };
  }

  const matches = publicVpdChartMatchingStages(rounded);
  if (matches.length > 0) {
    const primary = matches[0];
    const codes = matches.map((stage) => stage.code);
    return {
      cssClass: primary.cssClass,
      code: codes.join("/"),
      label: codes.join(" / "),
      matchesSelected: false,
    };
  }

  return {
    cssClass: "band-veg",
    code: "—",
    label: "In range",
    matchesSelected: false,
  };
}

export function publicVpdChartSelectedStageVerdict(vpdRounded: number, stageId: string): string {
  const stage = publicVpdChartStageById(stageId);
  const targetRangeText = `(${stage.min.toFixed(1)}–${stage.max.toFixed(1)} kPa)`;
  if (vpdRounded < stage.min) {
    const extra = vpdRounded < 0.4 ? " — very low (damp, mold risk)." : ".";
    return `Below your ${stage.name} target ${targetRangeText}${extra}`;
  }
  if (vpdRounded > stage.max) {
    const extra = vpdRounded > 1.6 ? " — very high (plant stress)." : ".";
    return `Above your ${stage.name} target ${targetRangeText}${extra}`;
  }
  return `Within your ${stage.name} target ${targetRangeText}.`;
}

/** Display value shown in the °F/°C controls. Canonical state stays in °F. */
export function publicVpdChartDisplayedAirTemperature(
  airTempF: number,
  unit: PublicVpdChartUnit,
): number {
  if (unit === "F") return Number(airTempF.toFixed(1));
  return Number(publicVpdChartFahrenheitToCelsius(airTempF).toFixed(1));
}

export function publicVpdChartDisplayedOffset(offsetF: number, unit: PublicVpdChartUnit): number {
  if (unit === "F") return Number(offsetF.toFixed(1));
  return Number(publicVpdChartOffsetFahrenheitToCelsius(offsetF).toFixed(1));
}

export function publicVpdChartAirTemperatureFromDisplay(
  displayed: number,
  unit: PublicVpdChartUnit,
): number {
  if (unit === "F")
    return publicVpdChartClamp(
      displayed,
      PUBLIC_VPD_CHART_AIR_FAHRENHEIT_MIN,
      PUBLIC_VPD_CHART_AIR_FAHRENHEIT_MAX,
    );
  const clampedC = publicVpdChartClamp(
    displayed,
    PUBLIC_VPD_CHART_AIR_CELSIUS_MIN,
    PUBLIC_VPD_CHART_AIR_CELSIUS_MAX,
  );
  return publicVpdChartClamp(
    publicVpdChartCelsiusToFahrenheit(clampedC),
    PUBLIC_VPD_CHART_AIR_FAHRENHEIT_MIN,
    PUBLIC_VPD_CHART_AIR_FAHRENHEIT_MAX,
  );
}

export function publicVpdChartOffsetFromDisplay(
  displayed: number,
  unit: PublicVpdChartUnit,
): number {
  if (unit === "F") return publicVpdChartClamp(displayed, -10, 5);
  const minC = publicVpdChartOffsetFahrenheitToCelsius(-10);
  const maxC = publicVpdChartOffsetFahrenheitToCelsius(5);
  const clampedC = publicVpdChartClamp(displayed, minC, maxC);
  return publicVpdChartClamp(publicVpdChartOffsetCelsiusToFahrenheit(clampedC), -10, 5);
}

export function publicVpdChartNearestHeatmapCell(
  airTempF: number,
  rh: number,
): { readonly rowF: number; readonly colRH: number } {
  let bestRowF = PUBLIC_VPD_CHART_HEATMAP_F_ROWS[0];
  let minTempDiff = Math.abs(airTempF - bestRowF);
  for (const row of PUBLIC_VPD_CHART_HEATMAP_F_ROWS) {
    const diff = Math.abs(airTempF - row);
    if (diff < minTempDiff) {
      minTempDiff = diff;
      bestRowF = row;
    }
  }

  let bestColRH = PUBLIC_VPD_CHART_HEATMAP_RH_COLS[0];
  let minRhDiff = Math.abs(rh - bestColRH);
  for (const column of PUBLIC_VPD_CHART_HEATMAP_RH_COLS) {
    const diff = Math.abs(rh - column);
    if (diff < minRhDiff) {
      minRhDiff = diff;
      bestColRH = column;
    }
  }
  return { rowF: bestRowF, colRH: bestColRH };
}

export function publicVpdChartMoveFocus(
  row: number,
  column: number,
  key: string,
): { readonly row: number; readonly column: number } | null {
  const lastRow = PUBLIC_VPD_CHART_HEATMAP_F_ROWS.length - 1;
  const lastColumn = PUBLIC_VPD_CHART_HEATMAP_RH_COLS.length - 1;
  if (key === "ArrowUp") return { row: Math.max(0, row - 1), column };
  if (key === "ArrowDown") return { row: Math.min(lastRow, row + 1), column };
  if (key === "ArrowLeft") return { row, column: Math.max(0, column - 1) };
  if (key === "ArrowRight") return { row, column: Math.min(lastColumn, column + 1) };
  return null;
}
