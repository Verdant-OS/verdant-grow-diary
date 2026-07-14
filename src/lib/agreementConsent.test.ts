import { describe, it, expect } from "vitest";
import { computeAgreementGaps, buildAcceptanceRows } from "./agreementConsent";
import type { AgreementVersion } from "@/constants/agreements";

const AGREEMENTS: AgreementVersion[] = [
  { type: "terms", version: "v2", effectiveDate: "2026-07-13", label: "Terms", href: "/terms" },
  { type: "privacy", version: "v2", effectiveDate: "2026-07-13", label: "Privacy", href: "/privacy" },
];

describe("computeAgreementGaps", () => {
  it("returns all agreements when user has none", () => {
    expect(computeAgreementGaps([], AGREEMENTS)).toHaveLength(2);
  });

  it("returns empty when user accepted current versions", () => {
    const rows = [
      { agreement_type: "terms" as const, version: "v2" },
      { agreement_type: "privacy" as const, version: "v2" },
    ];
    expect(computeAgreementGaps(rows, AGREEMENTS)).toEqual([]);
  });

  it("flags stale acceptance as gap with prior version noted", () => {
    const rows = [
      { agreement_type: "terms" as const, version: "v1" },
      { agreement_type: "privacy" as const, version: "v2" },
    ];
    const gaps = computeAgreementGaps(rows, AGREEMENTS);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].agreement.type).toBe("terms");
    expect(gaps[0].previouslyAcceptedVersion).toBe("v1");
  });

  it("handles null/undefined defensively", () => {
    expect(computeAgreementGaps(null, AGREEMENTS)).toHaveLength(2);
    expect(computeAgreementGaps(undefined, AGREEMENTS)).toHaveLength(2);
  });

  it("previouslyAcceptedVersion is null for never-accepted", () => {
    const gaps = computeAgreementGaps([], AGREEMENTS);
    expect(gaps.every((g) => g.previouslyAcceptedVersion === null)).toBe(true);
  });
});

describe("buildAcceptanceRows", () => {
  it("returns one row per agreement scoped to user", () => {
    const rows = buildAcceptanceRows("user-1", AGREEMENTS);
    expect(rows).toEqual([
      { user_id: "user-1", agreement_type: "terms", version: "v2", effective_date: "2026-07-13" },
      { user_id: "user-1", agreement_type: "privacy", version: "v2", effective_date: "2026-07-13" },
    ]);
  });
});
