import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { Route as AgentIntegrationsAliasRoute } from "@/routes/_app/agent-integrations";
import { Route as BreedingProgramsAliasRoute } from "@/routes/_app/breeding-programs";
import { Route as HelpAliasRoute } from "@/routes/help";
import { getRouteAliasRedirectTarget, isRouteMounted } from "./helpers/routeManifestSyncHarness";

/**
 * 2026-10-20 QA: three guessable URLs landed on the 404 page. Each one now
 * forwards to the page a grower meant, keeping the query and hash.
 */
const ALIASES = [
  { path: "/breeding-programs", to: "/breeding", route: BreedingProgramsAliasRoute },
  {
    path: "/agent-integrations",
    to: "/settings/agent-integrations",
    route: AgentIntegrationsAliasRoute,
  },
  { path: "/help", to: "/tools/grow-help-toolkit", route: HelpAliasRoute },
] as const;

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="alias-location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

afterEach(() => cleanup());

describe("legacy route aliases (2026-10-20 QA)", () => {
  for (const { path, to, route } of ALIASES) {
    it(`${path} is a mounted redirect alias to ${to}`, () => {
      expect(isRouteMounted(path)).toBe(true);
      expect(getRouteAliasRedirectTarget(path)).toBe(to);
      expect(APP_ROUTES.find((entry) => entry.path === path)?.access).toBe("redirect");
    });

    it(`${path}'s route component lands on ${to} with query and hash kept`, () => {
      const AliasComponent = route.options.component as ComponentType;
      render(
        <MemoryRouter initialEntries={[`${path}?ref=qa#top`]}>
          <Routes>
            <Route path={path} element={<AliasComponent />} />
            <Route path={to} element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByTestId("alias-location").textContent).toBe(`${to}?ref=qa#top`);
    });
  }
});
