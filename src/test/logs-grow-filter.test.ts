/**
 * Static tests for /logs?growId=... grow-scoped filtering.
 * /logs and /timeline both route to Timeline.tsx; behavior is shared.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const TIMELINE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const GROW_DETAIL = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");

describe("Logs — grow filter (/logs?growId=…)", () => {
  it("/logs route renders Timeline", () => {
    expect(APP).toMatch(/path=\s*["']\/logs["']\s*element=\{<Timeline/);
  });

  it("reads growId from URL search params", () => {
    expect(TIMELINE).toMatch(/searchParams\.get\(\s*["']growId["']\s*\)/);
  });

  it("scopes diary_entries query by grow_id at the query layer", () => {
    expect(TIMELINE).toMatch(
      /\.from\(\s*["']diary_entries["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*activeGrowId\s*\)/,
    );
  });

  it("route-aware banner uses ScopedGrowBanner with scopeLabel + clearTo", () => {
    expect(TIMELINE).toMatch(/ScopedGrowBanner/);
    expect(TIMELINE).toMatch(/label=\{scopeLabel\}/);
    expect(TIMELINE).toMatch(/scopeLabel\s*=\s*isLogsRoute\s*\?\s*["']logs["']/);
    expect(TIMELINE).toMatch(/clearHref=\{clearTo\}/);
    expect(TIMELINE).toMatch(/clearTo\s*=\s*isLogsRoute\s*\?\s*["']\/logs["']/);
  });

  it("GrowDetail links to /logs?growId=<growId>", () => {
    expect(GROW_DETAIL).toMatch(/\/logs\?growId=\$\{growId\}/);
  });

  it("does not introduce ai-coach, device-control, or service_role surface", () => {
    expect(TIMELINE).not.toMatch(/ai-coach|ai_coach/);
    expect(TIMELINE).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
  });
});
