import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findGuideBySlug } from "@/constants/verdantSeoContent";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const SKILL = read(".agents/skills/nutrient-schedule-assistant/SKILL.md");
const LOVABLE_PROMPT = read("docs/lovable/verdant-skill-creation-prompt.md");
const CONTENT_PLAN = read("docs/seo/verdant-30-day-grower-keyword-content-plan.md");
const CONTRACT = `${SKILL}\n${LOVABLE_PROMPT}\n${CONTENT_PLAN}`;
const PUBLIC_GUIDE = findGuideBySlug("cronk-nutrients-grow-diary");

describe("Cronk Nutrients priority contract", () => {
  it("uses the operator-confirmed Cronk spelling everywhere in the nutrient strategy", () => {
    expect(CONTRACT).toContain("Cronk Nutrients");
    expect(CONTRACT).not.toMatch(/\bKronk\b/);
  });

  it("keeps Cronk first in the brand-evaluation queue", () => {
    expect(SKILL).toMatch(/Cronk Nutrients is the first brand-specific case-study priority/);
    expect(LOVABLE_PROMPT).toMatch(
      /Make Cronk Nutrients the first brand-chart publishing priority/,
    );
    expect(CONTENT_PLAN).toMatch(/\| 1\s+\| Using Cronk Nutrients with a grow diary/);
  });

  it("keeps the strategy chart-adherence based and avoids universal endorsement", () => {
    expect(SKILL).toMatch(/Chart-adherence only/);
    expect(SKILL).toMatch(/Never reproduce or reconstruct a proprietary chart from memory/);
    expect(CONTRACT).toMatch(/does \*\*not\*\* make Cronk a universal\s+recommendation/);
  });

  it("publishes Cronk as the first brand-specific grow-diary case study", () => {
    expect(PUBLIC_GUIDE).not.toBeNull();
    const copy = JSON.stringify(PUBLIC_GUIDE);
    expect(copy).toContain("Cronk Nutrients");
    expect(copy).not.toMatch(/\bKronk\b/);
    expect(copy).toMatch(/first brand-specific case study/);
    expect(copy).toMatch(/not a universal recommendation/);
  });

  it("keeps the public guide focused on chart adherence and measured plant response", () => {
    const copy = JSON.stringify(PUBLIC_GUIDE);
    for (const required of [
      "current official chart",
      "product line",
      "medium",
      "plant stage",
      "input pH",
      "input EC or PPM",
      "runoff or drain pH and EC",
      "plant responded",
    ]) {
      expect(copy).toContain(required);
    }
    expect(copy).toMatch(/does not copy, reconstruct, or replace the manufacturer's chart/);
  });

  it("does not publish a dosing schedule or turn one weak signal into an aggressive change", () => {
    const copy = JSON.stringify(PUBLIC_GUIDE);
    expect(copy).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:ml|mL|tsp|tbsp|g)\b/);
    expect(copy).not.toMatch(/week\s*\d+\s*:/i);
    expect(copy).toMatch(/does not prove nutrient burn/);
    expect(copy).toMatch(/Not from one weak signal/);
    expect(copy).toMatch(/grower—not software—in control/);
  });
});
