import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiaryRangeReportData } from "@/hooks/useDiaryRangeReportData";

const io = vi.hoisted(() => ({
  calls: vi.fn(),
  sensor: [] as unknown,
  error: null as unknown,
  tents: true,
  fault: null as { table: string; kind: "null" | "error" } | null,
  signedIn: true,
  owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  pendingSensor: null as Promise<unknown> | null,
  diary: [] as unknown[],
  photos: { data: [] as unknown, error: null as unknown },
}));
vi.mock("@/store/auth", () => {
  const users = new Map<string, { id: string }>();
  return {
    useAuth: () => {
      if (!users.has(io.owner)) users.set(io.owner, { id: io.owner });
      return { user: io.signedIn ? users.get(io.owner) : null };
    },
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrls: async () => io.photos }) },
    from: (table: string) => {
      const filters: unknown[] = [];
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return q;
        },
        in: (k: string, v: unknown) => {
          filters.push([k, v]);
          return q;
        },
        or: (v: string) => {
          filters.push(["or", v]);
          return q;
        },
        is: () => q,
        gte: () => q,
        lte: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: () => q,
        then: (resolve: (value: unknown) => unknown) => {
          io.calls(table, filters);
          if (io.fault?.table === table)
            return Promise.resolve({
              data: null,
              error: io.fault.kind === "error" ? new Error("PRIVATE_DATABASE_DETAIL") : null,
            }).then(resolve);
          if (table.startsWith("sensor_readings") && io.pendingSensor) {
            return io.pendingSensor.then(resolve);
          }
          const result =
            table === "grows"
              ? { data: { id: "grow-a", name: "Grow A", stage: "veg" }, error: null }
              : table === "tents"
                ? {
                    data: io.tents ? [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] : [],
                    error: null,
                  }
                : table.startsWith("sensor_readings")
                  ? { data: io.sensor, error: io.error }
                  : { data: table === "diary_entries" ? io.diary : [], error: null };
          return Promise.resolve(result).then(resolve);
        },
      };
      return q;
    },
  },
}));
const observed = "2026-01-01T12:00:00.000Z";
function row() {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    tent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    value: 24,
    metric: "temperature_c",
    source: "manual",
    quality: "ok",
    captured_at: observed,
    ts: observed,
    created_at: observed,
    device_id: null,
    raw_payload: null,
    correction_valid: true,
    corrected_at: new Date().toISOString(),
  };
}
beforeEach(() => {
  io.calls.mockClear();
  io.fault = null;
  io.sensor = [row()];
  io.error = null;
  io.tents = true;
  io.signedIn = true;
  io.owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  io.pendingSensor = null;
  io.diary = [];
  io.photos = { data: [], error: null };
  onlineManager.setOnline(true);
});
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  onlineManager.setOnline(true);
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const hook = renderHook(({ grow, end }) => useDiaryRangeReportData(grow, "2026-01-01", end), {
    initialProps: { grow: "grow-a", end: "2026-01-02" },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, client };
}
describe("diary range effective sensor evidence", () => {
  it("keeps a first paused report read unresolved without querying", async () => {
    onlineManager.setOnline(false);
    const { result } = mount();
    await act(async () => {});
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();
    expect(io.calls).not.toHaveBeenCalled();
  });
  it("withholds cached report data during paused correction refresh and resumes", async () => {
    const { result, client } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    onlineManager.setOnline(false);
    io.sensor = [{ ...row(), value: 23 }];
    act(() => {
      void client.invalidateQueries({ queryKey: ["diary-range-report"] });
    });
    await waitFor(() => expect(result.current.status).toBe("loading"));
    expect(result.current.data).toBeNull();
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.data?.sensorReadings[0]?.value).toBe(23));
  });
  it.each(["grow", "date"])("does not expose a late response after changing %s", async (scope) => {
    let resolveOld!: (value: unknown) => void;
    io.pendingSensor = new Promise((resolve) => {
      resolveOld = resolve;
    });
    const { result, rerender } = mount();
    await waitFor(() =>
      expect(io.calls.mock.calls.some(([t]) => t.startsWith("sensor_readings"))).toBe(true),
    );
    io.pendingSensor = null;
    io.sensor = [{ ...row(), value: 29 }];
    rerender({
      grow: scope === "grow" ? "grow-b" : "grow-a",
      end: scope === "date" ? "2026-01-03" : "2026-01-02",
    });
    await waitFor(() => expect(result.current.data?.sensorReadings[0]?.value).toBe(29));
    await act(async () => {
      resolveOld({ data: [row()], error: null });
    });
    expect(result.current.data?.sensorReadings[0]?.value).toBe(29);
  });
  it("cannot restore report data after sign-out", async () => {
    let resolveOld!: (value: unknown) => void;
    io.pendingSensor = new Promise((resolve) => {
      resolveOld = resolve;
    });
    const { result, rerender } = mount();
    await waitFor(() =>
      expect(io.calls.mock.calls.some(([t]) => t.startsWith("sensor_readings"))).toBe(true),
    );
    io.signedIn = false;
    rerender({ grow: "grow-a", end: "2026-01-02" });
    await act(async () => {
      resolveOld({ data: [row()], error: null });
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeNull();
  });
  it("refreshes corrected data through the report invalidation family", async () => {
    const { result, client } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    io.sensor = [{ ...row(), value: 23 }];
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["diary-range-report"] });
    });
    await waitFor(() => expect(result.current.data?.sensorReadings[0]?.value).toBe(23));
  });
  it("reads corrected values and original time/source for the requested grow and range", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.sensorReadings).toMatchObject([
      { value: 24, captured_at: observed, source: "manual" },
    ]);
    expect(Object.keys(result.current.data!.sensorReadings[0]).sort()).toEqual(
      ["metric", "value", "ts", "captured_at", "source", "raw_payload"].sort(),
    );
    const sensorCalls = io.calls.mock.calls.filter(([table]) =>
      table.startsWith("sensor_readings"),
    );
    expect(sensorCalls).toEqual([
      [
        "sensor_readings_effective",
        [
          ["tent_id", [row().tent_id]],
          ["metric", ["temperature_c", "humidity_pct", "vpd_kpa"]],
          [
            "or",
            "and(captured_at.gte.2026-01-01T00:00:00.000Z,captured_at.lte.2026-01-02T23:59:59.999Z),and(captured_at.is.null,ts.gte.2026-01-01T00:00:00.000Z,ts.lte.2026-01-02T23:59:59.999Z)",
          ],
        ],
      ],
    ]);
  });
  it.each(["invalid", "null", "transport"])(
    "does not export a %s sensor read as an empty successful report",
    async (mode) => {
      if (mode === "invalid") io.sensor = [{ ...row(), value: null, correction_valid: false }];
      if (mode === "null") io.sensor = null;
      if (mode === "transport") io.error = new Error("unavailable");
      const { result } = mount();
      await waitFor(() => expect(result.current.status).toBe("unavailable"));
    },
  );
  it("retains successful empty sensor history", async () => {
    io.sensor = [];
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.sensorReadings).toEqual([]);
  });
  it("does not query sensors when the grow has no tents", async () => {
    io.tents = false;
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(io.calls.mock.calls.some(([table]) => table.startsWith("sensor_readings"))).toBe(false);
  });
});
it.each(
  ["tents", "diary_entries", "grow_events", "harvests"].flatMap((table) =>
    (["null", "error"] as const).map((kind) => ({ table, kind })),
  ),
)("keeps $table $kind evidence unavailable", async ({ table, kind }) => {
  io.fault = { table, kind };
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.error).not.toContain("PRIVATE_DATABASE_DETAIL");
});
import { notifyManualSensorCorrectionConfirmed } from "@/lib/manualSensorCorrectionEvents";
it("retries a failed read without exposing cached report evidence", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  io.error = new Error("private sensor failure");
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.data).toBeNull();
  expect(result.current.error).not.toContain("private");
  io.error = null;
  io.sensor = [{ ...row(), value: 21 }];
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.data?.sensorReadings[0].value).toBe(21);
});
it("refreshes confirmed corrections only for the current owner", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  io.calls.mockClear();
  act(() => notifyManualSensorCorrectionConfirmed("other-owner", row().tent_id));
  expect(io.calls).not.toHaveBeenCalled();
  io.sensor = [{ ...row(), value: 22 }];
  act(() => notifyManualSensorCorrectionConfirmed(io.owner, row().tent_id));
  await waitFor(() => expect(result.current.data?.sensorReadings[0].value).toBe(22));
});
it("withholds the prior owner's report immediately on an account switch", async () => {
  const { result, rerender } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  io.owner = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  io.sensor = [];
  rerender({ grow: "grow-a", end: "2026-01-02" });
  expect(result.current.data).toBeNull();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.data?.sensorReadings).toEqual([]);
});
it.each(["error", "null", "missing", "empty-url"])(
  "does not export unresolved %s photo evidence",
  async (kind) => {
    io.diary = [{ id: "photo-entry", photo_url: "owner/photo.jpg", entry_at: observed }];
    io.photos = {
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
    expect(result.current.data).toBeNull();
    expect(result.current.error).not.toContain("private");
  },
);
it("preserves signed photo retrieval after a complete storage response", async () => {
  io.diary = [{ id: "photo-entry", photo_url: "owner/photo.jpg", entry_at: observed }];
  io.photos = {
    data: [{ path: "owner/photo.jpg", signedUrl: "https://signed.example/photo.jpg" }],
    error: null,
  };
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.data?.diaryEntries[0].photo_url).toBe("https://signed.example/photo.jpg");
});
