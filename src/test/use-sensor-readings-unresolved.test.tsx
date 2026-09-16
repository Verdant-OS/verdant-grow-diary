import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSensorReadingsByTents } from "@/hooks/use-sensor-readings";
import { buildPrivateSensorQueryKey } from "@/lib/growDataQueryKeyRules";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDetailAiDoctorReadiness from "@/components/PlantDetailAiDoctorReadiness";

const io = vi.hoisted(() => ({
  owner: "11111111-1111-4111-8111-111111111111",
  responses: new Map<string, unknown>(),
  manualResponses: new Map<string, unknown>(),
  requests: [] as Array<{ tentId: string; sources: string[]; limit: number }>,
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: io.owner } }) }));
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useSensorBridgeHealth", () => ({
  useSensorBridgeHealth: () => ({ data: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let tentId = "";
      let sources: string[] = [];
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          tentId = value;
          return query;
        },
        in: (_column: string, values: string[]) => {
          sources = values;
          return query;
        },
        order: () => query,
        limit: async (limit: number) => {
          io.requests.push({ tentId, sources, limit });
          if (sources.length === 1 && sources[0] === "manual" && io.manualResponses.has(tentId)) {
            return { data: io.manualResponses.get(tentId), error: null };
          }
          return { data: io.responses.has(tentId) ? io.responses.get(tentId) : [], error: null };
        },
      };
      return query;
    },
  },
}));

const TENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROW = {
  id: "reading-a",
  tent_id: TENT_A,
  metric: "temperature_c",
  value: 23,
  source: "manual",
  captured_at: "2026-09-16T12:00:00Z",
  ts: "2026-09-16T12:00:00Z",
  created_at: "2026-09-16T12:00:00Z",
};
const clients: QueryClient[] = [];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  };
}

beforeEach(() => {
  onlineManager.setOnline(true);
  io.responses.clear();
  io.manualResponses.clear();
  io.requests.length = 0;
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
});

describe("per-tent sensor read outcome honesty", () => {
  it("keeps first paused reads unresolved until reconnect establishes rows or an empty result", async () => {
    onlineManager.setOnline(false);
    io.responses.set(TENT_A, [ROW]);
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useSensorReadingsByTents([TENT_A, TENT_B]), { wrapper });

    expect(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.fetchStatus),
    ).toEqual(["paused", "paused"]);
    expect(io.requests).toEqual([]);
    expect(result.current.statusByTent).toEqual({ [TENT_A]: "loading", [TENT_B]: "loading" });
    expect(result.current.isLoading).toBe(true);

    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.statusByTent[TENT_B]).toBe("success"));
    expect(result.current.statusByTent[TENT_A]).toBe("success");
    expect(result.current.byTent[TENT_A]).toEqual([ROW]);
    expect(result.current.byTent[TENT_B]).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(io.requests.map((request) => request.tentId)).toEqual([TENT_A, TENT_B]);
  });

  it("preserves a confirmed cached window while a different tent's first read is paused", () => {
    const { wrapper, client } = setup();
    client.setQueryData(buildPrivateSensorQueryKey(io.owner, [TENT_A, 200, "all-sources"]), [ROW]);
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useSensorReadingsByTents([TENT_A, TENT_B]), { wrapper });

    expect(result.current.statusByTent[TENT_A]).toBe("success");
    expect(result.current.byTent[TENT_A]).toEqual([ROW]);
    expect(result.current.statusByTent[TENT_B]).toBe("loading");
    expect(result.current.isLoading).toBe(true);
    expect(io.requests).toEqual([]);
  });

  it("does not borrow the previous tent's successful read after an offline scope change", async () => {
    const { wrapper } = setup();
    io.responses.set(TENT_A, [ROW]);
    const { result, rerender } = renderHook(({ ids }) => useSensorReadingsByTents(ids), {
      initialProps: { ids: [TENT_A] },
      wrapper,
    });
    await waitFor(() => expect(result.current.statusByTent[TENT_A]).toBe("success"));
    act(() => onlineManager.setOnline(false));
    rerender({ ids: [TENT_B] });

    expect(result.current.statusByTent).toEqual({ [TENT_B]: "loading" });
    expect(result.current.byTent).toEqual({ [TENT_B]: [] });
    expect(io.requests.map((request) => request.tentId)).toEqual([TENT_A]);
  });

  it.each([null, undefined, {}, "unreadable"])(
    "reports malformed successful transport data %j as unavailable instead of successful empty",
    async (data) => {
      io.responses.set(TENT_A, data);
      const { wrapper } = setup();
      const { result } = renderHook(() => useSensorReadingsByTents([TENT_A]), { wrapper });
      await waitFor(() => expect(result.current.statusByTent[TENT_A]).not.toBe("loading"));

      expect(result.current.statusByTent[TENT_A]).toBe("error");
      expect(result.current.isError).toBe(true);
      expect(result.current.byTent[TENT_A]).toEqual([]);
    },
  );

  it.each([null, {}])(
    "retains the last confirmed rows after a malformed refresh (%j)",
    async (data) => {
      io.responses.set(TENT_A, [ROW]);
      const { wrapper } = setup();
      const { result } = renderHook(() => useSensorReadingsByTents([TENT_A]), { wrapper });
      await waitFor(() => expect(result.current.statusByTent[TENT_A]).toBe("success"));
      io.responses.set(TENT_A, data);
      await act(async () => {
        await result.current.retryTent(TENT_A);
      });

      await waitFor(() => expect(result.current.statusByTent[TENT_A]).toBe("refresh_error"));
      expect(result.current.byTent[TENT_A]).toEqual([ROW]);
    },
  );

  it("retries only the failed source-filtered tent and accepts a verified empty recovery", async () => {
    io.responses.set(TENT_A, [ROW]);
    io.responses.set(TENT_B, null);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useSensorReadingsByTents([TENT_A, TENT_B], 60, ["manual"]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.statusByTent[TENT_B]).toBe("error"));
    expect(result.current.statusByTent[TENT_A]).toBe("success");
    expect(result.current.byTent[TENT_A]).toEqual([ROW]);
    io.responses.set(TENT_B, []);
    await act(async () => {
      await result.current.retryTent(TENT_B);
    });
    await waitFor(() => expect(result.current.statusByTent[TENT_B]).toBe("success"));

    expect(result.current.byTent[TENT_B]).toEqual([]);
    expect(result.current.isError).toBe(false);
    expect(io.requests).toEqual([
      { tentId: TENT_A, sources: ["manual"], limit: 60 },
      { tentId: TENT_B, sources: ["manual"], limit: 60 },
      { tentId: TENT_B, sources: ["manual"], limit: 60 },
    ]);
  });

  it("keeps an absent scope idle without fetching when offline", () => {
    onlineManager.setOnline(false);
    const { wrapper } = setup();
    const { result } = renderHook(() => useSensorReadingsByTents([]), { wrapper });
    expect(result.current.statusByTent).toEqual({});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(io.requests).toEqual([]);
  });
});

