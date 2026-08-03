/**
 * Grow Lineage Deep-Link Reachability v1 (TanStack file routes).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  extractMountedAppRoutePaths,
  isMountedUnderOperatorLayout,
  readAllRouteModuleSources,
  extractTanstackRouteIds,
  tanstackRouteIdToClassicPath,
} from "./helpers/routeManifestSyncHarness";

const PAGE = fs.readFileSync(path.resolve(__dirname, "../pages/GrowLineageRepair.tsx"), "utf8");
const SIDEBAR = fs.readFileSync(path.resolve(__dirname, "../components/AppSidebar.tsx"), "utf8");
const NAVIGATION_RULES = fs.readFileSync(
  path.resolve(__dirname, "../lib/growerNavigationRules.ts"),
  "utf8",
);
const ROUTES_SRC = readAllRouteModuleSources();

function isUnderAppShell(classicPath: string): boolean {
  for (const id of extractTanstackRouteIds()) {
    if (!id.startsWith("/_app") || id === "/_app") continue;
    if (tanstackRouteIdToClassicPath(id) === classicPath) return true;
  }
  return false;
}

describe("Grow Lineage Repair — deep-link reachability", () => {
  it("is mounted inside the AppShell-authenticated layout", () => {
    expect(extractMountedAppRoutePaths()).toContain("/grow-lineage");
    expect(isUnderAppShell("/grow-lineage")).toBe(true);
  });

  it("is NOT under the operator layout", () => {
    expect(isMountedUnderOperatorLayout("/grow-lineage")).toBe(false);
  });

  it("wires the GrowLineageRepair page", () => {
    expect(ROUTES_SRC).toMatch(/GrowLineageRepair/);
  });

  it("manifest access is auth (not operator)", () => {
    const entry = APP_ROUTES.find((r) => r.path === "/grow-lineage");
    expect(entry?.access).toBe("auth");
  });

  it("page exposes grower-facing repair copy", () => {
    expect(PAGE).toMatch(/Lineage Repair|Action Queue targeting|All tents are assigned/i);
  });

  it("sidebar / labs navigation exposes /grow-lineage", () => {
    expect(SIDEBAR + NAVIGATION_RULES).toMatch(/\/grow-lineage/);
  });
});
