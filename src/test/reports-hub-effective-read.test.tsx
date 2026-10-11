import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({
  owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as string | null,
  sensor: { data: [] as unknown[] | null, error: null as unknown },
  calls: vi.fn(),
  pending: null as Promise<unknown> | null,
  fault: null as { table: string; kind: "error" | "null" | "count" } | null,
  faultyCount: null as number | null,
}));
const tent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
vi.mock("@/store/auth", () => {
  const users = new Map<string, { id: string }>();
  return {
    useAuth: () => {
      if (io.owner && !users.has(io.owner)) users.set(io.owner, { id: io.owner });
      return { user: io.owner ? users.get(io.owner) : null };
    },
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let grow = "grow-a";
      let head = false;
      const q = {
        select: (...args: unknown[]) => {
          io.calls(table, "select", ...args);
          head = !!(args[1] as { head?: boolean } | undefined)?.head;
          return q;
        },
        eq: (key: string, value: string) => {
          if (key === "grow_id") grow = value;
          return q;
        },
        or: (filter: string) => {
          io.calls(table, "or", filter);
          if (table === "tents") grow = filter.split(",")[0].slice("grow_id.eq.".length);
          return q;
        },
        in: (...args: unknown[]) => {
          io.calls(table, "in", ...args);
          return q;
        },
        order: () => q,
        limit: () => q,
        range: () => q,
        is: () => q,
        not: () => q,
        lte: () => q,
        gte: () => q,
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          if (io.fault?.table === table && (io.fault.kind !== "count" || head)) {
            return Promise.resolve({
              data: null,
              count: io.fault.kind === "count" ? io.faultyCount : null,
              error: io.fault.kind === "error" ? { message: "private failure" } : null,
            }).then(resolve, reject);
          }
          if (table.startsWith("sensor_readings") && io.pending) {
            const pending = io.pending;
            io.pending = null;
            return pending.then(resolve, reject);
          }
          const result =
            table === "tents"
              ? { data: [{ id: tent, grow_id: grow }], error: null }
              : table.startsWith("sensor_readings")
                ? io.sensor
                : { data: [], error: null, count: 0 };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
  },
}));
import { useReportsHubData } from "@/hooks/useReportsHubData";
function reading() {
  const ts = new Date(Date.now() - 60_000).toISOString();
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    user_id: io.owner,
    tent_id: tent,
    metric: "temperature_c",
    value: 24,
    source: "manual",
    quality: "ok",
    ts,
    captured_at: ts,
    created_at: ts,
    device_id: null,
    raw_payload: null,
    correction_valid: true,
  };
}
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return {
    client,
    ...renderHook(({ grow }) => useReportsHubData(grow), {
      initialProps: { grow: "grow-a" },
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
beforeEach(() => {
  io.owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  io.sensor = { data: [reading()], error: null };
  io.pending = null;
  io.fault = null;
  io.faultyCount = null;
  io.calls.mockClear();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
});
it.each(
  ["tents", "plants", "alerts", "diary_entries", "grow_events", "action_queue"].flatMap((table) =>
    (["error", "null"] as const).map((kind) => ({ table, kind })),
  ),
)("does not report empty evidence for $table $kind responses", async ({ table, kind }) => {
  io.fault = { table, kind };
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.latestSensorCapturedAt).toBeNull();
});
it.each(["alerts", "diary_entries"])("requires a successful exact count for %s", async (table) => {
  io.fault = { table, kind: "count" };
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
});
it("counts effective observations and retains their original observation time", async () => {
  const row = reading();
  io.sensor.data = [row];
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.recentSensorReadingCount).toBe(1);
  expect(result.current.latestSensorCapturedAt).toBe(row.captured_at);
  expect(io.calls).toHaveBeenCalledWith(
    "sensor_readings_effective",
    "select",
    expect.stringContaining("correction_valid"),
  );
  expect(io.calls).toHaveBeenCalledWith("sensor_readings_effective", "in", "tent_id", [tent]);
});
it.each(["invalid", "null", "error"])("reports %s sensor evidence as unavailable", async (kind) => {
  io.sensor =
    kind === "invalid"
      ? { data: [{ ...reading(), correction_valid: false }], error: null }
      : kind === "null"
        ? { data: null, error: null }
        : { data: [], error: new Error("private error") };
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.latestSensorCapturedAt).toBeNull();
});
it("keeps a successful empty read distinct from failure", async () => {
  io.sensor.data = [];
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.recentSensorReadingCount).toBe(0);
});
it("retries the failed report and restores ready state only after successful reads", async () => {
  io.fault = { table: "alerts", kind: "error" };
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  io.fault = null;
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.recentSensorReadingCount).toBe(1);
});
it("keeps an offline first read unresolved", () => {
  onlineManager.setOnline(false);
  const { result } = mount();
  expect(result.current.status).toBe("loading");
  expect(io.calls).not.toHaveBeenCalled();
});
it("refreshes a mounted report and withholds cached evidence while paused", async () => {
  const { client, result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  onlineManager.setOnline(false);
  act(() => {
    void client.invalidateQueries({ queryKey: ["reports-hub"] });
  });
  await waitFor(() => expect(result.current.status).toBe("loading"));
  expect(result.current.latestSensorCapturedAt).toBeNull();
  io.sensor.data = [];
  act(() => onlineManager.setOnline(true));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.recentSensorReadingCount).toBe(0);
});
it("isolates a late response after switching grows", async () => {
  const previous = reading();
  let resolve!: (value: unknown) => void;
  io.pending = new Promise((done) => {
    resolve = done;
  });
  const { result, rerender } = mount();
  await waitFor(() =>
    expect(io.calls.mock.calls.some(([table]) => table.startsWith("sensor_readings"))).toBe(true),
  );
  io.sensor.data = [];
  rerender({ grow: "grow-b" });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  await act(async () => {
    resolve({ data: [previous], error: null });
  });
  expect(result.current.recentSensorReadingCount).toBe(0);
  expect(result.current.latestSensorCapturedAt).toBeNull();
});
it("immediately withholds report evidence on logout", async () => {
  const { result, rerender } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  io.owner = null;
  rerender({ grow: "grow-a" });
  expect(result.current.status).toBe("idle");
  expect(result.current.latestSensorCapturedAt).toBeNull();
});
import { notifyManualSensorCorrectionConfirmed } from "@/lib/manualSensorCorrectionEvents";
it("refreshes corrected observations only for the current owner", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  io.calls.mockClear();
  act(() => notifyManualSensorCorrectionConfirmed("another-owner", tent));
  expect(io.calls).not.toHaveBeenCalled();
  io.sensor.data = [];
  act(() => notifyManualSensorCorrectionConfirmed(io.owner!, tent));
  await waitFor(() => expect(result.current.recentSensorReadingCount).toBe(0));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.latestSensorCapturedAt).toBeNull();
  expect(io.calls).toHaveBeenCalled();
});
it("does not expose previous-owner evidence during an owner switch", async () => {
  const { result, rerender } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  io.owner = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  io.sensor.data = [];
  rerender({ grow: "grow-a" });
  expect(result.current.latestSensorCapturedAt).toBeNull();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.recentSensorReadingCount).toBe(0);
});
it("withholds cached report facts when a later refresh fails", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  io.fault = { table: "diary_entries", kind: "error" };
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.latestSensorCapturedAt).toBeNull();
  expect(result.current.recentSensorReadingCount).toBe(0);
});
it("keeps logout idle when the old owner's unresolved read finishes", async () => {
  const previous = reading();
  let resolve!: (value: unknown) => void;
  io.pending = new Promise((done) => {
    resolve = done;
  });
  const { result, rerender } = mount();
  await waitFor(() =>
    expect(io.calls.mock.calls.some(([table]) => table === "sensor_readings_effective")).toBe(true),
  );
  io.owner = null;
  rerender({ grow: "grow-a" });
  expect(result.current.status).toBe("idle");
  await act(async () => {
    resolve({ data: [previous], error: null });
  });
  expect(result.current.status).toBe("idle");
  expect(result.current.latestSensorCapturedAt).toBeNull();
});
it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  "rejects malformed exact count %s instead of rendering it as a report fact",
  async (count) => {
    io.fault = { table: "alerts", kind: "count" };
    io.faultyCount = count;
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.alertsOpen).toBe(0);
  },
);
it("does not query report evidence when tent scope cannot be established", async () => {
  io.fault = { table: "tents", kind: "null" };
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(io.calls.mock.calls.every(([table]) => table === "tents" || table === "plants")).toBe(
    true,
  );
});
it("does not query or retry after an unauthenticated first render", () => {
  io.owner = null;
  const { result } = mount();
  expect(result.current.status).toBe("idle");
  act(() => result.current.retry());
  expect(io.calls).not.toHaveBeenCalled();
});
