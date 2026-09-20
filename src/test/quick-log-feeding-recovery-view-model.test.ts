import { describe, expect, it } from "vitest";
import { buildFeedingRecoveryForm } from "@/lib/quickLogFeedingRecoveryViewModel";
import { buildFeedingFormPayload } from "@/lib/quickLogFeedingFormViewModel";
import type { PendingQuickLogFeeding } from "@/lib/quickLogPendingFeedingStore";

const record: PendingQuickLogFeeding = {
  version: 1,
  ownerId: "owner-a",
  createdAt: "2026-09-17T16:00:00.000Z",
  payload: {
    idempotency_key: "feed-save-12345",
    grow_id: "grow-a",
    tent_id: "tent-a",
    plant_id: "plant-a",
    occurred_at: "2026-09-17T16:00:00.000Z",
    nutrient_line_id: "veg-week-3",
    products: [{ name: "Base A", amount: 0, unit: "ml_per_l" }, { name: "Base B" }],
    volume_ml: 750,
    ph: 6.2,
    ec_in: 1.4,
    water_temp_c: 21,
    note: "Original note",
  },
  resolved: {
    ok: true,
    targetType: "plant",
    targetId: "plant-a",
    plantId: "plant-a",
    tentId: "tent-a",
    growId: "grow-a",
  },
};
describe("restored Feed presentation", () => {
  it("preserves the original scope, products, note and canonical units without inventing empty metrics", () => {
    const restored = buildFeedingRecoveryForm(record);
    expect(restored.form).toMatchObject({
      action: "feed",
      selectedKey: "plant:plant-a",
      note: "Original note",
    });
    expect(restored.feedingForm).toMatchObject({
      lineId: "veg-week-3",
      volumeMl: "750",
      waterTempC: "21",
      ecIn: "1.4",
      ppmIn: "",
      ecOut: "",
      runoffMl: "",
      products: [
        { name: "Base A", amount: "0", unit: "ml_per_l" },
        { name: "Base B", amount: "", unit: "" },
      ],
    });
    const mapped = buildFeedingFormPayload({
      growId: "grow-a",
      tentId: "tent-a",
      plantId: "plant-a",
      idempotencyKey: "feed-save-12345",
      form: restored.feedingForm,
    });
    const { occurred_at: _at, ...original } = record.payload;
    expect(mapped).toEqual({ ok: true, payload: original });
  });
  it("is deterministic and returns detached product arrays", () => {
    const original = JSON.stringify(record);
    const first = buildFeedingRecoveryForm(record);
    expect(first).toEqual(buildFeedingRecoveryForm(record));
    first.feedingForm.products[0].name = "changed";
    expect(JSON.stringify(record)).toBe(original);
    expect(buildFeedingRecoveryForm(record).feedingForm.products[0].name).toBe("Base A");
  });

  it("keeps absent measurements empty for tent scope instead of inventing runoff or pH", () => {
    const saved: PendingQuickLogFeeding = {
      ...record,
      payload: {
        idempotency_key: "feed-save-12345",
        grow_id: "grow-a",
        tent_id: "tent-a",
        plant_id: null,
        occurred_at: "2026-09-17T16:00:00.000Z",
        nutrient_line_id: "veg-week-3",
        products: [{ name: "Base A" }],
        volume_ml: 750,
        note: null,
      },
      resolved: {
        ok: true,
        targetType: "tent",
        targetId: "tent-a",
        tentId: "tent-a",
        growId: "grow-a",
        plantId: null,
      },
    };
    const restored = buildFeedingRecoveryForm(saved);
    expect(restored.form).toMatchObject({
      selectedKey: "tent:tent-a",
      action: "feed",
      note: "",
    });
    expect(restored.feedingForm).toEqual({
      lineId: "veg-week-3",
      volumeMl: "750",
      ph: "",
      ecIn: "",
      ppmIn: "",
      ecOut: "",
      ppmOut: "",
      runoffMl: "",
      runoffPh: "",
      runoffEc: "",
      runoffPpm: "",
      waterTempC: "",
      note: "",
      products: [{ name: "Base A", amount: "", unit: "" }],
    });
  });

  it("does not modify the frozen write when restoring it repeatedly", () => {
    const saved = structuredClone(record);
    const before = structuredClone(saved);
    const first = buildFeedingRecoveryForm(saved);
    first.form.note = "Edited display object";
    first.feedingForm.volumeMl = "900";
    const second = buildFeedingRecoveryForm(saved);
    expect(second.form.note).toBe("Original note");
    expect(second.feedingForm.volumeMl).toBe("750");
    expect(saved).toEqual(before);
  });
});
