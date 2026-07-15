import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const SKILL = read(".agents/skills/nutrient-schedule-assistant/SKILL.md");
const LOVABLE_PROMPT = read("docs/lovable/verdant-skill-creation-prompt.md");
const CONTENT_PLAN = read("docs/seo/verdant-30-day-grower-keyword-content-plan.md");
const CONTRACT = `${SKILL}\n${LOVABLE_PROMPT}\n${CONTENT_PLAN}`;

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
});
