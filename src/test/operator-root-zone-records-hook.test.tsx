import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";
import {
  ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP,
  ROOT_ZONE_OBSERVATION_CAP,
} from "@/lib/rootZoneObservationRules";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";
const EVENT_ID = "44444444-4444-4444-8444-444444444444";
const GROW_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  authUserId: "11111111-1111-4111-8111-111111111111" as string | null,
  currentTable: "" as string,
  growRows: [] as unknown[],
  companionRows: [] as unknown[],
  growError: null as unknown,
  companionError: null as unknown,
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  not: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: mocks.authUserId ? { id: mocks.authUserId } : null }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = {
    select: mocks.select,
    eq: mocks.eq,
    in: mocks.in,
    not: mocks.not,
    order: mocks.order,
    limit: mocks.limit,
  };
  mocks.from.mockImplementation((table: string) => {
    mocks.currentTable = table;
    return builder;
  });
  mocks.select.mockImplementation(() => builder);
  mocks.eq.mockImplementation(() => builder);
  mocks.in.mockImplementation(() => builder);
  mocks.not.mockImplementation(() => builder);
  mocks.order.mockImplementation(() => builder);
  return { supabase: { from: mocks.from } };
});

import { useOperatorRootZoneRecords } from "@/hooks/useOperatorRootZoneRecords";

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

function queryKey(ownerId = USER_ID) {
  return buildPrivateGrowQueryKey(ownerId, [
    "operator_root_zone_records",
    GROW_ID,
    TENT_ID,
    ROOT_ZONE_OBSERVATION_CAP,
  ]);
}

function wateringRow(volumeMl: number) {
  return {
    id: EVENT_ID,
    grow_id: GROW_ID,
    plant_id: PLANT_ID,
    tent_id: TENT_ID,
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
    not: mocks.not,
    order: mocks.order,
    limit: mocks.limit,
  };
  mocks.from.mockImplementation((table: string) => {
    mocks.currentTable = table;
    return builder;
  });
  mocks.select.mockImplementation(() => builder);
  mocks.eq.mockImplementation(() => builder);
  mocks.in.mockImplementation(() => builder);
  mocks.not.mockImplementation(() => builder);
  mocks.order.mockImplementation(() => builder);
  mocks.authUserId = USER_ID;
  mocks.currentTable = "";
  mocks.growRows = [];
  mocks.companionRows = [];
  mocks.growError = null;
  mocks.companionError = null;
  mocks.limit.mockImplementation(async () =>
    mocks.currentTable === "diary_entries"
      ? { data: mocks.companionRows, error: mocks.companionError }
      : { data: mocks.growRows, error: mocks.growError },
  );
});

