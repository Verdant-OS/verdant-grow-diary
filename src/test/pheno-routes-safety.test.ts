/**
 * pheno-routes-safety — static route-gating contract over src/App.tsx.
 *
 * Every authenticated Pheno Tracker surface (create, setup confirmation,
 * workspace, keepers) must mount inside PhenoTrackerUpgradeGate so Free and
 * canceled/expired users land on the upgrade card. Public demo/read-only
 * routes must stay UNGATED — we never hide demos or historical comparisons
 * behind billing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APP = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

/** Extract the JSX chunk of a single <Route path="..."> element. */
function routeChunk(path: string): string {
  const marker = `path="${path}"`;
  const start = APP.indexOf(marker);
  expect(start, `route ${path} must exist in src/App.tsx`).toBeGreaterThan(-1);
  // A Route element ends at the next "/>" following its path attribute.
  const end = APP.indexOf("/>", start);
  expect(end, `route ${path} must be a well-formed element`).toBeGreaterThan(start);
  return APP.slice(start, end);
}

const GATED_ROUTES = [
  "/pheno-hunts/new",
  "/pheno-hunts/:id/setup",
  "/pheno-hunts/:id/workspace",
  "/pheno-hunts/:id/keepers",
];

const PUBLIC_ROUTES = [
  "/pheno-comparison",
  "/pheno-expression-showcase",
  "/pheno-hunts/:id/compare",
  "/internal/contextual-pheno-comparison-demo",
];

describe("Pheno Tracker route gating", () => {
  for (const path of GATED_ROUTES) {
    it(`${path} is wrapped in PhenoTrackerUpgradeGate`, () => {
      expect(routeChunk(path)).toContain("PhenoTrackerUpgradeGate");
    });
  }

  for (const path of PUBLIC_ROUTES) {
    it(`${path} stays ungated (public demo / read-only history)`, () => {
      expect(routeChunk(path)).not.toContain("PhenoTrackerUpgradeGate");
    });
  }

  it("no pheno-hunts write surface exists outside the gated list", () => {
    // Belt-and-suspenders: every /pheno-hunts/* route in App.tsx must be
    // either explicitly gated or the public compare view.
    const paths = [...APP.matchAll(/path="(\/pheno-hunts\/[^"]+)"/g)].map((m) => m[1]);
    for (const p of paths) {
      expect(
        [...GATED_ROUTES, "/pheno-hunts/:id/compare"],
        `unexpected pheno-hunts route ${p} — classify it as gated or public`,
      ).toContain(p);
    }
  });
});
