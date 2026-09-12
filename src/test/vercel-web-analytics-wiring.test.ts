/**
 * Static contract: Vercel Web Analytics is wired at the document shell.
 *
 * PR #1336 adds @vercel/analytics alongside the existing consent-gated Google
 * Analytics stack. These pins keep the integration from being dropped silently
 * or moved into the consent-gated shell by mistake.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");

const PACKAGE_JSON = JSON.parse(read("package.json")) as {
  dependencies?: Record<string, string>;
};
const ROOT_ROUTE = read("src/routes/__root.tsx");

describe("Vercel Web Analytics dependency", () => {
  it("declares @vercel/analytics in package.json", () => {
    expect(PACKAGE_JSON.dependencies?.["@vercel/analytics"]).toMatch(/^\^?\d/);
  });
});

describe("Vercel Web Analytics root wiring", () => {
  it("imports Analytics from the React entrypoint", () => {
    expect(ROOT_ROUTE).toContain('import { Analytics } from "@vercel/analytics/react"');
  });

  it("mounts Analytics exactly once in RootDocument", () => {
    expect((ROOT_ROUTE.match(/<Analytics\s*\/>/g) ?? []).length).toBe(1);
    expect(ROOT_ROUTE).toMatch(/function RootDocument\([\s\S]*?<Analytics\s*\/>/);
  });

  it("renders Analytics after route children and before Scripts in the body", () => {
    expect(ROOT_ROUTE).toMatch(
      /<body>\s*\{children\}\s*\n\s*<Analytics\s*\/>\s*\n\s*<Scripts\s*\/>\s*\n\s*<\/body>/,
    );
  });

  it("keeps Vercel Analytics outside the consent-gated AnalyticsShell", () => {
    const shellStart = ROOT_ROUTE.indexOf("function AnalyticsShell()");
    const shellEnd = ROOT_ROUTE.indexOf("function PageLoader()");
    expect(shellStart).toBeGreaterThan(-1);
    expect(shellEnd).toBeGreaterThan(shellStart);
    const shellBlock = ROOT_ROUTE.slice(shellStart, shellEnd);
    expect(shellBlock).not.toMatch(/<Analytics\s*\/>/);
    expect(shellBlock).not.toContain("@vercel/analytics");
  });

  it("still mounts consent-gated Google Analytics inside AnalyticsShell", () => {
    expect(ROOT_ROUTE).toMatch(/function AnalyticsShell\(\)[\s\S]*?loadGoogleAnalytics/);
    expect(ROOT_ROUTE).toMatch(
      /function AnalyticsShell\(\)[\s\S]*?useGoogleAnalyticsPageViews\(\)/,
    );
  });
});
