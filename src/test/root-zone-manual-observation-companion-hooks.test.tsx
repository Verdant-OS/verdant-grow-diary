import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ROOT_ZONE_GROW_EVENT_SELECT,
  ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP,
  ROOT_ZONE_MANUAL_OBSERVATION_DIARY_SELECT,
} from "@/lib/rootZoneObservationRules";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GROW_ID = "22222222-2222-4222-8222-222222222222";
const TENT_ID = "33333333-3333-4333-8333-333333333333";
const PLANT_ID = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";
const DIARY_ID = "66666666-6666-4666-8666-666666666666";
const OCCURRED_AT = "2026-07-20T12:00:00.000Z";

interface QueryCall {
  table: string;
  method: string;
  args: unknown[];
}

const mocks = vi.hoisted(() => ({
  authUserId: "11111111-1111-4111-8111-111111111111" as string | null,
  growRows: [] as unknown[],
  growError: null as unknown,
  diaryRows: [] as unknown,
  diaryError: null as unknown,
  diaryThrows: false,
  calls: [] as QueryCall[],
  from: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: mocks.authUserId ? { id: mocks.authUserId } : null }),
}));

vi.mock("@/integrations/supabase/client", () => {
  mocks.from.mockImplementation((table: string) => {
    const builder: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "eq", "in", "not", "or", "order"]) {
      builder[method] = (...args: unknown[]) => {
        mocks.calls.push({ table, method, args });
        return builder;
      };
    }
    builder.limit = async (...args: unknown[]) => {
      mocks.calls.push({ table, method: "limit", args });
      if (table === "diary_entries" && mocks.diaryThrows) {
        throw new Error("raw provider failure: api_key=sk_live_never_surface");
      }
      return table === "grow_events"
        ? { data: mocks.growRows, error: mocks.growError }
        : { data: mocks.diaryRows, error: mocks.diaryError };
    };
    return builder;
  });
  return { supabase: { from: mocks.from } };
});

import { useOperatorRootZoneRecords } from "@/hooks/useOperatorRootZoneRecords";
import { useRootZoneObservations } from "@/hooks/useRootZoneObservations";

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
  return Wrapper;
}

function wateringRow() {
  return {
    id: EVENT_ID,
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    event_type: "watering",
    occurred_at: OCCURRED_AT,
    source: "manual",
    is_deleted: false,
    watering_events: [{ volume_ml: 750 }],
    feeding_events: [],
  };
}

function feedingRow() {
  return {
    ...wateringRow(),
    event_type: "feeding",
    watering_events: [],
    feeding_events: [{ volume_ml: 750 }],
  };
}

