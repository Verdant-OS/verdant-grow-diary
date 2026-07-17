import { describe, expect, it } from "vitest";

import {
  SIGNUP_ACQUISITION_METADATA_KEY,
  buildAttributedSignupPath,
  buildSignupEmailRedirectUrl,
  buildSignupUserMetadata,
  resolveSignupAcquisitionSource,
} from "@/lib/signupAcquisitionRules";

describe("signup acquisition rules", () => {
  it("builds a deterministic signup-first handoff from a fixed source", () => {
    const first = buildAttributedSignupPath({ source: "landing_page" });
    const second = buildAttributedSignupPath({ source: "landing_page" });

    expect(first).toBe(second);
    expect(first).toBe(
      "/auth?mode=signup&utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch",
    );
    expect(resolveSignupAcquisitionSource(first.split("?")[1])).toBe("landing_page");
  });

  it("builds and resolves the fixed CSV-history acquisition handoff", () => {
    const path = buildAttributedSignupPath({ source: "csv_history" });

    expect(path).toBe(
      "/auth?mode=signup&utm_source=csv_history&utm_medium=owned&utm_campaign=csv_history",
    );
    expect(resolveSignupAcquisitionSource(path.split("?")[1])).toBe("csv_history");
    expect(buildSignupUserMetadata(path.split("?")[1])).toEqual({
      [SIGNUP_ACQUISITION_METADATA_KEY]: "csv_history",
    });
  });

  it("preserves a safe paid-plan return path and resolves nested attribution", () => {
    const redirectTo =
      "/pricing?plan=founder_lifetime&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch";
    const path = buildAttributedSignupPath({ source: "founder_share", redirectTo });
    const params = new URL(path, "https://verdantgrowdiary.com").searchParams;

    expect(params.get("mode")).toBe("signup");
    expect(params.get("redirectTo")).toBe(redirectTo);
    expect(resolveSignupAcquisitionSource(params)).toBe("founder_share");
    expect(buildSignupEmailRedirectUrl("https://verdantgrowdiary.com", redirectTo)).toBe(
      `https://verdantgrowdiary.com${redirectTo}`,
    );
  });

  it("extracts an exact nested tuple when the auth URL has no direct campaign", () => {
    const nested = new URLSearchParams({
      mode: "signup",
      redirectTo: "/pricing?utm_source=context_check&utm_medium=owned&utm_campaign=context_check",
    });
    expect(resolveSignupAcquisitionSource(nested)).toBe("context_check");
    expect(buildSignupUserMetadata(nested)).toEqual({
      [SIGNUP_ACQUISITION_METADATA_KEY]: "context_check",
    });
  });

  it("fails closed for unknown, mismatched, PII-bearing, and off-origin input", () => {
    for (const query of [
      "mode=signup&utm_source=reddit&utm_medium=referral&utm_campaign=paid_launch",
      "mode=signup&utm_source=landing_page&utm_medium=referral&utm_campaign=paid_launch",
      "mode=signup&email=grower%40example.com&token=secret",
      "mode=signup&redirectTo=https%3A%2F%2Fevil.example%2Fpricing%3Futm_source%3Dlanding_page%26utm_medium%3Downed%26utm_campaign%3Dpaid_launch",
    ]) {
      expect(resolveSignupAcquisitionSource(query)).toBeNull();
      expect(buildSignupUserMetadata(query)).toBeUndefined();
    }

    const path = buildAttributedSignupPath({
      source: "pricing_page",
      redirectTo: "https://evil.example/checkout",
    });
    expect(path).not.toContain("redirectTo");
    expect(path).not.toContain("evil");
    expect(buildSignupEmailRedirectUrl("https://verdantgrowdiary.com", "//evil.example")).toBe(
      "https://verdantgrowdiary.com/onboarding",
    );
  });
});
