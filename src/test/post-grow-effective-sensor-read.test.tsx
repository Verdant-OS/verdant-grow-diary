import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({
  owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as string | null,
  pending: null as Promise<unknown> | null,
  nullTable: null as string | null,
  sensor: [] as unknown,
  error: null as unknown,
  tents: true,
  unit: "celsius",
  diary: [] as unknown[],
  signed: { data: [] as unknown, error: null as unknown },
  calls: vi.fn(),
}));
vi.mock("@/store/auth", () => {
  const users = new Map<string, { id: string }>();
  return {
    useAuth: () => {
      if (io.owner && !users.has(io.owner)) users.set(io.owner, { id: io.owner });
      return { user: io.owner ? users.get(io.owner) : null };
    },
  };
});
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => io.unit,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrls: async () => io.signed }) },
    from: (table: string) => {
      let growId = "grow-a";
      const q = {
        select: (...args: unknown[]) => {
          io.calls(table, "select", ...args);
          return q;
        },
        eq: (...args: unknown[]) => {
          io.calls(table, "eq", ...args);
          if (table === "grows" && args[0] === "id") growId = String(args[1]);
          return q;
        },
        in: (...args: unknown[]) => {
          io.calls(table, "in", ...args);
          return q;
        },
        order: (...args: unknown[]) => {
          io.calls(table, "order", ...args);
          return q;
        },
        limit: (...args: unknown[]) => {
          io.calls(table, "limit", ...args);
          return q;
        },
        is: () => q,
        maybeSingle: () => q,
        then: (resolve: (value: unknown) => unknown) => {
          if (table === io.nullTable)
            return Promise.resolve({ data: null, error: null }).then(resolve);
          if (table.startsWith("sensor_readings") && io.pending) {
            const pending = io.pending;
            io.pending = null;
            return pending.then(resolve);
          }
          return Promise.resolve(
            table === "grows"
              ? {
                  data: { id: growId, name: growId, stage: "harvest", is_archived: true },
                  error: null,
                }
              : table === "tents"
                ? {
                    data: io.tents ? [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] : [],
                    error: null,
                  }
                : table.startsWith("sensor_readings")
                  ? {
                      data:
                        table === "sensor_readings" && Array.isArray(io.sensor)
                          ? io.sensor.map((r) => ({ ...r, value: 99 }))
                          : io.sensor,
                      error: io.error,
                    }
                  : { data: table === "diary_entries" ? io.diary : [], error: null },
          ).then(resolve);
        },
      };
      return q;
    },
  },
}));
import { usePostGrowLearningReportData } from "@/hooks/usePostGrowLearningReportData";
import { notifyManualSensorCorrectionConfirmed } from "@/lib/manualSensorCorrectionEvents";
const observed = "2026-01-01T12:00:00.000Z";
function row() {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    tent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    metric: "temperature_c",
    value: 24,
    source: "manual",
    quality: "ok",
    ts: observed,
    captured_at: observed,
    created_at: observed,
    device_id: null,
    raw_payload: null,
    correction_valid: true,
  };
}
beforeEach(() => {
  io.owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  io.pending = null;
  io.nullTable = null;
  onlineManager.setOnline(true);
  io.sensor = [row()];
  io.error = null;
  io.tents = true;
  io.unit = "celsius";
  io.diary = [];
  io.signed = { data: [], error: null };
  io.calls.mockClear();
});
it("summarizes corrected manual evidence while retaining scope, ordering and source", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.report?.environment.find((m) => m.key === "temperature_c")).toMatchObject({
    count: 1,
    avg: 24,
    min: 24,
    max: 24,
  });
  expect(result.current.report?.sensorReadingSources).toEqual([{ source: "manual" }]);
  expect(io.calls).toHaveBeenCalledWith("sensor_readings_effective", "in", "tent_id", [
    row().tent_id,
  ]);
  expect(io.calls).toHaveBeenCalledWith("sensor_readings_effective", "order", "captured_at", {
    ascending: true,
    nullsFirst: false,
  });
  expect(io.calls).toHaveBeenCalledWith("sensor_readings_effective", "limit", 1000);
  expect(JSON.stringify(result.current.report)).not.toMatch(/user_id|raw_payload|correction_valid/);
});
it.each(["null", "invalid", "error"])("makes %s sensor evidence unavailable", async (kind) => {
  if (kind === "null") io.sensor = null;
  if (kind === "invalid") io.sensor = [{ ...row(), correction_valid: false }];
  if (kind === "error") io.error = { message: "private provider detail" };
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.report).toBeNull();
});
it("retains a successfully empty report", async () => {
  io.sensor = [];
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.report?.environment.every((m) => m.count === 0)).toBe(true);
});
it("reloads a failed report without exposing provider details", async () => {
  io.error = new Error("private provider detail");
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.error).toBe("Unable to load post-grow report.");
  io.error = null;
  await act(async () => {
    await result.current.reload();
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.report?.environment[0].avg).toBe(24);
});
it("does not query readings without a tent in the grow", async () => {
  io.tents = false;
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(io.calls.mock.calls.some(([table]) => table.startsWith("sensor_readings"))).toBe(false);
});

