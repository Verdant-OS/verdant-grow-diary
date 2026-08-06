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
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import {
  Link,
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "../lib/react-router-compat";

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

  it("legacy MemoryRouter context: Navigate redirects without a TanStack provider", async () => {
    // The PRIMARY #740 fix: Navigate must not call a TanStack hook when the
    // module's own legacy router context is active — there is no TanStack
    // provider here, so an unconditional useTanStackNavigate() throws.
    render(
      <MemoryRouter initialEntries={["/features"]}>
        <Routes>
          <Route path="/features" element={<Navigate to="/welcome" replace />} />
          <Route path="/welcome" element={<div data-testid="legacy-welcome">welcome</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("legacy-welcome")).toBeTruthy();
  });
});

describe("react-router-compat fragment handling (real product shim)", () => {
  const mounts = { count: 0 };

  function Workspace() {
    useEffect(() => {
      mounts.count += 1;
    }, []);
    const nav = useNavigate();
    const [, setSearchParams] = useSearchParams();
    return (
      <div data-testid="workspace-page">
        <Link to="/hunts/55/workspace#notes" data-testid="fragment-link">
          Record notes
        </Link>
        <button
          type="button"
          data-testid="fragment-nav-button"
          onClick={() => nav("/hunts/55/workspace#notes")}
        >
          navigate with fragment
        </button>
        <button
          type="button"
          data-testid="combined-nav-button"
          onClick={() => nav("/hunts/55/workspace?growId=g-1#notes")}
        >
          navigate with query and fragment
        </button>
        <button
          type="button"
          data-testid="set-search-button"
          onClick={() => setSearchParams({ view: "keepers" })}
        >
          set search
        </button>
      </div>
    );
  }

  function buildWorkspaceRouter(entries: string[] = ["/hunts/55/workspace"]) {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const workspaceRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/hunts/$id/workspace",
      component: Workspace,
    });
    return createRouter({
      routeTree: rootRoute.addChildren([workspaceRoute]),
      history: createMemoryHistory({ initialEntries: entries }),
    });
  }

  it("useNavigate splits '/path#hash' into TanStack's to + hash options", async () => {
    // The census hang investigation found compat Link/useNavigate forwarding
    // the raw '/path#hash' string as TanStack `to`; TanStack reads fragments
    // only from its dedicated `hash` option, so the '#' rode into the built
    // pathname. This spy-shape assertion discriminates the fix directly.
    const router = buildWorkspaceRouter();
    const navigateSpy = vi.spyOn(router, "navigate");
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByTestId("fragment-nav-button"));

    await waitFor(() => {
      const fragmentCalls = navigateSpy.mock.calls.filter((call) => {
        const options = call[0] as { to?: string; hash?: string } | undefined;
        return typeof options?.to === "string" && options.to.startsWith("/hunts");
      });
      expect(fragmentCalls).toHaveLength(1);
      const options = fragmentCalls[0]?.[0] as { to?: string; hash?: string };
      expect(options.to).toBe("/hunts/55/workspace");
      expect(options.to).not.toContain("#");
      expect(options.hash).toBe("notes");
    });
  });

  it("splits a combined query + fragment target into to / search / hash", async () => {
    // Production shape: symptomEvidenceChecklistRules builds
    // `/timeline?growId=<id>#timeline-entry-<x>` (timelinePath + anchor) and
    // hands it to a compat Link. Splitting only the fragment would still
    // leave `?growId=...` inside `to`, which buildLocation folds into the
    // pathname with an EMPTY search object — the same polluted committed
    // state, one layer down.
    const router = buildWorkspaceRouter();
    const navigateSpy = vi.spyOn(router, "navigate");
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByTestId("combined-nav-button"));

    await waitFor(() => {
      const calls = navigateSpy.mock.calls.filter((call) => {
        const options = call[0] as { to?: string } | undefined;
        return typeof options?.to === "string" && options.to.startsWith("/hunts");
      });
      expect(calls).toHaveLength(1);
      const options = calls[0]?.[0] as {
        to?: string;
        search?: Record<string, string>;
        hash?: string;
      };
      expect(options.to).toBe("/hunts/55/workspace");
      expect(options.to).not.toContain("?");
      expect(options.to).not.toContain("#");
      expect(options.search).toEqual({ growId: "g-1" });
      expect(options.hash).toBe("notes");
    });
  });

  it("useSearchParams setter changes search, preserves the hash, keeps pathname clean", async () => {
    // Third fragment path (Copilot #755): starting on a hashed location, the
    // setter must not fold the new query into `to` and must carry the
    // grower's current anchor across the update.
    const router = buildWorkspaceRouter(["/hunts/55/workspace#notes"]);
    render(<RouterProvider router={router} />);
    await screen.findByTestId("workspace-page");

    fireEvent.click(await screen.findByTestId("set-search-button"));

    await waitFor(() => {
      expect(router.state.location.searchStr).toContain("view=keepers");
    });
    expect(router.state.location.pathname).toBe("/hunts/55/workspace");
    expect(router.state.location.pathname).not.toContain("?");
    expect(router.state.location.hash).toBe("notes");
  });

  it("clicking a same-page fragment Link commits a clean pathname + hash, no remount, no loop", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = buildWorkspaceRouter();
    render(<RouterProvider router={router} />);
    await screen.findByTestId("workspace-page");
    const mountsBefore = mounts.count;

    fireEvent.click(await screen.findByTestId("fragment-link"));

    await waitFor(() => {
      expect(router.state.location.hash).toBe("notes");
    });
    expect(router.state.location.pathname).toBe("/hunts/55/workspace");
    expect(router.state.location.pathname).not.toContain("#");
    expect(router.state.status).toBe("idle");
    // Same-route fragment navigation must not remount the page component —
    // a remount is what detached the census's clicked anchor mid-action.
    expect(mounts.count).toBe(mountsBefore);

    const updateDepthErrors = consoleError.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("Maximum update depth")),
    );
    expect(updateDepthErrors).toHaveLength(0);
  });
});
