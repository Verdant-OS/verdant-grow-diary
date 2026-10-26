import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

type GrowQueryResponse = {
  data: Array<{ id: string; name: string; is_archived?: boolean }> | null;
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

import { GrowsProvider, useGrows } from "@/store/grows";

function Probe() {
  const { grows, loading, error } = useGrows();
  return (
    <output data-testid="grows-state">
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
});

describe("GrowsProvider read retry", () => {
  it("waits until the post-sign-in session check finishes", async () => {
    state.authLoading = true;
    state.script = [{ data: [{ id: "g-1", name: "One" }], error: null }];
    const view = renderProbe();
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.started).toBe(0);
    expect(screen.getByTestId("grows-state")).toHaveTextContent("loading|ok|");

    state.authLoading = false;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <GrowsProvider>
          <Probe />
        </GrowsProvider>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("grows-state")).toHaveTextContent("ready|ok|g-1"),
    );
    expect(state.started).toBe(1);
    expect(reportErrorWhenReady).not.toHaveBeenCalled();
  });

  it("shows the error and reports a code after a persistent database failure", async () => {
    state.script = [{ data: null, error: { message: "secret grower note", code: "57014" } }];
    renderProbe();
    await waitFor(
      () =>
        expect(screen.getByTestId("grows-state")).toHaveTextContent("ready|Unable to load grows|"),
      {
        timeout: 4000,
      },
    );
    expect(state.started).toBe(3);
    expect(reportErrorWhenReady).toHaveBeenCalledTimes(1);
    expect(reportErrorWhenReady).toHaveBeenCalledWith(expect.any(Error), {
      source: "grows_provider",
      handled: true,
      failureKind: "db",
      failureCode: "57014",
    });
    const reported = reportErrorWhenReady.mock.calls[0]?.[0];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).message).toBe("grows_read_failed");
    expect(JSON.stringify(reportErrorWhenReady.mock.calls)).not.toContain("secret grower note");
  });
});
