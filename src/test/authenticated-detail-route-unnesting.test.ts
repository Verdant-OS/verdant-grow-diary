/**
 * Exact un-nesting contract for the 18 authenticated detail routes restored
 * in PR #713 (lost in the TanStack migration: nested ids made detail URLs
 * render their parent list).
 *
 * One aggregate table, EXACT assertions only — optional-underscore regexes
 * are forbidden for these load-bearing checks because they match the broken
 * nested predecessor as happily as the fix.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  extractTanstackRouteIds,
  tanstackRouteIdToClassicPath,
} from "./helpers/routeManifestSyncHarness";
import { UNNESTED_ROUTE_CONTRACTS } from "./helpers/unnestedRouteContracts";

const ROOT = resolve(__dirname, "../..");
const ROUTES = join(ROOT, "src/routes/_app");
const ROUTE_TREE = readFileSync(join(ROOT, "src/routeTree.gen.ts"), "utf8");


/** The broken nested predecessor: the same filename with every trailing
 *  un-nesting marker removed (`plants_.` -> `plants.`). */
function nestedPredecessorFile(routeFile: string): string {
  return routeFile.replace(/_\./g, ".");
}

describe("authenticated detail route un-nesting contract (18 routes, exact)", () => {
  it("covers exactly 18 routes with unique classic paths", () => {
    expect(UNNESTED_ROUTE_CONTRACTS).toHaveLength(18);
    const classic = UNNESTED_ROUTE_CONTRACTS.map((c) => c.classicPathTemplate);
    expect(new Set(classic).size).toBe(18);
  });

  it("each exact route file exists and its broken nested predecessor does not", () => {
    for (const c of UNNESTED_ROUTE_CONTRACTS) {
      expect(existsSync(join(ROUTES, c.routeFile)), c.routeFile).toBe(true);
      const predecessor = nestedPredecessorFile(c.routeFile);
      expect(predecessor).not.toBe(c.routeFile);
      expect(
        existsSync(join(ROUTES, predecessor)),
        `broken nested predecessor must not exist: ${predecessor}`,
      ).toBe(false);
    }
  });

  it("each route declares its EXACT un-nested id (trailing _ markers included)", () => {
    for (const c of UNNESTED_ROUTE_CONTRACTS) {
      const source = readFileSync(join(ROUTES, c.routeFile), "utf8");
      expect(source, c.routeFile).toContain(`createFileRoute("${c.routeId}")`);
      // Every contract id must carry at least one un-nesting marker.
      expect(c.routeId).toMatch(/_(\/|$)/);
    }
  });

  it("route ids map to the unchanged public URLs and collide with nothing", () => {
    for (const c of UNNESTED_ROUTE_CONTRACTS) {
      expect(tanstackRouteIdToClassicPath(c.routeId), c.routeId).toBe(c.classicPathTemplate);
      expect(c.classicPathTemplate).not.toBe(c.parentListPath);
    }
    // Across the ENTIRE route manifest no two route ids may map to the same
    // classic path — a duplicate is exactly the parent-list masquerade. The
    // single sanctioned exception is a TanStack layout + its own index child
    // (`/_app/x` + `/_app/x/`), which share a URL by design.
    const isLayoutIndexPair = (a: string, b: string) => a === `${b}/` || b === `${a}/`;
    const seen = new Map<string, string>();
    for (const id of extractTanstackRouteIds()) {
      const classic = tanstackRouteIdToClassicPath(id);
      if (classic === null) continue;
      const prior = seen.get(classic);
      if (prior !== undefined && !isLayoutIndexPair(prior, id)) {
        expect.fail(`duplicate classic path ${classic}: ${prior} vs ${id}`);
      }
      seen.set(classic, id);
    }
  });

  it("the generated route tree contains every un-nested route id", () => {
    for (const c of UNNESTED_ROUTE_CONTRACTS) {
      expect(ROUTE_TREE, c.routeId).toContain(`'${c.routeId}'`);
    }
  });

  it("forbids optional-underscore regexes in the load-bearing route assertions", () => {
    // An optional-underscore route regex matches the broken nested
    // predecessor as readily as the fix. The known prior offender must pin
    // the EXACT id and must not regress to `doctor_?` / `sessions_?` forms.
    const aiDoctorTest = readFileSync(
      join(ROOT, "src/test/ai-doctor-session-detail.test.tsx"),
      "utf8",
    );
    expect(aiDoctorTest).toContain('createFileRoute("/_app/doctor_/sessions_/$sessionId")');
    expect(aiDoctorTest).not.toContain("doctor_?");
    expect(aiDoctorTest).not.toContain("sessions_?");
  });
});
