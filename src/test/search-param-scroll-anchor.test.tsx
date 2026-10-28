/**
 * #2348 review follow-ups to filming bug #16 (search-param chips keep scroll):
 *
 * 1. A position-preserving search update on an anchored URL
 *    (`#timeline-entry-…`) must not scroll back to the anchor. TanStack's
 *    `hashScrollIntoView` defaults to true, so both setters disable it unless
 *    the caller opts back into a scroll reset.
 *    Pagination keeping its scroll reset is pinned in
 *    `ai-doctor-sessions-pager-scroll-reset.test.tsx`.
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
type NavigateArg = { resetScroll?: boolean; hashScrollIntoView?: unknown; hash?: string };

function buildAnchoredRouter(useSearchParams: UseSearchParams, preventScrollReset?: boolean) {
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
    history: createMemoryHistory({ initialEntries: ["/timeline#timeline-entry-42"] }),
  });
}

async function clickChipOnAnchoredRoute(
  useSearchParams: UseSearchParams,
  preventScrollReset?: boolean,
) {
  const router = buildAnchoredRouter(useSearchParams, preventScrollReset);
  const navigate = vi.spyOn(router, "navigate");
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
  fireEvent.click(await screen.findByText("Watering chip"));
  await waitFor(() => expect(screen.getByTestId("filter")).toHaveTextContent("watering"));
  return navigate.mock.calls.at(-1)?.[0] as NavigateArg | undefined;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([
  ["product shim", productUseSearchParams],
  ["vitest override", aliasUseSearchParams],
])("%s setSearchParams on an anchored route", (_name, useSearchParams) => {
  it("keeps the anchor but does not scroll back to it", async () => {
    const call = await clickChipOnAnchoredRoute(useSearchParams);
    expect(call?.hash).toBe("timeline-entry-42");
    expect(call?.resetScroll).toBe(false);
    expect(call?.hashScrollIntoView).toBe(false);
  });

  it("leaves hash scrolling at TanStack's default when the caller opts into a reset", async () => {
    const call = await clickChipOnAnchoredRoute(useSearchParams, false);
    expect(call?.resetScroll).toBe(true);
    expect(call && "hashScrollIntoView" in call).toBe(false);
  });
});
