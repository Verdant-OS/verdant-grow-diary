import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PHENO_COMPARISON_MIN_CANDIDATES,
  buildCandidateSelectionPreflight,
  clearSelection,
  selectAllIds,
  shouldAutoSelectAllOnLoad,
  toggleIdInSet,
} from "@/lib/phenoHuntCandidateSelectionRules";

const ROOT = resolve(__dirname, "../..");

describe("phenoHuntCandidateSelectionRules", () => {
  it("select all / clear / toggle", () => {
    expect([...selectAllIds(["a", "b", ""])].sort()).toEqual(["a", "b"]);
    expect(clearSelection().size).toBe(0);
    const t = toggleIdInSet(new Set(["a"]), "b");
    expect(t.has("a") && t.has("b")).toBe(true);
    expect(toggleIdInSet(t, "a").has("a")).toBe(false);
  });

  it("auto-select only when comparison min is available", () => {
    expect(shouldAutoSelectAllOnLoad(1)).toBe(false);
    expect(shouldAutoSelectAllOnLoad(PHENO_COMPARISON_MIN_CANDIDATES)).toBe(true);
  });

  it("preflight: none selected with 2+ available", () => {
    const p = buildCandidateSelectionPreflight({
      availablePlantIds: ["p1", "p2"],
      selectedIds: [],
    });
    expect(p.canSelectAll).toBe(true);
    expect(p.comparisonMinMet).toBe(false);
    expect(p.preflightMessage).toMatch(/at least 2/i);
    expect(p.comparisonHint).toMatch(/2\+/);
  });

  it("preflight: one selected is tracking-only", () => {
    const p = buildCandidateSelectionPreflight({
      availablePlantIds: ["p1", "p2", "p3"],
      selectedIds: ["p1"],
    });
    expect(p.trackingMinMet).toBe(true);
    expect(p.comparisonMinMet).toBe(false);
    expect(p.preflightMessage).toMatch(/tracking only/i);
  });

  it("preflight: two selected is comparison-eligible", () => {
    const p = buildCandidateSelectionPreflight({
      availablePlantIds: ["p1", "p2"],
      selectedIds: ["p1", "p2"],
    });
    expect(p.allSelected).toBe(true);
    expect(p.canSelectAll).toBe(false);
    expect(p.comparisonMinMet).toBe(true);
    expect(p.preflightMessage).toMatch(/comparison-eligible/i);
    expect(p.comparisonHint).toBeNull();
  });
});

describe("PhenoHuntNew select-all wiring", () => {
  const PAGE = readFileSync(resolve(ROOT, "src/pages/PhenoHuntNew.tsx"), "utf8");

  it("exposes select-all, clear, and preflight test ids", () => {
    expect(PAGE).toMatch(/ph-select-all/);
    expect(PAGE).toMatch(/ph-clear-selection/);
    expect(PAGE).toMatch(/ph-selection-preflight/);
    expect(PAGE).toMatch(/buildCandidateSelectionPreflight/);
  });
});
