/**
 * Grower bug report 2026-11-03, item 19: warn on near-duplicate plant and
 * tent names without nagging about deliberate series.
 */
import { describe, expect, it } from "vitest";
import {
  findSimilarNames,
  nameEditDistance,
  normalizeNameForComparison,
  similarNameWarning,
} from "@/lib/similarNameWarningRules";

const find = (candidate: string, names: string[], excludeId?: string) =>
  findSimilarNames({
    candidate,
    existing: names.map((name, i) => ({ id: `id-${i}`, name })),
    excludeId,
  });

describe("findSimilarNames", () => {
  it("flags the grower's real near-duplicate plant", () => {
    expect(find("Ducle De Pledge", ["Dolce di Pledge #1"])).toEqual([
      { id: "id-0", name: "Dolce di Pledge #1", kind: "similar", distance: 3 },
    ]);
  });

  it("flags an exact repeat regardless of case, accents and punctuation", () => {
    expect(find("vegetation  bravo", ["Vegetation Bravo"])[0]?.kind).toBe("same");
    expect(find("Crème Brûlée!", ["creme brulee"])[0]?.kind).toBe("same");
    expect(find("Pheno #2", ["Pheno 2"])[0]?.kind).toBe("same");
  });

  it("does not warn about a deliberate series", () => {
    expect(find("Tent B", ["Tent A"])).toEqual([]);
    expect(find("Pheno #2", ["Pheno #1", "Pheno #3"])).toEqual([]);
    expect(find("Dolce di Pledge #2", ["Dolce di Pledge #1"])).toEqual([]);
  });

  it("does not warn about clearly different names or very short ones", () => {
    expect(find("Skunk Gas", ["Blue Dream", "Wedding Cake"])).toEqual([]);
    expect(find("Abc", ["Abd"])).toEqual([]);
  });

  it("skips the record being renamed", () => {
    expect(find("Vegetation Bravo", ["Vegetation Bravo"], "id-0")).toEqual([]);
  });

  it("orders exact before similar, then by distance, deterministically", () => {
    const names = ["Vegetaton Bravo", "Vegetation Bravo"];
    const a = findSimilarNames({
      candidate: "Vegetation Bravo",
      existing: names.map((name, i) => ({ id: `id-${i}`, name })),
      limit: 5,
    });
    expect(a.map((m) => m.kind)).toEqual(["same", "similar"]);
    expect(
      findSimilarNames({
        candidate: "Vegetation Bravo",
        existing: names.map((name, i) => ({ id: `id-${i}`, name })),
        limit: 5,
      }),
    ).toEqual(a);
  });

  it("is null-safe", () => {
    expect(findSimilarNames({ candidate: "", existing: [{ id: "a", name: "X" }] })).toEqual([]);
    expect(findSimilarNames({ candidate: "Tent", existing: null })).toEqual([]);
    expect(findSimilarNames({ candidate: "Tent", existing: [{ id: "a", name: null }] })).toEqual(
      [],
    );
  });
});

describe("helpers", () => {
  it("normalizes and measures transpositions as one edit", () => {
    expect(normalizeNameForComparison("  Dolce  di Pledge #1 ")).toBe("dolce di pledge 1");
    expect(nameEditDistance("dolce", "ducle")).toBe(2);
  });

  it("words the warning for plants and tents", () => {
    expect(similarNameWarning("plant", find("Ducle De Pledge", ["Dolce di Pledge #1"]))).toBe(
      "This looks close to “Dolce di Pledge #1” in this grow. Check for a typo before saving.",
    );
    expect(similarNameWarning("tent", find("Vegetation Bravo", ["Vegetation Bravo"]))).toBe(
      "A tent named “Vegetation Bravo” already exists. Give this one a name you can tell apart.",
    );
    expect(similarNameWarning("tent", [])).toBeNull();
  });
});
