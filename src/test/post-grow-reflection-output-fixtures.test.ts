import { describe, expect, it } from "vitest";

import {
  createMalformedPostGrowReflectionOutput,
  createMissingEvidencePostGrowReflectionOutput,
  createOverconfidentPostGrowReflectionOutput,
  createUnsafeAutomationPostGrowReflectionOutput,
  createValidPostGrowReflectionOutput,
} from "@/lib/ai/postGrowReflectionOutputFixtures";

describe("post-grow reflection output fixtures", () => {
  it("valid fixture includes every ReflectionOutput section", () => {
    const output = createValidPostGrowReflectionOutput();

    expect(output.executive_reflection).toContain("1.21 kPa");
    expect(output.key_wins.length).toBeGreaterThan(0);
    expect(output.repeat_next_run.length).toBeGreaterThan(0);
    expect(output.adjust_or_avoid.length).toBeGreaterThan(0);
    expect(output.post_harvest_specific_insights.length).toBeGreaterThan(0);
    expect(output.pheno_strain_notes.length).toBeGreaterThan(0);
    expect(output.low_risk_experiments.length).toBeGreaterThan(0);
    expect(output.confidence).toBe("High");
    expect(output.gaps.length).toBeGreaterThan(0);
  });

  it("malformed fixture intentionally breaks shape and confidence", () => {
    const output = createMalformedPostGrowReflectionOutput() as Record<string, unknown>;

    expect(typeof output.key_wins).toBe("string");
    expect(output.confidence).toBe("Very High");
    expect(output.gaps).toBeUndefined();
  });

  it("overconfident fixture contains unsafe certainty language", () => {
    const output = createOverconfidentPostGrowReflectionOutput();

    expect(output.executive_reflection).toContain("definitely caused");
    expect(output.executive_reflection).toContain("guarantee");
    expect(output.gaps).toContain("Missing side-by-side control data.");
  });

  it("missing-evidence fixture is intentionally generic", () => {
    const output = createMissingEvidencePostGrowReflectionOutput();
    const joined = Object.values(output).flat().join(" ");

    expect(joined).not.toMatch(/20\d{2}-\d{2}-\d{2}|evt-|\d+\s?(?:%|kPa|g|grams?)/i);
  });

  it("unsafe automation fixture includes blocked equipment-control wording", () => {
    const output = createUnsafeAutomationPostGrowReflectionOutput();

    expect(output.repeat_next_run.join(" ")).toMatch(/Automatically control|turn on the dehumidifier/i);
  });
});
