import { describe, expect, it } from "vitest";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  buildCultivarSummaryRows,
  formatCultivarSeedExpression,
  formatReportedPercentRange,
} from "@/lib/cultivarReferenceViewModel";

describe("cultivarReferenceViewModel", () => {
  it("formats reported ranges without inventing missing values", () => {
    expect(formatReportedPercentRange(27, 30)).toBe("27–30% reported");
    expect(formatReportedPercentRange(20, 20)).toBe("20% reported");
    expect(formatReportedPercentRange(null, null)).toBe("Information limited");
  });

  it("formats seed expression for grower-facing reference copy", () => {
    expect(formatCultivarSeedExpression("clone_only")).toBe("Clone-only");
    expect(formatCultivarSeedExpression("unknown")).toBe("Information limited");
  });

  it("builds deterministic source-backed summary rows", () => {
    const gg4 = VERDANT_CULTIVARS.find((profile) => profile.slug === "gg4")!;
    const first = buildCultivarSummaryRows(gg4, "Jul 22, 2026");
    const second = buildCultivarSummaryRows(gg4, "Jul 22, 2026");
    expect(second).toEqual(first);
    expect(first).toEqual(
      expect.arrayContaining([
        { label: "Seed expression", value: "Clone-only" },
        { label: "Reported THC", value: "27–30% reported" },
        { label: "Guide version", value: "v1" },
      ]),
    );
  });
});
