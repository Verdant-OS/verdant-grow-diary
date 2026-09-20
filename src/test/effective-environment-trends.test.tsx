import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEnvironmentTrends } from "@/hooks/useEnvironmentTrends";

const io = vi.hoisted(() => ({
  read: vi.fn(),
  owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as string | null,
}));
vi.mock("@/store/auth", () => {
  const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  return { useAuth: () => ({ user: io.owner ? user : null }) };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let tents: string[] = [];
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        order: () => q,
        or: () => q,
        in: (key: string, ids: string[]) => {
          if (key === "tent_id") tents = ids;
          return q;
        },
        limit: (limit: number) => io.read(table, tents, limit),
      };
      return q;
    },
  },
}));
const tentA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tentB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const observed = "2026-01-01T12:00:00.000Z";
const clients: QueryClient[] = [];
function rows(value = 24, tent = tentA) {
  return [
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      user_id: io.owner,
      tent_id: tent,
      value,
      metric: "temperature_c",
      source: "manual",
      quality: "ok",
      ts: observed,
      captured_at: observed,
      created_at: observed,
      device_id: null,
      raw_payload: null,
      correction_valid: true,
      corrected_at: new Date().toISOString(),
    },
  ];
}
const ok = (data: unknown) => ({ data, error: null });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const hook = renderHook(({ tent }) => useEnvironmentTrends("grow-a", [tent]), {
    initialProps: { tent: tentA },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, client };
}
beforeEach(() => {
  onlineManager.setOnline(true);
  io.owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  io.read
    .mockReset()
    .mockImplementation((table) => Promise.resolve(ok(table === "diary_entries" ? [] : rows())));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  onlineManager.setOnline(true);
});
describe("effective Environment Trends", () => {
  it("uses corrected manual values without promoting their observation time", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.trends.temp.avg).toBe(24);
    expect(result.current.trends).toMatchObject({ latestTs: observed, source: "manual" });
    expect(io.read.mock.calls[0]).toEqual(["sensor_readings_effective", [tentA], 500]);
  });
  it("refetches mounted trends after the existing correction invalidation", async () => {
    const { result, client } = mount();
    await waitFor(() => expect(result.current.trends.temp.avg).toBe(24));
    io.read.mockResolvedValue(ok(rows(23)));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["environment-trends"] });
    });
    await waitFor(() => expect(result.current.trends.temp.avg).toBe(23));
  });
  it("cannot replace the selected tent with a late response from the previous tent", async () => {
    let resolveOld!: (value: unknown) => void;
    io.read.mockImplementation((_table, tents) =>
      tents[0] === tentA
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve(ok(rows(29, tentB))),
    );
    const { result, rerender } = mount();
    await waitFor(() => expect(io.read).toHaveBeenCalled());
    rerender({ tent: tentB });
    await waitFor(() => expect(result.current.trends.temp.avg).toBe(29));
    await act(async () => {
      resolveOld(ok(rows(24)));
    });
    expect(result.current.trends.temp.avg).toBe(29);
  });
  it("cannot display a pending owner's result after sign-out", async () => {
    const previousOwnerRows = rows();
    let resolveOld!: (value: unknown) => void;
    io.read.mockReturnValue(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const { result, rerender } = mount();
    await waitFor(() => expect(io.read).toHaveBeenCalled());
    io.owner = null;
    rerender({ tent: tentA });
    await act(async () => {
      resolveOld(ok(previousOwnerRows));
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.trends.count).toBe(0);
  });
  it("keeps a paused first read unresolved", () => {
    onlineManager.setOnline(false);
    const { result } = mount();
    expect(result.current.status).toBe("loading");
    expect(io.read).not.toHaveBeenCalled();
  });
  it("uses the effective historical fallback when the current window is empty", async () => {
    io.read.mockImplementation((_table, _tents, limit) =>
      Promise.resolve(ok(limit === 500 ? [] : rows())),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.trends.temp.avg).toBe(24));
    expect(io.read.mock.calls).toEqual([
      ["sensor_readings_effective", [tentA], 500],
      ["sensor_readings_effective", [tentA], 60],
    ]);
  });
  it.each(["invalid", "failed", "null"])(
    "does not call a %s sensor read plus empty diary successful-empty",
    async (mode) => {
      io.read.mockImplementation((table) =>
        Promise.resolve(
          table === "diary_entries"
            ? ok([])
            : mode === "failed"
              ? { data: null, error: new Error("private") }
              : ok(
                  mode === "null" ? null : [{ ...rows()[0], value: null, correction_valid: false }],
                ),
        ),
      );
      const { result } = mount();
      await waitFor(() => expect(result.current.status).toBe("unavailable"));
      expect(result.current.trends.count).toBe(0);
    },
  );
  it("accepts scoped diary evidence after a sensor failure", async () => {
    io.read.mockImplementation((table) =>
      Promise.resolve(
        table === "diary_entries"
          ? ok([{ tent_id: tentA, entry_at: observed, details: { sensor_snapshot: { temp: 22 } } }])
          : { data: null, error: new Error("unavailable") },
      ),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.trends.temp.avg).toBe(22));
    expect(result.current.status).toBe("ok");
  });
  it("keeps successful empty reads empty", async () => {
    io.read.mockResolvedValue(ok([]));
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.trends.count).toBe(0);
  });
  it("withholds a cached trend while correction refresh is paused, then reconnects", async () => {
    const { result, client } = mount();
    await waitFor(() => expect(result.current.trends.temp.avg).toBe(24));
    onlineManager.setOnline(false);
    io.read.mockResolvedValue(ok(rows(23)));
    act(() => {
      void client.invalidateQueries({ queryKey: ["environment-trends"] });
    });
    await waitFor(() => expect(result.current.status).toBe("loading"));
    expect(result.current.trends.count).toBe(0);
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.trends.temp.avg).toBe(23));
  });
  it("withholds a cached trend while an online background refetch is in flight", async () => {
    let resolveRefresh!: (value: unknown) => void;
    const { result, client } = mount();
    await waitFor(() => expect(result.current.trends.temp.avg).toBe(24));
    io.read.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    act(() => {
      void client.invalidateQueries({ queryKey: ["environment-trends"] });
    });
    await waitFor(() => expect(result.current.status).toBe("loading"));
    expect(result.current.trends.count).toBe(0);
    await act(async () => {
      resolveRefresh(ok(rows(23)));
    });
    await waitFor(() => expect(result.current.trends.temp.avg).toBe(23));
  });
  it.each([null, tentB])("rejects a diary survivor from scope %s", async (scope) => {
    io.read.mockImplementation((table) =>
      Promise.resolve(
        table === "diary_entries"
          ? ok([{ tent_id: scope, entry_at: observed, details: { sensor_snapshot: { temp: 22 } } }])
          : { data: null, error: new Error("unavailable") },
      ),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.trends.count).toBe(0);
  });
  it("reports failed historical fallback as unavailable rather than empty", async () => {
    io.read.mockImplementation((table, _tents, limit) =>
      Promise.resolve(
        table === "diary_entries" || limit === 500
          ? ok([])
          : { data: null, error: new Error("unavailable") },
      ),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });
});
