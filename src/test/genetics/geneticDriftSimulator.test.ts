/**
 * Tests for GeneticDriftSimulator — educational component safety and correctness.
 *
 * Test coverage:
 *  1. Small populations show more fixation/loss than large populations (deterministic seed)
 *  2. Invalid parameters are clamped or rejected safely
 *  3. fixed + lost + polymorphic stats sum correctly
 *  4. Average final frequency stays within 0–1
 *  5. No Action Queue / AI Doctor / alert imports or writes exist in simulator files
 *  6. Educational-only safety copy is rendered in the component
 *  7. No genetic certainty or recommendation wording appears in simulator files
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  simulateGeneticDrift,
  DRIFT_PARAM_LIMITS,
  EDUCATIONAL_DISCLAIMER,
} from "@/lib/genetics/geneticDriftSimulator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, "../../../");

function readSimulatorSource(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf-8");
}

// ---------------------------------------------------------------------------
// Test 1: Small populations drift faster than large populations
// ---------------------------------------------------------------------------

describe("Genetic drift magnitude by population size", () => {
  it("small populations (N=10) show higher fixation+loss rate than large populations (N=200) over 50 generations across 100 deterministic runs", () => {
    const commonParams = {
      initialFrequency: 0.5,
      generations: 50,
      runs: 100,
      seed: 42,
    };

    const smallResult = simulateGeneticDrift({ ...commonParams, populationSize: 10 });
    const largeResult = simulateGeneticDrift({ ...commonParams, populationSize: 200 });

    const smallFixedOrLost = smallResult.fixedCount + smallResult.lostCount;
    const largeFixedOrLost = largeResult.fixedCount + largeResult.lostCount;

    // Drift theory: smaller populations fix/lose alleles faster
    expect(smallFixedOrLost).toBeGreaterThan(largeFixedOrLost);
  });

  it("deterministic seed produces identical results on repeat calls", () => {
    const params = { populationSize: 30, initialFrequency: 0.5, generations: 20, runs: 50, seed: 7 };
    const r1 = simulateGeneticDrift(params);
    const r2 = simulateGeneticDrift(params);
    expect(r1.fixedCount).toBe(r2.fixedCount);
    expect(r1.lostCount).toBe(r2.lostCount);
    expect(r1.averageFinalFrequency).toBe(r2.averageFinalFrequency);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Invalid parameters are clamped or rejected safely
// ---------------------------------------------------------------------------

describe("Parameter clamping and validation", () => {
  it("clamps populationSize below minimum (0 → 2)", () => {
    const r = simulateGeneticDrift({ populationSize: 0, initialFrequency: 0.5, generations: 5, runs: 1 });
    expect(r.clampedParams.populationSize).toBe(DRIFT_PARAM_LIMITS.populationSize.min);
    expect(r.clampedParams.populationSize).toBeGreaterThanOrEqual(2);
  });

  it("clamps populationSize above maximum (999999 → max)", () => {
    const r = simulateGeneticDrift({ populationSize: 999999, initialFrequency: 0.5, generations: 5, runs: 1 });
    expect(r.clampedParams.populationSize).toBe(DRIFT_PARAM_LIMITS.populationSize.max);
    expect(r.clampedParams.populationSize).toBeLessThanOrEqual(500);
  });

  it("clamps negative populationSize to minimum", () => {
    const r = simulateGeneticDrift({ populationSize: -100, initialFrequency: 0.5, generations: 5, runs: 1 });
    expect(r.clampedParams.populationSize).toBe(DRIFT_PARAM_LIMITS.populationSize.min);
  });

  it("clamps initialFrequency below 0 to 0", () => {
    const r = simulateGeneticDrift({ populationSize: 10, initialFrequency: -0.5, generations: 5, runs: 1 });
    expect(r.clampedParams.initialFrequency).toBe(0);
  });

  it("clamps initialFrequency above 1 to 1", () => {
    const r = simulateGeneticDrift({ populationSize: 10, initialFrequency: 2.5, generations: 5, runs: 1 });
    expect(r.clampedParams.initialFrequency).toBe(1);
  });

  it("clamps generations below 1 to 1", () => {
    const r = simulateGeneticDrift({ populationSize: 10, initialFrequency: 0.5, generations: 0, runs: 1 });
    expect(r.clampedParams.generations).toBe(1);
  });

  it("clamps generations above max to max", () => {
    const r = simulateGeneticDrift({ populationSize: 10, initialFrequency: 0.5, generations: 9999, runs: 1 });
    expect(r.clampedParams.generations).toBeLessThanOrEqual(DRIFT_PARAM_LIMITS.generations.max);
  });

  it("clamps runs below 1 to 1", () => {
    const r = simulateGeneticDrift({ populationSize: 10, initialFrequency: 0.5, generations: 5, runs: 0 });
    expect(r.clampedParams.runs).toBe(1);
    expect(r.totalRuns).toBe(1);
  });

  it("clamps runs above max to max", () => {
    const r = simulateGeneticDrift({ populationSize: 10, initialFrequency: 0.5, generations: 5, runs: 9999 });
    expect(r.clampedParams.runs).toBeLessThanOrEqual(DRIFT_PARAM_LIMITS.runs.max);
    expect(r.totalRuns).toBeLessThanOrEqual(DRIFT_PARAM_LIMITS.runs.max);
  });

  it("handles NaN populationSize by clamping to minimum", () => {
    const r = simulateGeneticDrift({ populationSize: NaN, initialFrequency: 0.5, generations: 5, runs: 1 });
    expect(r.clampedParams.populationSize).toBe(DRIFT_PARAM_LIMITS.populationSize.min);
  });

  it("handles Infinity initialFrequency by clamping to 1", () => {
    const r = simulateGeneticDrift({ populationSize: 10, initialFrequency: Infinity, generations: 5, runs: 1 });
    expect(r.clampedParams.initialFrequency).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 3: fixed + lost + polymorphic stats sum correctly
// ---------------------------------------------------------------------------

describe("Outcome category counts are exhaustive and correct", () => {
  it("fixed + lost + polymorphic equals totalRuns", () => {
    const r = simulateGeneticDrift({
      populationSize: 20,
      initialFrequency: 0.5,
      generations: 30,
      runs: 50,
      seed: 123,
    });
    expect(r.fixedCount + r.lostCount + r.polymorphicCount).toBe(r.totalRuns);
    expect(r.totalRuns).toBe(r.runs.length);
  });

  it("each individual run has exactly one true outcome flag", () => {
    const r = simulateGeneticDrift({
      populationSize: 15,
      initialFrequency: 0.3,
      generations: 20,
      runs: 30,
      seed: 55,
    });
    for (const run of r.runs) {
      const trueFlags = [run.fixed, run.lost, run.polymorphic].filter(Boolean).length;
      expect(trueFlags).toBe(1);
    }
  });

  it("fixed runs all have finalFrequency === 1", () => {
    const r = simulateGeneticDrift({ populationSize: 10, initialFrequency: 0.5, generations: 50, runs: 50, seed: 1 });
    for (const run of r.runs.filter((x) => x.fixed)) {
      expect(run.finalFrequency).toBe(1);
    }
  });

  it("lost runs all have finalFrequency === 0", () => {
    const r = simulateGeneticDrift({ populationSize: 10, initialFrequency: 0.5, generations: 50, runs: 50, seed: 1 });
    for (const run of r.runs.filter((x) => x.lost)) {
      expect(run.finalFrequency).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 4: Average final frequency stays within 0–1
// ---------------------------------------------------------------------------

describe("Average final frequency bounds", () => {
  const scenarioTable: [string, number, number, number, number, number][] = [
    ["low freq, small pop",  10, 0.1, 20, 30, 11],
    ["mid freq, mid pop",    50, 0.5, 30, 50, 22],
    ["high freq, large pop",200, 0.9, 40, 40, 33],
    ["boundary freq 0",      10, 0.0, 10, 10, 44],
    ["boundary freq 1",      10, 1.0, 10, 10, 55],
  ];

  for (const [label, pop, freq, gens, runCount, seed] of scenarioTable) {
    it(`averageFinalFrequency ∈ [0, 1] — ${label}`, () => {
      const r = simulateGeneticDrift({
        populationSize: pop,
        initialFrequency: freq,
        generations: gens,
        runs: runCount,
        seed,
      });
      expect(r.averageFinalFrequency).toBeGreaterThanOrEqual(0);
      expect(r.averageFinalFrequency).toBeLessThanOrEqual(1);
    });
  }

  it("all individual run finalFrequency values are within [0, 1]", () => {
    const r = simulateGeneticDrift({ populationSize: 20, initialFrequency: 0.5, generations: 20, runs: 50, seed: 99 });
    for (const run of r.runs) {
      expect(run.finalFrequency).toBeGreaterThanOrEqual(0);
      expect(run.finalFrequency).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5: No Action Queue / AI Doctor / alert imports or writes exist
// ---------------------------------------------------------------------------

describe("Isolation — no ActionQueue, AI Doctor, or alert system imports", () => {
  const SIMULATOR_LIB = "src/lib/genetics/geneticDriftSimulator.ts";
  const SIMULATOR_COMP = "src/components/genetics/GeneticDriftSimulator.tsx";

  const PROHIBITED_TERMS = [
    "action_queue",
    "ActionQueue",
    "buildBreedingActionQueuePayloads",
    "aiDoctor",
    "ai-doctor",
    "AIDoctor",
    "useAiDoctor",
    "create-breeding-suggestions",
    "insertAlert",
    "useAlerts",
  ];

  for (const filePath of [SIMULATOR_LIB, SIMULATOR_COMP]) {
    it(`${filePath} contains no prohibited action/alert system references`, () => {
      const source = readSimulatorSource(filePath);
      for (const term of PROHIBITED_TERMS) {
        expect(source, `Found prohibited term "${term}" in ${filePath}`).not.toContain(term);
      }
    });
  }

  it("simulateGeneticDrift() returns without any observable side effects (no throws)", () => {
    expect(() =>
      simulateGeneticDrift({ populationSize: 10, initialFrequency: 0.5, generations: 5, runs: 5, seed: 0 })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test 6: Educational-only safety copy exists in the component source
// ---------------------------------------------------------------------------

describe("Educational safety copy is present in component source", () => {
  const SIMULATOR_COMP = "src/components/genetics/GeneticDriftSimulator.tsx";

  it("component source contains the canonical educational disclaimer constant", () => {
    const source = readSimulatorSource(SIMULATOR_COMP);
    // Must import or reference EDUCATIONAL_DISCLAIMER
    expect(source).toContain("EDUCATIONAL_DISCLAIMER");
  });

  it("component source references the DISCLAIMER_TEST_ID for test accessibility", () => {
    const source = readSimulatorSource(SIMULATOR_COMP);
    expect(source).toContain("genetic-drift-educational-disclaimer");
  });

  it("component source contains required educational copy phrases", () => {
    const source = readSimulatorSource(SIMULATOR_COMP);
    expect(source).toContain("educational simulation");
    expect(source).toContain("not a prediction");
    expect(source).toContain("learning purposes only");
  });

  it("library source exports EDUCATIONAL_DISCLAIMER string with required content", () => {
    expect(EDUCATIONAL_DISCLAIMER).toContain("educational simulation");
    expect(EDUCATIONAL_DISCLAIMER).toContain("not a prediction");
    expect(EDUCATIONAL_DISCLAIMER).toContain("learning purposes only");
    expect(EDUCATIONAL_DISCLAIMER.length).toBeGreaterThan(50);
  });

  it("library source contains ISOLATION GUARANTEE comment", () => {
    const source = readSimulatorSource(SIMULATOR_COMP);
    expect(source).toContain("ISOLATION GUARANTEE");
  });
});

// ---------------------------------------------------------------------------
// Test 7: No genetic certainty or recommendation wording
// ---------------------------------------------------------------------------

describe("Prohibited language — no genetic certainty or recommendation wording", () => {
  const SIMULATOR_LIB = "src/lib/genetics/geneticDriftSimulator.ts";
  const SIMULATOR_COMP = "src/components/genetics/GeneticDriftSimulator.tsx";

  const PROHIBITED_PHRASES = [
    "guaranteed",
    "dominant outcome",
    "expected cultivar result",
    "recommended cross",
    "breeding action",
    "will produce",
    "will result in",
    "definitive outcome",
    "certain to",
  ];

  for (const filePath of [SIMULATOR_LIB, SIMULATOR_COMP]) {
    it(`${filePath} does not contain certainty or recommendation language`, () => {
      const source = readSimulatorSource(filePath).toLowerCase();
      for (const phrase of PROHIBITED_PHRASES) {
        expect(source, `Found prohibited phrase "${phrase}" in ${filePath}`).not.toContain(
          phrase.toLowerCase()
        );
      }
    });
  }
});