function renderReadiness() {
  const { wrapper } = setup();
  return render(
    <MemoryRouter>
      <PlantDetailAiDoctorReadiness
        plantId="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        tentId={TENT_A}
        stage="veg"
      />
    </MemoryRouter>,
    { wrapper },
  );
}

describe("Plant Detail readiness with real per-tent sensor queries", () => {
  it("does not show an empty snapshot or readiness badge while the first reads are paused", async () => {
    onlineManager.setOnline(false);
    renderReadiness();
    expect(screen.getByTestId("plant-detail-ai-doctor-readiness-loading")).toBeInTheDocument();
    expect(screen.queryByText("No sensor snapshot.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plant-detail-ai-doctor-readiness-badge")).not.toBeInTheDocument();
    expect(io.requests).toEqual([]);

    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(screen.getByText("No sensor snapshot.")).toBeInTheDocument());
    expect(io.requests).toHaveLength(2);
  });

  it("renders unavailable for malformed rows and retries both query windows before accepting empty", async () => {
    io.responses.set(TENT_A, null);
    renderReadiness();
    await waitFor(() =>
      expect(
        screen.getByTestId("plant-detail-ai-doctor-readiness-sensor-error"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("No sensor snapshot.")).not.toBeInTheDocument();
    const firstRequests = io.requests.map((request) => ({ ...request }));
    expect(firstRequests).toHaveLength(2);
    io.responses.set(TENT_A, []);
    fireEvent.click(screen.getByTestId("plant-detail-ai-doctor-readiness-sensor-error-retry"));

    await waitFor(() => expect(screen.getByText("No sensor snapshot.")).toBeInTheDocument());
    expect(io.requests).toEqual([...firstRequests, ...firstRequests]);
    expect(
      screen.queryByTestId("plant-detail-ai-doctor-readiness-sensor-error"),
    ).not.toBeInTheDocument();
  });

  it("keeps a usable manual survivor when the mixed query response is malformed", async () => {
    io.responses.set(TENT_A, null);
    const at = new Date().toISOString();
    io.manualResponses.set(TENT_A, [
      { ...ROW, captured_at: at, ts: at, created_at: at, quality: "ok" },
    ]);
    renderReadiness();
    await waitFor(() =>
      expect(screen.getByTestId("plant-detail-ai-doctor-sensor-evidence-panel")).toHaveAttribute(
        "data-status",
        "usable",
      ),
    );
    expect(screen.getByText("Latest manual snapshot accepted.")).toBeInTheDocument();
    expect(
      screen.queryByTestId("plant-detail-ai-doctor-readiness-sensor-error"),
    ).not.toBeInTheDocument();
    expect(io.requests).toHaveLength(2);
  });
});
