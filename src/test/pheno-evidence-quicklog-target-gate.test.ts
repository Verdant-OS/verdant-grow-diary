/**
 * #1005 — Pheno evidence → Quick Log target gate (pure).
 *
 * The handoff targets the candidate plant's OWN stored grow/tent, resolved
 * through the canonical Quick Log target rules against the tent catalog.
 * Tentless candidates pass through with tentId null so Quick Log's own tent
 * gating decides (open PR #1824 owns that rule).
 */
import { describe, it, expect } from "vitest";
import {
  PHENO_EVIDENCE_TARGET_COPY,
  phenoEvidenceTargetNeedsPlantRepair,
  resolvePhenoEvidenceQuickLogTarget,
  type PhenoEvidenceTentCatalog,
} from "@/lib/phenoEvidenceQuickLogTargetGate";

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

describe("resolvePhenoEvidenceQuickLogTarget", () => {
  it("valid triangle → the exact stored plant, grow and tent ids", () => {
    expect(
      resolvePhenoEvidenceQuickLogTarget({ plant: plant("g2", "t2"), catalog: READY }),
    ).toEqual({ kind: "ready", plantId: "p1", growId: "g2", tentId: "t2" });
  });

  it("trims stored ids and never substitutes any other grow or tent", () => {
    expect(
      resolvePhenoEvidenceQuickLogTarget({ plant: plant(" g1 ", " t1 ", " p1 "), catalog: READY }),
    ).toEqual({ kind: "ready", plantId: "p1", growId: "g1", tentId: "t1" });
  });

  it("tentless plant in a grow → exact plant + grow, tent deferred to Quick Log (null)", () => {
    for (const catalog of [READY, { status: "loading" } as const, { status: "error" } as const]) {
      expect(resolvePhenoEvidenceQuickLogTarget({ plant: plant("g1", null), catalog })).toEqual({
        kind: "ready",
        plantId: "p1",
        growId: "g1",
        tentId: null,
      });
    }
  });

  it("catalog loading → pending; it never infers missing setup", () => {
    expect(
      resolvePhenoEvidenceQuickLogTarget({
        plant: plant("g1", "t1"),
        catalog: { status: "loading" },
      }),
    ).toEqual({ kind: "pending" });
    expect(resolvePhenoEvidenceQuickLogTarget({ plant: plant("g1", "t1"), catalog: null })).toEqual(
      {
        kind: "pending",
      },
    );
  });

  it("catalog read error → catalog_error, not a configuration problem", () => {
    expect(
      resolvePhenoEvidenceQuickLogTarget({
        plant: plant("g1", "t1"),
        catalog: { status: "error" },
      }),
    ).toEqual({ kind: "catalog_error" });
  });

  it("missing or archived tent → tent_unavailable", () => {
    expect(
      resolvePhenoEvidenceQuickLogTarget({ plant: plant("g1", "t-gone"), catalog: READY }),
    ).toEqual({ kind: "tent_unavailable" });
    expect(
      resolvePhenoEvidenceQuickLogTarget({ plant: plant("g1", "t-archived"), catalog: READY }),
    ).toEqual({ kind: "tent_unavailable" });
  });

  it("tent/grow mismatch → blocked; never falls back to another grow or tent", () => {
    expect(
      resolvePhenoEvidenceQuickLogTarget({ plant: plant("g1", "t2"), catalog: READY }),
    ).toEqual({ kind: "mismatch" });
    expect(
      resolvePhenoEvidenceQuickLogTarget({ plant: plant("g1", "t-orphan"), catalog: READY }),
    ).toEqual({ kind: "mismatch" });
  });

  it("plant with no grow → needs_assignment (no active-grow invention)", () => {
    expect(
      resolvePhenoEvidenceQuickLogTarget({ plant: plant(null, "t1"), catalog: READY }),
    ).toEqual({ kind: "needs_assignment" });
    expect(
      resolvePhenoEvidenceQuickLogTarget({ plant: plant("  ", null), catalog: READY }),
    ).toEqual({ kind: "needs_assignment" });
  });

  it("missing plant id or no plant → plant_unavailable", () => {
    expect(
      resolvePhenoEvidenceQuickLogTarget({ plant: plant("g1", "t1", null), catalog: READY }),
    ).toEqual({ kind: "plant_unavailable" });
    expect(resolvePhenoEvidenceQuickLogTarget({ plant: null, catalog: READY })).toEqual({
      kind: "plant_unavailable",
    });
    expect(
      resolvePhenoEvidenceQuickLogTarget({
        plant: { plantId: 7 as unknown as string, growId: "g1", tentId: "t1" },
        catalog: READY,
      }),
    ).toEqual({ kind: "plant_unavailable" });
  });

  it("is deterministic across repeated calls", () => {
    const input = { plant: plant("g2", "t2"), catalog: READY };
    expect(resolvePhenoEvidenceQuickLogTarget(input)).toEqual(
      resolvePhenoEvidenceQuickLogTarget(input),
    );
  });
});

describe("blocked-state copy and repair paths", () => {
  it("every blocked state has pinned copy", () => {
    expect(PHENO_EVIDENCE_TARGET_COPY).toEqual({
      pending: "Checking where this evidence will be saved…",
      catalog_error: "Couldn't confirm this plant's tent right now.",
      plant_unavailable: "This plant is no longer available, so evidence can't be recorded here.",
      needs_assignment: "Assign this plant to a grow before recording evidence.",
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