afterEach(() => onlineManager.setOnline(true));
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    client,
    ...renderHook(({ grow }) => usePostGrowLearningReportData(grow), {
      initialProps: { grow: "grow-a" },
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
it("keeps the first offline read unresolved without IO", () => {
  onlineManager.setOnline(false);
  const { result } = mount();
  expect(result.current.status).toBe("loading");
  expect(result.current.report).toBeNull();
  expect(io.calls).not.toHaveBeenCalled();
});
it("withholds cached data during a paused correction refresh and resumes", async () => {
  const { client, result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  onlineManager.setOnline(false);
  act(() => {
    void client.invalidateQueries({ queryKey: ["post-grow-report"] });
  });
  await waitFor(() => expect(result.current.status).toBe("loading"));
  expect(result.current.report).toBeNull();
  io.sensor = [{ ...row(), value: 23 }];
  act(() => onlineManager.setOnline(true));
  await waitFor(() => expect(result.current.report?.environment[0].avg).toBe(23));
});
it.each(["grow", "owner", "logout"])("isolates a late read after changing %s", async (scope) => {
  const previous = row();
  let resolve!: (value: unknown) => void;
  io.pending = new Promise((done) => {
    resolve = done;
  });
  const { result, rerender } = mount();
  await waitFor(() =>
    expect(io.calls.mock.calls.some(([table]) => table.startsWith("sensor_readings"))).toBe(true),
  );
  io.sensor = [];
  if (scope === "owner") io.owner = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  if (scope === "logout") io.owner = null;
  rerender({ grow: scope === "grow" ? "grow-b" : "grow-a" });
  await waitFor(() => expect(result.current.status).toBe(scope === "logout" ? "idle" : "ready"));
  await act(async () => {
    resolve({ data: [previous], error: null });
  });
  if (scope === "logout") expect(result.current.report).toBeNull();
  else {
    expect(result.current.report?.environment[0].count).toBe(0);
    expect(result.current.report?.header.growId).toBe(scope === "grow" ? "grow-b" : "grow-a");
  }
});
it.each(["tents", "harvests", "diary_entries", "action_queue"])(
  "rejects a null %s response",
  async (table) => {
    io.nullTable = table;
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.report).toBeNull();
  },
);
it("refreshes corrections only for the current owner", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  io.calls.mockClear();
  act(() => notifyManualSensorCorrectionConfirmed("other-owner", row().tent_id));
  expect(io.calls).not.toHaveBeenCalled();
  io.sensor = [{ ...row(), value: 22 }];
  act(() => notifyManualSensorCorrectionConfirmed(io.owner!, row().tent_id));
  await waitFor(() => expect(result.current.report?.environment[0].avg).toBe(22));
});
it("isolates a late response after changing measurement system", async () => {
  let resolve!: (value: unknown) => void;
  io.pending = new Promise((done) => {
    resolve = done;
  });
  const { result, rerender } = mount();
  await waitFor(() => expect(io.pending).toBeNull());
  io.unit = "fahrenheit";
  rerender({ grow: "grow-a" });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  const expected = result.current.yieldEfficiency;
  await act(async () => resolve({ data: [row()], error: null }));
  expect(result.current.yieldEfficiency).toEqual(expected);
  expect(result.current.yieldEfficiency?.system).toBe("imperial");
});
it("withholds cached evidence when a refresh fails, then recovers", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  io.error = new Error("private provider detail");
  await act(async () => {
    await result.current.reload();
  });
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.report).toBeNull();
  expect(result.current.yieldEfficiency).toBeNull();
  expect(result.current.error).not.toContain("private");
  io.error = null;
  await act(async () => {
    await result.current.reload();
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));
});
it.each(["error", "null", "missing", "empty-url"])(
  "withholds unresolved %s photo evidence",
  async (kind) => {
    io.diary = [{ id: "photo-entry", photo_url: "owner/photo.jpg", entry_at: observed }];
    io.signed = {
      data:
        kind === "null"
          ? null
          : kind === "empty-url"
            ? [{ path: "owner/photo.jpg", signedUrl: "" }]
            : [],
      error: kind === "error" ? new Error("private storage failure") : null,
    };
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.report).toBeNull();
    expect(result.current.error).not.toContain("private");
  },
);
it("retrieves photos after complete signing", async () => {
  io.diary = [{ id: "photo-entry", photo_url: "owner/photo.jpg", entry_at: observed }];
  io.signed = {
    data: [{ path: "owner/photo.jpg", signedUrl: "https://signed.example/photo.jpg" }],
    error: null,
  };
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.report?.photos[0].url).toBe("https://signed.example/photo.jpg");
});
