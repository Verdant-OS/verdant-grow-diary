/**
 * Stability environment coverage + comparison gate.
 *
 * The GxE-adjacent rule: a drift on re-grow cannot be read against the
 * environment until at least GXE_MIN_TAGGED_RUNS grow-outs carry an
 * environment tag ACROSS at least two distinct environments. Below the gate
 * the UI shows an insufficient-data explanation naming what is missing —
 * never a comparison, never sample data. The comparison itself is
 * descriptive grouping of the grower's own values; it draws no conclusion.
 */
import { describe, expect, it } from "vitest";
import {
  buildEnvironmentComparison,
  environmentCoverageCopy,
  sanitizeStabilityRuns,
  summarizeEnvironmentCoverage,
  GXE_MIN_TAGGED_RUNS,
  type StabilityRun,
} from "@/lib/phenoStabilityRunRules";

function run(label: string, env: string | null, traits: Record<string, number>): StabilityRun {
  return {
    runLabel: label,
    observedAt: null,
    traits,
    note: null,
    ...(env === null ? {} : { environment: env }),
  };
}

describe("summarizeEnvironmentCoverage", () => {
  it("counts tagged runs and distinct environments; gate needs 3 tagged across 2+ environments", () => {
    expect(GXE_MIN_TAGGED_RUNS).toBe(3);
    const two = summarizeEnvironmentCoverage([
      run("r1", "indoor coco", { nose_loudness: 8 }),
      run("r2", "outdoor", { nose_loudness: 7 }),
    ]);
    expect(two.taggedRunCount).toBe(2);
    expect(two.comparisonAvailable).toBe(false);

    const threeSameEnv = summarizeEnvironmentCoverage([
      run("r1", "indoor coco", {}),
      run("r2", "indoor coco", {}),
      run("r3", "indoor coco", {}),
    ]);
    expect(threeSameEnv.comparisonAvailable).toBe(false); // nothing to compare against

    const gate = summarizeEnvironmentCoverage([
      run("r1", "indoor coco", {}),
      run("r2", "indoor coco", {}),
      run("r3", "outdoor", {}),
    ]);
    expect(gate.comparisonAvailable).toBe(true);
    expect(gate.environments).toEqual(["indoor coco", "outdoor"]);
  });

  it("case/whitespace variants of one tag count as ONE environment and never unlock the gate", () => {
    // "Tent A", "tent a" and "tent  A" describe the same environment; the
    // comparison gate needs two genuinely different ones.
    const coverage = summarizeEnvironmentCoverage([
      run("r1", "Tent A", { nose_loudness: 8 }),
      run("r2", "tent a", { nose_loudness: 7 }),
      run("r3", "tent  A", { nose_loudness: 6 }),
    ]);
    expect(coverage.taggedRunCount).toBe(3);
    expect(coverage.environments).toEqual(["Tent A"]); // first-seen display spelling
    expect(coverage.comparisonAvailable).toBe(false);
  });

  it("comparison pools case-variant tags under one environment", () => {
    const comparisons = buildEnvironmentComparison([
      run("r1", "Tent A", { nose_loudness: 8 }),
      run("r2", "tent a", { nose_loudness: 7 }),
      run("r3", "Tent B", { nose_loudness: 5 }),
    ]);
    const nose = comparisons.find((c) => c.axisKey === "nose_loudness");
    expect(nose).toBeDefined();
    expect(nose!.byEnvironment.map((e) => e.environment)).toEqual(["Tent A", "Tent B"]);
    expect(nose!.byEnvironment[0].values).toEqual([8, 7]);
  });

  it("insufficient-data copy names exactly what is missing", () => {
    const untagged = summarizeEnvironmentCoverage([run("r1", null, {}), run("r2", null, {})]);
    expect(environmentCoverageCopy(untagged)).toMatch(/0 of 2 grow-outs/);
    expect(environmentCoverageCopy(untagged)).toMatch(/at least 3 tagged/);

    const oneEnv = summarizeEnvironmentCoverage([
      run("r1", "tent A", {}),
      run("r2", "tent A", {}),
      run("r3", "tent A", {}),
    ]);
    expect(environmentCoverageCopy(oneEnv)).toMatch(/share one environment/);
    expect(environmentCoverageCopy(oneEnv)).toMatch(/tent A/);
  });
});

describe("buildEnvironmentComparison", () => {
  const gated: StabilityRun[] = [
    run("r1", "indoor", { nose_loudness: 8, structure: 4 }),
    run("r2", "indoor", { nose_loudness: 7 }),
    run("r3", "outdoor", { nose_loudness: 5, structure: 4 }),
  ];

  it("returns [] below the gate — no partial comparison ever renders", () => {
    expect(buildEnvironmentComparison(gated.slice(0, 2))).toEqual([]);
    expect(buildEnvironmentComparison([])).toEqual([]);
    expect(buildEnvironmentComparison(null)).toEqual([]);
  });

  it("groups observed values by environment for axes seen in 2+ environments", () => {
    const comparison = buildEnvironmentComparison(gated);
    const nose = comparison.find((a) => a.axisKey === "nose_loudness");
    expect(nose?.byEnvironment).toEqual([
      { environment: "indoor", values: [8, 7] },
      { environment: "outdoor", values: [5] },
    ]);
    const structure = comparison.find((a) => a.axisKey === "structure");
    expect(structure?.byEnvironment.map((e) => e.environment)).toEqual(["indoor", "outdoor"]);
    // vigor was never observed anywhere — absent, not zero-filled.
    expect(comparison.some((a) => a.axisKey === "vigor")).toBe(false);
  });

  it("is deterministic regardless of untagged runs mixed in", () => {
    const withUntagged = [run("r0", null, { nose_loudness: 10 }), ...gated];
    const a = buildEnvironmentComparison(withUntagged);
    const b = buildEnvironmentComparison(withUntagged);
    expect(a).toEqual(b);
    // The untagged run's value never enters any environment bucket.
    const nose = a.find((x) => x.axisKey === "nose_loudness");
    expect(nose?.byEnvironment.flatMap((e) => e.values)).not.toContain(10);
  });
});

describe("sanitizeStabilityRuns — environment round-trip", () => {
  it("keeps a stored environment tag (trimmed, capped) and omits the field when absent", () => {
    const [tagged, untagged] = sanitizeStabilityRuns([
      { runLabel: "r1", environment: `  indoor coco ${"x".repeat(120)}`, traits: {} },
      { runLabel: "r2", traits: {} },
    ]);
    expect(tagged.environment).toBeDefined();
    expect(tagged.environment!.length).toBeLessThanOrEqual(80);
    expect(tagged.environment!.startsWith("indoor coco")).toBe(true);
    expect("environment" in untagged).toBe(false); // hand-typed runs round-trip unchanged
  });
});
