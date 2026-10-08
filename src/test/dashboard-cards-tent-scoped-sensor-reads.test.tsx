/**
 * BUG-003 residual (handoff item 1): on the deploy tip the Dashboard still sent
 * two unscoped reads of `sensor_readings_effective` (no tent predicate,
 * `limit=200` and `limit=500`). Both hit the Postgres statement timeout
 * (`57014`). The callers were DailyGrowCheckStatusCard (`useSensorReadings()`)
 * and GuidedActionChecklistPanel (`useSensorReadings(undefined, 500)`).
 *
 * These tests render the real cards over the real `useSensorReadings` hook and
 * record every request the hook sends to Supabase, so they assert on the
 * resolved query (tent predicate + limit), not on source text. They also pin
 * the sensor-truth rule: a pending or failed tent scope/window never renders
 * as "no readings".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import DailyGrowCheckStatusCard from "@/components/DailyGrowCheckStatusCard";
import GuidedActionChecklistPanel from "@/components/GuidedActionChecklistPanel";

type QueryLike = {
  data: unknown;
  isLoading: boolean;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  fetchStatus: "idle" | "fetching" | "paused";
  status: "pending" | "error" | "success";
  refetch: ReturnType<typeof vi.fn>;
};

const io = vi.hoisted(() => ({
  owner: "11111111-1111-4111-8111-111111111111",
  responses: new Map<string, unknown[]>(),
  failTents: new Set<string>(),
  hangTents: new Set<string>(),
  requests: [] as Array<{ table: string; tentId: string | null; limit: number }>,
  reads: {} as Record<"tents" | "growTents" | "growPlants" | "plants" | "diary", unknown>,
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: io.owner } }) }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => io.reads.tents }));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => io.reads.plants }));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => io.reads.diary }));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => io.reads.growTents,
  useGrowPlants: () => io.reads.growPlants,
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ alerts: [], status: "ok", reload: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let tentId: string | null = null;
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          if (column === "tent_id") tentId = value;
          return query;
        },
        in: () => query,
        order: () => query,
        limit: (limit: number) => {
          const settle = async () => {
            io.requests.push({ table, tentId, limit });
            if (tentId && io.hangTents.has(tentId)) return new Promise(() => undefined);
            if (tentId && io.failTents.has(tentId)) {
              return { data: null, error: { code: "57014", message: "statement timeout" } };
            }
            return { data: tentId ? (io.responses.get(tentId) ?? []) : [], error: null };
          };
          const pending = settle();
          // The legacy unscoped read awaits `.limit()` and may chain `.eq()`.
          return Object.assign(pending, {
            eq: (column: string, value: string) => {
              if (column === "tent_id") tentId = value;
              return pending;
            },
          });
        },
      };
      return query;
    },
  },
}));

const TENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENT_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GROW = "99999999-9999-4999-8999-999999999999";

function ok(data: unknown[]): QueryLike {
  return {
    data,
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    fetchStatus: "idle",
    status: "success",
    refetch: vi.fn().mockResolvedValue({}),
  };
}
function pendingRead(): QueryLike {
  return {
    ...ok([]),
    data: undefined,
    isLoading: true,
    isPending: true,
    isFetching: true,
    fetchStatus: "fetching",
    status: "pending",
  };
}
function failedRead(): QueryLike {
  return { ...ok([]), data: undefined, isError: true, status: "error" };
}

function manualRow(id: string, tentId: string) {
  const now = new Date().toISOString();
  return {
    id,
    user_id: io.owner,
    quality: "ok",
    device_id: null,
    raw_payload: null,
    correction_valid: true,
    tent_id: tentId,
    metric: "humidity_pct",
    value: 60,
    source: "manual",
    captured_at: now,
    ts: now,
    created_at: now,
  };
}

const clients: QueryClient[] = [];
function mount(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const sensorRequests = () => io.requests.filter((r) => r.table === "sensor_readings_effective");
const flush = () => new Promise((r) => setTimeout(r, 20));
const dailyKind = () =>
  screen.getByTestId("daily-grow-check-status-card").getAttribute("data-kind");

beforeEach(() => {
  io.responses.clear();
  io.failTents.clear();
  io.hangTents.clear();
  io.requests.length = 0;
  io.reads = {
    tents: ok([{ id: TENT_A }, { id: TENT_B }]),
    plants: ok([]),
    diary: ok([]),
    growTents: ok([
      { id: TENT_A, name: "Tent A" },
      { id: TENT_B, name: "Tent B" },
    ]),
    growPlants: ok([]),
  };
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe("DailyGrowCheckStatusCard reads per-tent windows (BUG-003 residual)", () => {
  it("never sends an unscoped read; reads one 200-row window per resolved tent", async () => {
    mount(<DailyGrowCheckStatusCard />);
    await waitFor(() => expect(dailyKind()).toBe("none"));
    const reqs = sensorRequests();
    expect(reqs.some((r) => r.tentId === null)).toBe(false);
    expect(reqs.map((r) => r.tentId).sort()).toEqual([TENT_A, TENT_B]);
    expect(reqs.every((r) => r.limit === 200)).toBe(true);
  });

  it("scopes the windows to the caller's tentIds when provided", async () => {
    mount(<DailyGrowCheckStatusCard tentIds={[TENT_C]} />);
    await waitFor(() => expect(dailyKind()).toBe("none"));
    expect(sensorRequests().map((r) => r.tentId)).toEqual([TENT_C]);
  });

  it("shows tent-scoped manual activity from the merged windows", async () => {
    io.responses.set(TENT_B, [manualRow("m-b", TENT_B)]);
    mount(<DailyGrowCheckStatusCard />);
    await waitFor(() => expect(dailyKind()).not.toBe("loading"));
    expect(dailyKind()).not.toBe("none");
    expect(sensorRequests().some((r) => r.tentId === null)).toBe(false);
  });

  it("stays loading (not 'no readings') while the tent scope is unresolved", async () => {
    io.reads.tents = pendingRead();
    mount(<DailyGrowCheckStatusCard />);
    await flush();
    expect(dailyKind()).toBe("loading");
    expect(sensorRequests()).toEqual([]);
  });

  it("is unavailable (not 'no readings') when the tent scope read fails", async () => {
    io.reads.tents = failedRead();
    mount(<DailyGrowCheckStatusCard />);
    await flush();
    expect(dailyKind()).toBe("unavailable");
    expect(sensorRequests()).toEqual([]);
  });

  it("is unavailable (not 'no readings') when one tent window fails", async () => {
    io.failTents.add(TENT_B);
    mount(<DailyGrowCheckStatusCard />);
    await waitFor(() => expect(dailyKind()).toBe("unavailable"));
    expect(sensorRequests().some((r) => r.tentId === null)).toBe(false);
  });

  it("stays loading (not 'no readings') while one tent window is pending", async () => {
    io.hangTents.add(TENT_B);
    mount(<DailyGrowCheckStatusCard />);
    await waitFor(() => expect(sensorRequests().length).toBe(2));
    await flush();
    expect(dailyKind()).toBe("loading");
    expect(sensorRequests().some((r) => r.tentId === null)).toBe(false);
  });
});

describe("DailyGrowCheckStatusCard caller scope: null = unresolved, [] = empty (Blue Dream P2-1)", () => {
  function diaryToday(id: string, tentId: string) {
    const now = new Date().toISOString();
    return { id, tent_id: tentId, plant_id: null, entry_at: now, created_at: now };
  }

  it("stays loading for tentIds={null} and never falls back to every active tent", async () => {
    io.responses.set(TENT_A, [manualRow("m-a", TENT_A)]);
    mount(<DailyGrowCheckStatusCard tentIds={null} />);
    await flush();
    expect(dailyKind()).toBe("loading");
    expect(sensorRequests()).toEqual([]);
  });

  it("treats tentIds={[]} as an empty scope: no sensor reads and no other grow's activity", async () => {
    io.responses.set(TENT_A, [manualRow("m-a", TENT_A)]);
    io.reads.diary = ok([diaryToday("d-a", TENT_A)]);
    mount(<DailyGrowCheckStatusCard tentIds={[]} />);
    await waitFor(() => expect(dailyKind()).not.toBe("loading"));
    expect(dailyKind()).toBe("none");
    expect(sensorRequests()).toEqual([]);
  });

  it("still counts in-scope diary activity for an explicit tent scope", async () => {
    io.reads.diary = ok([diaryToday("d-a", TENT_A), diaryToday("d-c", TENT_C)]);
    mount(<DailyGrowCheckStatusCard tentIds={[TENT_C]} />);
    await waitFor(() => expect(dailyKind()).not.toBe("loading"));
    expect(dailyKind()).not.toBe("none");
    expect(sensorRequests().map((r) => r.tentId)).toEqual([TENT_C]);
  });
});

describe("GuidedActionChecklistPanel reads per-tent windows (BUG-003 residual)", () => {
  it("never sends an unscoped read; reads one 500-row window per grow tent", async () => {
    mount(<GuidedActionChecklistPanel scopedGrowId={GROW} />);
    await waitFor(() => expect(screen.queryByTestId("guided-action-checklist-loading")).toBeNull());
    const reqs = sensorRequests();
    expect(reqs.some((r) => r.tentId === null)).toBe(false);
    expect(reqs.map((r) => r.tentId).sort()).toEqual([TENT_A, TENT_B]);
    expect(reqs.every((r) => r.limit === 500)).toBe(true);
  });

  it("sends no sensor read at all when no grow is in scope (panel renders nothing)", async () => {
    const view = mount(<GuidedActionChecklistPanel scopedGrowId={null} />);
    await flush();
    expect(
      view.container.querySelector("[data-testid='guided-action-checklist-panel']"),
    ).toBeNull();
    expect(sensorRequests()).toEqual([]);
  });

  it("stays pending (not empty) while the grow's tents are unresolved", async () => {
    io.reads.growTents = pendingRead();
    mount(<GuidedActionChecklistPanel scopedGrowId={GROW} />);
    await flush();
    expect(screen.getByTestId("guided-action-checklist-loading")).toBeTruthy();
    expect(screen.queryByTestId("guided-action-checklist-empty")).toBeNull();
    expect(sensorRequests()).toEqual([]);
  });

  it("reports an error (not empty) when a tent window fails", async () => {
    io.failTents.add(TENT_A);
    mount(<GuidedActionChecklistPanel scopedGrowId={GROW} />);
    await waitFor(() =>
      expect(screen.getByText(/Could not confirm your diary context/)).toBeTruthy(),
    );
    expect(screen.queryByTestId("guided-action-checklist-empty")).toBeNull();
    expect(sensorRequests().some((r) => r.tentId === null)).toBe(false);
  });
});
