import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  AUTHENTICATED_CORE_CENSUS_ROUTES,
  expectedCensusNavigationPath,
} from "../../e2e/lib/coreLinkFormCensus";

// #2045 sends a signed-in account that already has a grow from /onboarding to the
// dashboard. The authenticated census fixture has a grow, so both the direct route
// audit and any clicked /onboarding link (Start your room's skip link) end on "/".
describe("core census onboarding redirect", () => {
  it("expects the signed-in /onboarding audit to finish on the dashboard", () => {
    const route = AUTHENTICATED_CORE_CENSUS_ROUTES.find((entry) => entry.path === "/onboarding");
    expect(route).toBeDefined();
    expect(route && "expectedPathname" in route ? route.expectedPathname : undefined).toBe("/");
  });

  it("expects a signed-in /onboarding link click to finish on the dashboard", () => {
    expect(expectedCensusNavigationPath("/onboarding", APP_ROUTES, true)).toBe("/");
  });

  it("leaves other signed-in links and the signed-out lane unchanged", () => {
    expect(expectedCensusNavigationPath("/start-room", APP_ROUTES, true)).toBe("/start-room");
    expect(expectedCensusNavigationPath("/onboarding", APP_ROUTES, false)).toBe("/auth");
  });
});
