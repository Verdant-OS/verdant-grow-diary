// Pure mapping from a recorded stage to plant silhouette parameters.
// These numbers describe *recorded stage and week*, not measured size, health or yield.
// Everything is clamped and null-safe so an old or partial record still renders.

export const STAGE_LABELS = Object.freeze({
  seedling: "Seedling",
  veg: "Veg",
  flower: "Flower",
  unknown: "Stage not recorded",
});

/** @typedef {{ stage?: string|null, week?: number|null, sex?: string|null }} StageRecord */

/**
 * @returns {{
 *   stage: "seedling"|"veg"|"flower"|"unknown",
 *   week: number|null,
 *   label: string,
 *   heightIn: number,        // stem/canopy height in inches (stylised)
 *   canopyRadiusIn: number,  // canopy radius in inches (stylised)
 *   leafTiers: number,       // how many leaf whorls to draw
 *   clusterCount: number,    // flower clusters (0 outside flower)
 *   clusterScale: number,    // 0..1 fullness of clusters
 *   neutral: boolean,        // unknown stage: muted neutral artwork
 *   colorKey: "seedling"|"veg"|"flower"|"neutral",
 * }}
 */
export function visualForStage(record) {
  const stage = normalizeStage(record?.stage);
  const week = normalizeWeek(record?.week);
  if (stage === "unknown") {
    return {
      stage,
      week: null,
      label: STAGE_LABELS.unknown,
      heightIn: 7,
      canopyRadiusIn: 4,
      leafTiers: 2,
      clusterCount: 0,
      clusterScale: 0,
      neutral: true,
      colorKey: "neutral",
    };
  }
  if (stage === "seedling") {
    return {
      stage,
      week,
      label: week == null ? STAGE_LABELS.seedling : `${STAGE_LABELS.seedling} · week ${week}`,
      heightIn: 4,
      canopyRadiusIn: 2.5,
      leafTiers: 1,
      clusterCount: 0,
      clusterScale: 0,
      neutral: false,
      colorKey: "seedling",
    };
  }
  if (stage === "veg") {
    // Veg grows by recorded week: taller and wider, capped so week 12 looks like week 8.
    const w = week == null ? 1 : Math.min(week, 8);
    return {
      stage,
      week,
      label: week == null ? STAGE_LABELS.veg : `${STAGE_LABELS.veg} · week ${week}`,
      heightIn: 8 + w * 1.5,
      canopyRadiusIn: 4 + w * 0.75,
      leafTiers: Math.min(2 + Math.floor(w / 2), 6),
      clusterCount: 0,
      clusterScale: 0,
      neutral: false,
      colorKey: "veg",
    };
  }
  // flower: height is held; fullness comes from clusters, which fill in by recorded week.
  const w = week == null ? 1 : Math.min(week, 9);
  return {
    stage,
    week,
    label: week == null ? STAGE_LABELS.flower : `${STAGE_LABELS.flower} · week ${week}`,
    heightIn: 20,
    canopyRadiusIn: 9,
    leafTiers: 5,
    clusterCount: Math.min(3 + w, 12),
    clusterScale: Math.min(0.35 + w * 0.08, 1),
    neutral: false,
    colorKey: "flower",
  };
}

export function normalizeStage(stage) {
  if (stage === "seedling" || stage === "veg" || stage === "flower") return stage;
  return "unknown";
}

export function normalizeWeek(week) {
  if (!Number.isFinite(week) || week < 0) return null;
  return Math.floor(week);
}

/** Sex label for the details panel. Males use the same plant design; only the tag differs. */
export function sexLabel(sex) {
  if (sex === "male") return "Male (recorded)";
  if (sex === "female") return "Female (recorded)";
  return "Sex not recorded";
}

/** Truncate a long name for a label while keeping the id visible. */
/**
 * Diorama label: the short name plus the stable id. The long name stays in details and List
 * view; a short label keeps six labels legible on a phone without shrinking text.
 */
export function labelFor(plant, maxNameChars = 14) {
  const id = plant?.id ?? "?";
  const name = String(plant?.shortName ?? plant?.longName ?? "").trim();
  if (!name) return `${id}`;
  const shown = name.length > maxNameChars ? `${name.slice(0, maxNameChars - 1)}…` : name;
  return `${shown} · ${id}`;
}
