/**
 * #1005 — Pheno evidence → Quick Log target gate (pure).
 *
 * The handoff targets the candidate plant's OWN stored grow/tent, resolved
 * through the canonical Quick Log target rules against the tent catalog.
 * Tentless candidates pass through with tentId null so Quick Log's own tent
 * gating decides (`quickLogTentRequirementRules`, #1824, owns that rule).
 */
import { describe, it, expect } from "vitest";
import {
  PHENO_EVIDENCE_TARGET_COPY,
  phenoEvidenceTargetNeedsPlantRepair,
  resolvePhenoEvidenceQuickLogTarget,
  type PhenoEvidenceGrowCatalog,
  type PhenoEvidencePlantCatalog,
  type PhenoEvidenceTentCatalog,
} from "@/lib/phenoEvidenceQuickLogTargetGate";

/** Active (non-archived) grows, as GrowsProvider lists them. */
const ACTIVE_GROWS: PhenoEvidenceGrowCatalog = { status: "ready", growIds: new Set(["g1", "g2"]) };

const READY: PhenoEvidenceTentCatalog = {
  status: "ready",
  tents: [
    { id: "t1", grow_id: "g1" },
    { id: "t2", grow_id: "g2" },
    { id: "t-orphan", grow_id: null },
    { id: "t-archived", grow_id: "g1", is_archived: true },
  ],
};

const plant = (growId: string | null, tentId: string | null, plantId: string | null = "p1") => ({
  plantId,
  growId,
  tentId,
});

type PlantTriple = { plantId: unknown; growId: string | null; tentId: string | null };

/**
 * Resolve with Quick Log's live plant catalog agreeing with `plant` (the
 * plant has not moved since the page loaded), unless `plants` is given.
 */
function resolve(input: {
  plant: PlantTriple | null;
  catalog: PhenoEvidenceTentCatalog | null;
  grows: PhenoEvidenceGrowCatalog | null;
  plants?: PhenoEvidencePlantCatalog | null;
}) {
  const p = input.plant;
  const live: PhenoEvidencePlantCatalog = {
    status: "ready",
    plants:
      p && typeof p.plantId === "string"
        ? [{ id: p.plantId.trim(), grow_id: p.growId, tent_id: p.tentId }]
        : [],
  };
  return resolvePhenoEvidenceQuickLogTarget({
    plantId: (p?.plantId ?? null) as string | null,
    plants: input.plants === undefined ? live : input.plants,
    catalog: input.catalog,
    grows: input.grows,
  });
}

describe("resolvePhenoEvidenceQuickLogTarget", () => {
  it("valid triangle → the exact stored plant, grow and tent ids", () => {
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant("g2", "t2"),
        catalog: READY,
      }),
    ).toEqual({ kind: "ready", plantId: "p1", growId: "g2", tentId: "t2" });
  });

  it("trims stored ids and never substitutes any other grow or tent", () => {
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant(" g1 ", " t1 ", " p1 "),
        catalog: READY,
      }),
    ).toEqual({ kind: "ready", plantId: "p1", growId: "g1", tentId: "t1" });
  });

  it("tentless plant in a grow → exact plant + grow, tent deferred to Quick Log (null)", () => {
    for (const catalog of [READY, { status: "loading" } as const, { status: "error" } as const]) {
      expect(
        resolve({
          grows: ACTIVE_GROWS,
          plant: plant("g1", null),
          catalog,
        }),
      ).toEqual({
        kind: "ready",
        plantId: "p1",
        growId: "g1",
        tentId: null,
      });
    }
  });

  it("catalog loading → pending; it never infers missing setup", () => {
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant("g1", "t1"),
        catalog: { status: "loading" },
      }),
    ).toEqual({ kind: "pending" });
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant("g1", "t1"),
        catalog: null,
      }),
    ).toEqual({
      kind: "pending",
    });
  });

  it("catalog read error → catalog_error, not a configuration problem", () => {
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant("g1", "t1"),
        catalog: { status: "error" },
      }),
    ).toEqual({ kind: "catalog_error" });
  });

  it("missing or archived tent → tent_unavailable", () => {
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant("g1", "t-gone"),
        catalog: READY,
      }),
    ).toEqual({ kind: "tent_unavailable" });
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant("g1", "t-archived"),
        catalog: READY,
      }),
    ).toEqual({ kind: "tent_unavailable" });
  });

  it("tent/grow mismatch → blocked; never falls back to another grow or tent", () => {
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant("g1", "t2"),
        catalog: READY,
      }),
    ).toEqual({ kind: "mismatch" });
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant("g1", "t-orphan"),
        catalog: READY,
      }),
    ).toEqual({ kind: "mismatch" });
  });

  it("plant with no grow → needs_assignment (no active-grow invention)", () => {
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant(null, "t1"),
        catalog: READY,
      }),
    ).toEqual({ kind: "needs_assignment" });
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant("  ", null),
        catalog: READY,
      }),
    ).toEqual({ kind: "needs_assignment" });
  });

  it("missing plant id or no plant → plant_unavailable", () => {
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: plant("g1", "t1", null),
        catalog: READY,
      }),
    ).toEqual({ kind: "plant_unavailable" });
    expect(resolve({ grows: ACTIVE_GROWS, plant: null, catalog: READY })).toEqual({
      kind: "plant_unavailable",
    });
    expect(
      resolve({
        grows: ACTIVE_GROWS,
        plant: { plantId: 7, growId: "g1", tentId: "t1" },
        catalog: READY,
      }),
    ).toEqual({ kind: "plant_unavailable" });
  });

  it("is deterministic across repeated calls", () => {
    const input = { grows: ACTIVE_GROWS, plant: plant("g2", "t2"), catalog: READY };
    expect(resolve(input)).toEqual(resolve(input));
  });
});

