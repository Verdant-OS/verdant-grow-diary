/**
 * #2171 (QA on production ebaf1b6a, 2/2): a new plant has no health
 * assessment, so its health is "unknown" (the column default) or missing.
 * The plant page and the /plants card both read plantHealthStatusLabel.
 */
import { describe, expect, it } from "vitest";
import { PLANT_HEALTH_NOT_ASSESSED_LABEL, plantHealthStatusLabel } from "@/lib/plantHealthRules";

describe("plantHealthStatusLabel", () => {
  it.each([null, undefined, "", "  ", "unknown", "Unknown", "not_enough_evidence", 3, {}])(
    "reads %s as Not assessed yet",
    (value) => {
      expect(plantHealthStatusLabel(value)).toBe("Not assessed yet");
      expect(plantHealthStatusLabel(value)).toBe(PLANT_HEALTH_NOT_ASSESSED_LABEL);
    },
  );

  it.each(["healthy", "watch", "issue"])("shows a recorded %s assessment as stored", (value) => {
    expect(plantHealthStatusLabel(value)).toBe(value);
  });

  it("never returns unknown or a raw ISO-like string", () => {
    for (const value of [null, undefined, "unknown", "2026-10-21T15:51:54.957+00:00"]) {
      const label = plantHealthStatusLabel(value);
      expect(label.toLowerCase()).not.toBe("unknown");
      expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    }
  });
});
