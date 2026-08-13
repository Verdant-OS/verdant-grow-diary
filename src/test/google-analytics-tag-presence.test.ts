/**
 * Static test: analytics is consent-gated.
 *
 * The Google tag must NOT be declared in the TanStack root route head. It is
 * injected by src/lib/googleAnalyticsLoader.ts only after the grower accepts
 * in the consent banner, and still with `send_page_view: false` so the router
 * owns every page_view.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");

const ROOT_ROUTE = read("src/routes/__root.tsx");
const LOADER = read("src/lib/googleAnalyticsLoader.ts");
const CONSTANTS = read("src/constants/analytics.ts");
const HOOK = read("src/hooks/useGoogleAnalyticsPageViews.ts");

describe("Google Analytics consent gate", () => {
  it("resolves the measurement ID in one place, from the connector env var", () => {
    expect(CONSTANTS).toContain("VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY");
    expect(CONSTANTS).toMatch(/GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK\s*=\s*["']G-[A-Z0-9]{10}["']/);
  });


  it("does not ship the gtag.js tag in the root head", () => {
    expect(ROOT_ROUTE).not.toContain("https://www.googletagmanager.com/gtag/js?id=");
  });

  it("mounts the consent banner and the consent-gated loader", () => {
    expect(ROOT_ROUTE).toContain("AnalyticsConsentBanner");
    expect(ROOT_ROUTE).toContain("loadGoogleAnalytics");
    expect(ROOT_ROUTE).toMatch(/decision === "granted"/);
  });

  it("loads the gtag.js script only from the loader", () => {
    expect(LOADER).toContain("https://www.googletagmanager.com/gtag/js?id=");
  });

  it("disables the raw-location initial page view", () => {
    expect(LOADER).toMatch(
      /gtag\(\s*["']config["']\s*,\s*[^)]*?\{\s*send_page_view:\s*false\s*\}\s*\)/,
    );
  });

  it("contains the dataLayer bootstrap and Arguments-shaped gtag queue push", () => {
    expect(LOADER).toMatch(/dataLayer\s*=\s*w\.dataLayer\s*\|\|\s*\[\]/);
    // Must push `arguments` (Arguments object). Rest-parameter Array push is
    // silently ignored by gtag.js and leaves collection dark.
    expect(LOADER).toMatch(/dataLayer\.push\(arguments/);
    expect(LOADER).not.toMatch(/dataLayer\.push\(args\)/);
  });

  it("blocks page_view events until consent is granted", () => {
    expect(HOOK).toMatch(/readAnalyticsConsent\(\) !== "granted"/);
  });
});
