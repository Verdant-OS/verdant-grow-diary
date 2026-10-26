import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CRONK_FEED_LOG_DISCLAIMER,
  CRONK_FEED_LOG_FAQ,
  CRONK_FEED_LOG_H1,
  cronkPublicCopyHasDoseNumbers,
} from "@/lib/cronkFeedLogRules";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const SKILL = read(".agents/skills/nutrient-schedule-assistant/SKILL.md");
const LOVABLE_PROMPT = read("docs/lovable/verdant-skill-creation-prompt.md");
const CONTENT_PLAN = read("docs/seo/verdant-30-day-grower-keyword-content-plan.md");
const CONTRACT = `${SKILL}\n${LOVABLE_PROMPT}\n${CONTENT_PLAN}`;
const PUBLIC_PAGE = read("src/pages/CronkFeedLog.tsx");

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
    const copy = `${PUBLIC_PAGE}\n${CRONK_FEED_LOG_H1}\n${CRONK_FEED_LOG_DISCLAIMER}`;
    expect(copy).toContain("Cronk Nutrients");
    expect(copy).not.toMatch(/\bKronk\b/);
    expect(copy).toMatch(/first brand Verdant covers in depth/);
    expect(copy).toMatch(/not affiliated with, sponsored by, or endorsed by Cronk Nutrients/);
  });

  it("keeps the public guide focused on chart adherence and measured plant response", () => {
    const copy = `${PUBLIC_PAGE}\n${JSON.stringify(CRONK_FEED_LOG_FAQ)}`;
    for (const required of [
      "plant stage",
      "input EC or PPM",
      "how your plants responded",
      "Use Cronk's official chart",
    ]) {
      expect(copy).toContain(required);
    }
    expect(copy).toMatch(/leave it blank rather than guessing/);
  });

  it("does not publish a dosing schedule or turn one weak signal into an aggressive change", () => {
    const copy = `${PUBLIC_PAGE}\n${JSON.stringify(CRONK_FEED_LOG_FAQ)}\n${CRONK_FEED_LOG_DISCLAIMER}`;
    expect(cronkPublicCopyHasDoseNumbers(copy)).toBe(false);
    expect(copy).not.toMatch(/week\s*\d+\s*:/i);
    expect(copy).toMatch(/not proof of a problem/);
    expect(copy).toMatch(/before you change anything/);
  });
});
