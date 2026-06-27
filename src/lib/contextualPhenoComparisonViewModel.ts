/**
 * contextualPhenoComparisonViewModel
 *
 * Pure, read-only view-model for the Verdant Contextual Pheno Comparison v0
 * foundation. Aggregates available evidence across 2–4 plants from rows the
 * caller has already loaded.
 *
 * Hard rules (V0):
 *  - No I/O. No fetch. No Supabase calls. No AI calls. No mutations.
 *  - No ranking. No automatic phenotype pick. Grower decides.
 *  - Demo / stale / invalid / unknown sensor sources are never trusted.
 *  - Missing context is reported explicitly, never guessed.
 *  - Deterministic output: stable sort with explicit tie-breakers.
 *  - Null-safe on every field.
 *
 * This module is presenter input only. It does NOT decide outcomes for the
 * grower; the grower decides.
 */

export type ContextualPhenoEvidenceSource =
  | "diary"
  | "photo"
  | "sensor"
  | "watering"
  | "feeding"
  | "training"
  | "alert"
  | "manual"
  | "unknown";

export type ContextualPhenoSensorSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "unknown";

const SENSOR_SOURCE_VALUES: readonly ContextualPhenoSensorSource[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "unknown",
];

const UNTRUSTED_SOURCES: ReadonlySet<ContextualPhenoSensorSource> = new Set([
  "demo",
  "stale",
  "invalid",
  "unknown",
]);

export interface ContextualPhenoSensorReadingInput {
  readonly source?: string | null;
  readonly capturedAt?: string | null;
  readonly tempF?: number | null;
  readonly rh?: number | null;
  readonly vpd?: number | null;
  readonly ppfd?: number | null;
}

export interface ContextualPhenoPlantInput {
  readonly plantId: string;
  readonly plantLabel?: string | null;
  readonly growId?: string | null;
  readonly tentId?: string | null;
  readonly strain?: string | null;
  readonly stage?: string | null;
  readonly status?: string | null;
  readonly diaryCount?: number | null;
  readonly photoCount?: number | null;
  readonly wateringCount?: number | null;
  readonly feedingCount?: number | null;
  readonly trainingCount?: number | null;
  readonly alertCount?: number | null;
  readonly sensorReadings?: readonly ContextualPhenoSensorReadingInput[] | null;
  /** Free-text grower notes. Never used to derive ranking or AI claims. */
  readonly comparisonNotes?: readonly string[] | null;
}

export interface ContextualPhenoComparisonPlant {
  plantId: string;
  plantLabel: string;
  growId: string | null;
  tentId: string | null;
  strain: string | null;
  stage: string | null;
  status: string | null;
  evidenceCounts: {
    diary: number;
    photos: number;
    watering: number;
    feeding: number;
    training: number;
    sensorReadings: number;
    alerts: number;
  };
  sourceCounts: Record<ContextualPhenoSensorSource, number>;
  environmentSummary: {
    avgTempF: number | null;
    avgRh: number | null;
    avgVpd: number | null;
    avgPpfd: number | null;
    lastSensorAt: string | null;
    hasTrustedSensorContext: boolean;
    trustWarnings: string[];
  };
  missingContext: string[];
  comparisonNotes: string[];
}

export type ContextualPhenoComparisonError =
  | "too_few_plants"
  | "too_many_plants"
  | "duplicate_plant_ids";

export interface ContextualPhenoComparisonView {
  readonly ok: boolean;
  readonly error: ContextualPhenoComparisonError | null;
  readonly caveat: string;
  readonly plants: readonly ContextualPhenoComparisonPlant[];
  readonly crossPlantMissingContext: readonly string[];
  readonly sourceQualitySummary: Record<ContextualPhenoSensorSource, number>;
}

export const CONTEXTUAL_PHENO_COMPARISON_CAVEAT =
  "This comparison shows available context only. It does not pick a phenotype for you.";

const MIN_PLANTS = 2;
const MAX_PLANTS = 4;

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nonNegInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.floor(value);
}

