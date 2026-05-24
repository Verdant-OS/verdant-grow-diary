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
  it("reads growId via shared useScopedGrow hook", () => {
    expect(PLANTS).toMatch(/useScopedGrow\(\)/);
    expect(PLANTS).toMatch(/const\s*\{[^}]*urlGrowId[^}]*\}\s*=\s*useScopedGrow\(\)/);
  });
  it("passes growId to the data hook (query-level filtering)", () => {
    expect(PLANTS).toMatch(/useGrowPlants\([^)]*urlGrowId[^)]*\)/);
  });
  it("renders banner and clear link via ScopedGrowBanner", () => {
    expect(PLANTS).toMatch(/ScopedGrowBanner/);
    expect(PLANTS).toMatch(/label=\s*["']plants["']/);
    expect(PLANTS).toMatch(/clearHref=\{plantsPath\(\)\}/);
  });
  it("no ai-coach / device-control / service_role", () => {
    expect(PLANTS).not.toMatch(/ai-coach|ai_coach/);
    expect(PLANTS).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
  });
});

describe("Tents — grow filter", () => {
  it("reads growId via shared useScopedGrow hook", () => {
    expect(TENTS).toMatch(/useScopedGrow\(\)/);
    expect(TENTS).toMatch(/const\s*\{[^}]*urlGrowId[^}]*\}\s*=\s*useScopedGrow\(\)/);
  });
  it("passes growId to the data hook (query-level filtering)", () => {
    expect(TENTS).toMatch(/useGrowTents\([^)]*urlGrowId[^)]*\)/);
  });
  it("renders banner and clear link via ScopedGrowBanner", () => {
    expect(TENTS).toMatch(/ScopedGrowBanner/);
    expect(TENTS).toMatch(/label=\s*["']tents["']/);
    expect(TENTS).toMatch(/clearHref=\{tentsPath\(\)\}/);
  });
  it("no ai-coach / device-control / service_role", () => {
    expect(TENTS).not.toMatch(/ai-coach|ai_coach/);
    expect(TENTS).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
  });
});

describe("GrowDetail — scoped hub links", () => {
  it("links to /plants and /tents with growId via helpers", () => {
    expect(GROW_DETAIL).toMatch(/plantsPath\(growId\)/);
    expect(GROW_DETAIL).toMatch(/tentsPath\(growId\)/);
  });
});

describe("Adapters expose growId", () => {
  it("mapTentRow and mapPlantRow include growId", () => {
    expect(ADAPTERS).toMatch(/mapTentRow[\s\S]*?growId:/);
    expect(ADAPTERS).toMatch(/mapPlantRow[\s\S]*?growId:/);
  });
});

import { readFileSync as _rfs } from "node:fs";
const REPO = _rfs(resolve(ROOT, "src/lib/growRepo.ts"), "utf8");

describe("growRepo — query-level grow filtering", () => {
  it("fetchTents adds .eq('grow_id', growId) when growId provided", () => {
    expect(REPO).toMatch(/fetchTents\(growId\?:\s*string\)/);
    expect(REPO).toMatch(/if\s*\(\s*growId\s*\)\s*q\s*=\s*q\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)/);
  });
  it("fetchPlants adds .eq('grow_id', growId) when growId provided", () => {
    expect(REPO).toMatch(/fetchPlants\(\s*tentId\?:\s*string,\s*growId\?:\s*string/);
    expect(REPO).toMatch(/if\s*\(\s*growId\s*\)\s*q\s*=\s*q\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)/);
  });
});
