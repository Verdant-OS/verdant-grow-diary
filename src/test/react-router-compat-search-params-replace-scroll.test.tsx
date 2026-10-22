/**
 * Timeline and other filter chips call `setSearchParams(next, { replace: true })`
 * without `preventScrollReset`. After filming bug #16, that must still keep scroll
 * (resetScroll: false) while honoring replace navigation.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { useSearchParams as productUseSearchParams } from "../lib/react-router-compat";
import { useSearchParams as aliasUseSearchParams } from "@/lib/react-router-compat";

type UseSearchParams = typeof productUseSearchParams;

function buildRouter(useSearchParams: UseSearchParams) {
  function Chips() {
    const [params, setParams] = useSearchParams();
    return (
      <>
        <output data-testid="filter">{params.get("type") ?? ""}</output>
        <button type="button" onClick={() => setParams({ type: "watering" }, { replace: true })}>
          Watering chip
        </button>
      </>
    );
  }
  const rootRoute = createRootRoute();
  const timeline = createRoute({
    getParentRoute: () => rootRoute,
    path: "/timeline",
    validateSearch: (search: Record<string, unknown>) => search,
    component: Chips,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([timeline]),
    history: createMemoryHistory({ initialEntries: ["/timeline"] }),
  });
}

async function clickReplaceChip(useSearchParams: UseSearchParams) {
  const router = buildRouter(useSearchParams);
  const navigate = vi.spyOn(router, "navigate");
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
  fireEvent.click(await screen.findByText("Watering chip"));
  await waitFor(() => expect(screen.getByTestId("filter")).toHaveTextContent("watering"));
  return navigate.mock.calls.at(-1)?.[0] as
    { resetScroll?: boolean; replace?: boolean } | undefined;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([
  ["product shim", productUseSearchParams],
  ["vitest override", aliasUseSearchParams],
])("%s setSearchParams with replace: true", (_name, useSearchParams) => {
  it("keeps scroll on replace-only chip updates", async () => {
    const nav = await clickReplaceChip(useSearchParams);
    expect(nav?.replace).toBe(true);
    expect(nav?.resetScroll).toBe(false);
  });
});
