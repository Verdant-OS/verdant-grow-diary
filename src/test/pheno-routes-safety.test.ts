/**
 * pheno-routes-safety.test.ts
 *
 * Static guarantees:
 *  - Public demo routes (/pheno-comparison, /pheno-expression-showcase,
 *    /pheno-hunts/:id/compare) are NOT wrapped in PhenoTrackerUpgradeGate.
 *  - Gated workflow routes (/pheno-hunts, /new, workspace, keepers, and the
 *    editable diary strain profile) ARE wrapped in PhenoTrackerUpgradeGate.
 *  - Server-side entitlement enforcement files are untouched by this UI
 *    slice (well-known paths still exist and still export the assertion).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractMountedAppRoutePaths,
  readRouteModuleSourceForPath,
} from "./helpers/routeManifestSyncHarness";

const ROOT = process.cwd();

const PUBLIC_DEMO_ROUTES = [
  "/pheno-comparison",
  "/pheno-expression-showcase",
  "/pheno-hunts/:id/compare",
];

const GATED_ROUTES = [
  "/diary/strains/:slug",
  "/pheno-hunts",
  "/pheno-hunts/new",
  "/pheno-hunts/:id/workspace",
  "/pheno-hunts/:id/keepers",
];

function routeBlock(routePath: string): string {
  expect(extractMountedAppRoutePaths(), `route ${routePath} mounted`).toContain(routePath);
  const src = readRouteModuleSourceForPath(routePath);
  expect(src, `route module for ${routePath}`).toBeTruthy();
  // Gate may live on the page component imported by the route module.
  const pageImport = src!.match(/from\s+["']@\/pages\/([^"']+)["']/);
  if (pageImport) {
    const pagePath = join(ROOT, "src/pages", `${pageImport[1]}.tsx`);
    if (existsSync(pagePath)) {
      return src! + "\n" + readFileSync(pagePath, "utf8");
    }
  }
  return src!;
}

describe("pheno route safety", () => {
  it("public demo routes are ungated", () => {
    for (const r of PUBLIC_DEMO_ROUTES) {
      const block = routeBlock(r);
      expect(
        block.includes("PhenoTrackerUpgradeGate"),
        `public demo route ${r} must not be wrapped in PhenoTrackerUpgradeGate`,
      ).toBe(false);
    }
  });

  it("Pro workflow routes are wrapped in PhenoTrackerUpgradeGate", () => {
    for (const r of GATED_ROUTES) {
      const block = routeBlock(r);
      expect(
        block.includes("PhenoTrackerUpgradeGate"),
        `gated route ${r} must be wrapped in PhenoTrackerUpgradeGate`,
      ).toBe(true);
    }
  });

  it("server-side pheno tracker entitlement helper still exists and exports the assertion", () => {
    const path = join(ROOT, "supabase/functions/_shared/assertPhenoTrackerEntitlement.ts");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src).toMatch(/export\s+(async\s+)?function\s+assertPhenoTrackerEntitlement/);
    expect(src).toMatch(/pheno_tracker_pro_required/);
  });

  it("RESTRICTIVE RLS enforcement migration is still present", () => {
    const glob = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");
    expect(glob.length).toBeGreaterThan(0);
    const migrationsDir = join(ROOT, "supabase/migrations");
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const found = files.some((f) =>
      readFileSync(join(migrationsDir, f), "utf8").includes("has_pheno_tracker_entitlement"),
    );
    expect(found, "has_pheno_tracker_entitlement enforcement migration missing").toBe(true);
  });
});
