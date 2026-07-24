import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";
import { ROOT_ZONE_OBSERVATION_CAP } from "@/lib/rootZoneObservationRules";
import type { RootZoneObservationScope } from "@/hooks/useRootZoneObservations";

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";
const USER_A_ID = "44444444-4444-4444-8444-444444444444";
const USER_B_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  authUserId: "44444444-4444-4444-8444-444444444444" as string | null,
  rows: [] as unknown[],
  error: null as unknown,
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: mocks.authUserId ? { id: mocks.authUserId } : null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = {
    select: mocks.select,
    eq: mocks.eq,
    in: mocks.in,
    or: mocks.or,
    order: mocks.order,
    limit: mocks.limit,
  };
  mocks.from.mockImplementation(() => builder);
  mocks.select.mockImplementation(() => builder);
  mocks.eq.mockImplementation(() => builder);
  mocks.in.mockImplementation(() => builder);
  mocks.or.mockImplementation(() => builder);
  mocks.order.mockImplementation(() => builder);
  return { supabase: { from: mocks.from } };
});

import { useRootZoneObservations } from "@/hooks/useRootZoneObservations";

const scope: RootZoneObservationScope = {
  kind: "plant_context",
  growId: GROW_ID,
  tentId: TENT_ID,
  plantId: PLANT_ID,
};

function rootZoneQueryKey(ownerId: string, value: RootZoneObservationScope = scope) {
  return buildPrivateGrowQueryKey(ownerId, [
    "root_zone_observations",
    value.kind,
    value.kind === "plant" ? value.plantId : null,
    value.kind === "plant_context" ? value.plantId : null,
    value.kind === "plant_context" ? value.tentId : null,
    value.kind === "plant_context" ? value.growId : null,
    value.kind === "tent" ? value.tentId : null,
    value.kind === "grow" ? value.growId : null,
    ROOT_ZONE_OBSERVATION_CAP,
  ]);
}

function makeHarness() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
      },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, wrapper: Wrapper };
}

function wateringRow(volumeMl: number) {
  return {
    id: `watering-${volumeMl}`,
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    event_type: "watering",
    occurred_at: "2026-07-19T12:00:00.000Z",
    source: "manual",
    is_deleted: false,
    watering_events: [{ volume_ml: volumeMl }],
    feeding_events: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const builder = {
    select: mocks.select,
    eq: mocks.eq,
    in: mocks.in,
    or: mocks.or,
    order: mocks.order,
    limit: mocks.limit,
  };
  mocks.from.mockImplementation(() => builder);
  mocks.select.mockImplementation(() => builder);
  mocks.eq.mockImplementation(() => builder);
  mocks.in.mockImplementation(() => builder);
  mocks.or.mockImplementation(() => builder);
  mocks.order.mockImplementation(() => builder);
  mocks.authUserId = USER_A_ID;
  mocks.rows = [];
  mocks.error = null;
  mocks.limit.mockImplementation(async () => ({ data: mocks.rows, error: mocks.error }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useRootZoneObservations confirmed-save refresh", () => {
  it("refetches the exact owner/scope key and leaves unrelated private cache entries alone", async () => {
    const { client, wrapper } = makeHarness();
    const { result } = renderHook(() => useRootZoneObservations(scope), { wrapper });
    await waitFor(() => expect(mocks.limit).toHaveBeenCalledTimes(1));
    expect(result.current.observations).toEqual([]);

    const unrelatedKey = rootZoneQueryKey(USER_B_ID, { kind: "grow", growId: GROW_ID });
    client.setQueryData(unrelatedKey, ["unrelated-owner-and-scope"]);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    mocks.rows = [wateringRow(500)];

    act(() => {
      window.dispatchEvent(new CustomEvent(QUICK_LOG_V2_ENTRY_CREATED_EVENT));
    });

    await waitFor(() => expect(result.current.observations).toHaveLength(1));
    expect(result.current.observations[0]?.metrics.volumeMl).toBe(500);
    expect(mocks.limit).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: rootZoneQueryKey(USER_A_ID),
      exact: true,
    });
    expect(client.getQueryData(unrelatedKey)).toEqual(["unrelated-owner-and-scope"]);
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  });

  it("removes the confirmed-save listener when the hook unmounts", async () => {
    const { client, wrapper } = makeHarness();
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useRootZoneObservations(scope), { wrapper });
    await waitFor(() => expect(mocks.limit).toHaveBeenCalledTimes(1));
    const invalidate = vi.spyOn(client, "invalidateQueries");

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      QUICK_LOG_V2_ENTRY_CREATED_EVENT,
      expect.any(Function),
    );
    act(() => {
      window.dispatchEvent(new CustomEvent(QUICK_LOG_V2_ENTRY_CREATED_EVENT));
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(mocks.limit).toHaveBeenCalledTimes(1);
  });

  it("keeps null, incomplete, invalid, and unauthenticated scopes idle even on manual refetch", async () => {
    const invalidScopes: Array<RootZoneObservationScope | null> = [
      null,
      { kind: "plant", plantId: "demo-plant" },
      { kind: "plant_context", plantId: PLANT_ID, tentId: "", growId: GROW_ID },
      { kind: "tent", tentId: "demo-tent" },
      { kind: "grow", growId: "demo-grow" },
    ];

    for (const invalidScope of invalidScopes) {
      const { wrapper } = makeHarness();
      const { result, unmount } = renderHook(() => useRootZoneObservations(invalidScope), {
        wrapper,
      });
      expect(result.current.observations).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
      await act(async () => {
        await result.current.refetch();
      });
      unmount();
    }

    mocks.authUserId = null;
    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useRootZoneObservations(scope), { wrapper });
    await act(async () => {
      await result.current.refetch();
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not reuse root-zone observations after an authenticated owner swap", async () => {
    mocks.rows = [wateringRow(250)];
    const { client, wrapper } = makeHarness();
    const { result, rerender } = renderHook(() => useRootZoneObservations(scope), { wrapper });
    await waitFor(() => expect(result.current.observations[0]?.metrics.volumeMl).toBe(250));

    mocks.authUserId = USER_B_ID;
    mocks.rows = [];
    rerender();

    await waitFor(() => {
      expect(mocks.limit).toHaveBeenCalledTimes(2);
      expect(result.current.isFetching).toBe(false);
      expect(result.current.observations).toEqual([]);
    });
    expect(client.getQueryData(rootZoneQueryKey(USER_A_ID))).toHaveLength(1);
    expect(client.getQueryData(rootZoneQueryKey(USER_B_ID))).toEqual([]);
  });
});

describe("root-zone observation refresh safety fence", () => {
  const source = readFileSync(resolve(__dirname, "../hooks/useRootZoneObservations.ts"), "utf8");

  it("stays owner-keyed, UUID-gated, SELECT-only, and free of control side effects", () => {
    expect(source).toContain("buildPrivateGrowQueryKey");
    expect(source).toContain("useAuth");
    expect(source).toContain("isQueryableScope");
    expect(source).toContain("QUICK_LOG_V2_ENTRY_CREATED_EVENT");
    expect(source).toMatch(/addEventListener\([\s\S]*removeEventListener\(/);
    expect(source).toContain("exact: true");
    expect(source).toContain('.from("grow_events")');
    expect(source).not.toMatch(/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
    expect(source).not.toMatch(/\.rpc\s*\(|functions\.invoke|service_role/i);
    expect(source).not.toMatch(/\.eq\(\s*["']user_id["']/);
    expect(source).not.toMatch(/action_queue|device_control|turn_on|turn_off/i);
  });
});
