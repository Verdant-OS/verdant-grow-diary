import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_SETTLE_WAIT_MS } from "@/lib/growsReadRetryRules";
import { GrowsProvider, useGrows } from "@/store/grows";

type GrowQueryResponse = {
  data: Array<{ id: string; name: string }> | null;
  error: { message: string; code?: string } | null;
};

const state = vi.hoisted(() => ({
  authLoading: true,
  userId: "owner-a" as string | null,
  script: [] as Array<GrowQueryResponse | "hang">,
  started: 0,
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
    const index = state.started;
    state.started += 1;
    const step = state.script[index] ?? { data: [], error: null };
    const promise =
      step === "hang" ? new Promise<GrowQueryResponse>(() => {}) : Promise.resolve(step);
    const builder = {
      select: () => builder,
      order: () => builder,
      abortSignal: () => builder,
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
    <output data-testid="auth-settle-grows">
      {`${loading ? "loading" : "ready"}|${error ?? "ok"}|${grows.map((grow) => grow.id).join(",")}|${state.started}`}
    </output>
  );
}

beforeEach(() => {
  state.authLoading = true;
  state.userId = "owner-a";
  state.script = [{ data: [{ id: "g-1", name: "One" }], error: null }];
  state.started = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("auth settle does not restart the grows read", () => {
  it("keeps the in-flight read when auth loading ends after the wait", async () => {
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
    expect(state.started).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_SETTLE_WAIT_MS);
    });
    expect(state.started).toBe(1);
    expect(screen.getByTestId("auth-settle-grows")).toHaveTextContent("ready|ok|g-1|1");

    state.authLoading = false;
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <GrowsProvider>
          <Probe />
        </GrowsProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(state.started).toBe(1);
    expect(screen.getByTestId("auth-settle-grows")).toHaveTextContent("ready|ok|g-1|1");
  });
});
