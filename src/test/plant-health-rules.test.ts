import { describe, expect, it } from "vitest";
import {
  buildPlantHealthUpdate,
  editablePlantHealth,
  normalizePlantHealth,
  plantHealthTone,
} from "@/lib/plantHealthRules";

describe("recorded plant health rules", () => {
  it.each([null, undefined, "", " ", "unknown", "Healthy", " healthy", "weird", true, 0, {}, []])(
    "preserves missing or invalid health %j as neutral unknown without a database write",
    (value) => {
      expect(normalizePlantHealth(value)).toBe("unknown");
      expect(plantHealthTone(value)).toBe("neutral");
      expect(editablePlantHealth(value)).toBe("");
      expect(buildPlantHealthUpdate(value)).toEqual({});
      expect(buildPlantHealthUpdate(value)).not.toHaveProperty("health");
    },
  );

  it.each([
    ["healthy", "success"],
    ["watch", "warning"],
    ["issue", "destructive"],
  ] as const)("preserves the supported stored value %s", (value, tone) => {
    expect(normalizePlantHealth(value)).toBe(value);
    expect(plantHealthTone(value)).toBe(tone);
    expect(editablePlantHealth(value)).toBe(value);
    expect(buildPlantHealthUpdate(value)).toEqual({ health: value });
  });

  it("does not infer an assessment from an object describing one", () => {
    const value = Object.freeze({ health: "healthy", assessed: true });
    expect(normalizePlantHealth(value)).toBe("unknown");
    expect(buildPlantHealthUpdate(value)).toEqual({});
    expect(value).toEqual({ health: "healthy", assessed: true });
  });

  it("is repeatable and does not share mutable update objects", () => {
    for (const value of [null, "unknown", "healthy", "watch", "issue"]) {
      expect(normalizePlantHealth(value)).toBe(normalizePlantHealth(value));
      expect(plantHealthTone(value)).toBe(plantHealthTone(value));
      const first = buildPlantHealthUpdate(value);
      const second = buildPlantHealthUpdate(value);
      expect(second).toEqual(first);
      expect(second).not.toBe(first);
    }
  });
});
