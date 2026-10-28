/**
 * A hung dashboard read for grow A must not replace grow B after the grower
 * switches scope. The 8s deadline is per request, not a global overwrite.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CRITICAL_READ_DEADLINE_MS } from "@/lib/boundedReadRules";
import { useDashboardScopedData } from "@/hooks/useDashboardScopedData";

const io = vi.hoisted(() => ({
  hangGrowIds: new Set<string>(),
  user: {
    id: "user-1",
    email: "grower@example.com",
    email_confirmed_at: "2026-07-01",
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  function queryFor() {
    const filters: Array<[string, unknown]> = [];
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      is() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      in() {
        return query;
      },
      or() {
        return query;
      },
      then(
        onFulfilled?: (value: { data: unknown[]; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        const growId = filters.find(([column]) => column === "grow_id")?.[1];
        if (typeof growId === "string" && io.hangGrowIds.has(growId)) return new Promise(() => {});
        return Promise.resolve({ data: [] as unknown[], error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
    };
    return query;
  }

  return { supabase: { from: () => queryFor() } };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: io.user,
    session: null,
    loading: false,
    signOut: vi.fn(async () => {}),
  }),
}));

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  io.hangGrowIds = new Set();
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("dashboard scoped deadline", () => {
  it("does not let a previous grow's deadline overwrite the current grow", async () => {
    vi.useFakeTimers();
    io.hangGrowIds.add("grow-a");
    const { result, rerender } = renderHook(
      ({ growId }: { growId: string }) => useDashboardScopedData(growId),
      {
        initialProps: { growId: "grow-a" },
        wrapper: ({ children }) => wrap(children),
      },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.recent.status).toBe("loading");

    rerender({ growId: "grow-b" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.recent.status).toBe("ok");
    expect(result.current.pending.status).toBe("ok");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
    });
    expect(result.current.recent.status).toBe("ok");
    expect(result.current.pending.status).toBe("ok");
  });
});
