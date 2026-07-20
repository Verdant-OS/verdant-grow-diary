import { describe, it, expect } from "vitest";
import { buildPhenoPedigree } from "@/lib/phenoPedigreeViewModel";
import { DEMO_KEEPERS, DEMO_CROSSES, DEMO_PHENO_HUNT } from "@/lib/demo/phenoHuntDemoFixture";

const pedigree = buildPhenoPedigree(DEMO_KEEPERS, DEMO_CROSSES);
const cross = (id: string) => pedigree.crosses.find((c) => c.id === id)!;
const keeper = (id: string) => pedigree.keepers.find((k) => k.id === id)!;
const K_GAS = DEMO_PHENO_HUNT.keeperIds.gasRuntz;
const K_CAKE = DEMO_PHENO_HUNT.keeperIds.sherbCake;

describe("buildPhenoPedigree — keeper nodes", () => {
  it("keeps both mothers with reversal + clone + stability data", () => {
    expect(pedigree.keepers).toHaveLength(2);
    const gas = keeper(K_GAS);
    expect(gas.name).toBe("Gas Runtz");
    expect(gas.reversed).toBe(true);
    expect(gas.reversalMethods).toContain("colloidal_silver");
    expect(gas.cloneCount).toBe(4);
    expect(gas.stabilityRunCount).toBe(2);
    expect(gas.flags).toHaveLength(0); // has a source candidate
  });
  it("orders keepers deterministically by name", () => {
    expect(pedigree.keepers.map((k) => k.name)).toEqual(["Gas Runtz", "Sherb Cake"]);
  });
});

describe("buildPhenoPedigree — cross display reuses the canonical helpers", () => {
  it("badges: F1 and S1 render from the shared cross helper", () => {
    expect(cross("cross-f1").badge).toBe("F1");
    expect(cross("cross-s1").badge).toBe("S1 / Selfed");
  });
  it("donor labels: Self, Open pollination, known name, unknown keeper", () => {
    expect(cross("cross-s1").donorLabel).toBe("Self");
    expect(cross("cross-op").donorLabel).toBe("Open pollination");
    expect(cross("cross-f1").donorLabel).toBe("Sherb Cake");
    expect(cross("cross-unknown").donorLabel).toBe("unknown keeper");
  });
});

describe("buildPhenoPedigree — edges only for verified parents", () => {
  it("draws female + male edges for the fully-backed F1", () => {
    expect(pedigree.edges).toContainEqual({ from: K_GAS, to: "cross-f1", kind: "female" });
    expect(pedigree.edges).toContainEqual({ from: K_CAKE, to: "cross-f1", kind: "male" });
  });
  it("draws a backcross edge to the recurrent parent", () => {
    expect(pedigree.edges).toContainEqual({ from: "cross-bx1", to: K_GAS, kind: "backcross" });
  });
  it("does NOT draw a male edge for a parent that isn't a keeper in this hunt", () => {
    // cross-outcross's male is from another hunt — female edge yes, male edge no.
    expect(pedigree.edges).toContainEqual({ from: K_GAS, to: "cross-outcross", kind: "female" });
    expect(pedigree.edges.some((e) => e.to === "cross-outcross" && e.kind === "male")).toBe(false);
  });
});

describe("buildPhenoPedigree — provenance honesty (refuse to draw what it can't back up)", () => {
  it("flags an unknown pollen parent on a non-self, non-OP cross", () => {
    expect(cross("cross-unknown").flags.map((f) => f.code)).toContain("unknown_pollen_parent");
  });
  it("does NOT flag a null pollen parent when it's honest (self / open pollination)", () => {
    expect(cross("cross-s1").flags).toHaveLength(0);
    expect(cross("cross-op").flags).toHaveLength(0);
  });
  it("flags a parent that isn't a keeper in this hunt", () => {
    expect(cross("cross-outcross").flags.map((f) => f.code)).toContain("parent_not_in_hunt");
  });
  it("flags an unrecorded generation on a backcross", () => {
    expect(cross("cross-bx-nogen").flags.map((f) => f.code)).toContain("generation_unrecorded");
    // ...but the recorded-generation BX1 is clean.
    expect(cross("cross-bx1").flags).toHaveLength(0);
  });
  it("surfaces an aggregate flag list (nothing hidden)", () => {
    expect(pedigree.flags.length).toBeGreaterThanOrEqual(3);
  });
});

describe("buildPhenoPedigree — edge cases", () => {
  it("empty input yields an empty, well-formed pedigree", () => {
    const p = buildPhenoPedigree([], []);
    expect(p).toEqual({ keepers: [], crosses: [], edges: [], flags: [] });
    expect(buildPhenoPedigree(null, undefined).keepers).toHaveLength(0);
  });
  it("flags a keeper with no recorded source candidate as origin_unrecorded", () => {
    const p = buildPhenoPedigree([{ id: "k1", name: "Orphan cut" }], []);
    expect(p.keepers[0].flags.map((f) => f.code)).toContain("origin_unrecorded");
  });
  it("drops rows with no id / no cross_type", () => {
    const p = buildPhenoPedigree(
      [{ id: "" } as never],
      [{ id: "x", crossType: "" } as never],
    );
    expect(p.keepers).toHaveLength(0);
    expect(p.crosses).toHaveLength(0);
  });
});
