// FICTIONAL SAMPLE DATA. No real grow, plant, grower, sensor or photo is represented.
// Nine plants in a 5×5 ft tent (60 × 60 in), a present-day layout and one dated snapshot.
// Positions are inches on the tent floor (x right, z toward the door). Snap grid is 2 in.
// Same export shape as sampleGarden.js so the app can load either.

export const SAMPLE_TODAY_DATE = "2026-10-16";

/** Tent footprint and default pot for this fictional garden (see layoutRules TENT_PROFILES). */
export const TENT_PROFILE_ID = "5x5";
export const DEFAULT_POT_GAL = 5;

const plant = (id, shortName, stage, week, sex) => ({
  id,
  shortName,
  longName: `${shortName} (sample)`,
  stage: { stage, week, sex },
});

export const PLANTS = Object.freeze([
  plant("P-201", "Basil", "flower", 5, "female"),
  plant("P-202", "Comet", "flower", 5, "female"),
  plant("P-203", "Driftwood", "flower", 3, "female"),
  plant("P-204", "Fennel", "veg", 6, "female"),
  plant("P-205", "Gale", "veg", 4, "unknown"),
  plant("P-206", "Harbor", "veg", 2, "male"),
  plant("P-207", "Ivy", "seedling", 2, "unknown"),
  plant("P-208", "Juno", "flower", 1, "female"),
  plant("P-209", "Kestrel", "unknown", null, "unknown"),
]);

export const PLANTS_BY_ID = Object.freeze(Object.fromEntries(PLANTS.map((p) => [p.id, p])));

/** Present-day recorded layout: a 3 × 3 grid at 20-in spacing (editable in the prototype). */
export const TODAY_LAYOUT = Object.freeze({
  "P-201": { x: 10, z: 10 },
  "P-202": { x: 30, z: 10 },
  "P-203": { x: 50, z: 10 },
  "P-204": { x: 10, z: 30 },
  "P-205": { x: 30, z: 30 },
  "P-206": { x: 50, z: 30 },
  "P-207": { x: 10, z: 50 },
  "P-208": { x: 30, z: 50 },
  "P-209": { x: 50, z: 50 },
});

export const TODAY_STAGES = Object.freeze(
  Object.fromEntries(PLANTS.map((p) => [p.id, { ...p.stage }])),
);

export const TODAY_NOTES = Object.freeze({
  "P-206": "Sample note: male, kept at the edge away from the flowering row.",
  "P-209": "Sample note: gifted clone, stage not recorded at intake.",
});

/** One dated, explicitly fictional snapshot. Kestrel (P-209) had not arrived yet. */
export const SNAPSHOTS = Object.freeze([
  {
    id: "snap-5x5-2026-09-25",
    date: "2026-09-25",
    label: "Sep 25 — eight plants, Harbor in the centre",
    layout: {
      "P-201": { x: 10, z: 10 },
      "P-202": { x: 30, z: 10 },
      "P-203": { x: 50, z: 10 },
      "P-204": { x: 10, z: 30 },
      "P-206": { x: 30, z: 30 },
      "P-205": { x: 50, z: 30 },
      "P-207": { x: 10, z: 50 },
      "P-208": { x: 30, z: 50 },
    },
    stages: {
      "P-201": { stage: "flower", week: 2, sex: "female" },
      "P-202": { stage: "flower", week: 2, sex: "female" },
      "P-203": { stage: "flower", week: 0, sex: "female" },
      "P-204": { stage: "veg", week: 3, sex: "unknown" },
      "P-205": { stage: "veg", week: 1, sex: "unknown" },
      "P-206": { stage: "veg", week: 0, sex: "unknown" },
      "P-207": { stage: "seedling", week: 0, sex: "unknown" },
      "P-208": { stage: "veg", week: 5, sex: "female" },
    },
    notes: {
      "P-206": "Sample note: centre spot for now; sex not yet shown.",
    },
    photos: {},
  },
]);

/** No plants in this garden exist only in history. */
export const HISTORICAL_PLANTS_BY_ID = Object.freeze({});

export function plantById(id) {
  return PLANTS_BY_ID[id] ?? HISTORICAL_PLANTS_BY_ID[id] ?? null;
}
