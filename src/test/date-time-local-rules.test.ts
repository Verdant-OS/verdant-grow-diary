import { describe, expect, it } from "vitest";

import { toDateTimeLocalInputValue } from "@/lib/dateTimeLocalRules";

describe("date-time local input rules", () => {
  it("preserves the local wall-clock fields and omits seconds", () => {
    const localDate = new Date(2026, 6, 5, 9, 7, 45);

    expect(toDateTimeLocalInputValue(localDate)).toBe("2026-07-05T09:07");
  });

  it("returns an empty value for an invalid date", () => {
    expect(toDateTimeLocalInputValue(new Date(Number.NaN))).toBe("");
  });
});
