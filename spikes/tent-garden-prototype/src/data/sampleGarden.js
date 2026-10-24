// FICTIONAL SAMPLE DATA. No real grow, plant, grower, sensor or photo is represented.
// Six plants in a 4×4 ft tent, a present-day layout, and three dated history snapshots.
// Positions are inches on the tent floor (x right, z toward the door). Snap grid is 2 in.

export const SAMPLE_TODAY_DATE = "2026-10-16";

/** Tent footprint and default pot for this fictional garden (see layoutRules TENT_PROFILES). */
export const TENT_PROFILE_ID = "4x4";
export const DEFAULT_POT_GAL = 5;

export const PLANTS = Object.freeze([
  {
    id: "P-101",
    shortName: "Ember",
    longName: "Ember Creek (sample cultivar)",
    stage: { stage: "flower", week: 4, sex: "female" },
  },
  {
    id: "P-102",
    shortName: "Juniper",
    longName: "Juniper Valley Haze — sample cut #2",
    stage: { stage: "flower", week: 2, sex: "female" },
  },
  {
    id: "P-103",
    shortName: "Marrow",
    longName: "Marrow Bone (sample)",
    stage: { stage: "veg", week: 6, sex: "female" },
  },
  {
    id: "P-104",
    shortName: "Tidewater",
    longName: "Tidewater Sour — sample pheno A",
    stage: { stage: "veg", week: 3, sex: "male" },
  },
  {
    id: "P-105",
    shortName: "Sprout",
    longName: "Unnamed seedling (sample)",
    stage: { stage: "seedling", week: 1, sex: "unknown" },
  },
  {
    id: "P-106",
    shortName: "Lantern",
    longName: "Lantern Moss (sample)",
    stage: { stage: "unknown", week: null, sex: "unknown" },
  },
]);

export const PLANTS_BY_ID = Object.freeze(Object.fromEntries(PLANTS.map((p) => [p.id, p])));

/** Present-day recorded layout (editable in the prototype). */
export const TODAY_LAYOUT = Object.freeze({
  "P-101": { x: 12, z: 12 },
  "P-102": { x: 36, z: 12 },
  "P-103": { x: 12, z: 36 },
  "P-104": { x: 36, z: 36 },
  "P-105": { x: 24, z: 24 },
  "P-106": { x: 24, z: 40 },
});

/** Present-day stage records keyed by plant id (mirrors PLANTS for the "today" view). */
export const TODAY_STAGES = Object.freeze(
  Object.fromEntries(PLANTS.map((p) => [p.id, { ...p.stage }])),
);

/** Present-day saved notes (editable as drafts in the prototype). Fictional. */
export const TODAY_NOTES = Object.freeze({
  "P-101": "Sample note: stretch finished; first pistils everywhere.",
  "P-104": "Sample note: confirmed male on Oct 2 — kept for pollen (sample).",
});

const PHOTO = (caption) => ({
  placeholder: true,
  caption: `Sample photo placeholder — ${caption}`,
});

/**
 * Three dated, explicitly fictional snapshots. Membership differs on purpose:
 *  - P-107 "Cinder" existed in August and September but is gone today (culled male, sample).
 *  - P-105 "Sprout" and P-106 "Lantern" only appear in the latest snapshot.
 */
export const SNAPSHOTS = Object.freeze([
  {
    id: "snap-2026-08-18",
    date: "2026-08-18",
    label: "Aug 18 — fresh transplants",
    layout: {
      "P-101": { x: 12, z: 12 },
      "P-102": { x: 24, z: 12 },
      "P-103": { x: 36, z: 12 },
      "P-104": { x: 12, z: 36 },
      "P-107": { x: 36, z: 36 },
    },
    stages: {
      "P-101": { stage: "veg", week: 1, sex: "unknown" },
      "P-102": { stage: "veg", week: 1, sex: "unknown" },
      "P-103": { stage: "seedling", week: 2, sex: "unknown" },
      "P-104": { stage: "seedling", week: 1, sex: "unknown" },
      "P-107": { stage: "veg", week: 1, sex: "unknown" },
    },
    notes: {
      "P-101": "Sample note: transplanted into 3 gal fabric pot.",
      "P-102": "Sample note: transplanted into 3 gal fabric pot.",
      "P-107": "Sample note: back-right corner, under the weaker light edge.",
    },
    photos: {
      "P-101": PHOTO("Aug 18, Ember after transplant"),
      "P-107": PHOTO("Aug 18, Cinder after transplant"),
    },
  },
  {
    id: "snap-2026-09-08",
    date: "2026-09-08",
    label: "Sep 8 — veg, canopy spread",
    layout: {
      "P-101": { x: 12, z: 12 },
      "P-102": { x: 36, z: 12 },
      "P-103": { x: 12, z: 36 },
      "P-104": { x: 36, z: 36 },
      "P-107": { x: 24, z: 24 },
    },
    stages: {
      "P-101": { stage: "veg", week: 4, sex: "female" },
      "P-102": { stage: "veg", week: 4, sex: "female" },
      "P-103": { stage: "veg", week: 2, sex: "unknown" },
      "P-104": { stage: "veg", week: 1, sex: "unknown" },
      "P-107": { stage: "veg", week: 4, sex: "male" },
    },
    notes: {
      "P-101": "Sample note: first LST tie-down.",
      "P-107": "Sample note: pre-flowers look male; moved to the centre for a closer look.",
    },
    photos: {
      "P-102": PHOTO("Sep 8, Juniper canopy"),
    },
  },
  {
    id: "snap-2026-09-29",
    date: "2026-09-29",
    label: "Sep 29 — flip to flower, Cinder removed",
    layout: {
      "P-101": { x: 12, z: 12 },
      "P-102": { x: 36, z: 12 },
      "P-103": { x: 12, z: 36 },
      "P-104": { x: 36, z: 36 },
      "P-105": { x: 24, z: 24 },
      "P-106": { x: 24, z: 40 },
    },
    stages: {
      "P-101": { stage: "flower", week: 1, sex: "female" },
      "P-102": { stage: "flower", week: 0, sex: "female" },
      "P-103": { stage: "veg", week: 5, sex: "female" },
      "P-104": { stage: "veg", week: 2, sex: "male" },
      "P-105": { stage: "seedling", week: 0, sex: "unknown" },
      "P-106": { stage: "unknown", week: null, sex: "unknown" },
    },
    notes: {
      "P-101": "Sample note: flipped to 12/12 on Sep 22.",
      "P-105": "Sample note: new seedling added to the centre.",
      "P-106": "Sample note: gifted clone, stage not recorded at intake.",
    },
    photos: {
      "P-101": PHOTO("Sep 29, Ember stretch"),
      "P-106": PHOTO("Sep 29, Lantern at intake"),
    },
  },
]);

/** Plants that appear only in history (not in today's roster). Keeps labels working. */
export const HISTORICAL_PLANTS_BY_ID = Object.freeze({
  "P-107": {
    id: "P-107",
    shortName: "Cinder",
    longName: "Cinder Ridge (sample, removed Sep 2026)",
    stage: { stage: "unknown", week: null, sex: "male" },
  },
});

export function plantById(id) {
  return PLANTS_BY_ID[id] ?? HISTORICAL_PLANTS_BY_ID[id] ?? null;
}