describe("blocked-state copy and repair paths", () => {
  it("every blocked state has pinned copy", () => {
    expect(PHENO_EVIDENCE_TARGET_COPY).toEqual({
      pending: "Checking where this evidence will be saved…",
      catalog_error: "Couldn't confirm this plant's grow and tent right now.",
      plant_unavailable: "This plant is no longer available, so evidence can't be recorded here.",
      needs_assignment: "Assign this plant to a grow before recording evidence.",
      grow_unavailable: "This plant's grow is archived or no longer available.",
      tent_unavailable: "This plant's tent is archived or no longer available.",
      mismatch: "This plant's tent belongs to a different grow. Review the plant before recording.",
    });
  });

  it("only plant-fixable states offer the Plant Detail repair path", () => {
    expect(phenoEvidenceTargetNeedsPlantRepair("needs_assignment")).toBe(true);
    expect(phenoEvidenceTargetNeedsPlantRepair("tent_unavailable")).toBe(true);
    expect(phenoEvidenceTargetNeedsPlantRepair("mismatch")).toBe(true);
    expect(phenoEvidenceTargetNeedsPlantRepair("pending")).toBe(false);
    expect(phenoEvidenceTargetNeedsPlantRepair("catalog_error")).toBe(false);
    expect(phenoEvidenceTargetNeedsPlantRepair("plant_unavailable")).toBe(false);
    expect(phenoEvidenceTargetNeedsPlantRepair("ready")).toBe(false);
  });
});

describe("resolvePhenoEvidenceQuickLogTarget — grow must be active (Codex on #1825)", () => {
  it("an archived or unknown grow is unavailable even when its tent is active", () => {
    const grows: PhenoEvidenceGrowCatalog = { status: "ready", growIds: new Set(["g2"]) };
    expect(resolve({ grows, plant: plant("g1", "t1"), catalog: READY })).toEqual({
      kind: "grow_unavailable",
    });
    // Tentless candidates in an archived grow are blocked too.
    expect(resolve({ grows, plant: plant("g1", null), catalog: READY })).toEqual({
      kind: "grow_unavailable",
    });
    expect(phenoEvidenceTargetNeedsPlantRepair("grow_unavailable")).toBe(true);
    expect(PHENO_EVIDENCE_TARGET_COPY.grow_unavailable).toMatch(/grow/i);
  });

  it("waits for the grow catalog and fails closed on its error or absence", () => {
    const p = plant("g1", "t1");
    expect(
      resolve({
        grows: { status: "loading" },
        plant: p,
        catalog: READY,
      }),
    ).toEqual({ kind: "pending" });
    expect(resolve({ grows: { status: "error" }, plant: p, catalog: READY })).toEqual({
      kind: "catalog_error",
    });
    expect(resolve({ grows: null, plant: p, catalog: READY })).toEqual({
      kind: "pending",
    });
  });
});

describe("resolvePhenoEvidenceQuickLogTarget — Quick Log's live plant catalog (Codex on #1825)", () => {
  it("a plant moved after the page loaded targets its CURRENT grow/tent, not the stale ids", () => {
    expect(
      resolvePhenoEvidenceQuickLogTarget({
        plantId: "p1",
        plants: { status: "ready", plants: [{ id: "p1", grow_id: "g2", tent_id: "t2" }] },
        catalog: READY,
        grows: ACTIVE_GROWS,
      }),
    ).toEqual({ kind: "ready", plantId: "p1", growId: "g2", tentId: "t2" });
  });

  it("a live row moved into an archived tent or a mismatched tent is blocked", () => {
    const base = { plantId: "p1", catalog: READY, grows: ACTIVE_GROWS };
    expect(
      resolvePhenoEvidenceQuickLogTarget({
        ...base,
        plants: { status: "ready", plants: [{ id: "p1", grow_id: "g1", tent_id: "t-archived" }] },
      }),
    ).toEqual({ kind: "tent_unavailable" });
    expect(
      resolvePhenoEvidenceQuickLogTarget({
        ...base,
        plants: { status: "ready", plants: [{ id: "p1", grow_id: "g1", tent_id: "t2" }] },
      }),
    ).toEqual({ kind: "mismatch" });
  });

  it("a plant missing from, archived in, or merged in the live catalog is unavailable", () => {
    const base = { plantId: "p1", catalog: READY, grows: ACTIVE_GROWS };
    for (const plants of [
      [],
      [{ id: "p-other", grow_id: "g1", tent_id: "t1" }],
      [{ id: "p1", grow_id: "g1", tent_id: "t1", is_archived: true }],
      [{ id: "p1", grow_id: "g1", tent_id: "t1", merged_into_plant_id: "p9" }],
    ]) {
      expect(
        resolvePhenoEvidenceQuickLogTarget({ ...base, plants: { status: "ready", plants } }),
      ).toEqual({ kind: "plant_unavailable" });
    }
  });

  it("waits for the live plant catalog and fails closed on its error or absence", () => {
    const base = { plantId: "p1", catalog: READY, grows: ACTIVE_GROWS };
    expect(resolvePhenoEvidenceQuickLogTarget({ ...base, plants: { status: "loading" } })).toEqual({
      kind: "pending",
    });
    expect(resolvePhenoEvidenceQuickLogTarget({ ...base, plants: { status: "error" } })).toEqual({
      kind: "catalog_error",
    });
    expect(resolvePhenoEvidenceQuickLogTarget({ ...base, plants: null })).toEqual({
      kind: "pending",
    });
  });
});
