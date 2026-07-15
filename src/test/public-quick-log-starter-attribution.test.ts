/**
 * Public Quick Log Starter — attribution / outbound-URL contract.
 *
 * This is the contract the search-to-first-value guide cluster builds on:
 * the starter path literal, the signup CTA shape, UTM allow-listing, and
 * the sanitizeAuthRedirect round-trip are pinned here the same way
 * REQUIRED_GUIDE_URLS pins guide URLs.
 */
import { describe, it, expect } from "vitest";
import {
  PUBLIC_QUICK_LOG_STARTER_PATH,
  PUBLIC_QUICK_LOG_STARTER_SIGNUP_REDIRECT,
  buildQuickLogStarterSignupHref,
} from "@/lib/quickLogStarterLinks";
import { sanitizeAuthRedirect } from "@/lib/authRedirectRules";
import { SAFE_UTM_KEYS } from "@/lib/utm/preserveUtm";

describe("cluster contract literals", () => {
  it("pins the starter path (six guides will hardcode this)", () => {
    expect(PUBLIC_QUICK_LOG_STARTER_PATH).toBe("/quick-log");
  });

  it("keeps the path short enough that GA's 20+-char segment redaction never hides it", () => {
    for (const segment of PUBLIC_QUICK_LOG_STARTER_PATH.split("/").filter(Boolean)) {
      expect(segment.length).toBeLessThan(20);
    }
  });

  it("pins the signup redirect target to Auth's own default", () => {
    expect(PUBLIC_QUICK_LOG_STARTER_SIGNUP_REDIRECT).toBe("/onboarding");
  });
});

describe("buildQuickLogStarterSignupHref", () => {
  it("emits the exact pinned CTA with no inbound UTMs", () => {
    expect(buildQuickLogStarterSignupHref("")).toBe("/auth?mode=signup&redirectTo=%2Fonboarding");
    expect(buildQuickLogStarterSignupHref(null)).toBe("/auth?mode=signup&redirectTo=%2Fonboarding");
    expect(buildQuickLogStarterSignupHref(undefined)).toBe(
      "/auth?mode=signup&redirectTo=%2Fonboarding",
    );
  });

  it("appends ONLY allow-listed UTM params, in stable order, capped at 256 chars", () => {
    const href = buildQuickLogStarterSignupHref(
      "?utm_content=vpd-guide&utm_source=organic_guide&ref=evil&session=tok&utm_medium=owned",
    );
    expect(href).toBe(
      "/auth?mode=signup&redirectTo=%2Fonboarding&utm_source=organic_guide&utm_medium=owned&utm_content=vpd-guide",
    );
    const long = buildQuickLogStarterSignupHref(`?utm_campaign=${"x".repeat(400)}`);
    const params = new URLSearchParams(long.split("?")[1]);
    expect(params.get("utm_campaign")?.length).toBe(256);
  });

  it("never emits params outside {mode, redirectTo} + SAFE_UTM_KEYS", () => {
    const href = buildQuickLogStarterSignupHref(
      "?utm_source=a&utm_medium=b&utm_campaign=c&utm_content=d&utm_term=e&redirectTo=%2Fevil&mode=signin&note=PII",
    );
    const params = new URLSearchParams(href.split("?")[1]);
    const allowed = new Set(["mode", "redirectTo", ...SAFE_UTM_KEYS]);
    for (const key of params.keys()) {
      expect(allowed.has(key), `unexpected param ${key}`).toBe(true);
    }
    // Inbound attempts to override machine params are ignored.
    expect(params.get("mode")).toBe("signup");
    expect(params.get("redirectTo")).toBe("/onboarding");
  });

  it("emits a redirectTo that survives sanitizeAuthRedirect unchanged", () => {
    for (const search of ["", "?utm_source=organic_guide&utm_medium=owned"]) {
      const href = buildQuickLogStarterSignupHref(search);
      const redirect = new URLSearchParams(href.split("?")[1]).get("redirectTo");
      expect(redirect).not.toBeNull();
      expect(sanitizeAuthRedirect(redirect)).toBe(redirect);
    }
  });

  it("targets /auth directly (never a signup alias route)", () => {
    expect(buildQuickLogStarterSignupHref("").startsWith("/auth?")).toBe(true);
  });
});
