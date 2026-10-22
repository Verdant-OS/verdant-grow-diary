/**
 * `useLatestSensorSnapshotsByTent` (Codex P2 on #2303 at 0c19a9e0): the tents
 * list reads every tent's Dashboard snapshot once at page level. Each tent's
 * entry must be the same cache entry `useLatestSensorSnapshot(growId, [tentId])`
 * uses, so the Dashboard, Tent Detail and the list never read twice for one
 * tent, and a tent without a grow is idle and never queried.
 */
import { cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  latestSensorSnapshotQueryKey,
  useLatestSensorSnapshot,
  useLatestSensorSnapshotsByTent,
} from "@/hooks/useLatestSensorSnapshot";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

const io = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      io.from(table);
      throw new Error("unexpected network read");
    },
  },
}));

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROW = "11111111-1111-4111-8111-111111111111";
const TENT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const TENT_B = "aaaaaaaa-0000-4000-8000-000000000002";
const TENT_C = "aaaaaaaa-0000-4000-8000-000000000003";

function snapshotFor(tentId: string, temp: number): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "manual",
    ts: "2026-10-22T02:00:00.000Z",
    temp,
    tent_id: tentId,
  };
}

const clients: QueryClient[] = [];
function seededClient(): QueryClient {
  // Fresh forever, so a seeded entry is served from cache and nothing fetches.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  client.setQueryData(latestSensorSnapshotQueryKey(OWNER, GROW, [TENT_A]), snapshotFor(TENT_A, 21));
  client.setQueryData(latestSensorSnapshotQueryKey(OWNER, GROW, [TENT_B]), snapshotFor(TENT_B, 25));
  clients.push(client);
  return client;
}
const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  io.from.mockClear();
});

describe("useLatestSensorSnapshotsByTent", () => {
  it("returns one state per tent from the per-tent cache entries, with no extra read", () => {
    const client = seededClient();
    const { result } = renderHook(
      () =>
        useLatestSensorSnapshotsByTent([
          { tentId: TENT_A, growId: GROW },
          { tentId: TENT_B, growId: GROW },
        ]),
      { wrapper: wrapperFor(client) },
    );
    expect(result.current[TENT_A]).toMatchObject({ status: "ok", snapshot: { temp: 21 } });
    expect(result.current[TENT_B]).toMatchObject({ status: "ok", snapshot: { temp: 25 } });
    expect(io.from).not.toHaveBeenCalled();
  });

  it("shares each tent's cache entry with useLatestSensorSnapshot", () => {
    const client = seededClient();
    const wrapper = wrapperFor(client);
    const page = renderHook(
      () => useLatestSensorSnapshotsByTent([{ tentId: TENT_A, growId: GROW }]),
      { wrapper },
    );
    const single = renderHook(() => useLatestSensorSnapshot(GROW, [TENT_A]), { wrapper });
    expect(page.result.current[TENT_A].snapshot).toBe(single.result.current.snapshot);
    expect(io.from).not.toHaveBeenCalled();
  });

  it("is idle for a tent without a grow and never queries it", () => {
    const client = seededClient();
    const { result } = renderHook(
      () =>
        useLatestSensorSnapshotsByTent([
          { tentId: TENT_C, growId: null },
          { tentId: TENT_A, growId: GROW },
        ]),
      { wrapper: wrapperFor(client) },
    );
    expect(result.current[TENT_C]).toMatchObject({ status: "idle", snapshot: EMPTY_SNAPSHOT });
    expect(result.current[TENT_A].status).toBe("ok");
    expect(io.from).not.toHaveBeenCalled();
  });

  it("returns an empty record for no tents", () => {
    const client = seededClient();
    const { result } = renderHook(() => useLatestSensorSnapshotsByTent([]), {
      wrapper: wrapperFor(client),
    });
    expect(result.current).toEqual({});
  });
});
