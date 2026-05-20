/**
 * Static tests for grow-scoped filtering on Plants and Tents pages.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PLANTS = readFileSync(resolve(ROOT, "src/pages/Plants.tsx"), "utf8");
const TENTS = readFileSync(resolve(ROOT, "src/pages/Tents.tsx"), "utf8");
const GROW_DETAIL = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8");
const ADAPTERS = readFileSync(resolve(ROOT, "src/lib/growAdapters.ts"), "utf8");

describe("Plants — grow filter", () => {
  it("reads growId from URL", () => {
    expect(PLANTS).toMatch(/useSearchParams/);
    expect(PLANTS).toMatch(/searchParams\.get\(\s*["']growId["']\s*\)/);
  });
  it("passes growId to the data hook (query-level filtering)", () => {
    expect(PLANTS).toMatch(/useGrowPlants\([^)]*growId[^)]*\)/);
  });
  it("renders banner and clear link", () => {
    expect(PLANTS).toMatch(/Showing plants for this grow/);
    expect(PLANTS).toMatch(/to=\s*["']\/plants["']/);
    expect(PLANTS).toMatch(/Clear grow filter/);
  });
  it("no ai-coach / device-control / service_role", () => {
    expect(PLANTS).not.toMatch(/ai-coach|ai_coach/);
    expect(PLANTS).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
  });
});

describe("Tents — grow filter", () => {
  it("reads growId from URL", () => {
    expect(TENTS).toMatch(/useSearchParams/);
    expect(TENTS).toMatch(/searchParams\.get\(\s*["']growId["']\s*\)/);
  });
  it("passes growId to the data hook (query-level filtering)", () => {
    expect(TENTS).toMatch(/useGrowTents\([^)]*growId[^)]*\)/);
  });
  it("renders banner and clear link", () => {
    expect(TENTS).toMatch(/Showing tents for this grow/);
    expect(TENTS).toMatch(/to=\s*["']\/tents["']/);
    expect(TENTS).toMatch(/Clear grow filter/);
  });
  it("no ai-coach / device-control / service_role", () => {
    expect(TENTS).not.toMatch(/ai-coach|ai_coach/);
    expect(TENTS).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
  });
});

describe("GrowDetail — scoped hub links", () => {
  it("links to /plants and /tents with growId", () => {
    expect(GROW_DETAIL).toMatch(/\/plants\?growId=\$\{growId\}/);
    expect(GROW_DETAIL).toMatch(/\/tents\?growId=\$\{growId\}/);
  });
});

describe("Adapters expose growId", () => {
  it("mapTentRow and mapPlantRow include growId", () => {
    expect(ADAPTERS).toMatch(/mapTentRow[\s\S]*?growId:/);
    expect(ADAPTERS).toMatch(/mapPlantRow[\s\S]*?growId:/);
  });
});
