import { describe, expect, it } from "vitest";

import {
  buildFeedLogCsv,
  createDefaultFeedLogState,
  escapeCsvField,
} from "@/lib/athenaFeedLogRules";

describe("athena feed log csv formula guard", () => {
  it("exports plain numbers without a leading apostrophe", () => {
    expect(escapeCsvField("+1.50")).toBe("+1.50");
    expect(escapeCsvField("-0.5")).toBe("-0.5");
    expect(escapeCsvField("2.5")).toBe("2.5");

    const state = createDefaultFeedLogState();
    state.weeks[0].products[0] = { planned: "1", actual: "2.5" };
    const csv = buildFeedLogCsv(state);
    expect(csv).toContain("+1.50");
    expect(csv).not.toContain("'+1.50");
    expect(csv).toContain("2.5");
    expect(csv).not.toContain("'2.5");
  });

  it("still prefixes formulas, at-signs, tab, CR, and non-numeric plus or minus", () => {
    expect(escapeCsvField("=1+1")).toBe("'=1+1");
    expect(escapeCsvField("@x")).toBe("'@x");
    expect(escapeCsvField("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvField("-2+3")).toBe("'-2+3");
    expect(escapeCsvField("\t=1")).toBe("'\t=1");
    expect(escapeCsvField("\r=1")).toBe('"\'\r=1"');
  });
});