describe("useOperatorRootZoneRecords", () => {
  it("reads one owner-scoped tent and preserves safe event/plant identity", async () => {
    mocks.growRows = [wateringRow(750)];
    const { wrapper } = makeHarness();
    const { result } = renderHook(
      () => useOperatorRootZoneRecords({ growId: GROW_ID, tentId: TENT_ID }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.records[0]).toMatchObject({
      eventId: EVENT_ID,
      plantId: PLANT_ID,
      tentId: TENT_ID,
      metrics: { volumeMl: 750 },
    });
    expect(result.current.manualObservationStatus).toBe("ready");
    expect(mocks.from).toHaveBeenCalledWith("grow_events");
    expect(mocks.eq).toHaveBeenCalledWith("grow_id", GROW_ID);
    expect(mocks.eq).toHaveBeenCalledWith("tent_id", TENT_ID);
    expect(mocks.order).toHaveBeenNthCalledWith(1, "occurred_at", { ascending: false });
    expect(mocks.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
    expect(mocks.limit).toHaveBeenCalledWith(ROOT_ZONE_OBSERVATION_CAP);
    expect(mocks.limit).toHaveBeenCalledWith(ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP);
  });

  it("refreshes only its exact private query after a confirmed Quick Log save", async () => {
    const { client, wrapper } = makeHarness();
    const { result } = renderHook(
      () => useOperatorRootZoneRecords({ growId: GROW_ID, tentId: TENT_ID }),
      { wrapper },
    );
    await waitFor(() => expect(mocks.limit).toHaveBeenCalledTimes(1));
    const unrelatedKey = queryKey("66666666-6666-4666-8666-666666666666");
    client.setQueryData(unrelatedKey, ["unrelated"]);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    mocks.growRows = [wateringRow(900)];

    act(() => {
      window.dispatchEvent(new CustomEvent(QUICK_LOG_V2_ENTRY_CREATED_EVENT));
    });

    await waitFor(() => expect(result.current.records[0]?.metrics.volumeMl).toBe(900));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKey(), exact: true });
    expect(client.getQueryData(unrelatedKey)).toEqual(["unrelated"]);
  });

  it("keeps invalid, missing, and unauthenticated tent scopes idle", async () => {
    const invalidScopes = [
      null,
      { growId: "demo-grow", tentId: TENT_ID },
      { growId: GROW_ID, tentId: "demo-tent" },
    ];
    for (const scope of invalidScopes) {
      const { wrapper } = makeHarness();
      const { result, unmount } = renderHook(() => useOperatorRootZoneRecords(scope), {
        wrapper,
      });
      await act(async () => {
        await result.current.refetch();
      });
      expect(result.current.records).toEqual([]);
      unmount();
    }
    const zeroLimitHarness = makeHarness();
    const zeroLimit = renderHook(
      () => useOperatorRootZoneRecords({ growId: GROW_ID, tentId: TENT_ID }, 0),
      { wrapper: zeroLimitHarness.wrapper },
    );
    await act(async () => {
      await zeroLimit.result.current.refetch();
    });
    expect(zeroLimit.result.current.records).toEqual([]);
    zeroLimit.unmount();

    mocks.authUserId = null;
    const { wrapper } = makeHarness();
    const { result } = renderHook(
      () => useOperatorRootZoneRecords({ growId: GROW_ID, tentId: TENT_ID }),
      { wrapper },
    );
    await act(async () => {
      await result.current.refetch();
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not reuse one authenticated owner's records after an owner swap", async () => {
    mocks.growRows = [wateringRow(750)];
    const { client, wrapper } = makeHarness();
    const { result, rerender } = renderHook(
      () => useOperatorRootZoneRecords({ growId: GROW_ID, tentId: TENT_ID }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.records).toHaveLength(1));

    const nextOwner = "77777777-7777-4777-8777-777777777777";
    mocks.authUserId = nextOwner;
    mocks.growRows = [];
    rerender();

    await waitFor(() => {
      expect(mocks.limit).toHaveBeenCalledTimes(3);
      expect(result.current.isFetching).toBe(false);
      expect(result.current.records).toEqual([]);
    });
    expect(client.getQueryData(queryKey(USER_ID))).toMatchObject({
      records: [expect.objectContaining({ eventId: EVENT_ID })],
      manualObservationStatus: "ready",
    });
    expect(client.getQueryData(queryKey(nextOwner))).toEqual({
      records: [],
      manualObservationStatus: "ready",
    });
  });

  it("keeps core records while surfacing unavailable manual observation enrichment", async () => {
    mocks.growRows = [wateringRow(750)];
    mocks.companionError = { message: "companion unavailable" };
    const { wrapper } = makeHarness();
    const { result } = renderHook(
      () => useOperatorRootZoneRecords({ growId: GROW_ID, tentId: TENT_ID }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.isError).toBe(false);
    expect(result.current.manualObservationStatus).toBe("unavailable");
    expect(result.current.records[0]?.metrics.volumeMl).toBe(750);
  });

  it("marks overflowed manual observation enrichment unavailable without discarding events", async () => {
    mocks.growRows = [wateringRow(750)];
    mocks.companionRows = Array.from(
      { length: ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP },
      (_, index) => ({ id: `companion-${index}` }),
    );
    const { wrapper } = makeHarness();
    const { result } = renderHook(
      () => useOperatorRootZoneRecords({ growId: GROW_ID, tentId: TENT_ID }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.isError).toBe(false);
    expect(result.current.manualObservationStatus).toBe("unavailable");
  });
});

describe("operator root-zone records hook safety fence", () => {
  const source = readFileSync(resolve(__dirname, "../hooks/useOperatorRootZoneRecords.ts"), "utf8");

  it("stays owner-keyed, UUID-gated, SELECT-only, and free of control side effects", () => {
    expect(source).toContain("buildPrivateGrowQueryKey");
    expect(source).toContain("useAuth");
    expect(source).toContain("isUuid(tentId)");
    expect(source).toContain("QUICK_LOG_V2_ENTRY_CREATED_EVENT");
    expect(source).toContain("exact: true");
    expect(source).toContain('.from("grow_events")');
    expect(source).not.toMatch(/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
    expect(source).not.toMatch(/\.rpc\s*\(|functions\.invoke|service_role/i);
    expect(source).not.toMatch(/\.eq\(\s*["']user_id["']/);
    expect(source).not.toMatch(/action_queue|device_control|turn_on|turn_off/i);
  });
});
