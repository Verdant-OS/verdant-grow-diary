import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { isSnapshotStale } from "@/lib/sensorSnapshot";

const io = vi.hoisted(() => ({
  from: vi.fn(),
  sensor: [] as unknown,
  diary: [] as unknown,
  error: null as unknown,
  reject: false,
  sensorLimit: null as null | (() => Promise<{ data: unknown; error: unknown }>),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      io.from(table);
      const q = {
        select: () => q,
        in: () => q,
        eq: () => q,
        is: () => q,
        or: () => q,
        order: () => q,
        range: (from: number, to: number) =>
          Promise.resolve({
            data: Array.isArray(io.diary) ? io.diary.slice(from, to + 1) : io.diary,
            error: null,
          }),
        limit: () => {
          if (table === "diary_entries") {
            return Promise.resolve({ data: io.diary, error: null });
          }
          if (io.sensorLimit) return io.sensorLimit();
          if (io.reject) return Promise.reject(new Error("private read failure"));
          return Promise.resolve({ data: io.sensor, error: io.error });
        },
      };
      return q;
    },
  },
}));
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const observed = "2026-01-01T12:00:00.000Z";
const clients: QueryClient[] = [];
function reading() {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    user_id: owner,
    tent_id: tent,
    ts: observed,
    captured_at: observed,
    created_at: observed,
    metric: "temperature_c",
    value: 24,
    source: "manual",
    quality: "ok",
    device_id: null,
    raw_payload: null,
    correction_valid: true,
    corrected_at: new Date().toISOString(),
  };
}
function diary(tentId: string | null = tent, entryAt = "2026-01-02T12:00:00.000Z") {
  return [
    {
      id: "diary-1",
      tent_id: tentId,
      entry_at: entryAt,
      details: { manual_sensor_snapshot: { source: "manual", temp_f: 77, humidity_percent: 55 } },
    },
  ];
}
function mount(oldCache = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  if (oldCache)
    client.setQueryData(["latest-sensor-snapshot", owner, "grow-a", tent], { temp: 99 });
  return renderHook(() => useLatestSensorSnapshot("grow-a", [tent]), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  io.from.mockClear();
  io.sensor = [reading()];
  io.diary = [];
  io.error = null;
  io.reject = false;
  io.sensorLimit = null;
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  onlineManager.setOnline(true);
});
describe("Dashboard effective correction reads", () => {
  it("keeps an offline first read unresolved until reconnect completes it", async () => {
    onlineManager.setOnline(false);
    const { result } = mount();
    expect(result.current).toMatchObject({
      status: "loading",
      isFetching: false,
      isPaused: true,
    });
    expect(io.from).not.toHaveBeenCalled();
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot.temp).toBe(24);
    expect(result.current.isPaused).toBe(false);
  });
  it("keeps cached evidence visible with isFetching during a background correction refetch", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot.temp).toBe(24);

    let resolveRefetch!: (value: { data: unknown; error: null }) => void;
    io.sensor = [{ ...reading(), value: 26 }];
    io.sensorLimit = () =>
      new Promise((resolve) => {
        resolveRefetch = resolve;
      });

    act(() => {
      void clients.at(-1)!.invalidateQueries({ queryKey: ["latest-sensor-snapshot"] });
    });

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.status).toBe("ok");
    expect(result.current.snapshot.temp).toBe(24);
    expect(result.current.isPaused).toBe(false);

    await act(async () => {
      resolveRefetch({ data: io.sensor, error: null });
    });

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.snapshot.temp).toBe(26);
  });

  it("preserves cached evidence with an explicit paused flag during an offline refresh", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ok"));
    onlineManager.setOnline(false);
    act(() => {
      void clients.at(-1)!.invalidateQueries({ queryKey: ["latest-sensor-snapshot"] });
    });
    await waitFor(() => expect(result.current.isPaused).toBe(true));
    expect(result.current.status).toBe("ok");
    expect(result.current.snapshot.temp).toBe(24);
    expect(result.current.isFetching).toBe(false);
    io.sensor = [{ ...reading(), value: 26 }];
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.snapshot.temp).toBe(26));
    expect(result.current.snapshot.ts).toBe(observed);
    expect(result.current.isPaused).toBe(false);
  });
  it.each([
    ["null", null, false],
    ["undefined", undefined, false],
    ["null with stale sensor evidence", null, true],
    ["undefined with stale sensor evidence", undefined, true],
  ])("reports a %s diary response as unavailable", async (_label, data, withStaleSensor) => {
    io.sensor = withStaleSensor ? [reading()] : [];
    io.diary = data;
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.snapshot.temp).toBeNull();
  });
  it("retains the corrected value, manual source, root identity and stale observation time", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot).toMatchObject({
      temp: 24,
      source: "manual",
      ts: observed,
      tent_id: tent,
    });
    expect(result.current.snapshot.metric_refs?.temp).toMatchObject({
      id: reading().id,
      captured_at: observed,
    });
    expect(isSnapshotStale(result.current.snapshot)).toBe(true);
    expect(io.from.mock.calls).toEqual([["sensor_readings_effective"], ["diary_entries"]]);
  });
  it("does not reuse the old raw cache", async () => {
    const { result } = mount(true);
    expect(result.current.snapshot.temp).not.toBe(99);
    await waitFor(() => expect(result.current.snapshot.temp).toBe(24));
  });
  it("still prefers newer usable diary evidence over a stale corrected reading", async () => {
    io.diary = diary();
    const { result } = mount();
    await waitFor(() => expect(result.current.snapshot.temp).toBe(25));
    expect(result.current.snapshot.source).toBe("manual");
  });
  it("keeps a corrected observation over an older diary observation", async () => {
    io.diary = diary(tent, "2025-12-31T12:00:00.000Z");
    const { result } = mount();
    await waitFor(() => expect(result.current.snapshot.temp).toBe(24));
    expect(result.current.snapshot.ts).toBe(observed);
  });
  it("keeps a fresh usable corrected observation ahead of diary fallback", async () => {
    const fresh = new Date().toISOString();
    io.sensor = [{ ...reading(), ts: fresh, captured_at: fresh }];
    io.diary = diary(tent, fresh);
    const { result } = mount();
    await waitFor(() => expect(result.current.snapshot.temp).toBe(24));
    expect(io.from.mock.calls).toEqual([["sensor_readings_effective"]]);
    expect(isSnapshotStale(result.current.snapshot)).toBe(false);
  });
  it("accepts usable diary evidence even when the sensor request rejects", async () => {
    io.reject = true;
    io.diary = diary();
    const { result } = mount();
    await waitFor(() => expect(result.current.snapshot.temp).toBe(25));
    expect(result.current.status).toBe("ok");
  });
  it.each(["invalid", "transport", "rejected", "null"])(
    "reports %s sensor reads plus empty diary as unavailable",
    async (mode) => {
      if (mode === "invalid") io.sensor = [{ ...reading(), correction_valid: false, value: null }];
      if (mode === "transport") io.error = new Error("private transport detail");
      if (mode === "rejected") io.reject = true;
      if (mode === "null") io.sensor = null;
      const { result } = mount();
      await waitFor(() => expect(result.current.status).toBe("unavailable"));
      expect(result.current.snapshot.temp).toBeNull();
    },
  );
  it("accepts an in-scope diary survivor when correction evidence is invalid", async () => {
    io.sensor = [{ ...reading(), correction_valid: false, value: null }];
    io.diary = diary();
    const { result } = mount();
    await waitFor(() => expect(result.current.snapshot.temp).toBe(25));
    expect(result.current.status).toBe("ok");
  });
  it.each([null, "foreign-tent"])(
    "never substitutes diary evidence attributed to %s",
    async (scope) => {
      io.error = new Error("unavailable");
      io.diary = diary(scope);
      const { result } = mount();
      await waitFor(() => expect(result.current.status).toBe("unavailable"));
      expect(result.current.snapshot.temp).toBeNull();
    },
  );
  it("keeps completed empty reads distinct from failure", async () => {
    io.sensor = [];
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot.temp).toBeNull();
  });
});
