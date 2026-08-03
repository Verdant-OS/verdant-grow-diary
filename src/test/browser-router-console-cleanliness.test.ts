import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAllRouteModuleSources } from "./helpers/routeManifestSyncHarness";

const ROOT = resolve(__dirname, "../..");
const APP = readAllRouteModuleSources();
const INDEX = readFileSync(resolve(ROOT, "index.html"), "utf8");
const NOT_FOUND = readFileSync(resolve(ROOT, "src/pages/NotFound.tsx"), "utf8");

describe("production browser-router console cleanliness", () => {
  it("opts into both supported React Router v7 transition behaviors", () => {
    expect(APP).toMatch(
      /<BrowserRouter\s+future=\{\{\s*v7_startTransition:\s*true,\s*v7_relativeSplatPath:\s*true,?\s*\}\}>/,
    );
  });

  it("does not turn an expected Not Found render into a raw-path console error", () => {
    expect(NOT_FOUND).not.toMatch(/\bconsole\.(?:error|warn|log)\s*\(/);
    expect(NOT_FOUND).not.toContain("location.pathname);");
  });

  it("does not preload a route-optional logo on every document", () => {
    expect(INDEX).not.toMatch(
      /<link\s+rel=["']preload["'][^>]+href=["']\/brand\/verdant-logo\.png["'][^>]*>/,
    );
  });
});
