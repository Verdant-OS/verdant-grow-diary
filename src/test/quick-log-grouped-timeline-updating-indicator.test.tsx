// @vitest-environment jsdom
/**
 * QuickLogGroupedTimelineSection — post-save updating indicator.
 *
 * Verifies:
 *  - The "Updating QuickLog timeline…" indicator renders while the
 *    grouped timeline query is refetching after a cache invalidation,
 *    and only then.
 *  - The indicator does NOT render for unrelated query activity
 *    (different prefix invalidations).
 *  - The indicator copy is exact and calm.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection, {
  QUICK_LOG_GROUPED_TIMELINE_UPDATING_LABEL,
} from "@/components/QuickLogGroupedTimelineSection";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: [] }) }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: [] }) }));

function buildQueryStub(resolveNow: () => Promise<unknown[]>) {
  const builder: Record<string, unknown> = {};
  const passthrough = () => builder;
  builder.select = passthrough;
  builder.eq = passthrough;
  builder.in = passthrough;
  builder.or = passthrough;
  builder.order = passthrough;
  builder.limit = () => resolveNow().then((data) => ({ data, error: null }));
  return builder;
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("QuickLogGroupedTimelineSection — updating indicator", () => {
  it("shows the calm updating label while a post-save refetch is in flight", async () => {
    // First fetch resolves immediately with empty data.
    let pendingResolve: ((v: unknown[]) => void) | null = null;
    fromMock
      .mockImplementationOnce(() => buildQueryStub(() => Promise.resolve([])))
      .mockImplementationOnce(() =>
        buildQueryStub(
          () =>
            new Promise<unknown[]>((res) => {
              pendingResolve = res;
            }),
        ),
      );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <QuickLogGroupedTimelineSection
          scope="plant"
          plantId="plant-1"
          tentId="tent-1"
        />
      </QueryClientProvider>,
    );

    // After initial load, indicator is not shown.
    await waitFor(() =>
      expect(
        screen.queryByTestId("quick-log-grouped-timeline-loading"),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("quick-log-grouped-timeline-updating"),
    ).not.toBeInTheDocument();

    // Invalidate the grouped timeline → triggers refetch which we hold pending.
    // Do NOT await: invalidateQueries resolves only after refetch settles.
    act(() => {
      void client.invalidateQueries({
        queryKey: ["quick_log_grouped_timeline"],
      });
    });

    // Updating indicator should now be visible.
    await waitFor(() =>
      expect(
        screen.getByTestId("quick-log-grouped-timeline-updating"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("quick-log-grouped-timeline-updating").textContent,
    ).toBe(QUICK_LOG_GROUPED_TIMELINE_UPDATING_LABEL);

    // Resolve the pending refetch — indicator clears.
    await act(async () => {
      pendingResolve?.([]);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.queryByTestId("quick-log-grouped-timeline-updating"),
      ).not.toBeInTheDocument(),
    );
  });

  it("does not show the updating indicator for unrelated query activity", async () => {
    fromMock.mockImplementation(() => buildQueryStub(() => Promise.resolve([])));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <QuickLogGroupedTimelineSection
          scope="tent"
          tentId="tent-1"
        />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId("quick-log-grouped-timeline-loading"),
      ).not.toBeInTheDocument(),
    );
    // Invalidate an unrelated key.
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["dashboard_memory"] });
    });
    expect(
      screen.queryByTestId("quick-log-grouped-timeline-updating"),
    ).not.toBeInTheDocument();
  });
});
