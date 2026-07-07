/**
 * Slice A3.1 — Vocab A (value+unit) → Vocab B (grams) boundary tests.
 *
 * Verifies that grower-entered oz/lb/kg values are canonicalized to
 * grams at the RPC persistence boundary, never treated as raw grams,
 * and that the ORIGINAL value+unit are stamped into `details.harvest`
 * so the timeline card can render honestly.
 */
import { describe, it, expect } from "vitest";
import { buildHarvestCureQuickLogPersistencePayload } from "@/lib/harvestCureQuickLogPersistencePayload";
import { buildHarvestCardViewModel } from "@/lib/harvestCureTimelineCardViewModel";
import { GRAMS_PER_UNIT } from "@/lib/harvestWeightUnitNormalization";

const GROW = "00000000-0000-0000-0000-000000000001";
const IK = "vocab-a-boundary-test-key";

function build(harvest: Record<string, unknown>) {
  return buildHarvestCureQuickLogPersistencePayload({
    eventType: "harvest",
    growId: GROW,
    idempotencyKey: IK,
    harvest: harvest as never,
  });
}

describe("harvest Vocab A → Vocab B boundary (persistence)", () => {
  it("oz input canonicalizes wet_weight_grams and stamps original", () => {
    const r = build({ wet_weight_input: "2", weight_unit: "oz" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = (r.payload.p_details as { harvest: Record<string, unknown> }).harvest;
    expect(d.wet_weight_grams).toBeCloseTo(2 * GRAMS_PER_UNIT.oz, 8);
    expect(d.original_wet_weight).toBe("2");
    expect(d.original_weight_unit).toBe("oz");
  });

  it("lb input canonicalizes correctly", () => {
    const r = build({ wet_weight_input: "1", weight_unit: "lb" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = (r.payload.p_details as { harvest: Record<string, unknown> }).harvest;
    expect(d.wet_weight_grams).toBeCloseTo(453.59237, 8);
    expect(d.original_weight_unit).toBe("lb");
  });

  it("kg input canonicalizes correctly for both wet and dry", () => {
    const r = build({
      wet_weight_input: "1.25",
      dry_weight_input: "0.3",
      weight_unit: "kg",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = (r.payload.p_details as { harvest: Record<string, unknown> }).harvest;
    expect(d.wet_weight_grams).toBeCloseTo(1250, 8);
    expect(d.dry_weight_grams).toBeCloseTo(300, 8);
    expect(d.original_wet_weight).toBe("1.25");
    expect(d.original_dry_weight).toBe("0.3");
    expect(d.original_weight_unit).toBe("kg");
  });

  it("g input stays stable (identity conversion)", () => {
    const r = build({ wet_weight_input: "412.5", weight_unit: "g" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = (r.payload.p_details as { harvest: Record<string, unknown> }).harvest;
    expect(d.wet_weight_grams).toBe(412.5);
    expect(d.original_weight_unit).toBe("g");
  });

  it("empty Vocab A input does not create fake grams", () => {
    const r = build({ wet_weight_input: "", dry_weight_input: "", weight_unit: "oz" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // No grams stamped, no originals stamped.
    const d = r.payload.p_details as { harvest?: Record<string, unknown> } | null;
    expect(d?.harvest?.wet_weight_grams).toBeUndefined();
    expect(d?.harvest?.dry_weight_grams).toBeUndefined();
    expect(d?.harvest?.original_weight_unit).toBeUndefined();
  });

  it("Vocab A value with no unit is rejected — never coerced to grams", () => {
    const r = build({ wet_weight_input: "5" });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("invalid_harvest_details");
  });

  it("Vocab A value with unknown unit is rejected", () => {
    const r = build({ wet_weight_input: "5", weight_unit: "pounds" });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("invalid_harvest_details");
  });

  it("Vocab A negative / non-numeric value is rejected (never persisted as grams)", () => {
    for (const bad of ["-1", "abc", "1e3"]) {
      const r = build({ wet_weight_input: bad, weight_unit: "oz" });
      expect(r.ok).toBe(false);
    }
  });

  it("legacy grams-only input still passes through unchanged (no regression)", () => {
    const r = build({ wet_weight_grams: 412.5, keeper_candidate: "yes" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = (r.payload.p_details as { harvest: Record<string, unknown> }).harvest;
    expect(d.wet_weight_grams).toBe(412.5);
    expect(d.keeper_candidate).toBe("yes");
    expect(d.original_weight_unit).toBeUndefined();
  });

  it("Vocab A wins when both weight_input and grams are provided for the same side", () => {
    const r = build({
      wet_weight_input: "1",
      weight_unit: "kg",
      wet_weight_grams: 999, // stale numeric — must be overridden
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = (r.payload.p_details as { harvest: Record<string, unknown> }).harvest;
    expect(d.wet_weight_grams).toBeCloseTo(1000, 8);
  });
});

describe("harvest Vocab A → Vocab B boundary (timeline card)", () => {
  it("timeline card surfaces original value+unit alongside grams", () => {
    const vm = buildHarvestCardViewModel({
      details: {
        wet_weight_grams: 907.18474,
        original_wet_weight: "2",
        original_weight_unit: "lb",
      },
    });
    expect(vm.wet_weight_grams).toBeCloseTo(907.18474, 5);
    expect(vm.original_wet_weight).toBe("2");
    expect(vm.original_weight_unit).toBe("lb");
  });

  it("timeline card without originals still renders (legacy grams-only rows)", () => {
    const vm = buildHarvestCardViewModel({
      details: { wet_weight_grams: 500 },
    });
    expect(vm.wet_weight_grams).toBe(500);
    expect(vm.original_wet_weight).toBeUndefined();
    expect(vm.original_weight_unit).toBeUndefined();
  });

  it("timeline card never invents an original when only grams are present — must not imply oz/lb", () => {
    const vm = buildHarvestCardViewModel({
      details: { wet_weight_grams: 100 },
    });
    // Presenter would show "100 g" — never "100 lb" or "100 oz".
    expect(vm.original_weight_unit).toBeUndefined();
  });
});
