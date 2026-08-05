/**
 * Regression: compat `<Navigate>` must issue exactly ONE navigation per set
 * of inputs, even while its own navigation is pending.
 *
 * TanStack's own `<Navigate>` re-issues its navigation on every router-state
 * re-render; while the transition is pending the still-mounted source route
 * re-renders per state change, so alias routes (e.g. /features → /welcome)
 * restarted the transition in a loop until React threw "Maximum update depth
 * exceeded" (~50 error cycles per visit in the browser). The compat shim now
 * navigates from an input-keyed effect instead.
 *
 * IMPORTANT: this file imports the REAL product shim by relative path.
 * `vitest.config.ts` aliases the `@/lib/react-router-compat` specifier to
 * `src/test/helpers/reactRouterCompat.vitest.tsx`, so alias-route tests that
 * import via `@/` never execute the product `Navigate`. The relative import
 * bypasses that alias on purpose — do not "clean it up" to `@/`.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Navigate, Outlet, useLocation } from "../lib/react-router-compat";

/**
 * Mirrors src/components/RouteAliasRedirect.tsx: the useLocation() call
 * subscribes the source component to router state, so it re-renders on every
 * pending-transition state change. That re-render is what made the previous
 * TanStackNavigate-based implementation re-issue its navigation (fresh props
 * object per render fails its identity check) and loop.
 */
function AliasRedirect() {
  const location = useLocation();
  return <Navigate to={`/welcome${location.search}${location.hash}`} replace />;
}

function buildAliasRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const aliasRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/features",
    component: AliasRedirect,
  });
  const targetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/welcome",
    // A pending loader keeps the transition open for several router-state
    // re-renders of the still-mounted /features source — the exact window in
    // which TanStack's <Navigate> re-issued and looped.
    loader: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return null;
    },
    component: () => <div data-testid="welcome-page">welcome</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([aliasRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ["/features"] }),
  });
  return router;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("react-router-compat Navigate (real product shim)", () => {
  it("alias route with a pending target issues exactly one navigation and no update-depth errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = buildAliasRouter();
    const navigateSpy = vi.spyOn(router, "navigate");

    render(<RouterProvider router={router} />);

    await screen.findByTestId("welcome-page");
    // Give any straggler re-issues a chance to fire before counting.
    await new Promise((resolve) => setTimeout(resolve, 120));

    const redirectCalls = navigateSpy.mock.calls.filter(
      (call) => (call[0] as { to?: string } | undefined)?.to === "/welcome",
    );
    expect(redirectCalls).toHaveLength(1);
    expect(redirectCalls[0]?.[0]).toMatchObject({ replace: true });

    const updateDepthErrors = consoleError.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("Maximum update depth")),
    );
    expect(updateDepthErrors).toHaveLength(0);
  });

  it("lands on the target route with replace semantics (single history entry)", async () => {
    const router = buildAliasRouter();
    render(<RouterProvider router={router} />);

    await screen.findByTestId("welcome-page");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/welcome");
    });
    // replace: the /features entry must not linger behind the target.
    expect(router.history.length).toBe(1);
  });
});
