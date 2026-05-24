/**
 * Plants page grow-filter vs plant-search clarity tests.
 *
 * Source-text contract for the Plants page. Verifies:
 *   - A clear "Filter by grow" select control exists, labeled as a grow
 *     filter (not a plant picker).
 *   - A separate "Search plants by name, strain, or tent…" input exists.
 *   - The page renders the deterministic filter summary line.
 *   - The page uses buildGrowFilterOptions / filterPlantsBySearch /
 *     summarizePlantsPageFilters from the pure rules module.
 *   - Tent tab counts continue to render with parenthesized counts.
 *   - Static safety: no schema/merge-RPC/sensor-ingest/pi-ingest/
 *     edge-function/alert-persistence/Action-Queue/automation/device-control/
 *     service_role surface introduced. No hardcoded result-limit slicing.
 *
 * Read-only. No DB calls. No network.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PLANTS = read("src/pages/Plants.tsx");
const RULES = read("src/lib/plantsPageFilterRules.ts");

describe("Plants page — grow filter clarity", () => {
  it("renders the grow filter control with the 'Filter by grow' label", () => {
    expect(PLANTS).toMatch(/data-testid="plants-grow-filter"/);
    expect(PLANTS).toMatch(/data-testid="plants-grow-filter-select"/);
    expect(PLANTS).toMatch(/Filter by grow/);
    expect(PLANTS).toMatch(/aria-label="Filter plants by grow"/);
  });

  it("uses buildGrowFilterOptions so options include 'All grows' + counts", () => {
    expect(PLANTS).toMatch(/buildGrowFilterOptions/);
    expect(PLANTS).toMatch(/plants-grow-filter-option-/);
  });

  it("does not use the word 'dropdown' in user-facing copy", () => {
    // Strip block + line comments before scanning, then look for visible copy.
    const stripped = PLANTS
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(stripped).not.toMatch(/\bdropdown\b/i);
  });
});

describe("Plants page — plant search", () => {
  it("renders a separate search input with the required placeholder", () => {
    expect(PLANTS).toMatch(/data-testid="plants-search-input"/);
    expect(PLANTS).toMatch(/Search plants by name, strain, or tent/);
    expect(PLANTS).toMatch(/aria-label="Search plants by name, strain, or tent"/);
  });

  it("wires the search input through the pure rules module", () => {
    expect(PLANTS).toMatch(/filterPlantsBySearch\s*\(/);
  });

  it("has helper text near the plant search control", () => {
    expect(PLANTS).toMatch(/Search visible plants by name, strain, or tent/);
  });
});

describe("Plants page — filter summary + empty states", () => {
  it("renders the deterministic filter summary line", () => {
    expect(PLANTS).toMatch(/data-testid="plants-filter-summary"/);
    expect(PLANTS).toMatch(/summarizePlantsPageFilters/);
    expect(PLANTS).toMatch(/formatPlantsPageFilterSummary/);
  });

  it("uses plantsPageEmptyStateCopy for empty list states", () => {
    expect(PLANTS).toMatch(/plantsPageEmptyStateCopy/);
  });

  it("renders the archived-hidden hint when relevant", () => {
    expect(PLANTS).toMatch(/data-testid="plants-archived-hidden-note"/);
    expect(PLANTS).toMatch(/archived\/merged hidden/);
  });
});

describe("Plants page — tent tabs still render counts", () => {
  it("renders per-tent filter buttons with (count) text", () => {
    expect(PLANTS).toMatch(/plants-tent-filter-/);
    expect(PLANTS).toMatch(/\{t\.name\}\s*\(\{t\.count\}\)/);
  });
});

describe("Plants page — safety guardrails", () => {
  it("no service_role / automation / device-control surface", () => {
    expect(PLANTS).not.toMatch(/service_role/);
    expect(PLANTS).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook|automation/i,
    );
  });

  it("no edge-function / ai-coach / pi-ingest call surface", () => {
    expect(PLANTS).not.toMatch(/functions\/(ai-coach|pi-ingest)/);
    expect(PLANTS).not.toMatch(/["'`]ai-coach["'`]|ai_coach/);
  });

  it("no hardcoded result-limit slicing of the plant list", () => {
    // Guard against accidental .slice(0, N) / .limit(N) that would hide
    // valid plants from the user (the bug class this whole task targets).
    expect(PLANTS).not.toMatch(/filtered\.slice\s*\(/);
    expect(PLANTS).not.toMatch(/\.limit\s*\(\s*\d+\s*\)/);
  });

  it("rules module is pure and read-only", () => {
    expect(RULES).not.toMatch(/supabase/i);
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(RULES).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
  });
});
