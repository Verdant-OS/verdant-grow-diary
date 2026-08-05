/**
 * Runtime deep-link matching contract (route-reliability program, Phase 1).
 *
 * The static contract (authenticated-detail-route-unnesting.test.ts) pins
 * route FILE names and ids. This contract proves the behavior those names
 * exist for: the REAL router — built from the real routeTree via the app
 * factory — resolves each un-nested detail URL to the DETAIL route at
 * runtime, never its parent list. The nested-predecessor regression shipped
 * detail URLs rendering their list pages in production; exact-id matching
 * here turns any re-nesting into a red test instead of a silent wrong page.
 *
 * Matching is pure (no loaders run, no components render), so this imports
 * the full route module graph once but executes none of it.
 */
import { describe, it, expect } from "vitest";
import { getRouter } from "@/router";
import {
  extractTanstackRouteIds,
  tanstackRouteIdToClassicPath,
} from "./helpers/routeManifestSyncHarness";

// Trailing `_` on a path segment is TanStack's un-nesting marker
// (`doctor_/sessions_/$sessionId`). `/_app` is a pathless layout — its
// underscore LEADS the segment and must not match.
const UNNEST_MARKER = /_(?=\/|$)/;

const router = getRouter();

/** "/plants/:id" -> "/plants/id-e2e77" — distinct, url-safe param values. */
function concretize(template: string): string {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_m, p: string) => `${p.toLowerCase()}-e2e77`);
}

function matchStack(pathname: string): Array<{ routeId: string; params: Record<string, string> }> {
  return router.matchRoutes(pathname, {}) as unknown as Array<{
    routeId: string;
    params: Record<string, string>;
  }>;
}

function deepestMatch(pathname: string) {
  const stack = matchStack(pathname);
  expect(stack.length, `no route matched ${pathname}`).toBeGreaterThan(0);
  return stack[stack.length - 1];
}

const UNNESTED_IDS = extractTanstackRouteIds().filter((id) => UNNEST_MARKER.test(id));

describe("runtime deep-link matching — un-nested detail routes", () => {
  it("covers the full un-nested detail route family", () => {
    // 18 shipped in the un-nesting fix; growth is fine, shrink means a
    // detail route silently left the contract.
    expect(UNNESTED_IDS.length).toBeGreaterThanOrEqual(18);
  });

  it("resolves every un-nested detail URL to the detail route, not a list", () => {
    for (const id of UNNESTED_IDS) {
      const classic = tanstackRouteIdToClassicPath(id);
      expect(classic, `no classic path derivable for ${id}`).not.toBeNull();
      if (classic === null) continue;
      const concrete = concretize(classic);
      const deepest = deepestMatch(concrete);
      expect(deepest.routeId, `${concrete} must resolve to ${id}`).toBe(id);
    }
  });

  it("extracts every path param on the deepest match", () => {
    for (const id of UNNESTED_IDS) {
      const classic = tanstackRouteIdToClassicPath(id);
      expect(classic, `no classic path derivable for ${id}`).not.toBeNull();
      if (classic === null) continue;
      const paramNames = [...classic.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
      if (paramNames.length === 0) continue;
      const deepest = deepestMatch(concretize(classic));
      for (const name of paramNames) {
        expect(deepest.params[name], `${classic} param ${name}`).toBe(
          `${name.toLowerCase()}-e2e77`,
        );
      }
    }
  });

  it("regression pin: /plants/:id is the detail route, /plants stays the list", () => {
    // The concrete production regression: plants.$id.tsx nested under
    // plants.tsx rendered the LIST at every detail URL.
    expect(deepestMatch("/plants/plant-a").routeId).toBe("/_app/plants_/$id");
    expect(deepestMatch("/plants").routeId).not.toBe("/_app/plants_/$id");
  });
});
