/**
 * Timeline navigation must not paint the Dashboard while the next route is
 * pending, and a direct /timeline match must not select the Dashboard route.
 * TanStack keeps the previous match in the DOM with display:none for the
 * in-flight transition; the assertion is that it is not visible and the
 * Timeline skeleton is.
 *
 * Auth and network stay mocked: this file never reads credentials.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import RouteTransitionSkeleton from "@/components/RouteTransitionSkeleton";
import { routeTransitionRouterOptions } from "@/lib/routeTransitionRules";
import { getRouter } from "@/router";

const mounts = { dashboard: 0, timeline: 0 };

function DashboardPage() {
  mounts.dashboard += 1;
  return <div data-testid="dashboard-page">Dashboard</div>;
}

function TimelinePage() {
  mounts.timeline += 1;
  return <div data-testid="timeline-page">Timeline</div>;
}

function TimelinePending() {
  return <RouteTransitionSkeleton label="Timeline" testId="timeline-route-skeleton" />;
}

function buildRouter(initialPath: string, holdTimeline: Promise<void>) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/dashboard",
    component: DashboardPage,
  });
  const timelineRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/timeline",
    loader: () => holdTimeline,
    pendingComponent: TimelinePending,
    component: TimelinePage,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([dashboardRoute, timelineRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    ...routeTransitionRouterOptions(),
    defaultPendingComponent: () => (
      <RouteTransitionSkeleton label="Opening page" testId="route-transition-skeleton" />
    ),
  });
}

afterEach(() => {
  cleanup();
  mounts.dashboard = 0;
  mounts.timeline = 0;
});

describe("Timeline route does not mount the Dashboard", () => {
  it("matches /timeline on the timeline route in the production router", () => {
    const router = getRouter();
    expect(router.options.defaultPendingMs).toBe(0);
    expect(router.options.defaultPendingMinMs).toBe(0);
    const stack = router.matchRoutes("/timeline", {}) as Array<{ routeId: string }>;
    const ids = stack.map((match) => match.routeId);
    expect(ids).toContain("/_app/timeline");
    expect(ids).not.toContain("/_app/dashboard");
    expect(ids).not.toContain("/");
  });

  it("opens /timeline without ever mounting the Dashboard", async () => {
    const router = buildRouter("/timeline", Promise.resolve());
    render(<RouterProvider router={router} />);
    expect(await screen.findByTestId("timeline-page")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-page")).toBeNull();
    expect(mounts.dashboard).toBe(0);
  });

  it("drops the Dashboard as soon as navigation to Timeline is pending", async () => {
    let release: () => void = () => {};
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const router = buildRouter("/dashboard", hold);
    render(<RouterProvider router={router} />);
    expect(await screen.findByTestId("dashboard-page")).toBeInTheDocument();
    const seen = mounts.dashboard;

    void router.navigate({ to: "/timeline" });

    await waitFor(() => {
      expect(screen.getByTestId("timeline-route-skeleton")).toBeVisible();
      expect(screen.getByTestId("dashboard-page")).not.toBeVisible();
    });
    expect(screen.getByTestId("timeline-route-skeleton")).toHaveTextContent("Timeline");
    expect(mounts.dashboard).toBe(seen);
    expect(mounts.timeline).toBe(0);

    release();
    expect(await screen.findByTestId("timeline-page")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-page")).toBeNull();
    expect(screen.queryByTestId("timeline-route-skeleton")).toBeNull();
  });
});
