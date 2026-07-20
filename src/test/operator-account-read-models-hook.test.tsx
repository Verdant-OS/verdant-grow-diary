import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_TENT_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  grows: vi.fn(),
  tents: vi.fn(),
  rootZone: vi.fn(),
  listDiary: vi.fn(),
  listTentDiary: vi.fn(),
  getSnapshot: vi.fn(),
}));

vi.mock("@/store/auth", () => ({ useAuth: () => mocks.auth() }));
vi.mock("@/store/grows", () => ({ useGrows: () => mocks.grows() }));
vi.mock("@/hooks/useGrowData", () => ({ useGrowTents: (id: string) => mocks.tents(id) }));
vi.mock("@/hooks/useOperatorRootZoneRecords", () => ({
  useOperatorRootZoneRecords: (tentId: unknown) => mocks.rootZone(tentId),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/operatorAccountReadModels", () => ({
  listRecentDiaryEntriesForOwnedGrow: (...args: unknown[]) => mocks.listDiary(...args),
  listRecentDiaryEntriesForOwnedTent: (...args: unknown[]) => mocks.listTentDiary(...args),
  getLatestSensorSnapshotForOwnedTent: (...args: unknown[]) => mocks.getSnapshot(...args),
}));

import { useOperatorAccountReadModels } from "@/hooks/useOperatorAccountReadModels";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function TestQueryProvider({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function readyDefaults() {
  mocks.auth.mockReturnValue({ user: { id: USER_ID } });
  mocks.grows.mockReturnValue({
    activeGrow: { id: GROW_ID, name: "Home run" },
    activeGrowId: GROW_ID,
    loading: false,
    error: null,
  });
  mocks.tents.mockReturnValue({
    data: [{ id: TENT_ID, growId: GROW_ID, name: "Flower tent" }],
    isLoading: false,
    isError: false,
  });
  mocks.rootZone.mockReturnValue({
    records: [],
    manualObservationStatus: "ready",
    isLoading: false,
    isFetching: false,
    isError: false,
  });
  mocks.listDiary.mockResolvedValue({
    ok: true,
    data: {
      entries: [
        {
          id: "entry-1",
          grow_id: GROW_ID,
          plant_id: null,
          tent_id: TENT_ID,
          stage: "flower",
          note: "Observed upright leaves.",
          entry_at: "2026-07-19T10:00:00.000Z",
          created_at: "2026-07-19T10:00:00.000Z",
        },
      ],
    },
  });
  mocks.listTentDiary.mockResolvedValue({
    ok: true,
    data: {
      entries: [
        {
          id: "entry-1",
          grow_id: GROW_ID,
          plant_id: null,
          tent_id: TENT_ID,
          stage: "flower",
          note: "Observed upright leaves.",
          entry_at: "2026-07-19T10:00:00.000Z",
          created_at: "2026-07-19T10:00:00.000Z",
        },
      ],
    },
  });
  mocks.getSnapshot.mockResolvedValue({
    ok: true,
    data: {
      tent: { id: TENT_ID, name: "Flower tent", grow_id: GROW_ID },
      snapshot: {
        tentId: TENT_ID,
        readings: {
          soil_moisture_pct: {
            id: "reading-1",
            tent_id: TENT_ID,
            metric: "soil_moisture_pct",
            value: 42,
            quality: "ok",
            source: "live",
            ts: "2026-07-19T10:00:00.000Z",
            captured_at: "2026-07-19T10:00:00.000Z",
            freshness: "fresh",
            current_live: true,
          },
        },
      },
    },
  });
}

describe("useOperatorAccountReadModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyDefaults();
  });

  it("loads diary, single-tent sensor truth, and typed root-zone context for the active owner", async () => {
    const { result } = renderHook(() => useOperatorAccountReadModels(), { wrapper: wrapper() });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
      if (result.current.status === "ready") {
        expect(result.current.diary.status).toBe("ok");
        expect(result.current.sensor.status).toBe("ok");
      }
    });

    expect(mocks.listDiary).toHaveBeenCalledWith(expect.anything(), GROW_ID, 10);
    expect(mocks.listTentDiary).toHaveBeenCalledWith(expect.anything(), GROW_ID, TENT_ID, 10);
    expect(mocks.getSnapshot).toHaveBeenCalledWith(expect.anything(), TENT_ID);
    expect(mocks.rootZone).toHaveBeenCalledWith({ growId: GROW_ID, tentId: TENT_ID });
    expect(result.current.status === "ready" && result.current.watering.status).toBe(
      "insufficient",
    );
    expect(result.current.status === "ready" && result.current.tentScopeStatus).toBe("ready");
    expect(result.current.status === "ready" && result.current.selectedTentId).toBe(TENT_ID);
  });

  it("requires a tent choice and never mixes another tent's diary note into watering context", async () => {
    const tentA = { id: TENT_ID, growId: GROW_ID, name: "Flower tent" };
    const tentB = { id: SECOND_TENT_ID, growId: GROW_ID, name: "Veg tent" };
    mocks.tents.mockReturnValue({
      data: [tentB, tentA],
      isLoading: false,
      isError: false,
    });
    mocks.listDiary.mockResolvedValue({
      ok: true,
      data: {
        entries: [
          {
            id: "entry-b",
            grow_id: GROW_ID,
            plant_id: null,
            tent_id: SECOND_TENT_ID,
            stage: "veg",
            note: "Tent B is still wet.",
            entry_at: "2026-07-19T11:00:00.000Z",
            created_at: "2026-07-19T11:00:00.000Z",
          },
          {
            id: "entry-a",
            grow_id: GROW_ID,
            plant_id: null,
            tent_id: TENT_ID,
            stage: "flower",
            note: "Tent A pot feels light.",
            entry_at: "2026-07-19T10:00:00.000Z",
            created_at: "2026-07-19T10:00:00.000Z",
          },
        ],
      },
    });
    mocks.listTentDiary.mockResolvedValue({
      ok: true,
      data: {
        entries: [
          {
            id: "entry-a",
            grow_id: GROW_ID,
            plant_id: null,
            tent_id: TENT_ID,
            stage: "flower",
            note: "Tent A pot feels light.",
            entry_at: "2026-07-19T10:00:00.000Z",
            created_at: "2026-07-19T10:00:00.000Z",
          },
        ],
      },
    });

    const { result, rerender } = renderHook(
      ({ selectedTentId }: { selectedTentId: string | null }) =>
        useOperatorAccountReadModels({ selectedTentId }),
      { wrapper: wrapper(), initialProps: { selectedTentId: null } },
    );

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
      expect(result.current.status === "ready" && result.current.tentScopeStatus).toBe(
        "selection_required",
      );
    });
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
    expect(mocks.listTentDiary).not.toHaveBeenCalled();
    expect(mocks.rootZone).toHaveBeenLastCalledWith(null);
    expect(result.current.status === "ready" && result.current.watering.diaryObservationCount).toBe(
      0,
    );

    rerender({ selectedTentId: TENT_ID });
    await waitFor(() => {
      expect(result.current.status === "ready" && result.current.sensor.status).toBe("ok");
      expect(result.current.status === "ready" && result.current.selectedTentId).toBe(TENT_ID);
    });

    expect(mocks.getSnapshot).toHaveBeenCalledWith(expect.anything(), TENT_ID);
    expect(mocks.listTentDiary).toHaveBeenCalledWith(expect.anything(), GROW_ID, TENT_ID, 10);
    expect(mocks.rootZone).toHaveBeenLastCalledWith({ growId: GROW_ID, tentId: TENT_ID });
    expect(
      result.current.status === "ready" &&
        result.current.watering.diaryObservations.map((entry) => entry.note),
    ).toEqual(["Tent A pot feels light."]);

    // Query ordering is not a selection contract. Reordering tents must not
    // silently switch the selected room or admit Tent B's conflicting note.
    mocks.tents.mockReturnValue({ data: [tentA, tentB], isLoading: false, isError: false });
    rerender({ selectedTentId: TENT_ID });
    await waitFor(() => {
      expect(result.current.status === "ready" && result.current.selectedTentId).toBe(TENT_ID);
    });
    expect(
      result.current.status === "ready" &&
        result.current.watering.diaryObservations.map((entry) => entry.note),
    ).toEqual(["Tent A pot feels light."]);
  });

  it("keeps the selected tent's observation when newer sibling-tent rows fill the grow preview", async () => {
    mocks.tents.mockReturnValue({
      data: [
        { id: TENT_ID, growId: GROW_ID, name: "Flower tent" },
        { id: SECOND_TENT_ID, growId: GROW_ID, name: "Veg tent" },
      ],
      isLoading: false,
      isError: false,
    });
    mocks.listDiary.mockResolvedValue({
      ok: true,
      data: {
        entries: Array.from({ length: 10 }, (_, index) => ({
          id: `veg-entry-${index}`,
          grow_id: GROW_ID,
          plant_id: null,
          tent_id: SECOND_TENT_ID,
          stage: "veg",
          note: `Veg observation ${index}`,
          entry_at: `2026-07-20T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
          created_at: `2026-07-20T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
        })),
      },
    });
    mocks.listTentDiary.mockResolvedValue({
      ok: true,
      data: {
        entries: [
          {
            id: "flower-entry",
            grow_id: GROW_ID,
            plant_id: null,
            tent_id: TENT_ID,
            stage: "flower",
            note: "Flower pot feels light.",
            entry_at: "2026-07-20T09:00:00.000Z",
            created_at: "2026-07-20T09:00:00.000Z",
          },
        ],
      },
    });

    const { result } = renderHook(() => useOperatorAccountReadModels({ selectedTentId: TENT_ID }), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(
        result.current.status === "ready" && result.current.watering.diaryObservationCount,
      ).toBe(1);
    });
    expect(
      result.current.status === "ready" &&
        result.current.watering.diaryObservations.map((entry) => entry.note),
    ).toEqual(["Flower pot feels light."]);
    expect(mocks.listDiary).toHaveBeenCalledWith(expect.anything(), GROW_ID, 10);
    expect(mocks.listTentDiary).toHaveBeenCalledWith(expect.anything(), GROW_ID, TENT_ID, 10);
  });

  it("does not convert an unavailable tent diary read into an empty watering history", async () => {
    mocks.listTentDiary.mockResolvedValue({
      ok: false,
      reason: "unavailable",
      message: "tent diary read failed",
    });

    const { result } = renderHook(() => useOperatorAccountReadModels(), { wrapper: wrapper() });

    await waitFor(() => {
      expect(
        result.current.status === "ready" &&
          result.current.watering.diaryObservationAvailabilityNote,
      ).toMatch(/cannot confirm this tent has no recent entries/i);
    });
    expect(
      result.current.status === "ready" && result.current.watering.diaryObservationStatus,
    ).toBe("unavailable");
    expect(result.current.status === "ready" && result.current.watering.diaryObservationCount).toBe(
      0,
    );
    expect(result.current.status === "ready" && result.current.sensor.status).toBe("ok");
    expect(result.current.status === "ready" && result.current.diary.status).toBe("ok");
  });

  it("fails the sensor section closed when the loader returns a tent from another grow", async () => {
    mocks.getSnapshot.mockResolvedValue({
      ok: true,
      data: {
        tent: {
          id: TENT_ID,
          name: "Foreign relation",
          grow_id: "44444444-4444-4444-8444-444444444444",
        },
        snapshot: null,
      },
    });

    const { result } = renderHook(() => useOperatorAccountReadModels(), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
      if (result.current.status === "ready") {
        expect(result.current.sensor.status).toBe("unavailable");
      }
    });
  });

  it("does not mislabel an unavailable tent read as an empty grow", async () => {
    mocks.tents.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    const { result } = renderHook(() => useOperatorAccountReadModels(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.status === "ready" && result.current.tentScopeStatus).toBe("unavailable");
    expect(result.current.status === "ready" && result.current.sensor.status).toBe("unavailable");
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
    expect(mocks.rootZone).toHaveBeenLastCalledWith(null);
  });

  it("propagates unavailable manual observation enrichment without discarding core context", async () => {
    mocks.rootZone.mockReturnValue({
      records: [],
      manualObservationStatus: "unavailable",
      isLoading: false,
      isFetching: false,
      isError: false,
    });

    const { result } = renderHook(() => useOperatorAccountReadModels(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(
      result.current.status === "ready" &&
        result.current.watering.manualObservationAvailabilityNote,
    ).toMatch(/manual root-zone observations are unavailable/i);
    expect(
      result.current.status === "ready" && result.current.watering.manualObservationStatus,
    ).toBe("unavailable");
    expect(result.current.status === "ready" && result.current.watering.status).toBe(
      "insufficient",
    );
  });

  it("does not reuse the prior account's diary or sensor cache after an identity swap", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 60_000 } },
    });
    function SharedQueryProvider({ children }: PropsWithChildren) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const { result, rerender } = renderHook(() => useOperatorAccountReadModels(), {
      wrapper: SharedQueryProvider,
    });
    await waitFor(() => {
      expect(result.current.status === "ready" && result.current.diary.status).toBe("ok");
    });

    let resolveDiary!: (value: Awaited<ReturnType<typeof mocks.listDiary>>) => void;
    let resolveSensor!: (value: Awaited<ReturnType<typeof mocks.getSnapshot>>) => void;
    const nextDiary = new Promise<Awaited<ReturnType<typeof mocks.listDiary>>>((resolve) => {
      resolveDiary = resolve;
    });
    const nextSensor = new Promise<Awaited<ReturnType<typeof mocks.getSnapshot>>>((resolve) => {
      resolveSensor = resolve;
    });
    mocks.auth.mockReturnValue({ user: { id: "55555555-5555-4555-8555-555555555555" } });
    mocks.listDiary.mockReturnValue(nextDiary);
    mocks.getSnapshot.mockReturnValue(nextSensor);

    rerender();
    await waitFor(() => {
      expect(mocks.listDiary).toHaveBeenCalledTimes(2);
      expect(mocks.getSnapshot).toHaveBeenCalledTimes(2);
      expect(result.current.status === "ready" && result.current.diary.status).toBe("loading");
      expect(result.current.status === "ready" && result.current.sensor.status).toBe("loading");
    });

    await act(async () => {
      resolveDiary({
        ok: true,
        data: {
          entries: [
            {
              id: "entry-next-owner",
              grow_id: GROW_ID,
              plant_id: null,
              tent_id: TENT_ID,
              stage: "veg",
              note: "Second account observation.",
              entry_at: "2026-07-19T11:00:00.000Z",
              created_at: "2026-07-19T11:00:00.000Z",
            },
          ],
        },
      });
      resolveSensor({
        ok: true,
        data: {
          tent: { id: TENT_ID, name: "Flower tent", grow_id: GROW_ID },
          snapshot: null,
        },
      });
    });

    await waitFor(() => {
      expect(result.current.status === "ready" && result.current.diary.status).toBe("ok");
      if (result.current.status === "ready" && result.current.diary.status === "ok") {
        expect(result.current.diary.items.map((entry) => entry.note)).toEqual([
          "Second account observation.",
        ]);
      }
    });
  });

  it("returns a no-grow state without executing owner data queries", async () => {
    mocks.grows.mockReturnValue({
      activeGrow: null,
      activeGrowId: null,
      loading: false,
      error: null,
    });
    mocks.tents.mockReturnValue({ data: [], isLoading: false, isError: false });

    const { result } = renderHook(() => useOperatorAccountReadModels(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe("no_grow"));
    expect(mocks.tents).toHaveBeenCalledWith("operator-no-grow");
    expect(mocks.listDiary).not.toHaveBeenCalled();
    expect(mocks.listTentDiary).not.toHaveBeenCalled();
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
    expect(mocks.rootZone).toHaveBeenCalledWith(null);
  });
});
