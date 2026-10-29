/**
 * VER-300 copy pins for alertTargetContextRules toggle helpers.
 * UI wiring is covered in alerts-historical-targets-toggle.test.tsx (locked).
 */
import { describe, expect, it } from "vitest";
import {
  alertTargetHiddenCountLabel,
  alertTargetHistoricalToggleLabel,
} from "@/lib/alertTargetContextRules";

describe("alertTargetHistoricalToggleLabel", () => {
  it("names show/hide with the archived-target count", () => {
    expect(alertTargetHistoricalToggleLabel(false, 2)).toBe("Show archived targets (2)");
    expect(alertTargetHistoricalToggleLabel(true, 2)).toBe("Hide archived targets (2)");
  });
});

describe("alertTargetHiddenCountLabel", () => {
  it("returns null when nothing is hidden and pins the visible count otherwise", () => {
    expect(alertTargetHiddenCountLabel(0)).toBeNull();
    expect(alertTargetHiddenCountLabel(3)).toBe("3 hidden for archived tents/plants");
  });
});
