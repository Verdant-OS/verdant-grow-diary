import { describe, it, expect } from "vitest";
import {
  describeSettingsTile,
  settingsTileAriaLabel,
} from "@/lib/settingsTilesRules";

describe("settingsTilesRules", () => {
  it("labels available tiles as live", () => {
    const b = describeSettingsTile("available");
    expect(b.label).toBe("Available");
    expect(b.helper).toMatch(/live/i);
  });

  it("marks coming-soon tiles as not yet saved", () => {
    const b = describeSettingsTile("coming_soon");
    expect(b.label).toMatch(/coming soon/i);
    expect(b.helper).toMatch(/not saved|future/i);
  });

  it("marks disabled tiles as not configured", () => {
    const b = describeSettingsTile("disabled");
    expect(b.label).toMatch(/not configured/i);
    expect(b.helper).toMatch(/no data/i);
  });

  it("builds descriptive aria labels", () => {
    expect(settingsTileAriaLabel("Spider Farmer", "disabled")).toBe(
      "Spider Farmer — Not configured",
    );
  });

  it("returns deterministic output for repeated calls", () => {
    expect(describeSettingsTile("available")).toEqual(
      describeSettingsTile("available"),
    );
  });
});
