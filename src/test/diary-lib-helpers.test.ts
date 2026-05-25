/**
 * Unit tests for src/lib/diary.ts
 *
 * Pure function tests: getEventType, EVENT_TYPE_MAP, EVENT_TYPES.
 * No I/O, no Supabase, no React.
 */
import { describe, it, expect } from "vitest";
import { getEventType, EVENT_TYPE_MAP, EVENT_TYPES } from "@/lib/diary";

describe("EVENT_TYPES constant", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(EVENT_TYPES)).toBe(true);
    expect(EVENT_TYPES.length).toBeGreaterThan(0);
  });

  it("every entry has a non-empty value, label, icon, and tone", () => {
    for (const et of EVENT_TYPES) {
      expect(typeof et.value).toBe("string");
      expect(et.value.length).toBeGreaterThan(0);
      expect(typeof et.label).toBe("string");
      expect(et.label.length).toBeGreaterThan(0);
      expect(et.icon).toBeTruthy();
      expect(typeof et.tone).toBe("string");
      expect(et.tone.length).toBeGreaterThan(0);
    }
  });

  it("all event type values are unique", () => {
    const values = EVENT_TYPES.map((e) => e.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("includes all expected event type values", () => {
    const values = new Set(EVENT_TYPES.map((e) => e.value));
    const expected = [
      "observation",
      "watering",
      "feeding",
      "training",
      "defoliation",
      "transplant",
      "measurement",
      "environment",
      "photo",
      "diagnosis",
      "pest_disease",
      "harvest",
      "reminder",
      "other",
    ];
    for (const v of expected) {
      expect(values.has(v)).toBe(true);
    }
  });
});

describe("EVENT_TYPE_MAP constant", () => {
  it("is keyed by event value strings", () => {
    for (const et of EVENT_TYPES) {
      expect(EVENT_TYPE_MAP[et.value]).toBeDefined();
      expect(EVENT_TYPE_MAP[et.value].value).toBe(et.value);
      expect(EVENT_TYPE_MAP[et.value].label).toBe(et.label);
    }
  });

  it("contains exactly the same entries as EVENT_TYPES", () => {
    expect(Object.keys(EVENT_TYPE_MAP)).toHaveLength(EVENT_TYPES.length);
  });

  it("'observation' entry has the expected label", () => {
    expect(EVENT_TYPE_MAP["observation"].label).toBe("Observation");
  });

  it("'watering' entry has the expected label", () => {
    expect(EVENT_TYPE_MAP["watering"].label).toBe("Watering");
  });
});

describe("getEventType", () => {
  it("returns the matching entry for every known event value", () => {
    for (const et of EVENT_TYPES) {
      const result = getEventType(et.value);
      expect(result.value).toBe(et.value);
      expect(result.label).toBe(et.label);
    }
  });

  it("returns the 'observation' fallback for an unrecognised string", () => {
    const fallback = getEventType("totally_unknown");
    expect(fallback.value).toBe("observation");
  });

  it("returns the 'observation' fallback for null", () => {
    const fallback = getEventType(null);
    expect(fallback.value).toBe("observation");
  });

  it("returns the 'observation' fallback for undefined", () => {
    const fallback = getEventType(undefined);
    expect(fallback.value).toBe("observation");
  });

  it("returns the 'observation' fallback for empty string", () => {
    const fallback = getEventType("");
    expect(fallback.value).toBe("observation");
  });

  it("returns the correct entry for 'watering'", () => {
    const r = getEventType("watering");
    expect(r.value).toBe("watering");
    expect(r.label).toBe("Watering");
  });

  it("returns the correct entry for 'feeding'", () => {
    const r = getEventType("feeding");
    expect(r.value).toBe("feeding");
    expect(r.label).toBe("Feeding");
  });

  it("returns the correct entry for 'harvest'", () => {
    const r = getEventType("harvest");
    expect(r.value).toBe("harvest");
    expect(r.label).toBe("Harvest");
  });

  it("returns the correct entry for 'pest_disease'", () => {
    const r = getEventType("pest_disease");
    expect(r.value).toBe("pest_disease");
    expect(r.label).toBe("Pest / Disease");
  });

  it("returned entries always have an icon and tone", () => {
    const known = getEventType("training");
    expect(known.icon).toBeTruthy();
    expect(known.tone.length).toBeGreaterThan(0);

    const unknown = getEventType("bogus");
    expect(unknown.icon).toBeTruthy();
    expect(unknown.tone.length).toBeGreaterThan(0);
  });
});
