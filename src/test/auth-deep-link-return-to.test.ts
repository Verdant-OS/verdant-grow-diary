// Signed-out deep-link return-to chain:
//   protected route → /welcome?redirectTo=<path> → /auth?redirectTo=<path>
//   → restored after sign-in.
//
// Open-redirect safety: a return-to value is only honored when it survives
// sanitizeAuthRedirect unchanged AND its path portion matches a route in the
// app's own manifest (positive allowlist). Everything else falls back to the
// plain landing/default target.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSignedOutRedirect,
  isKnownAppRoutePath,
  resolveKnownRouteReturnTo,
  SIGNED_OUT_LANDING,
} from "@/lib/authRedirectRules";

const ROOT = resolve(__dirname, "..");
const APP_SHELL = readFileSync(resolve(ROOT, "components/AppShell.tsx"), "utf8");
const LANDING = readFileSync(resolve(ROOT, "pages/Landing.tsx"), "utf8");
const AUTH = readFileSync(resolve(ROOT, "pages/Auth.tsx"), "utf8");

describe("isKnownAppRoutePath — manifest allowlist matching", () => {
  it("matches static manifest routes", () => {
    expect(isKnownAppRoutePath("/plants")).toBe(true);
    expect(isKnownAppRoutePath("/alerts")).toBe(true);
    expect(isKnownAppRoutePath("/reports")).toBe(true);
    expect(isKnownAppRoutePath("/welcome")).toBe(true);
    expect(isKnownAppRoutePath("/dashboard")).toBe(true);
  });

  it("matches dynamic-segment routes with a concrete value", () => {
    expect(isKnownAppRoutePath("/plants/abc-123")).toBe(true);
    expect(isKnownAppRoutePath("/alerts/42")).toBe(true);
    expect(isKnownAppRoutePath("/reports/post-grow/g1")).toBe(true);
  });

  it("tolerates a single trailing slash", () => {
    expect(isKnownAppRoutePath("/plants/")).toBe(true);
  });

  it("rejects unknown paths — the '*' catch-all never matches", () => {
    expect(isKnownAppRoutePath("/definitely-not-a-route")).toBe(false);
    expect(isKnownAppRoutePath("/plants/a/b")).toBe(false);
    expect(isKnownAppRoutePath("/plants//")).toBe(false);
    expect(isKnownAppRoutePath("plants")).toBe(false);
    expect(isKnownAppRoutePath("")).toBe(false);
  });
});

describe("resolveKnownRouteReturnTo — strict return-to resolver", () => {
  it("returns manifest-known paths unchanged, query preserved", () => {
    expect(resolveKnownRouteReturnTo("/plants")).toBe("/plants");
    expect(resolveKnownRouteReturnTo("/actions?filter=open")).toBe("/actions?filter=open");
    expect(resolveKnownRouteReturnTo("/pricing?plan=pro_annual")).toBe("/pricing?plan=pro_annual");
    expect(resolveKnownRouteReturnTo("/dashboard?growId=g1")).toBe("/dashboard?growId=g1");
  });

  it("rejects off-origin and scheme vectors", () => {
    expect(resolveKnownRouteReturnTo("https://evil.example/plants")).toBeNull();
    expect(resolveKnownRouteReturnTo("//evil.example")).toBeNull();
    expect(resolveKnownRouteReturnTo("/\\evil.example")).toBeNull();
    expect(resolveKnownRouteReturnTo("javascript:alert(1)")).toBeNull();
    expect(resolveKnownRouteReturnTo("/javascript:alert(1)")).toBeNull();
  });

  it("rejects syntactically-clean but unknown paths (positive allowlist)", () => {
    expect(resolveKnownRouteReturnTo("/evil-page")).toBeNull();
    expect(resolveKnownRouteReturnTo("/plants/../../etc")).toBeNull();
  });

  it("rejects non-strings and empty values", () => {
    expect(resolveKnownRouteReturnTo(null)).toBeNull();
    expect(resolveKnownRouteReturnTo(undefined)).toBeNull();
    expect(resolveKnownRouteReturnTo("")).toBeNull();
    expect(resolveKnownRouteReturnTo(42)).toBeNull();
  });
});

