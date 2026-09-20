import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as string | null,
  read: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: mocks.owner ? { id: mocks.owner } : null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: vi.fn(),
  },
}));
import { useLatestTentSensorSnapshot, latestTentSensorSnapshotQueryKey } from "@/lib/sensor";
const tent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function row(value = 24) {
  const observed = new Date(Date.now() - 60_000).toISOString();
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    user_id: mocks.owner,
    tent_id: tent,
    metric: "temperature_c",
    value,
    source: "manual",
    quality: "ok",
    captured_at: observed,
    ts: observed,
    created_at: observed,
    device_id: null,
    raw_payload: null,
    correction_valid: true,
  };
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useLatestTentSensorSnapshot(tent), { wrapper }) };
}
beforeEach(() => {
  mocks.owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  mocks.read.mockReset();
  mocks.from.mockReset();
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: mocks.read,
  };
  mocks.from.mockReturnValue(builder);
  mocks.read.mockResolvedValue({ data: [row()], error: null });
});
afterEach(() => onlineManager.setOnline(true));
it("reads corrected manual values and preserves observation time", async () => {
  const reading = row();
  mocks.read.mockResolvedValue({ data: [reading], error: null });
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(mocks.from).toHaveBeenCalledWith("sensor_readings_effective");
  expect(result.current.snapshot.metrics.temp_f).toBeCloseTo(75.2);
  expect(JSON.stringify(result.current.snapshot)).toContain(reading.captured_at);
  expect(result.current.snapshot.source).toBe("manual");
});
it("does not classify an offline first read as successful empty", () => {
  onlineManager.setOnline(false);
  const { result } = mount();
  expect(result.current.status).toBe("loading");
  expect(mocks.read).not.toHaveBeenCalled();
});
it.each(["null", "invalid"])(
  "reports %s correction evidence as error, not empty or ready",
  async (kind) => {
    mocks.read.mockResolvedValue({
      data: kind === "null" ? null : [{ ...row(), correction_valid: false }],
      error: null,
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("error"), { timeout: 3000 });
    expect(result.current.snapshot.usable).toBe(false);
  },
);
it("isolates a late response from the previous owner", async () => {
  const previous = row(25);
  let resolvePrevious!: (value: { data: ReturnType<typeof row>[]; error: null }) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePrevious = resolve;
      }),
  );
  const { result, rerender } = mount();
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
  mocks.owner = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  mocks.read.mockResolvedValue({ data: [], error: null });
  rerender();
  await waitFor(() => expect(result.current.status).toBe("empty"));
  await act(async () => {
    resolvePrevious({ data: [previous], error: null });
  });
  expect(result.current.status).toBe("empty");
  expect(result.current.snapshot.usable).toBe(false);
});
it("withholds cached values while a correction refresh is paused", async () => {
  const { client, result } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  onlineManager.setOnline(false);
  act(() => {
    void client.invalidateQueries({ queryKey: ["sensor", "latest"] });
  });
  await waitFor(() => expect(result.current.status).toBe("loading"));
  expect(result.current.snapshot.usable).toBe(false);
});
it("clears visible evidence on logout and uses an owner-specific cache", async () => {
  const { client, result, rerender } = mount();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  const oldOwner = mocks.owner;
  mocks.owner = null;
  rerender();
  expect(result.current.status).toBe("idle");
  expect(result.current.snapshot.usable).toBe(false);
  expect(client.getQueryData(latestTentSensorSnapshotQueryKey(tent, oldOwner))).toBeDefined();
});
it("refreshes the mounted strip after its correction cache is invalidated", async () => {
  mocks.read.mockResolvedValue({ data: [row(25)], error: null });
  const { client, result } = mount();
  await waitFor(() => expect(result.current.snapshot.metrics.temp_f).toBe(77));
  mocks.read.mockResolvedValue({ data: [row(24)], error: null });
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["sensor", "latest"] });
  });
  await waitFor(() => expect(result.current.snapshot.metrics.temp_f).toBeCloseTo(75.2));
});
