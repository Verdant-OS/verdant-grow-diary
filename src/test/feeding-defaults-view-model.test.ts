/**
 * Tests for feedingDefaultsViewModel.
 *
 * Pure helper — no mocks of Supabase / React / time. Covers the safe
 * "last used feeding" prefill contract for the QuickLogV2 Feed surface.
 */
import { describe, it, expect } from "vitest";
import {
  buildFeedingDefaults,
  applyFeedingDefaultsToForm,
  FEEDING_DEFAULTS_LABEL,
} from "@/lib/feedingDefaultsViewModel";
import {
  EMPTY_QUICKLOG_FEEDING_FORM,
  FEEDING_FORM_DEFAULT_UNIT,
} from "@/lib/quickLogFeedingFormViewModel";

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "row-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    event_type: "feeding",
    entry_at: "2026-06-10T12:00:00.000Z",
    note: "",
    details: {
      nutrients: [{ name: "Base A", amount: 2, unit: "ml_per_l" }],
      nutrient_line_id: "veg-week-3",
    },
    ...overrides,
  };
}

describe("buildFeedingDefaults", () => {
  it("returns empty defaults when no rows exist", () => {
    const r = buildFeedingDefaults({ rawEntries: [], plantId: "plant-1" });
    expect(r.defaults).toBeNull();
    expect(r.scope).toBeNull();
    expect(r.label).toBeNull();
  });

  it("returns empty defaults when rawEntries is not an array", () => {
    const r = buildFeedingDefaults({
      rawEntries: undefined as unknown as readonly unknown[],
      plantId: "plant-1",
    });
    expect(r.defaults).toBeNull();
  });

  it("selects the latest valid same-plant feeding", () => {
    const r = buildFeedingDefaults({
      rawEntries: [
        row({ id: "older", entry_at: "2026-06-01T00:00:00.000Z",
          details: { nutrients: [{ name: "Old", amount: 1, unit: "ml_per_l" }],
            nutrient_line_id: "old-line" } }),
        row({ id: "newer", entry_at: "2026-06-09T00:00:00.000Z",
          details: { nutrients: [{ name: "New", amount: 3, unit: "ml_per_l" }],
            nutrient_line_id: "veg-week-3" } }),
      ],
      plantId: "plant-1",
      tentId: "tent-1",
      growId: "grow-1",
    });
    expect(r.scope).toBe("plant");
    expect(r.sourceEntryId).toBe("newer");
    expect(r.defaults?.lineId).toBe("veg-week-3");
    expect(r.defaults?.products).toEqual([
      { name: "New", amount: "3", unit: "ml_per_l" },
    ]);
    expect(r.label).toBe(FEEDING_DEFAULTS_LABEL);
  });

  it("is deterministic regardless of input order", () => {
    const a = row({ id: "a", entry_at: "2026-06-01T00:00:00.000Z" });
    const b = row({ id: "b", entry_at: "2026-06-09T00:00:00.000Z",
      details: { nutrients: [{ name: "B", amount: 1, unit: "ml_per_l" }],
        nutrient_line_id: "line-b" } });
    const c = row({ id: "c", entry_at: "2026-06-05T00:00:00.000Z" });
    const r1 = buildFeedingDefaults({ rawEntries: [a, b, c], plantId: "plant-1" });
    const r2 = buildFeedingDefaults({ rawEntries: [c, b, a], plantId: "plant-1" });
    expect(r1).toEqual(r2);
    expect(r1.sourceEntryId).toBe("b");
  });

  it("ignores non-feeding rows", () => {
    const r = buildFeedingDefaults({
      rawEntries: [
        row({ id: "water", event_type: "watering",
          details: { watering_amount_ml: 500 } }),
        row({ id: "note", event_type: "note", details: {} }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults).toBeNull();
  });

  it("ignores rows with malformed details", () => {
    const r = buildFeedingDefaults({
      rawEntries: [row({ details: "{not-json" })],
      plantId: "plant-1",
    });
    expect(r.defaults).toBeNull();
  });

  it("ignores rows whose products payload is invalid", () => {
    const r = buildFeedingDefaults({
      rawEntries: [
        row({ details: { nutrients: "oops", nutrient_line_id: "x" } }),
        row({ id: "no-name",
          details: { nutrients: [{ amount: 1 }], nutrient_line_id: "x" } }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults).toBeNull();
  });

  it("ignores demo/stale/invalid provenance", () => {
    const r = buildFeedingDefaults({
      rawEntries: [
        row({ id: "demo",
          details: {
            nutrients: [{ name: "Demo", amount: 1, unit: "ml_per_l" }],
            nutrient_line_id: "demo-line",
            source: "demo",
          } }),
        row({ id: "stale",
          details: {
            nutrients: [{ name: "Stale", amount: 1, unit: "ml_per_l" }],
            nutrient_line_id: "stale-line",
            provenance: "stale",
          } }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults).toBeNull();
  });

  it("prefills nutrient line + product rows", () => {
    const r = buildFeedingDefaults({
      rawEntries: [
        row({ details: {
          nutrients: [
            { name: "Base A", amount: 2, unit: "ml_per_l" },
            { name: "Cal-Mag", amount: 1.5, unit: "ml_per_l" },
          ],
          nutrient_line_id: "veg-week-3",
        } }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults?.lineId).toBe("veg-week-3");
    expect(r.defaults?.products).toEqual([
      { name: "Base A", amount: "2", unit: "ml_per_l" },
      { name: "Cal-Mag", amount: "1.5", unit: "ml_per_l" },
    ]);
  });

  it("does not include measured outcome fields in defaults", () => {
    const r = buildFeedingDefaults({
      rawEntries: [
        row({ details: {
          nutrients: [{ name: "Base", amount: 2, unit: "ml_per_l" }],
          nutrient_line_id: "veg-week-3",
          ph: 6.1,
          ec: 1.6,
          runoff_ph: 6.4,
          runoff_ec: 2.1,
          runoff_ml: 250,
          extras: { water_temp_c: 21 },
        } }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults).not.toBeNull();
    // Only lineId + products are returned in defaults.
    expect(Object.keys(r.defaults!).sort()).toEqual(["lineId", "products"]);
  });

  it("falls back to same tent when no plant feeding exists", () => {
    const r = buildFeedingDefaults({
      rawEntries: [
        row({ id: "tent-only", plant_id: "other-plant", tent_id: "tent-1",
          details: { nutrients: [{ name: "T", amount: 1, unit: "ml_per_l" }],
            nutrient_line_id: "tent-line" } }),
      ],
      plantId: "plant-1",
      tentId: "tent-1",
    });
    expect(r.scope).toBe("tent");
    expect(r.defaults?.lineId).toBe("tent-line");
  });

  it("falls back to same grow when no plant/tent feeding exists", () => {
    const r = buildFeedingDefaults({
      rawEntries: [
        row({ id: "grow-only", plant_id: "p2", tent_id: "t2", grow_id: "grow-1",
          details: { nutrients: [{ name: "G", amount: 1, unit: "ml_per_l" }],
            nutrient_line_id: "grow-line" } }),
      ],
      plantId: "plant-1",
      tentId: "tent-1",
      growId: "grow-1",
    });
    expect(r.scope).toBe("grow");
    expect(r.defaults?.lineId).toBe("grow-line");
  });

  it("skips entries missing a nutrient line id", () => {
    const r = buildFeedingDefaults({
      rawEntries: [
        row({ details: {
          nutrients: [{ name: "Base", amount: 1, unit: "ml_per_l" }],
        } }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults).toBeNull();
  });
});

describe("applyFeedingDefaultsToForm", () => {
  it("returns empty form when no defaults", () => {
    const f = applyFeedingDefaultsToForm({
      defaults: null,
      scope: null,
      sourceEntryId: null,
      label: null,
    });
    expect(f).toEqual(EMPTY_QUICKLOG_FEEDING_FORM);
    // returns a fresh object (does not share array reference)
    expect(f.products).not.toBe(EMPTY_QUICKLOG_FEEDING_FORM.products);
  });

  it("merges defaults but leaves measured fields blank", () => {
    const f = applyFeedingDefaultsToForm({
      defaults: {
        lineId: "veg-week-3",
        products: [{ name: "Base", amount: "2", unit: FEEDING_FORM_DEFAULT_UNIT }],
      },
      scope: "plant",
      sourceEntryId: "x",
      label: FEEDING_DEFAULTS_LABEL,
    });
    expect(f.lineId).toBe("veg-week-3");
    expect(f.products).toEqual([
      { name: "Base", amount: "2", unit: FEEDING_FORM_DEFAULT_UNIT },
    ]);
    expect(f.ph).toBe("");
    expect(f.ecIn).toBe("");
    expect(f.ecOut).toBe("");
    expect(f.runoffMl).toBe("");
    expect(f.runoffPh).toBe("");
    expect(f.runoffEc).toBe("");
    expect(f.waterTempC).toBe("");
    expect(f.note).toBe("");
  });
});
