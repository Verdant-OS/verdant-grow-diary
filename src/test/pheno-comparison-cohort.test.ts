/**
 * pheno-comparison-cohort — pure helpers for the grower-selected 2–6 comparison
 * cohort: parse/serialize the `candidates` deep-link param, hunt-isolation,
 * bounded toggling, and href construction.
 */
import { describe, it, expect } from "vitest";
import {
  PHENO_COHORT_MIN,
  PHENO_COHORT_MAX,
  parseCohortParamValue,
  readCohortFromSearch,
  serializeCohortParam,
  buildPhenoCompareHref,
  isValidCohortSize,
  restrictCohortToHunt,
  toggleCohortMember,
} from "@/lib/phenoComparisonCohort";

describe("parse / serialize cohort param", () => {
  it("parses ordered, de-duplicated, trimmed ids", () => {
    expect(parseCohortParamValue("a,b,a,,  c ")).toEqual(["a", "b", "c"]);
  });

  it("decodes URI-encoded ids", () => {
    expect(parseCohortParamValue("id%20one,id%2Btwo")).toEqual(["id one", "id+two"]);
  });

  it("returns [] for empty/nullish input", () => {
    expect(parseCohortParamValue(null)).toEqual([]);
    expect(parseCohortParamValue(undefined)).toEqual([]);
    expect(parseCohortParamValue("")).toEqual([]);
  });

  it("reads the cohort from a query string", () => {
    expect(readCohortFromSearch("?candidates=p1,p2")).toEqual(["p1", "p2"]);
    expect(readCohortFromSearch(new URLSearchParams("candidates=p3,p4"))).toEqual(["p3", "p4"]);
    expect(readCohortFromSearch("?other=1")).toEqual([]);
  });

  it("serializes ids into a URI-encoded candidates param, round-tripping", () => {
    const q = serializeCohortParam(["p1", "id two"]);
    expect(q).toBe("candidates=p1,id%20two");
    expect(readCohortFromSearch(`?${q}`)).toEqual(["p1", "id two"]);
  });

  it("serializes empty selection to an empty string", () => {
    expect(serializeCohortParam([])).toBe("");
  });
});

describe("buildPhenoCompareHref", () => {
  it("links to the plain compare route with no cohort", () => {
    expect(buildPhenoCompareHref("h1", [])).toBe("/pheno-hunts/h1/compare");
  });
  it("appends the candidates param with a cohort", () => {
    expect(buildPhenoCompareHref("h1", ["p1", "p2"])).toBe(
      "/pheno-hunts/h1/compare?candidates=p1,p2",
    );
  });
});

describe("cohort size validation", () => {
  it("accepts only 2..6", () => {
    expect(isValidCohortSize(1)).toBe(false);
    expect(isValidCohortSize(PHENO_COHORT_MIN)).toBe(true);
    expect(isValidCohortSize(4)).toBe(true);
    expect(isValidCohortSize(PHENO_COHORT_MAX)).toBe(true);
    expect(isValidCohortSize(7)).toBe(false);
  });
});

describe("restrictCohortToHunt — hunt isolation", () => {
  it("keeps only ids belonging to the hunt, in hunt order", () => {
    const hunt = ["a", "b", "c", "d"];
    // requested includes a foreign id 'x' and out-of-order — result is hunt-ordered, x dropped
    expect(restrictCohortToHunt(["c", "x", "a"], hunt)).toEqual(["a", "c"]);
  });
  it("drops a whole foreign cohort", () => {
    expect(restrictCohortToHunt(["x", "y"], ["a", "b"])).toEqual([]);
  });
});

describe("toggleCohortMember — bounded selection", () => {
  it("adds an id when under the max", () => {
    expect(toggleCohortMember(["a"], "b")).toEqual({ ids: ["a", "b"], atMax: false });
  });
  it("removes an already-selected id", () => {
    expect(toggleCohortMember(["a", "b"], "a")).toEqual({ ids: ["b"], atMax: false });
  });
  it("refuses to add past the max and flags atMax", () => {
    const full = ["1", "2", "3", "4", "5", "6"];
    const res = toggleCohortMember(full, "7");
    expect(res.ids).toEqual(full);
    expect(res.atMax).toBe(true);
  });
  it("still allows removing when at the max", () => {
    const full = ["1", "2", "3", "4", "5", "6"];
    expect(toggleCohortMember(full, "3").ids).toEqual(["1", "2", "4", "5", "6"]);
  });
  it("preserves selection order across toggles", () => {
    let r = toggleCohortMember([], "c");
    r = toggleCohortMember(r.ids, "a");
    r = toggleCohortMember(r.ids, "b");
    expect(r.ids).toEqual(["c", "a", "b"]);
  });
});
