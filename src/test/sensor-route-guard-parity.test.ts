// Verdant Sensor Route Guard Regression v1
//
// Generalized parity test for every `/sensors/*` route in the app.
//
// Goals (TanStack file routes):
//  - `/sensors/ecowitt-audit` and `/sensors/ingest-normalizer` must be mounted
//    under the `/_app/_operator` layout (RequireOperatorRole).
//  - Every `/sensors/*` manifest entry with `access: "operator"` must be
//    under that layout.
//  - Authenticated and public grower-facing `/sensors/*` routes must NOT sit
//    under the operator layout, and each access class must be documented.
//
// Static source test only. No runtime, no DB writes, no Supabase calls.
import { describe, it, expect } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  extractMountedAppRoutePaths,
  isMountedUnderOperatorLayout,
  readAllRouteModuleSources,
} from "./helpers/routeManifestSyncHarness";

const MOUNTED = extractMountedAppRoutePaths();
const ROUTES_SRC = readAllRouteModuleSources();

/**
 * Documented grower-facing `/sensors/*` routes intentionally mounted under
 * the authenticated AppShell, NOT under RequireOperatorRole.
 */
const AUTHENTICATED_GROWER_FACING_SENSOR_ROUTES = new Set<string>(["/sensors"]);

/**
 * Documented public `/sensors/*` routes intentionally mounted outside the
 * authenticated AppShell and RequireOperatorRole.
 */
const PUBLIC_SENSOR_ROUTES = new Set<string>(["/sensors/csv-preview"]);

/**
 * Documented operator/debug sensor exception list. Empty by design.
 */
const OPERATOR_SENSOR_EXCEPTIONS = new Set<string>([]);

const PATHS_IN_OPERATOR_BLOCK = new Set(
  MOUNTED.filter((p) => p.startsWith("/sensors") && isMountedUnderOperatorLayout(p)),
);
const PATHS_OUTSIDE_OPERATOR_BLOCK = new Set(
  MOUNTED.filter((p) => p.startsWith("/sensors") && !isMountedUnderOperatorLayout(p)),
);

describe("Verdant Sensor Route Guard Regression v1 — operator layout", () => {
  it("has a single RequireOperatorRole layout route under /_app/_operator", () => {
    // Layout module is pathless; children sit under /_app/_operator/…
    expect(ROUTES_SRC).toMatch(/createFileRoute\(\s*["']\/_app\/_operator["']/);
    expect(ROUTES_SRC).toMatch(/RequireOperatorRole/);
    const layoutDecls = [
      ...ROUTES_SRC.matchAll(/createFileRoute\(\s*["']\/_app\/_operator["']\s*\)/g),
    ];
    expect(layoutDecls.length).toBe(1);
  });
});

describe("Verdant Sensor Route Guard Regression v1 — required operator-gated sensor routes", () => {
  const REQUIRED_OPERATOR_SENSOR_ROUTES = ["/sensors/ecowitt-audit", "/sensors/ingest-normalizer"];

  for (const p of REQUIRED_OPERATOR_SENSOR_ROUTES) {
    it(`${p} is mounted under /_app/_operator`, () => {
      expect(PATHS_IN_OPERATOR_BLOCK.has(p)).toBe(true);
    });
    it(`${p} is NOT mounted outside operator layout`, () => {
      expect(PATHS_OUTSIDE_OPERATOR_BLOCK.has(p)).toBe(false);
    });
    it(`${p} is declared access: "operator" in appRouteManifest`, () => {
      const entry = APP_ROUTES.find((r) => r.path === p);
      expect(entry, `missing manifest entry for ${p}`).toBeTruthy();
      expect(entry!.access).toBe("operator");
    });
  }
});

describe("Verdant Sensor Route Guard Regression v1 — generalized /sensors/* parity", () => {
  const sensorManifestRoutes = APP_ROUTES.filter((r) => r.path.startsWith("/sensors"));

  it("manifest contains every mounted /sensors/* route", () => {
    const mountedSensorPaths = MOUNTED.filter((p) => p.startsWith("/sensors"));
    for (const p of mountedSensorPaths) {
      const entry = sensorManifestRoutes.find((r) => r.path === p);
      expect(entry, `mounted /sensors/* route ${p} missing from manifest`).toBeTruthy();
    }
  });

  for (const r of sensorManifestRoutes) {
    if (r.access === "operator") {
      it(`${r.path} (manifest=operator) is mounted under operator layout`, () => {
        expect(PATHS_IN_OPERATOR_BLOCK.has(r.path)).toBe(true);
        expect(PATHS_OUTSIDE_OPERATOR_BLOCK.has(r.path)).toBe(false);
      });
    } else if (r.access === "auth") {
      it(`${r.path} (manifest=${r.access}) is NOT under operator layout`, () => {
        expect(PATHS_IN_OPERATOR_BLOCK.has(r.path)).toBe(false);
      });
      it(`${r.path} (manifest=${r.access}) is a documented authenticated grower-facing sensor route`, () => {
        expect(AUTHENTICATED_GROWER_FACING_SENSOR_ROUTES.has(r.path)).toBe(true);
      });
    } else {
      it(`${r.path} (manifest=${r.access}) is NOT under operator layout`, () => {
        expect(PATHS_IN_OPERATOR_BLOCK.has(r.path)).toBe(false);
      });
      it(`${r.path} (manifest=${r.access}) is a documented public sensor route`, () => {
        expect(PUBLIC_SENSOR_ROUTES.has(r.path)).toBe(true);
      });
    }
  }

  it("every /sensors/* route under operator layout is manifest=operator (or documented exception)", () => {
    for (const p of PATHS_IN_OPERATOR_BLOCK) {
      if (OPERATOR_SENSOR_EXCEPTIONS.has(p)) continue;
      const entry = APP_ROUTES.find((r) => r.path === p);
      expect(entry, `operator-layout /sensors/* route ${p} missing from manifest`).toBeTruthy();
      expect(entry!.access).toBe("operator");
    }
  });

  it("no operator-classified /sensors/* route leaks outside operator layout", () => {
    for (const r of sensorManifestRoutes) {
      if (r.access !== "operator") continue;
      if (OPERATOR_SENSOR_EXCEPTIONS.has(r.path)) continue;
      expect(isMountedUnderOperatorLayout(r.path)).toBe(true);
    }
  });
});
