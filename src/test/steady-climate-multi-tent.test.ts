import { describe, expect, it } from "vitest";
import { STEADY_CLIMATE_GUIDE } from "@/lib/publicGrowGuideArticles";

const NEW_HEADINGS = [
  "Track each tent in one diary",
  "Plant-to-tent history (Pro; Free includes 1 tent)",
  "Veg-to-flower moves (Pro)",
  "Compare VPD for each tent",
  "Bring in readings",
] as const;

describe("steady climate multi-tent sections", () => {
  it("places the new sections immediately after fix-one-thing, in order", () => {
    const headings = STEADY_CLIMATE_GUIDE.sections.map((section) => section.heading);
    const fixIndex = headings.indexOf("Fix the tent that drifts, one change at a time");
    expect(fixIndex).toBeGreaterThanOrEqual(0);
    expect(headings.slice(fixIndex + 1, fixIndex + 1 + NEW_HEADINGS.length)).toEqual([
      ...NEW_HEADINGS,
    ]);
  });

  it("includes the two multi-tent FAQ questions", () => {
    const questions = STEADY_CLIMATE_GUIDE.faq.map((entry) => entry.question);
    expect(questions).toContain("How do I keep a grow diary for more than one tent?");
    expect(questions).toContain("How can I compare VPD between two grow tents?");
  });

  it("links Compare VPD for each tent to the VPD calculator", () => {
    const section = STEADY_CLIMATE_GUIDE.sections.find(
      (entry) => entry.heading === "Compare VPD for each tent",
    );
    expect(section?.links).toEqual([{ label: "VPD calculator", to: "/tools/vpd-calculator" }]);
  });

  it("does not claim a built-in tent-vs-tent VPD view or mention price", () => {
    const text = STEADY_CLIMATE_GUIDE.sections
      .flatMap((section) => [section.heading, ...section.paragraphs])
      .join("\n")
      .toLowerCase();
    expect(text).not.toMatch(/tent-vs-tent/);
    expect(text).not.toMatch(/\bprice\b/);
    expect(text).not.toMatch(/built-in/);
  });
});
