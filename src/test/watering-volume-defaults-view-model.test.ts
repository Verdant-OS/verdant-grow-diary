/**
 * Tests for wateringVolumeDefaultsViewModel.
 *
 * Pure helper — no mocks of Supabase / React / time. Covers the fail-closed
 * "last watering volume" prefill contract for the QuickLogV2 Water surface.
 */
import { describe, it, expect } from "vitest";
import {
  applyWateringVolumeDefaultsToForm,
  buildWateringVolumeDefaults,
  formatWateringVolumeMlForPrefill,
  WATERING_VOLUME_DEFAULTS_LABEL,
} from "@/lib/wateringVolumeDefaultsViewModel";
import { EMPTY_QUICKLOG_WATERING_FORM } from "@/lib/quickLogWateringFormViewModel";

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "row-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    event_type: "watering",
    entry_at: "2026-06-10T12:00:00.000Z",
    note: "",
    details: {
      event_type: "watering",
      watering_amount_ml: 200,
    },
    ...overrides,
  };
}

describe("formatWateringVolumeMlForPrefill", () => {
  it("formats positive integers without a decimal", () => {
    expect(formatWateringVolumeMlForPrefill(200)).toBe("200");
  });

  it("keeps finite non-integers", () => {
    expect(formatWateringVolumeMlForPrefill(200.5)).toBe("200.5");
  });

  it("rejects non-positive, non-finite, and out-of-range values", () => {
    expect(formatWateringVolumeMlForPrefill(0)).toBeNull();
    expect(formatWateringVolumeMlForPrefill(-1)).toBeNull();
    expect(formatWateringVolumeMlForPrefill(Number.NaN)).toBeNull();
    expect(formatWateringVolumeMlForPrefill(1_000_001)).toBeNull();
  });
});

describe("buildWateringVolumeDefaults", () => {
  it("returns empty defaults when no rows exist", () => {
    const r = buildWateringVolumeDefaults({ rawEntries: [], plantId: "plant-1" });
    expect(r.defaults).toBeNull();
    expect(r.sourceEntryId).toBeNull();
    expect(r.label).toBeNull();
  });

  it("returns empty defaults without a plant id (fail closed)", () => {
    const r = buildWateringVolumeDefaults({
      rawEntries: [row()],
      plantId: null,
    });
    expect(r.defaults).toBeNull();
  });

  it("prefills the newest same-plant watering volume", () => {
    const r = buildWateringVolumeDefaults({
      rawEntries: [
        row({
          id: "older",
          entry_at: "2026-06-01T00:00:00.000Z",
          details: { event_type: "watering", watering_amount_ml: 500 },
        }),
        row({
          id: "newer",
          entry_at: "2026-06-09T00:00:00.000Z",
          details: { event_type: "watering", watering_amount_ml: 200 },
        }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults?.volumeMl).toBe("200");
    expect(r.sourceEntryId).toBe("newer");
    expect(r.label).toBe(WATERING_VOLUME_DEFAULTS_LABEL);
  });

  it("skips watering rows that lack a volume and keeps looking", () => {
    const r = buildWateringVolumeDefaults({
      rawEntries: [
        row({
          id: "no-volume",
          entry_at: "2026-06-10T00:00:00.000Z",
          details: { event_type: "watering" },
        }),
        row({
          id: "with-volume",
          entry_at: "2026-06-09T00:00:00.000Z",
          details: { event_type: "watering", watering_amount_ml: 1800 },
        }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults?.volumeMl).toBe("1800");
    expect(r.sourceEntryId).toBe("with-volume");
  });

  it("stays empty when no prior watering volume exists", () => {
    const r = buildWateringVolumeDefaults({
      rawEntries: [
        row({
          id: "note-only",
          event_type: "note",
          details: { event_type: "note" },
        }),
        row({
          id: "watering-no-ml",
          details: { event_type: "watering" },
        }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults).toBeNull();
  });

  it("ignores feeding rows that carry a solution volume", () => {
    const r = buildWateringVolumeDefaults({
      rawEntries: [
        row({
          id: "feed",
          event_type: "feeding",
          entry_at: "2026-06-11T00:00:00.000Z",
          details: {
            event_type: "feeding",
            watering_amount_ml: 900,
            nutrients: [{ name: "Base A", amount: 2, unit: "ml_per_l" }],
          },
        }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults).toBeNull();
  });

  it("does not use another plant's watering volume", () => {
    const r = buildWateringVolumeDefaults({
      rawEntries: [
        row({
          id: "other-plant",
          plant_id: "plant-2",
          details: { event_type: "watering", watering_amount_ml: 2500 },
        }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults).toBeNull();
  });

  it("skips demo / stale / invalid provenance", () => {
    const r = buildWateringVolumeDefaults({
      rawEntries: [
        row({
          id: "demo",
          entry_at: "2026-06-11T00:00:00.000Z",
          details: {
            event_type: "watering",
            watering_amount_ml: 999,
            source: "demo",
          },
        }),
        row({
          id: "real",
          entry_at: "2026-06-10T00:00:00.000Z",
          details: { event_type: "watering", watering_amount_ml: 200 },
        }),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults?.volumeMl).toBe("200");
    expect(r.sourceEntryId).toBe("real");
  });

  it("never invents a preset or pot-size guess when empty", () => {
    const r = buildWateringVolumeDefaults({ rawEntries: [], plantId: "plant-1" });
    expect(r.defaults).toBeNull();
    expect(r).not.toEqual(
      expect.objectContaining({ defaults: expect.objectContaining({ volumeMl: "500" }) }),
    );
    expect(r).not.toEqual(
      expect.objectContaining({ defaults: expect.objectContaining({ volumeMl: "200" }) }),
    );
  });
});

describe("applyWateringVolumeDefaultsToForm", () => {
  it("returns an empty form copy when defaults are null", () => {
    const form = applyWateringVolumeDefaultsToForm({
      defaults: null,
      sourceEntryId: null,
      label: null,
    });
    expect(form).toEqual(EMPTY_QUICKLOG_WATERING_FORM);
    expect(form).not.toBe(EMPTY_QUICKLOG_WATERING_FORM);
  });

  it("applies only volumeMl and leaves every other field blank", () => {
    const form = applyWateringVolumeDefaultsToForm({
      defaults: { volumeMl: "200" },
      sourceEntryId: "w1",
      label: WATERING_VOLUME_DEFAULTS_LABEL,
    });
    expect(form.volumeMl).toBe("200");
    expect(form.ph).toBe("");
    expect(form.ec).toBe("");
    expect(form.runoffMl).toBe("");
    expect(form.waterTempC).toBe("");
    expect(form.potWeightFeel).toBe("");
    expect(form.mediumSurface).toBe("");
    expect(form.drainage).toBe("");
  });
});
