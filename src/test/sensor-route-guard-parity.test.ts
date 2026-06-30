// Verdant Sensor Route Guard Regression v1
//
// Generalized parity test for every `/sensors/*` route in the app.
//
// Goals:
//  - `/sensors/ecowitt-audit` and `/sensors/ingest-normalizer` must be mounted
//    INSIDE the `<Route element={<RequireOperatorRole />}>` block in
//    `src/App.tsx`. They must NOT appear anywhere else.
//  - Every `/sensors/*` manifest entry with `access: "operator"` must be
//    mounted inside the operator block.
//  - Every `/sensors/*` route mounted inside the operator block must be
//    declared `access: "operator"` in the manifest (or appear in the
//    documented exception set with a written justification).
//  - Grower-facing `/sensors/*` routes (manifest `access: "auth"`) must NOT
//    leak into the operator block.
//
// Static source test only. No runtime, no DB writes, no Supabase calls.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const APP_PATH = path.resolve(__dirname, "../App.tsx");
const APP = fs.readFileSync(APP_PATH, "utf8");

function tagOpenEnd(src: string, openIdx: number): number {
  let i = openIdx + 1;
  let braces = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") braces += 1;
    else if (ch === "}") braces -= 1;
    else if (ch === ">" && braces === 0) return i;
    i += 1;
  }
  return -1;
}

function sliceMatchingRouteBlock(src: string, openIdx: number): string {
  const startEnd = tagOpenEnd(src, openIdx);
  let depth = 1;
  let i = startEnd + 1;
  while (i < src.length && depth > 0) {
    const nextOpen = src.indexOf("<Route", i);
    const nextClose = src.indexOf("</Route>", i);
    if (nextClose === -1) return "";
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const end = tagOpenEnd(src, nextOpen);
      if (end === -1) return "";
      if (src[end - 1] !== "/") depth += 1;
      i = end + 1;
    } else {
      depth -= 1;
      if (depth === 0) return src.slice(openIdx, nextClose);
      i = nextClose + "</Route>".length;
    }
  }
  return "";
}

const OPERATOR_OPEN = APP.indexOf("<Route element={<RequireOperatorRole />}>");
const OPERATOR_BLOCK = OPERATOR_OPEN >= 0 ? sliceMatchingRouteBlock(APP, OPERATOR_OPEN) : "";
const OUTSIDE_OPERATOR =
  OPERATOR_OPEN >= 0
    ? APP.slice(0, OPERATOR_OPEN) + APP.slice(OPERATOR_OPEN + OPERATOR_BLOCK.length)
    : APP;

function collectPaths(src: string): string[] {
  return [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

const PATHS_IN_OPERATOR_BLOCK = new Set(collectPaths(OPERATOR_BLOCK));
const PATHS_OUTSIDE_OPERATOR_BLOCK = new Set(collectPaths(OUTSIDE_OPERATOR));

/**
 * Documented grower-facing `/sensors/*` routes intentionally mounted under
 * the authenticated AppShell, NOT under <RequireOperatorRole />.
 *
 * These render owner-scoped, source-honest data only. Adding a new
 * grower-facing `/sensors/*` route requires adding it here AND keeping it
 * manifest `access: "auth"` (never `"operator"`).
 */
const GROWER_FACING_SENSOR_ROUTES = new Set<string>(["/sensors"]);

/**
 * Documented operator/debug sensor exception list. Empty by design:
 * every operator/debug `/sensors/*` route must be both
 * `access: "operator"` in the manifest AND mounted inside the operator
 * block. If a new exception is ever added, document why here.
 */
const OPERATOR_SENSOR_EXCEPTIONS = new Set<string>([]);

describe("Verdant Sensor Route Guard Regression v1 — App.tsx structure", () => {
  it("has a single <RequireOperatorRole /> block in App.tsx", () => {
    expect(OPERATOR_OPEN).toBeGreaterThan(-1);
    expect(OPERATOR_BLOCK.length).toBeGreaterThan(0);
    // No second occurrence.
    const secondOpen = APP.indexOf(
      "<Route element={<RequireOperatorRole />}>",
      OPERATOR_OPEN + 1,
    );
    expect(secondOpen).toBe(-1);
  });
});

describe("Verdant Sensor Route Guard Regression v1 — required operator-gated sensor routes", () => {
  const REQUIRED_OPERATOR_SENSOR_ROUTES = [
    "/sensors/ecowitt-audit",
    "/sensors/ingest-normalizer",
  ];

  for (const p of REQUIRED_OPERATOR_SENSOR_ROUTES) {
    it(`${p} is mounted INSIDE <RequireOperatorRole />`, () => {
      expect(PATHS_IN_OPERATOR_BLOCK.has(p)).toBe(true);
    });
    it(`${p} is NOT mounted outside <RequireOperatorRole />`, () => {
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

  it("manifest contains every /sensors/* route mounted in App.tsx", () => {
    const mountedSensorPaths = [
      ...PATHS_IN_OPERATOR_BLOCK,
      ...PATHS_OUTSIDE_OPERATOR_BLOCK,
    ].filter((p) => p.startsWith("/sensors"));
    for (const p of mountedSensorPaths) {
      const entry = sensorManifestRoutes.find((r) => r.path === p);
      expect(entry, `mounted /sensors/* route ${p} missing from manifest`).toBeTruthy();
    }
  });

  for (const r of sensorManifestRoutes) {
    if (r.access === "operator") {
      it(`${r.path} (manifest=operator) is mounted inside <RequireOperatorRole />`, () => {
        expect(PATHS_IN_OPERATOR_BLOCK.has(r.path)).toBe(true);
        expect(PATHS_OUTSIDE_OPERATOR_BLOCK.has(r.path)).toBe(false);
      });
    } else {
      it(`${r.path} (manifest=${r.access}) is NOT inside the operator block`, () => {
        expect(PATHS_IN_OPERATOR_BLOCK.has(r.path)).toBe(false);
      });
      it(`${r.path} (manifest=${r.access}) is a documented grower-facing sensor route`, () => {
        expect(GROWER_FACING_SENSOR_ROUTES.has(r.path)).toBe(true);
      });
    }
  }

  it("every /sensors/* route inside the operator block is manifest=operator (or a documented exception)", () => {
    const operatorSensorMounts = [...PATHS_IN_OPERATOR_BLOCK].filter((p) =>
      p.startsWith("/sensors"),
    );
    for (const p of operatorSensorMounts) {
      if (OPERATOR_SENSOR_EXCEPTIONS.has(p)) continue;
      const entry = APP_ROUTES.find((r) => r.path === p);
      expect(entry, `operator-block /sensors/* route ${p} missing from manifest`).toBeTruthy();
      expect(entry!.access).toBe("operator");
    }
  });

  it("no operator-classified /sensors/* route leaks into the authenticated AppShell only", () => {
    for (const r of sensorManifestRoutes) {
      if (r.access !== "operator") continue;
      // Must not appear outside the operator block at all.
      expect(
        PATHS_OUTSIDE_OPERATOR_BLOCK.has(r.path),
        `${r.path} must not be mounted outside <RequireOperatorRole />`,
      ).toBe(false);
    }
  });
});