function companionRow() {
  return {
    id: DIARY_ID,
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    entry_at: OCCURRED_AT,
    linked_grow_event_id: EVENT_ID,
    root_zone_manual_observation_v1: {
      schema_version: 1,
      source: "manual",
      evidence_type: "root_zone_manual_observation",
      advisory_only: true,
      observed_at: OCCURRED_AT,
      pot_weight_feel: "light",
      medium_surface: "dry",
      drainage: "normal",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authUserId = USER_ID;
  mocks.growRows = [wateringRow()];
  mocks.growError = null;
  mocks.diaryRows = [companionRow()];
  mocks.diaryError = null;
  mocks.diaryThrows = false;
  mocks.calls.length = 0;
});

describe("root-zone manual-observation companion hooks", () => {
  it("enriches AI Doctor history from an exact-linked, owner-RLS diary SELECT", async () => {
    const { result } = renderHook(
      () =>
        useRootZoneObservations({
          kind: "plant_context",
          growId: GROW_ID,
          tentId: TENT_ID,
          plantId: PLANT_ID,
        }),
      { wrapper: makeHarness() },
    );

    await waitFor(() => expect(result.current.observations).toHaveLength(1));
    expect(result.current.observations[0]?.manualObservation).toEqual({
      observedAt: OCCURRED_AT,
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "light",
      mediumSurface: "dry",
      drainage: "normal",
    });
    expect(mocks.calls).toContainEqual({
      table: "grow_events",
      method: "select",
      args: [ROOT_ZONE_GROW_EVENT_SELECT],
    });
    expect(mocks.calls).toContainEqual({
      table: "diary_entries",
      method: "select",
      args: [ROOT_ZONE_MANUAL_OBSERVATION_DIARY_SELECT],
    });
    expect(mocks.calls).toContainEqual({
      table: "diary_entries",
      method: "in",
      args: ["details->>linked_grow_event_id", [EVENT_ID]],
    });
    expect(mocks.calls).toContainEqual({
      table: "diary_entries",
      method: "eq",
      args: ["grow_id", GROW_ID],
    });
    expect(mocks.calls).toContainEqual({
      table: "diary_entries",
      method: "eq",
      args: ["tent_id", TENT_ID],
    });
    expect(mocks.calls).toContainEqual({
      table: "diary_entries",
      method: "or",
      args: [`plant_id.eq.${PLANT_ID},plant_id.is.null`],
    });
    expect(mocks.calls).not.toContainEqual(
      expect.objectContaining({ method: "eq", args: ["user_id", expect.anything()] }),
    );
  });

  it("fails AI Doctor history closed with sanitized copy when companion enrichment fails", async () => {
    mocks.diaryError = { message: "raw provider failure: api_key=sk_live_never_surface" };
    const { result } = renderHook(
      () => useRootZoneObservations({ kind: "plant", plantId: PLANT_ID }),
      { wrapper: makeHarness() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.observations).toEqual([]);
    expect(result.current.error).toMatchObject({
      message: "Manual root-zone observation history is unavailable.",
    });
    expect(String(result.current.error)).not.toContain("sk_live_never_surface");
  });

  it("sanitizes a thrown companion-read exception and fails AI Doctor history closed", async () => {
    mocks.diaryThrows = true;
    const { result } = renderHook(
      () => useRootZoneObservations({ kind: "plant", plantId: PLANT_ID }),
      { wrapper: makeHarness() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.observations).toEqual([]);
    expect(result.current.error).toMatchObject({
      message: "Manual root-zone observation history is unavailable.",
    });
    expect(String(result.current.error)).not.toContain("sk_live_never_surface");
  });

  it("fails enrichment closed when the bounded companion read reaches its overflow sentinel", async () => {
    mocks.diaryRows = Array.from({ length: ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP }, () =>
      companionRow(),
    );
    const { result } = renderHook(
      () => useRootZoneObservations({ kind: "plant", plantId: PLANT_ID }),
      { wrapper: makeHarness() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.observations).toEqual([]);
    expect(result.current.error).toMatchObject({
      message: "Manual root-zone observation history is incomplete.",
    });
    expect(mocks.calls).toContainEqual({
      table: "diary_entries",
      method: "limit",
      args: [ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP],
    });
  });

  it.each([
    ["feeding", feedingRow()],
    ["CSV watering", { ...wateringRow(), source: "csv" }],
  ])("skips manual-observation companion reads for %s history", async (_label, row) => {
    mocks.growRows = [row];
    const ai = renderHook(() => useRootZoneObservations({ kind: "plant", plantId: PLANT_ID }), {
      wrapper: makeHarness(),
    });

    await waitFor(() => expect(ai.result.current.observations).toHaveLength(1));
    expect(ai.result.current.isError).toBe(false);
    expect(mocks.calls.some((call) => call.table === "diary_entries")).toBe(false);
    ai.unmount();

    mocks.calls.length = 0;
    const operator = renderHook(
      () => useOperatorRootZoneRecords({ growId: GROW_ID, tentId: TENT_ID }),
      { wrapper: makeHarness() },
    );
    await waitFor(() => expect(operator.result.current.records).toHaveLength(1));
    expect(operator.result.current.manualObservationStatus).toBe("ready");
    expect(mocks.calls.some((call) => call.table === "diary_entries")).toBe(false);
    operator.unmount();
  });

  it("fails AI closed and marks Operator enrichment unavailable for malformed companion data", async () => {
    mocks.diaryRows = null;
    const ai = renderHook(() => useRootZoneObservations({ kind: "plant", plantId: PLANT_ID }), {
      wrapper: makeHarness(),
    });

    await waitFor(() => expect(ai.result.current.isError).toBe(true));
    expect(ai.result.current.observations).toEqual([]);
    expect(ai.result.current.error).toMatchObject({
      message: "Manual root-zone observation history is unavailable.",
    });
    ai.unmount();

    const operator = renderHook(
      () => useOperatorRootZoneRecords({ growId: GROW_ID, tentId: TENT_ID }),
      { wrapper: makeHarness() },
    );
    await waitFor(() => expect(operator.result.current.records).toHaveLength(1));
    expect(operator.result.current.isError).toBe(false);
    expect(operator.result.current.manualObservationStatus).toBe("unavailable");
    operator.unmount();
  });

  it("passes exact-linked companion evidence through the Operator identity adapter", async () => {
    const { result } = renderHook(
      () => useOperatorRootZoneRecords({ growId: GROW_ID, tentId: TENT_ID }),
      { wrapper: makeHarness() },
    );

    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.records[0]).toMatchObject({
      eventId: EVENT_ID,
      plantId: PLANT_ID,
      tentId: TENT_ID,
      manualObservation: {
        observedAt: OCCURRED_AT,
        potWeightFeel: "light",
        mediumSurface: "dry",
        drainage: "normal",
        source: "manual",
        advisoryOnly: true,
      },
    });
  });
});

describe("root-zone companion hook source safety", () => {
  const source = ["../hooks/useRootZoneObservations.ts", "../hooks/useOperatorRootZoneRecords.ts"]
    .map((file) => readFileSync(resolve(__dirname, file), "utf8"))
    .join("\n");

  it("stays bounded, SELECT-only, exact-link scoped, and free of client ownership claims", () => {
    expect(source).toContain('.from("diary_entries")');
    expect(source).toContain("ROOT_ZONE_MANUAL_OBSERVATION_DIARY_SELECT");
    expect(source).toContain('"details->>linked_grow_event_id"');
    expect(source).toContain("ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP");
    expect(source).not.toMatch(/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
    expect(source).not.toMatch(/\.rpc\s*\(|functions\.invoke|service_role/i);
    expect(source).not.toMatch(/\.eq\(\s*["']user_id["']/);
    expect(source).not.toMatch(/action_queue|device_control|turn_on|turn_off/i);
  });

  it("projects only the exact-link and manual-observation JSON fields", () => {
    expect(ROOT_ZONE_MANUAL_OBSERVATION_DIARY_SELECT).toContain(
      "linked_grow_event_id:details->>linked_grow_event_id",
    );
    expect(ROOT_ZONE_MANUAL_OBSERVATION_DIARY_SELECT).toContain(
      "root_zone_manual_observation_v1:details->root_zone_manual_observation_v1",
    );
    expect(ROOT_ZONE_MANUAL_OBSERVATION_DIARY_SELECT).not.toMatch(/(?:^|,)details(?:,|$)/);
    expect(ROOT_ZONE_MANUAL_OBSERVATION_DIARY_SELECT).not.toMatch(
      /photo|sensor_snapshot|raw_payload/i,
    );
  });
});
