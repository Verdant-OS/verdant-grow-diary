import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAllRouteModuleSources } from "./helpers/routeManifestSyncHarness";

const ROOT = resolve(__dirname, "../..");
const APP = readAllRouteModuleSources();
const NOT_FOUND = readFileSync(resolve(ROOT, "src/pages/NotFound.tsx"), "utf8");

describe("production browser-router console cleanliness", () => {
  it("opts into both supported React Router v7 transition behaviors", () => {
    // TanStack Start owns the router shell; classic BrowserRouter future flags
    // are not present. Route modules must still load without console-erroring.
    expect(APP.length).toBeGreaterThan(0);
    expect(APP).not.toMatch(/console\.error\(\s*location\.pathname/);
  });

  it("does not turn an expected Not Found render into a raw-path console error", () => {
    expect(NOT_FOUND).not.toMatch(/\bconsole\.(?:error|warn|log)\s*\(/);
    expect(NOT_FOUND).not.toContain("location.pathname);");
  });

  it("does not preload a route-optional logo on every document", () => {
    const indexPath = resolve(ROOT, "index.html");
    if (!existsSync(indexPath)) {
      // No classic SPA shell under TanStack SSR.
      expect(APP).not.toMatch(/rel=["']preload["'][^>]+verdant-logo\.png/);
      return;
    }
    const INDEX = readFileSync(indexPath, "utf8");
    expect(INDEX).not.toMatch(
      /<link\s+rel=["']preload["'][^>]+href=["']\/brand\/verdant-logo\.png["'][^>]*>/,
    );
  });
});
