/**
 * Static tests for Timeline grow-scoped URL filtering.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const TIMELINE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const GROW_DETAIL = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");

describe("Timeline — grow filter", () => {
  it("resolves URL growId via the shared useScopedGrow hook", () => {
    expect(TIMELINE).toMatch(/useScopedGrow/);
    expect(TIMELINE).toMatch(/from\s+["']@\/hooks\/useScopedGrow["']/);
  });

  it("reads growId from URL via useScopedGrow", () => {
    expect(TIMELINE).toMatch(/const\s*\{[^}]*urlGrowId[^}]*\}\s*=\s*useScopedGrow\(\)/);
  });

  it("falls back to store grow id when URL param absent", () => {
    expect(TIMELINE).toMatch(/urlGrowId\s*\?\?\s*storeGrowId/);
  });

  it("filters diary_entries and action_queue_events by activeGrowId (effective)", () => {
    expect(TIMELINE).toMatch(
      /\.from\(\s*["']diary_entries["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*activeGrowId\s*\)/,
    );
    expect(TIMELINE).toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*activeGrowId\s*\)/,
    );
  });

  it("renders banner and clear-filter link when growId is present via ScopedGrowBanner", () => {
    expect(TIMELINE).toMatch(/urlGrowId\s*&&/);
    expect(TIMELINE).toMatch(/ScopedGrowBanner/);
    expect(TIMELINE).toMatch(/label=\{scopeLabel\}/);
    expect(TIMELINE).toMatch(/clearHref=\{clearTo\}/);
  });

  it("preserves newest-first ordering", () => {
    expect(TIMELINE).toMatch(/entry_at["']\s*,\s*\{\s*ascending:\s*false/);
    expect(TIMELINE).toMatch(/created_at["']\s*,\s*\{\s*ascending:\s*false/);
  });

  it("introduces no device-control or service_role surface", () => {
    expect(TIMELINE).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
  });

  it("does not call ai-coach", () => {
    expect(TIMELINE).not.toMatch(/ai-coach|ai_coach/);
  });
});

describe("Timeline route", () => {
  it("registers /timeline route", () => {
    expect(APP).toMatch(/path=\s*["']\/timeline["']\s*element=\{<Timeline/);
  });
});

describe("GrowDetail — links to /logs?growId=", () => {
  it("hub card link uses logsPath(growId)", () => {
    expect(GROW_DETAIL).toMatch(/to=\{logsPath\(growId\)\}/);
  });
});
