/**
 * blueprintTargetsViewModel — pure view model for the public per-stage target
 * bands reference (/tools/blueprint-targets).
 *
 * Turns SOP_BLUEPRINT_TARGETS into display rows and carries the stage copy.
 * The page renders the result; it does not format bands itself.
 *
 * Pure. No React, no I/O, no Supabase, no browser globals — the route is
 * server-rendered, so nothing here may touch `window`, `document`, or
 * localStorage. Temperature is converted inline for that reason: the shared
 * unit-preference helper reads localStorage and would throw during SSR.
 */
import {
  SOP_BLUEPRINT_TARGETS,
  type BlueprintStageBands,
  type BlueprintTargetStage,
} from "@/constants/blueprintTargets";

export interface BlueprintTargetRow {
  /** Stable key; also the row testid suffix. */
  key: string;
  label: string;
  /** Preformatted display value, units included. */
  value: string;
  /** Qualifier shown under the label. Absent when none applies. */
  note?: string;
}

export interface BlueprintTargetStageSection {
  stage: BlueprintTargetStage;
  label: string;
  blurb: string;
  rows: readonly BlueprintTargetRow[];
}

/** Display order. Matches the order a plant actually moves through. */
export const BLUEPRINT_TARGET_STAGE_ORDER: readonly BlueprintTargetStage[] = [
  "seedling",
  "veg",
  "preflower",
  "flower",
  "late_flower",
  "harvest",
];

/**
 * Stage copy. Deliberately descriptive rather than mechanistic: claims about
 * plant growth responses belong in the grow-stage care guide, which is the
 * reviewed source for them.
 */
export const BLUEPRINT_TARGET_STAGE_COPY: Readonly<
  Record<BlueprintTargetStage, { label: string; blurb: string }>
> = Object.freeze({
  seedling: {
    label: "Seedling / propagation",
    blurb: "Warm and humid, with light kept low while the root system is still developing.",
  },
  veg: {
    label: "Vegetative",
    blurb:
      "A pronounced day/night temperature split opens up. Humidity comes down and feed strength climbs as the plant builds structure.",
  },
  preflower: {
    label: "Transition / pre-flower",
    blurb:
      "The stretch. Humidity drops toward flower levels and feed strength ramps up, though it has not yet reached its flower peak.",
  },
  flower: {
    label: "Flower",
    blurb: "Peak light and feed, with humidity held down to protect dense buds from rot.",
  },
  late_flower: {
    label: "Late flower / flush",
    blurb:
      "Cooler and drier still. Any taper or flush should follow evidence — runoff EC, leaf-tip burn, visible salt stress — rather than the calendar; a plant still building tissue should not be starved.",
  },
  harvest: {
    label: "Dry & cure",
    blurb:
      "A dark, cool room held to a narrow band, with gentle airflow — stagnant air lets damp pockets form even when the average reads right. Light, feed and pH targets no longer apply once the plant is cut.",
  },
});

export function celsiusToFahrenheit(celsius: number): number {
  return Math.round(((celsius * 9) / 5 + 32) * 10) / 10;
}

function formatTempBand(min: number, max: number): string {
  return `${min}–${max} °C (${celsiusToFahrenheit(min)}–${celsiusToFahrenheit(max)} °F)`;
}

/**
 * Flatten one stage's bands into display rows. A metric with no target for the
 * stage is omitted entirely rather than rendered blank — an absent band means
 * "no target", which is itself meaningful (see the dry-room stage, where feed
 * and light stop applying once the plant is cut).
 */
