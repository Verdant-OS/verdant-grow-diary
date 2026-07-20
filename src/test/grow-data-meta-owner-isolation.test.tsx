import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tent } from "@/mock";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const state = vi.hoisted(() => ({
  ownerId: "owner-a" as string | null,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: state.ownerId ? { id: state.ownerId } : null,
    session: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/growRepo", () => ({
  fetchTents: vi.fn(),
  fetchTent: vi.fn(),
  fetchPlants: vi.fn(),
  fetchPlant: vi.fn(),
  fetchSensorReadings: vi.fn(),
}));

import * as repo from "@/lib/growRepo";
import {
  DEFAULT_GROW_DATA_META,
  clearGrowDataMeta,
  getGrowDataMeta,
  useGrowTents,
} from "@/hooks/useGrowData";

const TENTS_META_KEY = ["grow", "tents", "all"] as const;

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  state.ownerId = "owner-a";
  vi.clearAllMocks();
  clearGrowDataMeta();
});

describe("grow data source metadata owner isolation", () => {
  it("does not let a late owner A request surface metadata to owner B", async () => {
    const ownerARequest = deferred<Tent[]>();
    const ownerBRequest = deferred<Tent[]>();
    const ownerATents = [{ id: "owner-a-tent", name: "Owner A Tent" }] as unknown as Tent[];
    vi.mocked(repo.fetchTents)
      .mockImplementationOnce(() => ownerARequest.promise)
      .mockImplementationOnce(() => ownerBRequest.promise);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
    const { result, rerender } = renderHook(() => useGrowTents(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(repo.fetchTents).toHaveBeenCalledTimes(1));

    state.ownerId = "owner-b";
    rerender();
    await waitFor(() => expect(repo.fetchTents).toHaveBeenCalledTimes(2));
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      ownerARequest.resolve(ownerATents);
      await ownerARequest.promise;
    });

    await waitFor(() =>
      expect(getGrowDataMeta(TENTS_META_KEY, "owner-a")).toEqual({
        isDemoData: false,
        dataSource: "supabase",
        sourceReason: "supabase:rows",
      }),
    );
    expect(result.current.isPending).toBe(true);
    expect(getGrowDataMeta(TENTS_META_KEY, "owner-b")).toEqual(DEFAULT_GROW_DATA_META);

    await act(async () => {
      ownerBRequest.resolve([]);
      await ownerBRequest.promise;
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(getGrowDataMeta(TENTS_META_KEY, "owner-b")).toEqual({
      isDemoData: false,
      dataSource: "unavailable",
      sourceReason: "no-rows",
    });
  });
});
