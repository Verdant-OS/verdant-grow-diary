import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrubEvent } from "@/lib/errorReportingRules";
import {
  GROW_READ_BUDGET_MS,
  GROW_READ_MIN_RETRY_MS,
  readWithGrowRetry,
} from "@/lib/growsReadRetryRules";
import { GrowsProvider, useGrows } from "@/store/grows";

type GrowQueryResponse = {
  data: Array<{ id: string; name: string }> | null;
  error: { message: string; code?: string } | null;
};

const signals = vi.hoisted(() => ({ current: [] as AbortSignal[] }));

const state = vi.hoisted(() => ({
  authLoading: false,
  userId: "owner-a" as string | null,
  mode: "hang" as "hang" | "slow-success",
  started: 0,
  resolveSlow: null as ((value: GrowQueryResponse) => void) | null,
}));

vi.mock("@/lib/errorReporter", () => ({
  reportErrorWhenReady: vi.fn(async () => {}),
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
    state.started += 1;
    let resolveSlow: (value: GrowQueryResponse) => void = () => {};
    const promise =
      state.mode === "slow-success"
        ? new Promise<GrowQueryResponse>((resolve) => {
            resolveSlow = resolve;
            state.resolveSlow = resolve;
          })
        : new Promise<GrowQueryResponse>(() => {});
    if (state.mode === "slow-success") state.resolveSlow = resolveSlow;
    const builder = {
      select: () => builder,
      order: () => builder,
      abortSignal: (signal: AbortSignal) => {
        signals.current.push(signal);
        return builder;
      },
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
    <output data-testid="should-fix-grows">
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
  signals.current = [];
  state.authLoading = false;
  state.userId = "owner-a";
  state.mode = "hang";
  state.started = 0;
  state.resolveSlow = null;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("grows read should-fixes", () => {
  it("skips a retry when under a second of budget remains", async () => {
    let clock = 0;
    const read = vi.fn(async () => {
      clock = GROW_READ_BUDGET_MS - GROW_READ_MIN_RETRY_MS + 1;
      return {
        ok: false as const,
        failure: { kind: "timeout" as const, code: "critical_read_deadline" },
      };
    });
    const sleep = vi.fn(async (_ms: number) => {});
    const outcome = await readWithGrowRetry(read, {
      sleep,
      delays: [200, 400],
      budgetMs: GROW_READ_BUDGET_MS,
      now: () => clock,
    });
    expect(outcome.ok).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not fail a first attempt that succeeds in about 5s", async () => {
    state.mode = "slow-success";
    renderProbe();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByTestId("should-fix-grows")).toHaveTextContent("loading|ok|");
    await act(async () => {
      state.resolveSlow?.({ data: [{ id: "g-slow", name: "Slow" }], error: null });
      await Promise.resolve();
    });
    expect(screen.getByTestId("should-fix-grows")).toHaveTextContent("ready|ok|g-slow");
    expect(state.started).toBe(1);
    expect(signals.current[0]?.aborted).toBe(false);
  });

  it("aborts the query when the first attempt times out", async () => {
    renderProbe();
    await act(async () => {
      await Promise.resolve();
    });
    expect(signals.current).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(signals.current[0]?.aborted).toBe(true);
  });

  it("aborts the query when the provider unmounts", async () => {
    const view = renderProbe();
    await act(async () => {
      await Promise.resolve();
    });
    expect(signals.current[0]?.aborted).toBe(false);
    view.unmount();
    expect(signals.current[0]?.aborted).toBe(true);
  });

  it("drops an unsafe failure_code while scrubbing tags", () => {
    expect(
      scrubEvent({
        tags: { failure_kind: "db", failure_code: "bearer token" },
      }).tags,
    ).toEqual({ failure_kind: "db" });
    expect(
      scrubEvent({
        tags: { failure_kind: "db", failure_code: "PGRST301" },
      }).tags,
    ).toEqual({ failure_kind: "db", failure_code: "PGRST301" });
  });
});
