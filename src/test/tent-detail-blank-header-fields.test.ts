import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatTentHeaderDescription, formatTentLightLine } from "@/lib/tentDetailBlankFieldRules";

const TENT_DETAIL = readFileSync(resolve(__dirname, "../pages/TentDetail.tsx"), "utf8");

describe("tent detail blank header and light line", () => {
  it("omits the description when brand and size are both blank", () => {
    expect(formatTentHeaderDescription("", "")).toBe("");
    expect(formatTentHeaderDescription(null, undefined)).toBe("");
    expect(formatTentHeaderDescription("  ", " · ")).toBe("");
  });

  it("joins only the brand or size that is present", () => {
    expect(formatTentHeaderDescription("AC Infinity", "")).toBe("AC Infinity");
    expect(formatTentHeaderDescription("", "2x4")).toBe("2x4");
    expect(formatTentHeaderDescription("  Gorilla  ", "  4x4  ")).toBe("Gorilla · 4x4");
  });

  it("hides a missing schedule and a zero or blank wattage", () => {
    expect(formatTentLightLine("", 0)).toBe("");
    expect(formatTentLightLine(null, null)).toBe("");
    expect(formatTentLightLine("   ", 0)).toBe("");
  });

  it("renders schedule and wattage only when each is present", () => {
    expect(formatTentLightLine("18/6", 0)).toBe("18/6");
    expect(formatTentLightLine("", 150)).toBe("150W");
    expect(formatTentLightLine("12/12", 240)).toBe("12/12 · 240W");
  });

  it("TentDetail renders the header and light line through those helpers", () => {
    expect(TENT_DETAIL).toContain("formatTentHeaderDescription(tent.brand, tent.size)");
    expect(TENT_DETAIL).toContain("formatTentLightLine(tent.light.schedule, tent.light.wattage)");
    expect(TENT_DETAIL).not.toContain("`${tent.brand} · ${tent.size}`");
    expect(TENT_DETAIL).not.toContain("{tent.light.schedule} · {tent.light.wattage}W");
  });
});
