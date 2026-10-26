import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_SETTLE_WAIT_MS, GROW_READ_BUDGET_MS } from "@/lib/growsReadRetryRules";
import { GrowsProvider, useGrows } from "@/store/grows";

type GrowQueryResponse = {
  data: Array<{ id: string; name: string }> | null;
  error: { message: string; code?: string } | null;
};

const state = vi.hoisted(() => ({
  authLoading: false,
  userId: "owner-a" as string | null,
  script: [] as Array<GrowQueryResponse | "hang">,
  started: 0,
}));

const reportErrorWhenReady = vi.hoisted(() =>
  vi.fn(async (_error: unknown, _context?: unknown) => {}),
);

vi.mock("@/lib/errorReporter", () => ({
  reportErrorWhenReady: (error: unknown, context?: unknown) => reportErrorWhenReady(error, context),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: state.userId ? { id: state.userId } : null,
    session: null,
    loading: state.authLoading,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  function createBuilder() {
    const index = state.started;
    state.started += 1;
    const step = state.script[index] ?? state.script[state.script.length - 1];
    const promise =
      step === "hang"
        ? new Promise<GrowQueryResponse>(() => {})
        : Promise.resolve(step ?? { data: [], error: null });
    const builder = {
      select: () => builder,
      order: () => builder,
      then: (
        onFulfilled: (value: GrowQueryResponse) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => promise.then(onFulfilled, onRejected),
    };
    return builder;
  }
  return { supabase: { from: () => createBuilder() } };
});

function Probe() {
  const { grows, loading, error } = useGrows();
  return (
    <output data-testid="review-grows">
      {`${loading ? "loading" : "ready"}|${error ?? "ok"}|${grows.map((grow) => grow.id).join(",")}`}
    </output>
  );
}

function renderProbe() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GrowsProvider>
        <Probe />
      </GrowsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.authLoading = false;
  state.userId = "owner-a";
  state.script = [];
  state.started = 0;
  reportErrorWhenReady.mockClear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GrowsProvider review cases", () => {
  it("shows grows after a transient failure succeeds on retry", async () => {
    state.script = [
      { data: null, error: { message: "temporary", code: "57014" } },
      { data: [{ id: "g-retry", name: "Retried" }], error: null },
    ];
    renderProbe();
    await waitFor(() =>
      expect(screen.getByTestId("review-grows")).toHaveTextContent("ready|ok|g-retry"),
    );
    expect(state.started).toBe(2);
    expect(reportErrorWhenReady).not.toHaveBeenCalled();
  });

  it("tags a timed-out read as critical_read_deadline", async () => {
    vi.useFakeTimers();
    state.script = ["hang"];
    renderProbe();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GROW_READ_BUDGET_MS + 500);
    });
    expect(screen.getByTestId("review-grows")).toHaveTextContent("ready|critical_read_deadline|");
    expect(reportErrorWhenReady).toHaveBeenCalledWith(expect.any(Error), {
      source: "grows_provider",
      handled: true,
      failureKind: "timeout",
      failureCode: "critical_read_deadline",
    });
    expect(state.started).toBeGreaterThan(1);
    expect(state.started).toBeLessThanOrEqual(3);
  });

  it("does not start another attempt after unmount", async () => {
    vi.useFakeTimers();
    state.script = [
      { data: null, error: { message: "temporary", code: "57014" } },
      { data: [{ id: "late", name: "Late" }], error: null },
    ];
    const view = renderProbe();
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.started).toBe(1);
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GROW_READ_BUDGET_MS);
    });
    expect(state.started).toBe(1);
    expect(reportErrorWhenReady).not.toHaveBeenCalled();
  });

  it("does not publish a cancelled retry after the user changes", async () => {
    vi.useFakeTimers();
    state.script = [
      { data: null, error: { message: "temporary", code: "57014" } },
      { data: [{ id: "owner-b-grow", name: "B" }], error: null },
    ];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <GrowsProvider>
          <Probe />
        </GrowsProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    state.userId = "owner-b";
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <GrowsProvider>
          <Probe />
        </GrowsProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByTestId("review-grows")).toHaveTextContent("ready|ok|owner-b-grow");
    expect(reportErrorWhenReady).not.toHaveBeenCalled();
  });

  it("does not retry RLS denial 42501", async () => {
    state.script = [
      { data: null, error: { message: "row hidden", code: "42501" } },
      { data: [{ id: "should-not-load", name: "Nope" }], error: null },
    ];
    renderProbe();
    await waitFor(() =>
      expect(screen.getByTestId("review-grows")).toHaveTextContent("ready|Unable to load grows|"),
    );
    expect(state.started).toBe(1);
    expect(reportErrorWhenReady).toHaveBeenCalledWith(expect.any(Error), {
      source: "grows_provider",
      handled: true,
      failureKind: "db",
      failureCode: "42501",
    });
  });

  it("starts the read when the auth-settle wait times out", async () => {
    vi.useFakeTimers();
    state.authLoading = true;
    state.script = [{ data: [{ id: "g-1", name: "One" }], error: null }];
    renderProbe();
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.started).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_SETTLE_WAIT_MS);
    });
    expect(state.started).toBe(1);
    expect(screen.getByTestId("review-grows")).toHaveTextContent("ready|ok|g-1");
  });
});
