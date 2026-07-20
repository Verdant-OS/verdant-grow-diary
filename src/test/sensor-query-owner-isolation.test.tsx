import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "owner-a" as string | null,
  queryCalls: 0,
  fail: false,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: state.userId ? { id: state.userId } : null,
    session: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  function createBuilder() {
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: () => builder,
      then: (
        resolve: (value: { data: unknown[] | null; error: Error | null }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => {
        state.queryCalls += 1;
        const response = state.fail
          ? { data: null, error: new Error("sensor read failed") }
          : { data: [], error: null };
        return Promise.resolve(response).then(resolve, reject);
      },
    };
    return builder;
  }

  return { supabase: { from: () => createBuilder() } };
});

import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { buildPrivateSensorQueryKey } from "@/lib/growDataQueryKeyRules";

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  state.userId = "owner-a";
  state.queryCalls = 0;
  state.fail = false;
});

describe("private sensor query owner isolation", () => {
  it("never renders owner A cached rows after switching to owner B on one QueryClient", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 3, staleTime: Number.POSITIVE_INFINITY } },
    });
    client.setQueryData(buildPrivateSensorQueryKey("owner-a", ["all", 60]), [
      { id: "owner-a-private-row" },
    ]);

    const observedAfterSwitch: string[][] = [];
    let switched = false;
    const { result, rerender } = renderHook(
      () => {
        const query = useSensorReadings(undefined, 60);
        if (switched) {
          observedAfterSwitch.push(
            (query.data ?? []).map((row) => String((row as { id?: string }).id ?? "")),
          );
        }
        return query;
      },
      { wrapper: makeWrapper(client) },
    );

    expect(result.current.data?.map((row) => row.id)).toEqual(["owner-a-private-row"]);
    expect(state.queryCalls).toBe(0);

    switched = true;
    state.userId = "owner-b";
    rerender();

    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(state.queryCalls).toBe(1);
    expect(observedAfterSwitch.flat()).not.toContain("owner-a-private-row");
  });

  it("does not inherit a QueryClient default that retries failed sensor reads", async () => {
    state.fail = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: 3 } } });

    const { result } = renderHook(() => useSensorReadings(undefined, 60), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(state.queryCalls).toBe(1);
  });
});
