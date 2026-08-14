/**
 * Committed-location contract for the react-router compat layer (both the
 * production module and its Vitest override, which this file exercises via
 * the vitest alias).
 *
 * Scenario from PR #713 review: /auth?redirectTo=… is mounted; a navigation
 * to /plants is IN FLIGHT (loader pending). React-router semantics: the
 * still-mounted Auth page must keep reading its committed location — the
 * redirectTo param must NOT vanish mid-transition because state.location
 * already points at the target. After the navigation resolves, the hooks
 * observe /plants.
 *
 * This drives the REAL TanStack router (memory history + gated loader) —
 * no values are swapped in manually outside the router.
 */
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useLocation, useSearchParams } from "@/lib/react-router-compat";
import { selectCommittedLocation } from "@/lib/routerCommittedLocation";

function Probe({ id }: { id: string }) {
  const location = useLocation();
  const [params] = useSearchParams();
  return (
    <div
      data-testid={id}
      data-pathname={location.pathname}
      data-redirect={params.get("redirectTo") ?? ""}
    />
  );
}

function buildRouter() {
  let releasePlants!: () => void;
  const plantsGate = new Promise<void>((resolve) => {
    releasePlants = resolve;
  });

  const rootRoute = createRootRoute({
    component: () => (
      <>
        {/* Root probe stays mounted across the transition. */}
        <Probe id="root-probe" />
        <Outlet />
      </>
    ),
  });
  const authRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/auth",
    validateSearch: (search: Record<string, unknown>) => search,
    // The still-mounted page under test: reads hooks while /plants loads.
    component: () => <Probe id="auth-probe" />,
  });
  const plantsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/plants",
    loader: async () => {
      await plantsGate;
      return null;
    },
    component: () => <div data-testid="plants-page" />,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([authRoute, plantsRoute]),
    history: createMemoryHistory({
      initialEntries: ["/auth?redirectTo=%2Fplants%2Fplant-a"],
    }),
  });
  return { router, releasePlants };
}

describe("compat hooks during pending navigation", () => {
  it("a still-mounted page reads the committed location, then observes the resolved target", async () => {
    const { router, releasePlants } = buildRouter();
    render(<RouterProvider router={router as never} />);

    // Committed state before any navigation.
    const authProbe = await screen.findByTestId("auth-probe");
    expect(authProbe.getAttribute("data-pathname")).toBe("/auth");
    expect(authProbe.getAttribute("data-redirect")).toBe("/plants/plant-a");

    // Start the navigation; the gated loader keeps it pending.
    await act(async () => {
      void router.navigate({ to: "/plants" } as never);
    });
    await waitFor(() => expect(router.state.status).toBe("pending"));

    // The router's raw state.location is already the target…
    expect(router.state.location.pathname).toBe("/plants");
    // …but the still-mounted page must keep its committed view.
    const pendingAuthProbe = screen.getByTestId("auth-probe");
    expect(pendingAuthProbe.getAttribute("data-pathname")).toBe("/auth");
    expect(pendingAuthProbe.getAttribute("data-redirect")).toBe("/plants/plant-a");
    const pendingRootProbe = screen.getByTestId("root-probe");
    expect(pendingRootProbe.getAttribute("data-pathname")).toBe("/auth");
    expect(pendingRootProbe.getAttribute("data-redirect")).toBe("/plants/plant-a");

    // Resolve the navigation.
    await act(async () => {
      releasePlants();
    });
    await waitFor(() => expect(router.state.status).toBe("idle"));
    await screen.findByTestId("plants-page");
    const rootProbe = screen.getByTestId("root-probe");
    expect(rootProbe.getAttribute("data-pathname")).toBe("/plants");
    expect(rootProbe.getAttribute("data-redirect")).toBe("");
  });

  it("selectCommittedLocation is the single shared rule (pure)", () => {
    const committed = { pathname: "/auth" };
    const target = { pathname: "/plants" };
    expect(
      selectCommittedLocation({ status: "pending", location: target, resolvedLocation: committed }),
    ).toBe(committed);
    expect(selectCommittedLocation({ status: "idle", location: target })).toBe(target);
    expect(
      selectCommittedLocation({ status: "pending", location: target, resolvedLocation: null }),
    ).toBe(target);
  });
});
