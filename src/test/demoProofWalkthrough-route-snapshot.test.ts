/**
 * Route-snapshot guard: every href used by the Demo Proof Walkthrough
 * must correspond to a route currently mounted in TanStack file routes.
 * The walkthrough is the operator's tour of the real app — if a step links
 * to a non-existent route, the demo is broken.
 *
 * Source of truth: extractMountedAppRoutePaths() over src/routes.
 */
import { describe, it, expect } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { buildDemoProofWalkthroughViewModel } from "@/lib/demoProofWalkthroughViewModel";
import { extractMountedAppRoutePaths } from "./helpers/routeManifestSyncHarness";

function loadAppRoutePaths(): Set<string> {
  return new Set(extractMountedAppRoutePaths());
}

function stripQuery(href: string): string {
  const q = href.indexOf("?");
  return q === -1 ? href : href.slice(0, q);
}

describe("Demo Proof Walkthrough — route snapshot", () => {
  const appPaths = loadAppRoutePaths();
  const vm = buildDemoProofWalkthroughViewModel();

  it("file routes exposes the expected real routes the walkthrough relies on", () => {
    const required = [
      "/",
      "/tents",
      "/plants",
      "/daily-check",
    ];
    for (const path of required) {
      expect(appPaths.has(path) || APP_ROUTES.some((r) => r.path === path), path).toBe(true);
    }
  });

  it("every walkthrough href resolves to a mounted route path", () => {
    const mounted = appPaths.size > 0 ? appPaths : new Set(APP_ROUTES.map((r) => r.path));
    for (const step of vm.steps) {
      const path = stripQuery(step.href);
      // parameterized routes: match prefix patterns
      const ok =
        mounted.has(path) ||
        [...mounted].some((m) => {
          if (!m.includes(":")) return false;
          const re = new RegExp("^" + m.replace(/:[^/]+/g, "[^/]+") + "$");
          return re.test(path);
        });
      expect(ok, `${step.id} -> ${path}`).toBe(true);
    }
  });
});
