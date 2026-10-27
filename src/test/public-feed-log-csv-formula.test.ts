import { describe, expect, it } from "vitest";

import { escapeCsvField } from "@/lib/publicFeedLogRules";

describe("feed log CSV formula guard", () => {
  it("prefixes formula-leading cells before quoting", () => {
    expect(escapeCsvField("+1.50")).toBe("+1.50");
    expect(escapeCsvField("-0.5")).toBe("-0.5");
    expect(escapeCsvField("2.5")).toBe("2.5");
    expect(escapeCsvField("=1+1")).toBe("'=1+1");
    expect(escapeCsvField("@x")).toBe("'@x");
    expect(escapeCsvField("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvField("-2+3")).toBe("'-2+3");
    expect(escapeCsvField("@sum")).toBe("'@sum");
    expect(escapeCsvField("\tcmd")).toBe("'\tcmd");
    expect(escapeCsvField("\rnote")).toBe('"\'\rnote"');
    expect(escapeCsvField("=a,b")).toBe('"\'=a,b"');
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField(null)).toBe("");
  });
});
