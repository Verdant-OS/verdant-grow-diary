/**
 * GDP-MOVE-PLANT-UNTAG-001 — pure-rule edge cases for hunt-linked move gating.
 *
 * Complements assign-tent-pheno-untag-then-move.test.tsx (component flow) and
 * plant-tent-crud-management.test.ts (happy-path helpers + static guards).
 */
import { describe, expect, it } from "vitest";
import {
  buildPlantPhenoUntagPayload,
  buildPlantTentMoveUpdate,
  isHuntLinkedPlant,
  partitionTentsForPlantMove,
  plantMoveRequiresPhenoUntag,
} from "@/lib/plantTentRelationshipRules";

describe("plantTentRelationshipRules · isHuntLinkedPlant", () => {
  it("treats only non-empty trimmed strings as hunt-linked", () => {
    expect(isHuntLinkedPlant("hunt-1")).toBe(true);
    expect(isHuntLinkedPlant("  hunt-1  ")).toBe(true);
    expect(isHuntLinkedPlant(null)).toBe(false);
    expect(isHuntLinkedPlant(undefined)).toBe(false);
    expect(isHuntLinkedPlant("")).toBe(false);
    expect(isHuntLinkedPlant("   ")).toBe(false);
  });
});

describe("plantTentRelationshipRules · partitionTentsForPlantMove", () => {
  const tents = [
    { id: "t1", name: "Current", grow_id: "g1" },
    { id: "t2", name: "Same", grow_id: "g1" },
    { id: "t3", name: "Other", grow_id: "g2" },
    { id: "t4", name: "Archived", grow_id: "g1", is_archived: true },
  ];

  it("splits same-grow vs other-grow and omits cross-grow until includeCrossGrow", () => {
    const blocked = partitionTentsForPlantMove(tents, "t1", "g1");
    expect(blocked.current.map((t) => t.id)).toEqual(["t1"]);
    expect(blocked.sameGrow.map((t) => t.id)).toEqual(["t2"]);
    expect(blocked.otherGrow).toEqual([]);

    const released = partitionTentsForPlantMove(tents, "t1", "g1", { includeCrossGrow: true });
    expect(released.otherGrow.map((t) => t.id)).toEqual(["t3"]);
  });

  it("skips archived tents in every bucket", () => {
    const out = partitionTentsForPlantMove(tents, "t1", "g1", { includeCrossGrow: true });
    const ids = [...out.sameGrow, ...out.otherGrow, ...out.current].map((t) => t.id);
    expect(ids).not.toContain("t4");
  });
});

describe("plantTentRelationshipRules · orphan / whitespace grow edges", () => {
  it("requires untag when a hunt-linked orphan would gain grow_id", () => {
    expect(
      plantMoveRequiresPhenoUntag({
        phenoHuntId: "hunt-1",
        plantGrowId: null,
        destinationGrowId: "g2",
      }),
    ).toBe(true);
    expect(
      buildPlantTentMoveUpdate({
        tentId: "t2",
        plantGrowId: null,
        destinationGrowId: "g2",
        usedGrowFallback: true,
        phenoHuntId: "hunt-1",
      }),
    ).toBeNull();
  });

  it("allows untagged orphan re-home to copy grow_id", () => {
    expect(
      buildPlantTentMoveUpdate({
        tentId: "t2",
        plantGrowId: null,
        destinationGrowId: "g2",
        usedGrowFallback: true,
        phenoHuntId: null,
      }),
    ).toEqual({ tent_id: "t2", grow_id: "g2" });
  });

  it("normalizes whitespace grow ids before comparing hunt gate", () => {
    expect(
      plantMoveRequiresPhenoUntag({
        phenoHuntId: "hunt-1",
        plantGrowId: " g1 ",
        destinationGrowId: "g1",
      }),
    ).toBe(false);
    expect(
      buildPlantTentMoveUpdate({
        tentId: "t2",
        plantGrowId: " g1 ",
        destinationGrowId: " g1 ",
        usedGrowFallback: false,
        phenoHuntId: "hunt-1",
      }),
    ).toEqual({ tent_id: "t2" });
  });

  it("never bundles pheno fields into move payload", () => {
    const move = buildPlantTentMoveUpdate({
      tentId: "t4",
      plantGrowId: "g1",
      destinationGrowId: "g2",
      usedGrowFallback: false,
      phenoHuntId: null,
    });
    expect(move).toEqual({ tent_id: "t4", grow_id: "g2" });
    expect(move).not.toHaveProperty("pheno_hunt_id");
    expect(move).not.toHaveProperty("candidate_label");
    expect(buildPlantPhenoUntagPayload()).not.toHaveProperty("tent_id");
  });

  it("does not require untag when destination grow id is blank", () => {
    expect(
      plantMoveRequiresPhenoUntag({
        phenoHuntId: "hunt-1",
        plantGrowId: "g1",
        destinationGrowId: "   ",
      }),
    ).toBe(false);
  });

  it("omits grow_id on same-grow hunt-linked moves", () => {
    expect(
      buildPlantTentMoveUpdate({
        tentId: "t2",
        plantGrowId: "g1",
        destinationGrowId: "g1",
        usedGrowFallback: false,
        phenoHuntId: "hunt-1",
      }),
    ).toEqual({ tent_id: "t2" });
  });

  it.each([null, undefined])(
    "does not require untag when destination grow id is %s",
    (destinationGrowId) => {
      expect(
        plantMoveRequiresPhenoUntag({
          phenoHuntId: "hunt-1",
          plantGrowId: "g1",
          destinationGrowId,
        }),
      ).toBe(false);
    },
  );

  it("does not copy grow_id when the destination grow cannot be resolved", () => {
    expect(
      buildPlantTentMoveUpdate({
        tentId: "t2",
        plantGrowId: null,
        destinationGrowId: null,
        usedGrowFallback: true,
        phenoHuntId: null,
      }),
    ).toEqual({ tent_id: "t2" });
  });
});