describe("buildSignedOutRedirect — AppShell signed-out target", () => {
  it("preserves a protected deep link as an encoded redirectTo", () => {
    expect(buildSignedOutRedirect("/plants", "")).toBe("/welcome?redirectTo=%2Fplants");
    expect(buildSignedOutRedirect("/alerts/42", "")).toBe("/welcome?redirectTo=%2Falerts%2F42");
    expect(buildSignedOutRedirect("/actions", "?filter=open")).toBe(
      "/welcome?redirectTo=%2Factions%3Ffilter%3Dopen",
    );
    expect(buildSignedOutRedirect("/dashboard", "?growId=g1")).toBe(
      "/welcome?redirectTo=%2Fdashboard%3FgrowId%3Dg1",
    );
  });

  it("preserves the location hash end-to-end (capture → restore)", () => {
    // Capture side: hash rides along inside the encoded redirectTo…
    expect(buildSignedOutRedirect("/sensors", "", "#manual-reading")).toBe(
      "/welcome?redirectTo=%2Fsensors%23manual-reading",
    );
    expect(buildSignedOutRedirect("/actions", "?filter=open", "#row-3")).toBe(
      "/welcome?redirectTo=%2Factions%3Ffilter%3Dopen%23row-3",
    );
    // …and the consume side hands it back intact (round trip).
    expect(resolveKnownRouteReturnTo("/sensors#manual-reading")).toBe("/sensors#manual-reading");
    expect(resolveKnownRouteReturnTo("/actions?filter=open#row-3")).toBe(
      "/actions?filter=open#row-3",
    );
    // Hash never affects the manifest match — unknown paths stay rejected.
    expect(resolveKnownRouteReturnTo("/not-a-route#anchor")).toBeNull();
  });

  it("falls back to plain /welcome for the root, the landing itself, and unknown paths", () => {
    expect(buildSignedOutRedirect("/", "")).toBe(SIGNED_OUT_LANDING);
    expect(buildSignedOutRedirect("/welcome", "")).toBe(SIGNED_OUT_LANDING);
    expect(buildSignedOutRedirect("/welcome", "?redirectTo=%2Fplants")).toBe(SIGNED_OUT_LANDING);
    expect(buildSignedOutRedirect("/welcome", "", "#features")).toBe(SIGNED_OUT_LANDING);
    expect(buildSignedOutRedirect("/not-a-route", "")).toBe(SIGNED_OUT_LANDING);
  });

  it("never emits an off-origin or unsanitized target", () => {
    expect(buildSignedOutRedirect("//evil.example", "")).toBe(SIGNED_OUT_LANDING);
    expect(buildSignedOutRedirect("/plants", "?q=a b")).toBe(SIGNED_OUT_LANDING);
  });
});

describe("Return-to wiring — static safety", () => {
  it("AppShell builds its signed-out target from the full current location (incl. hash)", () => {
    expect(APP_SHELL).toMatch(
      /const signedOutRedirect = buildSignedOutRedirect\(\s*location\.pathname,\s*location\.search,\s*location\.hash,?\s*\)/,
    );
    expect(APP_SHELL).toMatch(/useRequireAuth\(signedOutRedirect\)/);
    expect(APP_SHELL).toMatch(/nav\(signedOutRedirect/);
  });

  it("Landing forwards a validated redirectTo into its sign-in CTAs only", () => {
    expect(LANDING).toMatch(/resolveKnownRouteReturnTo\(searchParams\.get\("redirectTo"\)\)/);
    expect(LANDING).toMatch(
      /const signInPath = returnTo \? `\/auth\?redirectTo=\$\{encodeURIComponent\(returnTo\)\}` : "\/auth"/,
    );
    // Both sign-in CTAs use the computed path; no remaining bare /auth links.
    expect(LANDING).toMatch(/data-testid="landing-signin-cta-header"/);
    expect(LANDING).toMatch(/data-testid="landing-signin-cta-final"/);
    expect(LANDING).not.toMatch(/to="\/auth"/);
  });

  it("Auth consumes redirectTo through the manifest-validated resolver", () => {
    expect(AUTH).toMatch(/resolveKnownRouteReturnTo\(search\.get\("redirectTo"\)\)/);
    // The raw query value must never reach navigation directly.
    expect(AUTH).not.toMatch(/nav\(search\.get\("redirectTo"\)/);
  });
});
