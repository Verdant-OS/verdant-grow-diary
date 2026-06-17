import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PANEL_PATH = join(process.cwd(), "src/components/GgsSentinelSmokeRunnerPanel.tsx");

function panelSource(): string {
  return readFileSync(PANEL_PATH, "utf8");
}

describe("GGS Sentinel freshness panel UI", () => {
  it("visually distinguishes missing rows from stale rows", () => {
    const text = panelSource();

    expect(text).toContain("row expired");
    expect(text).toContain("no row found");
    expect(text).toContain("border-l-destructive");
    expect(text).toContain("border-l-muted-foreground");
    expect(text).toContain("border-dashed");
  });

  it("keeps freshness guidance explanatory instead of changing result priority", () => {
    const text = panelSource();

    expect(text).toContain("Freshness guidance explains metric timing only");
    expect(text).toContain("result-state priority still comes from the smoke-check result above");
  });

  it("uses a dedicated presenter so the compact rows can be tested without RPC or tent mocks", () => {
    const text = panelSource();

    expect(text).toContain("export function GgsSentinelFreshnessGuidanceList");
    expect(text).toContain("<GgsSentinelFreshnessGuidanceList metricFreshness={evaluation.metricFreshness} />");
  });

  it("uses a compact one-line metric row that preserves age, status, and next action", () => {
    const text = panelSource();

    expect(text).toContain("ggs-freshness-compact-list");
    expect(text).toContain("grid-cols-[minmax(6.5rem,1.15fr)_auto_auto_minmax(7.5rem,1fr)]");
    expect(text).toContain("{f.ageLabel}");
    expect(text).toContain("<FreshnessBadge freshness={f} />");
    expect(text).toContain("title={f.nextActionLabel}");
  });

  it("adds hover and tap tooltip copy for the 15-minute freshness thresholds", () => {
    const text = panelSource();

    expect(text).toContain("TooltipProvider");
    expect(text).toContain("TooltipTrigger asChild");
    expect(text).toContain("fresh through 75% of the window");
    expect(text).toContain("aging after 75%");
    expect(text).toContain("stale after");
    expect(text).toContain("Missing means no row was found");
  });
});
