import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { getRouteAliasRedirectTarget, isRouteMounted } from "./helpers/routeManifestSyncHarness";

/**
 * 2026-10-20 QA: three guessable URLs landed on the 404 page. Each one now
 * forwards to the page a grower meant.
 */
const ALIASES = [
  { path: "/breeding-programs", to: "/breeding" },
  { path: "/agent-integrations", to: "/settings/agent-integrations" },
  { path: "/help", to: "/tools/grow-help-toolkit" },
] as const;

describe("legacy route aliases (2026-10-20 QA)", () => {
  for (const { path, to } of ALIASES) {
    it(`${path} redirects to ${to}`, () => {
      expect(isRouteMounted(path)).toBe(true);
      expect(getRouteAliasRedirectTarget(path)).toBe(to);
      expect(APP_ROUTES.find((route) => route.path === path)?.access).toBe("redirect");
    });
  }
});
