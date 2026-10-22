/**
 * Filming bug #16 (2026-10-22): tapping a filter/status chip jumped the page
 * back to the top. Chips write URL search params through the compat
 * `setSearchParams`, which asked TanStack to reset scroll on every call and
 * no caller ever opted out. A search-param update now keeps the scroll
 * position unless the caller explicitly passes `preventScrollReset: false`.
 *
 * The product shim is exercised by relative path (bypassing the Vitest
 * alias) against a REAL TanStack router. The Vitest override keeps its old
 * reset-scroll default until its scorer lock is renegotiated; jsdom never
 * scrolls, so component tests are unaffected either way.
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

type UseSearchParams = typeof productUseSearchParams;

function buildRouter(useSearchParams: UseSearchParams, preventScrollReset?: boolean) {
  function Chips() {
    const [params, setParams] = useSearchParams();
    return (
      <>
        <output data-testid="filter">{params.get("type") ?? ""}</output>
        <button
          type="button"
          onClick={() =>
            setParams(
              { type: "watering" },
              preventScrollReset === undefined ? undefined : { preventScrollReset },
            )
          }
        >
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

async function clickChip(useSearchParams: UseSearchParams, preventScrollReset?: boolean) {
  const router = buildRouter(useSearchParams, preventScrollReset);
  const navigate = vi.spyOn(router, "navigate");
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
  fireEvent.click(await screen.findByText("Watering chip"));
  await waitFor(() => expect(screen.getByTestId("filter")).toHaveTextContent("watering"));
  return navigate.mock.calls.at(-1)?.[0] as { resetScroll?: boolean } | undefined;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("product shim setSearchParams scroll behaviour", () => {
  const useSearchParams = productUseSearchParams;
  it("keeps the scroll position when a chip changes a search param", async () => {
    expect((await clickChip(useSearchParams))?.resetScroll).toBe(false);
  });

  it("still resets scroll when the caller opts in", async () => {
    expect((await clickChip(useSearchParams, false))?.resetScroll).toBe(true);
  });
});
