import { describe, it, expect } from "vitest";
import {
  normalizeDiaryEntry,
  normalizeDiaryEntries,
  sortDiaryEntriesNewestFirst,
} from "@/lib/diaryEntryRules";

const GROW_START = "2025-01-01T00:00:00Z";

const baseRow = (over: Record<string, unknown> = {}) => ({
  id: "entry-1",
  grow_id: "grow-1",
  plant_id: "plant-1",
  tent_id: "tent-1",
  stage: "veg",
  entry_type: "water",
  note: "watered to runoff",
  photo_url: "https://example.com/p.jpg",
  entry_at: "2025-01-15T12:00:00Z",
  details: {
    ph: 6.2,
    ec: 1.4,
    tds: 700,
    runoff_ph: 6.0,
    runoff_ec: 1.6,
    runoff_tds: 800,
    watering_amount_ml: 1500,
    nutrients: [{ name: "CalMag", amount: 5, unit: "ml/L" }],
    training_actions: ["topping"],
    symptoms: ["yellow tips"],
    observations: "leaves look great",
    sensor_snapshot: { at: "2025-01-15T11:55:00Z", temp: 24, rh: 55, vpd: 1.0 },
    remind_at: "2025-01-17T12:00:00Z",
    custom_x: "keep me",
  },
  ...over,
});

