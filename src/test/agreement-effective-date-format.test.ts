import { describe, expect, it } from "vitest";
import { formatAgreementEffectiveDate } from "@/constants/agreements";

describe("formatAgreementEffectiveDate (#1995)", () => {
  it("rejects non-YYYY-MM-DD input", () => {
    expect(() => formatAgreementEffectiveDate("July 13, 2026")).toThrow(
      /Agreement effective date must be YYYY-MM-DD/,
    );
    expect(() => formatAgreementEffectiveDate("2026-7-13")).toThrow(
      /Agreement effective date must be YYYY-MM-DD/,
    );
    expect(() => formatAgreementEffectiveDate("")).toThrow(
      /Agreement effective date must be YYYY-MM-DD/,
    );
  });

  it("formats the same calendar day regardless of host timezone", () => {
    const previousTz = process.env.TZ;
    try {
      for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "America/Sao_Paulo"]) {
        process.env.TZ = tz;
        expect(formatAgreementEffectiveDate("2026-07-13")).toBe("July 13, 2026");
        expect(formatAgreementEffectiveDate("2025-12-31")).toBe("December 31, 2025");
      }
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });
});
