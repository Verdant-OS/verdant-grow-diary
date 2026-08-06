/**
 * geneticDriftSimulator.ts
 *
 * Educational Wright-Fisher genetic drift simulation.
 *
 * EDUCATIONAL USE ONLY. This module models allele frequency change due to random
 * sampling (genetic drift) in idealized populations. It is not connected to any
 * plant database, AI recommendations, action queue, or alerting system. Results do
 * not represent real plant outcomes, specific cultivars, or breeding programs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriftSimulationParams {
  /** Diploid population size (number of individuals). */
  populationSize: number;
  /** Starting allele frequency, between 0 and 1 inclusive. */
  initialFrequency: number;
  /** Number of discrete generations to simulate per run. */
  generations: number;
  /** Number of independent simulation runs. */
  runs: number;
  /**
   * Optional integer seed for the pseudo-random number generator.
   * When provided, the simulation is fully deterministic and reproducible.
   * Useful for tests and demonstrations.
   */
  seed?: number;
}

export interface DriftRunResult {
  /** Allele frequency at the end of the final generation (0–1). */
  finalFrequency: number;
  /** True when the allele reached frequency 1.0 (fixation). */
  fixed: boolean;
  /** True when the allele reached frequency 0.0 (loss). */
  lost: boolean;
  /** True when the allele remains between 0 and 1 (neither fixed nor lost). */
  polymorphic: boolean;
}

export interface DriftSimulationResult {
  /** Individual result for each simulation run. */
  runs: DriftRunResult[];
  /** Number of runs that ended in allele fixation (frequency = 1). */
  fixedCount: number;
  /** Number of runs that ended in allele loss (frequency = 0). */
  lostCount: number;
  /** Number of runs that ended with the allele still polymorphic (0 < freq < 1). */
  polymorphicCount: number;
  /** Mean final allele frequency across all runs (0–1). */
  averageFinalFrequency: number;
  /** Total number of runs executed (equals clampedParams.runs). */
  totalRuns: number;
  /** The actual parameters used after clamping. */
  clampedParams: Required<DriftSimulationParams>;
  /** Educational context text. Must be surfaced to users wherever results are shown. */
  educationalDisclaimer: string;
}

// ---------------------------------------------------------------------------
// Validation / clamping constants
// ---------------------------------------------------------------------------

export const DRIFT_PARAM_LIMITS = {
  populationSize: { min: 2, max: 500 },
  initialFrequency: { min: 0, max: 1 },
  generations: { min: 1, max: 100 },
  runs: { min: 1, max: 100 },
} as const;

export const EDUCATIONAL_DISCLAIMER =
  "This is an educational simulation of genetic drift based on the Wright-Fisher model. " +
  "It is not a prediction of real plant outcomes, and does not represent any specific cultivar, " +
  "trait, or breeding program. Allele frequencies change by random chance in these models. " +
  "Results are for learning purposes only and should not inform any cultivation or selection decision.";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

/**
 * Mulberry32: a fast, high-quality 32-bit PRNG seeded with a 32-bit integer.
 * Returns a factory that produces values in [0, 1).
 */
function makeMulberry32Rng(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Default seeded PRNG when no seed is supplied (uses current timestamp-derived value). */
function makeDefaultRng(): () => number {
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  return makeMulberry32Rng(seed);
}

/**
 * Wright-Fisher diploid sampling: given current allele frequency `p` in a
 * diploid population of size `n`, draw 2n Bernoulli(p) trials and return
 * the new allele frequency.
 */
function sampleNextGeneration(freq: number, populationSize: number, rng: () => number): number {
  const alleles = 2 * populationSize;
  let copies = 0;
  for (let i = 0; i < alleles; i++) {
    if (rng() < freq) copies++;
  }
  return copies / alleles;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs a Wright-Fisher genetic drift simulation.
 *
 * All parameters are clamped to safe ranges. The simulation is pure computation
 * with no side effects, no network calls, and no imports from any alerting,
 * recommendation, or action-queue system.
 *
 * @param params - Simulation configuration (see DriftSimulationParams)
 * @returns      - Simulation results with educational disclaimer attached
 */
export function simulateGeneticDrift(params: DriftSimulationParams): DriftSimulationResult {
  const lim = DRIFT_PARAM_LIMITS;

  const populationSize = clampInt(
    Number.isNaN(params.populationSize) ? lim.populationSize.min : params.populationSize,
    lim.populationSize.min,
    lim.populationSize.max,
  );
  const initialFrequency = clamp(
    Number.isNaN(params.initialFrequency) ? 0.5 : params.initialFrequency,
    lim.initialFrequency.min,
    lim.initialFrequency.max,
  );
  const generations = clampInt(
    Number.isNaN(params.generations) ? lim.generations.min : params.generations,
    lim.generations.min,
    lim.generations.max,
  );
  const runs = clampInt(
    Number.isNaN(params.runs) ? lim.runs.min : params.runs,
    lim.runs.min,
    lim.runs.max,
  );

  const seedProvided = params.seed !== undefined && Number.isFinite(params.seed);
  const seed = seedProvided ? (Math.round(params.seed!) >>> 0) : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  const rng = makeMulberry32Rng(seed);

  const clampedParams: Required<DriftSimulationParams> = {
    populationSize,
    initialFrequency,
    generations,
    runs,
    seed,
  };

  const runResults: DriftRunResult[] = [];

  for (let r = 0; r < runs; r++) {
    let freq = initialFrequency;
    for (let g = 0; g < generations; g++) {
      freq = sampleNextGeneration(freq, populationSize, rng);
      // Short-circuit once fixed or lost (saves computation)
      if (freq === 0 || freq === 1) break;
    }
    const fixed = freq === 1;
    const lost = freq === 0;
    runResults.push({
      finalFrequency: freq,
      fixed,
      lost,
      polymorphic: !fixed && !lost,
    });
  }

  const fixedCount = runResults.filter((r) => r.fixed).length;
  const lostCount = runResults.filter((r) => r.lost).length;
  const polymorphicCount = runResults.filter((r) => r.polymorphic).length;
  const averageFinalFrequency =
    runResults.reduce((sum, r) => sum + r.finalFrequency, 0) / runResults.length;

  return {
    runs: runResults,
    fixedCount,
    lostCount,
    polymorphicCount,
    averageFinalFrequency,
    totalRuns: runResults.length,
    clampedParams,
    educationalDisclaimer: EDUCATIONAL_DISCLAIMER,
  };
}
