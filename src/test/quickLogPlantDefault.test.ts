/**
 * Pure tests for pickDefaultQuickLogPlant.
 *
 * Target-integrity slice: preserve explicit or validated prefill choices,
 * but never infer the only available plant for a global launcher.
 */
import { describe, it, expect } from "vitest";
import { pickDefaultQuickLogPlant } from "@/lib/quickLogPlantOptionRules";

const one = [{ id: "p1", grow_id: "g1" }];
const many = [
  { id: "p1", grow_id: "g1" },
  { id: "p2", grow_id: "g1" },
];

describe("pickDefaultQuickLogPlant", () => {
  it("keeps a valid currentPlantId even when other rules would fire", () => {
    expect(pickDefaultQuickLogPlant(many, "p1", "p2")).toBe("p2");
    expect(pickDefaultQuickLogPlant(one, "p1", "p1")).toBe("p1");
  });

  it("clears a stale currentPlantId not present in scope", () => {
    expect(pickDefaultQuickLogPlant(one, null, "ghost")).toBe("");
  });

  it("uses a valid prefillPlantId over single-candidate fallback", () => {
    expect(pickDefaultQuickLogPlant(many, "p2", null)).toBe("p2");
  });

  it("ignores an invalid prefillPlantId", () => {
    expect(pickDefaultQuickLogPlant(many, "ghost", null)).toBe("");
    expect(pickDefaultQuickLogPlant(one, "ghost", null)).toBe("");
  });

  it("never infers the only scoped plant", () => {
    expect(pickDefaultQuickLogPlant(one, null, null)).toBe("");
    expect(pickDefaultQuickLogPlant(one, undefined, undefined)).toBe("");
  });

  it("returns empty for multiple scoped plants without prefill", () => {
    expect(pickDefaultQuickLogPlant(many, null, null)).toBe("");
  });

  it("returns empty for zero scoped plants", () => {
    expect(pickDefaultQuickLogPlant([], "p1", "p2")).toBe("");
  });

  it("is deterministic across repeat calls", () => {
    const a = pickDefaultQuickLogPlant(one, "p1", null);
    const b = pickDefaultQuickLogPlant(one, "p1", null);
    expect(a).toBe(b);
  });
});
