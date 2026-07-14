/**
 * pheno-routes-safety.test.ts
 *
 * Static guarantees:
 *  - Public demo routes (/pheno-comparison, /pheno-expression-showcase,
 *    /pheno-hunts/:id/compare) are NOT wrapped in PhenoTrackerUpgradeGate.
 *  - Gated workflow routes (/pheno-hunts/new, workspace, keepers) ARE
 *    wrapped in PhenoTrackerUpgradeGate.
 *  - Server-side entitlement enforcement files are untouched by this UI
 *    slice (well-known paths still exist and still export the assertion).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const APP_TSX = readFileSync(join(ROOT, "src/App.tsx"), "utf8");

const PUBLIC_DEMO_ROUTES = [
  "/pheno-comparison",
  "/pheno-expression-showcase",
  "/pheno-hunts/:id/compare",
];

const GATED_ROUTES = ["/pheno-hunts/new", "/pheno-hunts/:id/workspace", "/pheno-hunts/:id/keepers"];

function routeBlock(routePath: string): string {
  // Grab a slice around the route so we can check for a nearby Gate wrapper.
  const idx = APP_TSX.indexOf(`path="${routePath}"`);
  expect(idx, `route ${routePath} present in App.tsx`).toBeGreaterThan(-1);
  const start = Math.max(0, idx - 200);
  const end = Math.min(APP_TSX.length, idx + 400);
  return APP_TSX.slice(start, end);
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
    // The enforcement migration references the has_pheno_tracker_entitlement
    // function. Confirm at least one migration still declares it.
    const glob = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");
    expect(glob.length).toBeGreaterThan(0);
    // Cheap grep across migrations dir.
    const migrationsDir = join(ROOT, "supabase/migrations");
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const found = files.some((f) =>
      readFileSync(join(migrationsDir, f), "utf8").includes("has_pheno_tracker_entitlement"),
    );
    expect(found, "has_pheno_tracker_entitlement enforcement migration missing").toBe(true);
  });
});