describe("normalizeDiaryEntries", () => {
  it("returns empty list for empty input", () => {
    expect(normalizeDiaryEntries({ rawEntries: [] })).toEqual([]);
    expect(normalizeDiaryEntries({ rawEntries: [] as unknown[] })).toEqual([]);
  });

  it("normalizes a complete diary entry", () => {
    const [e] = normalizeDiaryEntries({
      rawEntries: [baseRow()],
      growStartedAt: GROW_START,
    });
    expect(e.id).toBe("entry-1");
    expect(e.growId).toBe("grow-1");
    expect(e.plantId).toBe("plant-1");
    expect(e.tentId).toBe("tent-1");
    expect(e.stage).toBe("veg");
    expect(e.eventType).toBe("water");
    expect(e.note).toContain("watered");
    expect(e.photoUrl).toMatch(/^https:/);
    expect(e.createdAt).toBe("2025-01-15T12:00:00.000Z");
    expect(e.details.ph).toBe(6.2);
    expect(e.details.ec).toBe(1.4);
    expect(e.details.runoffPh).toBe(6.0);
    expect(e.details.runoffEc).toBe(1.6);
    expect(e.details.wateringAmountMl).toBe(1500);
    expect(e.details.nutrients?.[0].name).toBe("CalMag");
    expect(e.details.sensorSnapshot?.temp).toBe(24);
    expect(e.details.remindAt).toBe("2025-01-17T12:00:00.000Z");
    expect(e.details.extras).toEqual({ custom_x: "keep me" });
    expect(e.isValidForAiContext).toBe(true);
    expect(e.warnings).toEqual([]);
  });

  it("derives day/week of grow only from valid dates", () => {
    const [e] = normalizeDiaryEntries({
      rawEntries: [baseRow()],
      growStartedAt: GROW_START,
    });
    expect(e.dayOfGrow).toBe(14);
    expect(e.weekOfGrow).toBe(2);

    const [noRef] = normalizeDiaryEntries({ rawEntries: [baseRow()] });
    expect(noRef.dayOfGrow).toBeNull();
    expect(noRef.weekOfGrow).toBeNull();

    const [badDate] = normalizeDiaryEntries({
      rawEntries: [baseRow({ entry_at: "not-a-date" })],
      growStartedAt: GROW_START,
    });
    expect(badDate.dayOfGrow).toBeNull();
    expect(badDate.warnings).toContain("created-at:invalid");
  });

  it("handles malformed details jsonb safely with warnings", () => {
    const [stringJson] = normalizeDiaryEntries({
      rawEntries: [baseRow({ details: "not-json" })],
    });
    expect(stringJson.warnings).toContain("details:invalid-json");
    expect(stringJson.details).toEqual({});
    expect(stringJson.isValidForAiContext).toBe(false);

    const [arr] = normalizeDiaryEntries({
      rawEntries: [baseRow({ details: [1, 2, 3] })],
    });
    expect(arr.warnings).toContain("details:not-object");
    expect(arr.isValidForAiContext).toBe(false);

    const [number] = normalizeDiaryEntries({
      rawEntries: [baseRow({ details: 42 })],
    });
    expect(number.warnings).toContain("details:not-object");
  });

  it("accepts details as a JSON string when it is a valid object", () => {
    const [e] = normalizeDiaryEntries({
      rawEntries: [
        baseRow({ details: JSON.stringify({ ph: 6.5, watering_amount_l: 2 }) }),
      ],
    });
    expect(e.details.ph).toBe(6.5);
    expect(e.details.wateringAmountMl).toBe(2000);
  });

  it("flags invalid pH/EC/runoff values without dropping the entry", () => {
    const [e] = normalizeDiaryEntries({
      rawEntries: [
        baseRow({
          details: {
            ph: "not-a-number",
            ec: Infinity,
            runoff_ph: 99,
            runoff_ec: -1,
            tds: NaN,
          },
        }),
      ],
    });
    expect(e.details.ph).toBeUndefined();
    expect(e.details.ec).toBeUndefined();
    expect(e.details.runoffPh).toBeUndefined();
    expect(e.details.runoffEc).toBeUndefined();
    expect(e.details.tds).toBeUndefined();
    expect(e.warnings).toEqual(
      expect.arrayContaining([
        "ph:invalid",
        "ec:invalid",
        "runoff-ph:out-of-range",
        "runoff-ec:out-of-range",
        "tds:invalid",
      ]),
    );
    expect(e.isValidForAiContext).toBe(false);
  });

  it("normalizes watering amount across ml and l units", () => {
    const [a] = normalizeDiaryEntries({
      rawEntries: [baseRow({ details: { watering_amount_l: 2.5 } })],
    });
    expect(a.details.wateringAmountMl).toBe(2500);

    const [b] = normalizeDiaryEntries({
      rawEntries: [baseRow({ details: { watering_amount: 750 } })],
    });
    expect(b.details.wateringAmountMl).toBe(750);

    const [c] = normalizeDiaryEntries({
      rawEntries: [baseRow({ details: { watering_amount_ml: -10 } })],
    });
    expect(c.details.wateringAmountMl).toBeUndefined();
    expect(c.warnings).toContain("watering:invalid");
  });

  it("normalizes sensor_snapshot and flags invalid fields", () => {
    const [e] = normalizeDiaryEntries({
      rawEntries: [
        baseRow({
          details: {
            sensor_snapshot: { at: "2025-01-15T11:55:00Z", temp: "bad", rh: 50 },
          },
        }),
      ],
    });
    expect(e.details.sensorSnapshot?.rh).toBe(50);
    expect(e.details.sensorSnapshot?.temp).toBeUndefined();
    expect(e.warnings).toContain("sensor-snapshot:temp:invalid");
  });

  it("preserves unknown details keys under extras", () => {
    const [e] = normalizeDiaryEntries({
      rawEntries: [
        baseRow({ details: { ph: 6.5, future_field: "abc", meta: { ok: 1 } } }),
      ],
    });
    expect(e.details.extras).toEqual({ future_field: "abc", meta: { ok: 1 } });
  });

  it("returns null on entries without a usable id and skips them in bulk", () => {
    expect(normalizeDiaryEntry({ entry_at: "2025-01-15T12:00:00Z" })).toBeNull();
    const list = normalizeDiaryEntries({
      rawEntries: [baseRow(), { entry_at: "2025-01-15T12:00:00Z" }, null, "x"],
    });
    expect(list).toHaveLength(1);
  });

  it("sorts newest-first with stable id tie-breaker", () => {
    const rows = [
      baseRow({ id: "b", entry_at: "2025-01-10T00:00:00Z" }),
      baseRow({ id: "a", entry_at: "2025-01-10T00:00:00Z" }),
      baseRow({ id: "c", entry_at: "2025-02-01T00:00:00Z" }),
      baseRow({ id: "d", entry_at: "not-a-date" }),
    ];
    const sorted = sortDiaryEntriesNewestFirst(
      normalizeDiaryEntries({ rawEntries: rows }),
    );
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("AI context validity is false when details are malformed", () => {
    const [e] = normalizeDiaryEntries({
      rawEntries: [baseRow({ details: "not-json" })],
    });
    expect(e.isValidForAiContext).toBe(false);
  });

  it("AI context validity is false when entry_at is invalid", () => {
    const [e] = normalizeDiaryEntries({
      rawEntries: [baseRow({ entry_at: "garbage" })],
    });
    expect(e.isValidForAiContext).toBe(false);
  });

  it("is deterministic for identical input", () => {
    const a = normalizeDiaryEntries({
      rawEntries: [baseRow(), baseRow({ id: "entry-2" })],
      growStartedAt: GROW_START,
    });
    const b = normalizeDiaryEntries({
      rawEntries: [baseRow(), baseRow({ id: "entry-2" })],
      growStartedAt: GROW_START,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not leak raw payload values into warning messages", () => {
    const [e] = normalizeDiaryEntries({
      rawEntries: [
        baseRow({
          note: "SECRET-NOTE",
          details: {
            ph: "BAD-PH-TOKEN",
            ec: "BAD-EC-TOKEN",
            sensor_snapshot: { temp: "BAD-TEMP-TOKEN" },
          },
        }),
      ],
    });
    const blob = JSON.stringify(e.warnings);
    expect(blob).not.toMatch(/BAD-PH-TOKEN|BAD-EC-TOKEN|BAD-TEMP-TOKEN|SECRET-NOTE/);
  });
});