function normalizeSensorSource(input: unknown): ContextualPhenoSensorSource {
  if (typeof input !== "string") return "unknown";
  const v = input.trim().toLowerCase();
  if (v.length === 0) return "unknown";
  if ((SENSOR_SOURCE_VALUES as readonly string[]).includes(v)) {
    return v as ContextualPhenoSensorSource;
  }
  return "unknown";
}

function emptySourceCounts(): Record<ContextualPhenoSensorSource, number> {
  return {
    live: 0,
    manual: 0,
    csv: 0,
    demo: 0,
    stale: 0,
    invalid: 0,
    unknown: 0,
  };
}

function finiteOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function avg(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

interface PlantAggregation {
  plant: ContextualPhenoComparisonPlant;
}

function aggregatePlant(input: ContextualPhenoPlantInput): PlantAggregation {
  const plantId = input.plantId;
  const plantLabel = cleanString(input.plantLabel) ?? plantId;

  const sourceCounts = emptySourceCounts();
  const trustedTemps: number[] = [];
  const trustedRh: number[] = [];
  const trustedVpd: number[] = [];
  const trustedPpfd: number[] = [];
  let lastSensorAt: string | null = null;
  const trustWarnings = new Set<string>();
  let sensorReadingCount = 0;

  for (const reading of input.sensorReadings ?? []) {
    sensorReadingCount += 1;
    const source = normalizeSensorSource(reading.source);
    sourceCounts[source] += 1;

    const capturedAt = cleanString(reading.capturedAt);
    if (capturedAt && (lastSensorAt === null || capturedAt > lastSensorAt)) {
      lastSensorAt = capturedAt;
    }

    if (UNTRUSTED_SOURCES.has(source)) {
      trustWarnings.add(
        `Sensor reading marked "${source}" is not treated as trusted context.`,
      );
      continue;
    }

    // Trusted: live | manual | csv. Only "live" is real-time trusted, but
    // manual/csv values are kept as user-entered context. Demo/stale/invalid
    // never reach this branch.
    const t = finiteOrNull(reading.tempF);
    if (t !== null) trustedTemps.push(t);
    const rh = finiteOrNull(reading.rh);
    if (rh !== null) trustedRh.push(rh);
    const vpd = finiteOrNull(reading.vpd);
    if (vpd !== null) trustedVpd.push(vpd);
    const ppfd = finiteOrNull(reading.ppfd);
    if (ppfd !== null) trustedPpfd.push(ppfd);
  }

  const evidenceCounts = {
    diary: nonNegInt(input.diaryCount),
    photos: nonNegInt(input.photoCount),
    watering: nonNegInt(input.wateringCount),
    feeding: nonNegInt(input.feedingCount),
    training: nonNegInt(input.trainingCount),
    sensorReadings: sensorReadingCount,
    alerts: nonNegInt(input.alertCount),
  };

  const missingContext: string[] = [];
  if (evidenceCounts.diary === 0) missingContext.push("No diary entries.");
  if (evidenceCounts.photos === 0) missingContext.push("No photos.");
  if (evidenceCounts.watering === 0) missingContext.push("No watering logs.");
  if (evidenceCounts.feeding === 0) missingContext.push("No feeding logs.");
  if (evidenceCounts.sensorReadings === 0) {
    missingContext.push("No sensor readings.");
  }
  if (cleanString(input.strain) === null) missingContext.push("Strain unknown.");
  if (cleanString(input.stage) === null) missingContext.push("Stage unknown.");

  const hasTrustedSensorContext =
    sourceCounts.live + sourceCounts.manual + sourceCounts.csv > 0;

  if (
    sensorReadingCount > 0 &&
    !hasTrustedSensorContext
  ) {
    trustWarnings.add(
      "All sensor readings come from untrusted sources (demo/stale/invalid/unknown).",
    );
  }

  const notes = (input.comparisonNotes ?? [])
    .map((n) => cleanString(n))
    .filter((n): n is string => n !== null);

  const plant: ContextualPhenoComparisonPlant = {
    plantId,
    plantLabel,
    growId: cleanString(input.growId),
    tentId: cleanString(input.tentId),
    strain: cleanString(input.strain),
    stage: cleanString(input.stage),
    status: cleanString(input.status),
    evidenceCounts,
    sourceCounts,
    environmentSummary: {
      avgTempF: avg(trustedTemps),
      avgRh: avg(trustedRh),
      avgVpd: avg(trustedVpd),
      avgPpfd: avg(trustedPpfd),
      lastSensorAt,
      hasTrustedSensorContext,
      trustWarnings: Array.from(trustWarnings).sort(),
    },
    missingContext,
    comparisonNotes: notes,
  };

  return { plant };
}

/**
 * Build a deterministic, read-only contextual pheno comparison view across
 * 2–4 plants using only the input rows supplied by the caller.
 */
export function buildContextualPhenoComparisonView(
  inputs: readonly ContextualPhenoPlantInput[] | null | undefined,
): ContextualPhenoComparisonView {
  const list = Array.isArray(inputs) ? inputs : [];

  if (list.length < MIN_PLANTS) {
    return {
      ok: false,
      error: "too_few_plants",
      caveat: CONTEXTUAL_PHENO_COMPARISON_CAVEAT,
      plants: [],
      crossPlantMissingContext: [
        `Select at least ${MIN_PLANTS} plants to compare.`,
      ],
      sourceQualitySummary: emptySourceCounts(),
    };
  }
  if (list.length > MAX_PLANTS) {
    return {
      ok: false,
      error: "too_many_plants",
      caveat: CONTEXTUAL_PHENO_COMPARISON_CAVEAT,
      plants: [],
      crossPlantMissingContext: [
        `Compare at most ${MAX_PLANTS} plants at a time.`,
      ],
      sourceQualitySummary: emptySourceCounts(),
    };
  }

  const ids = new Set<string>();
  for (const p of list) {
    if (ids.has(p.plantId)) {
      return {
        ok: false,
        error: "duplicate_plant_ids",
        caveat: CONTEXTUAL_PHENO_COMPARISON_CAVEAT,
        plants: [],
        crossPlantMissingContext: ["Duplicate plant ids in comparison."],
        sourceQualitySummary: emptySourceCounts(),
      };
    }
    ids.add(p.plantId);
  }

  const aggregated = list.map((p, idx) => ({
    idx,
    ...aggregatePlant(p),
  }));

  // Deterministic ordering: by plantLabel asc, then plantId asc, then input
  // index as a final stable tie-breaker.
  aggregated.sort((a, b) => {
    const labelCmp = a.plant.plantLabel.localeCompare(b.plant.plantLabel);
    if (labelCmp !== 0) return labelCmp;
    const idCmp = a.plant.plantId.localeCompare(b.plant.plantId);
    if (idCmp !== 0) return idCmp;
    return a.idx - b.idx;
  });

  const plants = aggregated.map((a) => a.plant);

  const sourceQualitySummary = emptySourceCounts();
  for (const p of plants) {
    for (const key of SENSOR_SOURCE_VALUES) {
      sourceQualitySummary[key] += p.sourceCounts[key];
    }
  }

  const crossPlantMissingContext: string[] = [];
  if (plants.every((p) => p.evidenceCounts.photos === 0)) {
    crossPlantMissingContext.push("No photos on any selected plant.");
  }
  if (plants.every((p) => p.evidenceCounts.sensorReadings === 0)) {
    crossPlantMissingContext.push("No sensor readings on any selected plant.");
  }
  if (plants.every((p) => !p.environmentSummary.hasTrustedSensorContext)) {
    crossPlantMissingContext.push(
      "No trusted sensor context on any selected plant.",
    );
  }
  if (plants.every((p) => p.strain === null)) {
    crossPlantMissingContext.push("Strain unknown on every selected plant.");
  }

  return {
    ok: true,
    error: null,
    caveat: CONTEXTUAL_PHENO_COMPARISON_CAVEAT,
    plants,
    crossPlantMissingContext,
    sourceQualitySummary,
  };
}
