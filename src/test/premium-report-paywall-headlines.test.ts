import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPaywallCtaViewModel } from "@/lib/paywallCtaViewModel";

/**
 * Premium report pages pass a noun phrase into buildPaywallCtaViewModel.
 * The view model appends " is part of <plan>", so an imperative "Unlock …"
 * phrase reads as a broken sentence.
 */
const REPORT_PAYWALLS = [
  {
    file: "src/pages/DiaryRangeReportPage.tsx",
    title: "A date-range diary report is part of Pro",
  },
  {
    file: "src/pages/EnvironmentSummaryReportPage.tsx",
    title: "An Environment Summary report is part of Pro",
  },
  {
    file: "src/pages/PostGrowLearningReport.tsx",
    title: "The Post-Grow Learning Report is part of Pro",
  },
] as const;

function featureTitleFrom(relativePath: string): string {
  const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
  const match = source.match(/featureTitle:\s*"([^"]+)"/);
  if (!match?.[1]) {
    throw new Error(`No featureTitle string in ${relativePath}`);
  }
  return match[1];
}

describe("premium report paywall headlines", () => {
  it.each(REPORT_PAYWALLS)("$file uses a grammatical noun-phrase title", ({ file, title }) => {
    const vm = buildPaywallCtaViewModel({
      featureTitle: featureTitleFrom(file),
      requiredPlanLabel: "Pro",
    });
    expect(vm.title).toBe(title);
    expect(vm.title.startsWith("Unlock")).toBe(false);
    expect(/^Unlock\b.*\bis part of\b/.test(vm.title)).toBe(false);
  });
});
