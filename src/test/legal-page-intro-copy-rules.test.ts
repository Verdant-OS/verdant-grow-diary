/**
 * Pure resolver for legal-page intro closing copy (Terms vs Privacy/Refund).
 * Complements legal-page-intro-copy.test.tsx integration coverage.
 */
import { describe, it, expect } from "vitest";
import {
  LEGAL_PAGE_DEFAULT_INTRO_CLOSING,
  LEGAL_PAGE_TERMS_INTRO_CLOSING,
  resolveLegalPageIntroClosing,
} from "@/lib/legalPageIntroCopyRules";

describe("resolveLegalPageIntroClosing", () => {
  it("/terms returns the terms closing line", () => {
    expect(resolveLegalPageIntroClosing("/terms")).toBe(LEGAL_PAGE_TERMS_INTRO_CLOSING);
  });

  it.each(["/privacy", "/refund"])("%s returns the policy closing line", (path) => {
    expect(resolveLegalPageIntroClosing(path)).toBe(LEGAL_PAGE_DEFAULT_INTRO_CLOSING);
    expect(resolveLegalPageIntroClosing(path)).not.toBe(LEGAL_PAGE_TERMS_INTRO_CLOSING);
  });

  it("unknown paths default to policy wording (future legal pages)", () => {
    expect(resolveLegalPageIntroClosing("/future-policy")).toBe(LEGAL_PAGE_DEFAULT_INTRO_CLOSING);
  });
});
