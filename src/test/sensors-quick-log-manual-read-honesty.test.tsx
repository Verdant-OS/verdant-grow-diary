import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSensorsQuickLogManualReadings } from "@/hooks/useSensorsQuickLogManualReadings";

const io = vi.hoisted(() => ({
  userId: "owner-a" as string | null,
  read: vi.fn(),
  filters: [] as Array<{ table: string; field: string; value: unknown }>,
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: io.userId ? { id: io.userId } : null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => {
          io.filters.push({ table, field, value });
          return query;
        },
        is: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve()
            .then(() => io.read(table))
            .then(resolve, reject),
      };
      return query;
    },
  },
}));
const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const at = new Date().toISOString();
const event = {
  id: "event-a",
  tent_id: TENT_A,
  event_type: "environment",
  source: "manual",
  is_deleted: false,
  occurred_at: at,
  environment_events: { temperature_c: 24, humidity_pct: 60, vpd_kpa: 1.1 },
};
const diary = {
  id: "diary-a",
  tent_id: TENT_A,
  entry_at: at,
  details: { manual_sensor_snapshot: { source: "manual", temp_f: 77, humidity_percent: 55 } },
};
const ok = (data: unknown = []) => ({ data, error: null });
const failure = { data: null, error: { message: "private backend failure", code: "XX000" } };
const clients: QueryClient[] = [];
function mount(tentId: string | null = TENT_A) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(({ tent }) => useSensorsQuickLogManualReadings(tent), {
      initialProps: { tent: tentId },
      wrapper,
    }),
    client,
  };
}
beforeEach(() => {
  io.userId = "owner-a";
  io.filters = [];
  io.read.mockReset().mockResolvedValue(ok());
  onlineManager.setOnline(true);
});
afterEach(() => {
  onlineManager.setOnline(true);
  clients.splice(0).forEach((c) => c.clear());
});

describe("Sensors Quick Log manual history read honesty", () => {
  it.each(["grow_events", "diary_entries"])(
    "keeps the surviving manual source when %s fails",
    async (failed) => {
      io.read.mockImplementation((table) =>
        Promise.resolve(
          table === failed ? failure : ok(table === "grow_events" ? [event] : [diary]),
        ),
      );
      const { result } = mount();
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].source).toBe("manual");
      expect(result.current.data?.[0].temp).toBe(failed === "grow_events" ? 25 : 24);
    },
  );
  it.each(["grow_events", "diary_entries"])(
    "does not turn %s failure plus empty survivor into success",
    async (failed) => {
      io.read.mockImplementation((table) => Promise.resolve(table === failed ? failure : ok()));
      const { result } = mount();
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.data ?? []).toEqual([]);
    },
  );
  it("exposes both failed reads", async () => {
    io.read.mockResolvedValue(failure);
    const { result } = mount();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isSuccess).toBe(false);
  });
  it.each([null, {}, "not rows"])("rejects malformed successful row payload %j", async (data) => {
    io.read.mockResolvedValue(ok(data));
    const { result } = mount();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isSuccess).toBe(false);
  });
  it("keeps both transport rejections unavailable", async () => {
    io.read.mockRejectedValue(new Error("transport unavailable"));
    const { result } = mount();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
  it("accepts successful empty reads", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data ?? []).toEqual([]);
    expect(result.current.isError).toBe(false);
  });
  it("merges grow_events and diary manual rows when both reads succeed", async () => {
    const olderEvent = { ...event, occurred_at: "2026-09-10T10:00:00.000Z" };
    const newerDiary = {
      ...diary,
      entry_at: "2026-09-11T10:00:00.000Z",
      details: {
        manual_sensor_snapshot: { source: "manual", temp_f: 80, humidity_percent: 58 },
      },
    };
    io.read.mockImplementation((table) =>
      Promise.resolve(ok(table === "grow_events" ? [olderEvent] : [newerDiary])),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.every((row) => row.source === "manual")).toBe(true);
  });
  it("retains cached manual data after both refreshes fail, then retries both sources", async () => {
    io.read.mockImplementation((table) =>
      Promise.resolve(ok(table === "diary_entries" ? [diary] : [])),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    io.read.mockClear().mockResolvedValue(failure);
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(io.read.mock.calls.map(([table]) => table).sort()).toEqual([
      "diary_entries",
      "grow_events",
    ]);
    io.read.mockClear().mockResolvedValue(ok());
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data ?? []).toEqual([]);
    expect(io.read.mock.calls.map(([table]) => table).sort()).toEqual([
      "diary_entries",
      "grow_events",
    ]);
  });
  it("keeps the first paused read unresolved and automatically resumes online", async () => {
    onlineManager.setOnline(false);
    const { result } = mount();
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("paused");
    expect(result.current.isSuccess).toBe(false);
    expect(io.read).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(io.read).toHaveBeenCalledTimes(2);
  });

  it("keeps a completed source visible while the other first read remains pending", async () => {
    let finish!: (value: ReturnType<typeof ok>) => void;
    const pending = new Promise<ReturnType<typeof ok>>((resolve) => {
      finish = resolve;
    });
    io.read.mockImplementation((table) => (table === "grow_events" ? pending : ok([diary])));
    const { result } = mount();
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.isPending).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    await act(async () => {
      finish(ok());
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("does not expose a late previous-owner result after the owner changes", async () => {
    let finish!: (value: ReturnType<typeof ok>) => void;
    const pending = new Promise<ReturnType<typeof ok>>((resolve) => {
      finish = resolve;
    });
    io.read.mockImplementation((table) => (table === "diary_entries" ? pending : ok()));
    const { result, rerender } = mount();
    await waitFor(() => expect(io.read).toHaveBeenCalledTimes(2));
    io.userId = "owner-b";
    io.read.mockResolvedValue(ok());
    rerender({ tent: TENT_A });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      finish(ok([diary]));
    });
    expect(result.current.data).toEqual([]);
  });
  it.each([null, "invalid"])("does not query an absent or invalid tent (%j)", async (tent) => {
    const { result } = mount(tent);
    expect(result.current.data ?? []).toEqual([]);
    expect(io.read).not.toHaveBeenCalled();
  });
  it("does not query without an authenticated user", () => {
    io.userId = null;
    mount();
    expect(io.read).not.toHaveBeenCalled();
  });
  it("keeps reads scoped to the selected tent and separates owners and targets", async () => {
    io.read.mockImplementation((table) =>
      Promise.resolve(ok(table === "diary_entries" ? [diary] : [])),
    );
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(io.filters.filter((f) => f.field === "tent_id").map((f) => f.value)).toEqual([
      TENT_A,
      TENT_A,
    ]);
    io.userId = "owner-b";
    io.read.mockResolvedValue(ok());
    rerender({ tent: TENT_A });
    expect(result.current.data ?? []).toEqual([]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ tent: TENT_B });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data ?? []).toEqual([]);
    expect(
      io.filters
        .filter((f) => f.field === "tent_id")
        .slice(-2)
        .map((f) => f.value),
    ).toEqual([TENT_B, TENT_B]);
  });
});