export function buildStageMetricRows(
  bands: BlueprintStageBands,
  stage?: BlueprintTargetStage,
): BlueprintTargetRow[] {
  const rows: BlueprintTargetRow[] = [];

  if (bands.tempC) {
    const { day, night } = bands.tempC;
    const sameDayNight = day.min === night.min && day.max === night.max;
    if (sameDayNight) {
      rows.push({
        key: "tempC",
        label: "Air temperature",
        value: formatTempBand(day.min, day.max),
      });
    } else {
      rows.push({
        key: "tempC-day",
        label: "Air temperature (lights on)",
        value: formatTempBand(day.min, day.max),
      });
      rows.push({
        key: "tempC-night",
        label: "Air temperature (lights off)",
        value: formatTempBand(night.min, night.max),
      });
    }
  }

  if (bands.rh) {
    rows.push({ key: "rh", label: "Relative humidity", value: `${bands.rh.min}–${bands.rh.max} %` });
  }

  // EC and pH carry two qualifiers that are load-bearing for safety.
  //
  // 1. INPUT ONLY. These target the solution the grower mixes, never collected
  //    runoff — see blueprintFeedingInput, which reads inputEcMsCm/inputPh
  //    precisely because runoff is excluded. Runoff EC reads higher as salts
  //    accumulate, so presenting an input band as a runoff target would invite
  //    a feeding change on a number that was never comparable.
  // 2. MEDIUM. These are soilless/hydro figures; soil buffers pH and runs
  //    materially higher (roughly 6.0–6.8, per the grow-stage care guide).
  if (bands.ec) {
    // The late-flower EC band is the FLUSH band: plants.stage has a literal
    // "flush" value that normalizes to late_flower, and the SOP drops EC for
    // it. So the lower figure describes a plant already being flushed — a
    // grower decision — not a target to drop to on reaching late flower.
    // Rendered unqualified it would prompt exactly the calendar-driven taper
    // the stage copy and FAQ warn against.
    const isFlushBand = stage === "late_flower";
    rows.push({
      key: "ec",
      label: isFlushBand ? "Input feed EC (during a flush)" : "Input feed EC",
      value: `${bands.ec.min}–${bands.ec.max} mS/cm`,
      note: isFlushBand
        ? "Applies once a flush is underway, not on reaching late flower. Hold the flower range until runoff or leaf evidence says otherwise. Soilless or hydro, as mixed — not runoff"
        : "Soilless or hydro, nutrient solution as mixed — not runoff",
    });
  }
  if (bands.ph) {
    rows.push({
      key: "ph",
      label: "Input feed pH",
      value: `${bands.ph.min}–${bands.ph.max}`,
      note: "Soilless or hydro, as mixed — not runoff. In soil, aim for roughly 6.0–6.8",
    });
  }

  if (bands.ppfd) {
    rows.push({
      key: "ppfd",
      label: "PPFD",
      value: `${bands.ppfd.min}–${bands.ppfd.max} µmol/m²/s`,
    });
  }
  if (bands.dli) {
    // DLI is PPFD integrated over the photoperiod, so this row and the PPFD
    // row are not independently satisfiable. At the endpoints they actively
    // disagree: veg PPFD 700 over 18 h gives 45.4, above the 25-40 band; flower
    // PPFD 700 over 12 h gives 30.2, below the 35-45 band. Without the formula
    // a grower could "correct" an intensity or schedule that was already fine.
    rows.push({
      key: "dli",
      label: "DLI",
      value: `${bands.dli.min}–${bands.dli.max} mol/m²/day`,
      note: "Depends on your photoperiod — DLI ≈ PPFD × light-hours × 0.0036. Reconcile with the PPFD row for your own schedule rather than hitting both independently",
    });
  }

  return rows;
}

/**
 * The whole page in one deterministic structure, in stage order. Every stage
 * is always present: the page must render all bands on first paint, since a
 * crawler never interacts with it.
 */
export function buildBlueprintTargetsViewModel(): BlueprintTargetStageSection[] {
  return BLUEPRINT_TARGET_STAGE_ORDER.map((stage) => ({
    stage,
    label: BLUEPRINT_TARGET_STAGE_COPY[stage].label,
    blurb: BLUEPRINT_TARGET_STAGE_COPY[stage].blurb,
    rows: buildStageMetricRows(SOP_BLUEPRINT_TARGETS[stage], stage),
  }));
}
