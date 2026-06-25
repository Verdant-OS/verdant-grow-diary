/**
 * Route manifest sync — shared harness coverage.
 *
 * Asserts:
 *   1. App.tsx ↔ APP_ROUTES bidirectional sync (with clear diffs).
 *   2. Manifest has no duplicate paths.
 *   3. Manifest paths stay in alphabetical order (matches manifest invariant).
 *   4. Every mounted `/operator/*` path exists in the manifest as `operator`
 *      (or `internal`) — explicit smoke for the operator surface.
 *   5. `/operator/one-tent-proof-record` is explicitly covered.
 *   6. Best-effort access-group mismatch check has no findings.
 *
 * Pricing-specific snapshot lives in `pricing.test.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  diffAppRoutesAgainstManifest,
  extractMountedAppRoutePaths,
  findAccessGroupMismatches,
  getMountedOperatorPaths,
} from "./helpers/routeManifestSyncHarness";
import { APP_ROUTES } from "@/lib/appRouteManifest";

describe("App route manifest sync", () => {
  it("App.tsx routes and the manifest stay in sync (bidirectional)", () => {
    const diff = diffAppRoutesAgainstManifest();
    expect(diff.missingFromManifest).toEqual([]);
    expect(diff.missingFromApp).toEqual([]);
    expect(diff.duplicateManifestPaths).toEqual([]);
  });

  it("manifest is sorted by path ascending (deterministic ordering)", () => {
    const paths = APP_ROUTES.map((r) => r.path);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });

  it("flags no best-effort access-group mismatches", () => {
    expect(findAccessGroupMismatches()).toEqual([]);
  });
});

describe("Operator route surface", () => {
  it("every mounted /operator/* route exists in appRouteManifest", () => {
    const mountedOps = getMountedOperatorPaths();
    const manifestSet = new Set(APP_ROUTES.map((r) => r.path));
    const missing = mountedOps.filter((p) => !manifestSet.has(p));
    expect(missing).toEqual([]);
  });

  it("every mounted /operator/* route is gated as operator or internal", () => {
    const mountedOps = new Set(getMountedOperatorPaths());
    const offenders = APP_ROUTES.filter(
      (r) =>
        mountedOps.has(r.path) &&
        r.access !== "operator" &&
        r.access !== "internal",
    ).map((r) => ({ path: r.path, access: r.access }));
    expect(offenders).toEqual([]);
  });

  it("explicitly covers /operator/one-tent-proof-record", () => {
    const mounted = extractMountedAppRoutePaths();
    expect(mounted).toContain("/operator/one-tent-proof-record");
    const entry = APP_ROUTES.find(
      (r) => r.path === "/operator/one-tent-proof-record",
    );
    expect(entry).toBeDefined();
    expect(entry?.access).toBe("operator");
  });

  it("explicitly covers /operator/ecowitt (Cloud Canary)", () => {
    const entry = APP_ROUTES.find((r) => r.path === "/operator/ecowitt");
    expect(entry).toBeDefined();
    expect(entry?.access).toBe("operator");
  });
});
