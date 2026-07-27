/**
 * App route manifest — structural invariants.
 *
 * These tests cover the manifest in isolation. Drift between the manifest
 * and `App.tsx` is enforced by `src/test/pricing.test.ts`'s bidirectional
 * check (the single source-of-truth assertion).
 */
import { describe, it, expect } from "vitest";
import {
  APP_ROUTES,
  APP_ROUTE_ACCESS_VALUES,
  assertUniqueAppRouteManifestPaths,
  findDuplicateAppRoutePaths,
  getAppRouteManifestPaths,
  getAppRouteManifestPathsSorted,
  getRoutesByAccess,
  type AppRouteEntry,
} from "@/lib/appRouteManifest";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/featureEntitlements";

describe("appRouteManifest — structural invariants", () => {
  it("has no duplicate paths", () => {
    expect(findDuplicateAppRoutePaths()).toEqual([]);
    expect(() => assertUniqueAppRouteManifestPaths()).not.toThrow();
  });

  it("includes the Cloud Canary operator route /operator/ecowitt", () => {
    const paths = getAppRouteManifestPaths();
    expect(paths).toContain("/operator/ecowitt");
    const entry = APP_ROUTES.find((r) => r.path === "/operator/ecowitt");
    expect(entry?.access).toBe("operator");
  });

  it("preserves the authenticated dashboard alias and redirects legacy logs", () => {
    expect(APP_ROUTES.find((route) => route.path === "/dashboard")?.access).toBe("auth");
    expect(APP_ROUTES.find((route) => route.path === "/logs")?.access).toBe("redirect");
  });

  it("describes operator support write capabilities without overstating read-only safety", () => {
    const supportInbox = APP_ROUTES.find((route) => route.path === "/operator/support-inbox");
    expect(supportInbox?.description).toMatch(/original submissions are read-only/i);
    expect(supportInbox?.description).toMatch(/review status and internal notes are editable/i);
  });

  it("every entry has a non-empty path and a valid access value", () => {
    for (const entry of APP_ROUTES) {
      expect(typeof entry.path).toBe("string");
      expect(entry.path.length).toBeGreaterThan(0);
      expect(APP_ROUTE_ACCESS_VALUES).toContain(entry.access);
    }
  });

  it("access values are limited to the declared enum", () => {
    const allowed = new Set<string>(APP_ROUTE_ACCESS_VALUES);
    for (const entry of APP_ROUTES) {
      expect(allowed.has(entry.access)).toBe(true);
    }
  });

  it("nav-visible entries (showInNav=true) have a label", () => {
    const navVisible: AppRouteEntry[] = APP_ROUTES.filter((r) => r.showInNav === true);
    for (const entry of navVisible) {
      expect(entry.label, `Entry ${entry.path} has showInNav=true but no label`).toBeTruthy();
      expect(typeof entry.label).toBe("string");
    }
  });

  it("models the exact Pheno Tracker route family with the canonical feature key", () => {
    const expected = [
      "/pheno-hunts",
      "/pheno-hunts/:id/keepers",
      "/pheno-hunts/:id/workspace",
      "/pheno-hunts/new",
    ];
    const featureRoutes = APP_ROUTES.filter(
      (route): route is AppRouteEntry & { requiredFeature: FeatureKey } =>
        "requiredFeature" in route && typeof route.requiredFeature === "string",
    );

    expect(featureRoutes.map((route) => route.path)).toEqual(expected);
    for (const route of featureRoutes) {
      expect(route.access).toBe("auth");
      expect(route.requiredFeature).toBe("pheno_tracker");
      expect(FEATURE_KEYS).toContain(route.requiredFeature);
    }
  });

  it("does not encode billing plans or a synthetic protected-tier access class", () => {
    const blob = JSON.stringify(APP_ROUTES);
    expect(blob).not.toMatch(/protected-tier/i);
    expect(blob).not.toMatch(/requiredTier/i);
    for (const entry of APP_ROUTES) {
      expect(entry.access as string).not.toBe("protected-tier");
    }
  });

  it("getAppRouteManifestPaths() is deterministic across calls", () => {
    const a = getAppRouteManifestPaths();
    const b = getAppRouteManifestPaths();
    expect(a).toEqual(b);
    // Returns a copy — mutating one call should not affect the next.
    a.push("/mutated");
    expect(getAppRouteManifestPaths()).not.toContain("/mutated");
  });

  it("getAppRouteManifestPathsSorted() returns the same set, alphabetically", () => {
    const sorted = getAppRouteManifestPathsSorted();
    const expected = [...getAppRouteManifestPaths()].sort();
    expect(sorted).toEqual(expected);
  });

  it("getRoutesByAccess returns only entries matching the requested access", () => {
    for (const access of APP_ROUTE_ACCESS_VALUES) {
      const subset = getRoutesByAccess(access);
      for (const e of subset) expect(e.access).toBe(access);
    }
    // Sanity: partition is complete (sum of buckets = full manifest count).
    const total = APP_ROUTE_ACCESS_VALUES.reduce((n, a) => n + getRoutesByAccess(a).length, 0);
    expect(total).toBe(APP_ROUTES.length);
  });
});
