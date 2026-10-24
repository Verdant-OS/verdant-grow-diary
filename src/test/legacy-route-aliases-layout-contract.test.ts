/**
 * Layout and manifest contracts for the 2026-10-20 legacy URL aliases.
 *
 * Component-level redirect behavior lives in legacy-route-aliases-2026-10-20.test.tsx.
 * These checks guard the auth-shell placement and canonical access gates that prevent
 * signed-out growers from skipping RequireAuth or landing on the wrong surface.
 */
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  extractMountedAppRoutePaths,
  getRouteAliasRedirectTarget,
  isMountedUnderAppShell,
} from "./helpers/routeManifestSyncHarness";

const AUTH_SHELL_ALIASES = [
  { alias: "/breeding-programs", canonical: "/breeding" },
  { alias: "/agent-integrations", canonical: "/settings/agent-integrations" },
] as const;

const PUBLIC_ALIAS = {
  alias: "/help",
  canonical: "/tools/grow-help-toolkit",
} as const;

describe("legacy route alias layout and canonical contracts (2026-10-20 QA)", () => {
  it("authenticated guessable URLs stay under the auth shell", () => {
    for (const { alias } of AUTH_SHELL_ALIASES) {
      expect(isMountedUnderAppShell(alias), alias).toBe(true);
    }
  });

  it("public help alias stays outside the auth shell", () => {
    expect(isMountedUnderAppShell(PUBLIC_ALIAS.alias)).toBe(false);
  });

  it("aliases still forward to mounted canonical routes with expected access", () => {
    const mounted = extractMountedAppRoutePaths();

    for (const { alias, canonical } of AUTH_SHELL_ALIASES) {
      expect(getRouteAliasRedirectTarget(alias)).toBe(canonical);
      expect(mounted).toContain(canonical);
      expect(APP_ROUTES.find((entry) => entry.path === canonical)?.access).toBe("auth");
    }

    expect(getRouteAliasRedirectTarget(PUBLIC_ALIAS.alias)).toBe(PUBLIC_ALIAS.canonical);
    expect(mounted).toContain(PUBLIC_ALIAS.canonical);
    expect(APP_ROUTES.find((entry) => entry.path === PUBLIC_ALIAS.canonical)?.access).toBe(
      "public",
    );
  });
});
