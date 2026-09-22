/**
 * useInsertSensorReadings — behavioral regression pins.
 *
 * validateSensorReadingBatch and confirmManualSnapshotConflict are tested
 * elsewhere. This file drives the hook's mutationFn + onSuccess wiring so a
 * stubbed growRepo or a swallowed 23505 cannot leave query caches stale or
 * skip the Daily Check cross-tab event.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InsertSensorReadingPayload } from "@/hooks/useInsertSensorReading";

const mocks = vi.hoisted(() => ({
  insertBatch: vi.fn(),
  confirmConflict: vi.fn(),
}));

vi.mock("@/lib/growRepo", () => ({
  insertSensorReadingsBatch: (...args: unknown[]) => mocks.insertBatch(...args),
}));

vi.mock("@/lib/manualSensorSnapshotRecovery", () => ({
  confirmManualSnapshotConflict: (...args: unknown[]) => mocks.confirmConflict(...args),
}));

import { useInsertSensorReadings } from "@/hooks/useInsertSensorReadings";

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const CAPTURED = "2026-09-16T08:00:00.000Z";

function manualRow(
  overrides: Partial<InsertSensorReadingPayload> = {},
): InsertSensorReadingPayload {
  return {
    tent_id: TENT_A,
    metric: "temperature_c",
    value: 22.5,
    source: "manual",
    ts: CAPTURED,
    captured_at: CAPTURED,
    ...overrides,
  };
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useInsertSensorReadings hook wiring", () => {
  let client: QueryClient;
  const invalidatedKeys: unknown[][] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    invalidatedKeys.length = 0;
    mocks.insertBatch.mockResolvedValue(undefined);
    mocks.confirmConflict.mockResolvedValue(false);
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.spyOn(client, "invalidateQueries").mockImplementation(async (filters) => {
      invalidatedKeys.push([filters?.queryKey]);
      return Promise.resolve(undefined);
    });
  });

  it("invalidates all sensor query families after a successful batch insert", async () => {
    const rows = [manualRow(), manualRow({ metric: "humidity_pct", value: 55 })];
    const { result } = renderHook(() => useInsertSensorReadings(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync(rows);
    });

    expect(mocks.insertBatch).toHaveBeenCalledWith(rows);
    expect(invalidatedKeys).toEqual([
      [["grow", "sensors"]],
      [["sensor_readings"]],
      [["latest-sensor-snapshot"]],
      [["plant-tent-environment"]],
      [["environment-trends"]],
    ]);
  });

  it("swallows a confirmed 23505 duplicate snapshot without rethrowing", async () => {
    const rows = [manualRow(), manualRow({ metric: "humidity_pct", value: 55 })];
    const duplicateError = { code: "23505", message: "duplicate key" };
    mocks.insertBatch.mockRejectedValueOnce(duplicateError);
    mocks.confirmConflict.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useInsertSensorReadings(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await expect(result.current.mutateAsync(rows)).resolves.toBeUndefined();
    });

    expect(mocks.confirmConflict).toHaveBeenCalledWith(rows, duplicateError);
    expect(invalidatedKeys).toHaveLength(5);
  });

  it("rethrows when duplicate conflict recovery is not confirmed", async () => {
    const rows = [manualRow()];
    const duplicateError = { code: "23505", message: "duplicate key" };
    mocks.insertBatch.mockRejectedValueOnce(duplicateError);
    mocks.confirmConflict.mockResolvedValueOnce(false);

    const { result } = renderHook(() => useInsertSensorReadings(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await expect(result.current.mutateAsync(rows)).rejects.toEqual(duplicateError);
    });

    expect(invalidatedKeys).toHaveLength(0);
  });

  it("rejects invalid batches before calling growRepo", async () => {
    const { result } = renderHook(() => useInsertSensorReadings(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync([manualRow({ metric: "not_a_metric" as "temperature_c" })]),
      ).rejects.toThrow(/invalid metric/);
    });

    expect(mocks.insertBatch).not.toHaveBeenCalled();
    expect(invalidatedKeys).toHaveLength(0);
  });

  it("dispatches verdant:sensor-reading-created for a single-tent manual snapshot", async () => {
    const rows = [manualRow(), manualRow({ metric: "humidity_pct", value: 55 })];
    const events: CustomEvent<{ createdAt: string; tentId: string }>[] = [];
    const listener = (event: Event) => {
      events.push(event as CustomEvent<{ createdAt: string; tentId: string }>);
    };
    window.addEventListener("verdant:sensor-reading-created", listener);

    const { result } = renderHook(() => useInsertSensorReadings(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync(rows);
    });

    window.removeEventListener("verdant:sensor-reading-created", listener);
    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toEqual({ createdAt: CAPTURED, tentId: TENT_A });
  });

  it("does not dispatch the cross-tab event for multi-tent manual batches", async () => {
    const rows = [manualRow(), manualRow({ tent_id: TENT_B, metric: "humidity_pct", value: 55 })];
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener("verdant:sensor-reading-created", listener);

    const { result } = renderHook(() => useInsertSensorReadings(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync(rows);
    });

    window.removeEventListener("verdant:sensor-reading-created", listener);
    expect(events).toHaveLength(0);
  });

  it("does not dispatch the cross-tab event for non-manual source batches", async () => {
    const rows = [manualRow({ source: "pi_bridge" })];
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener("verdant:sensor-reading-created", listener);

    const { result } = renderHook(() => useInsertSensorReadings(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync(rows);
    });

    window.removeEventListener("verdant:sensor-reading-created", listener);
    expect(events).toHaveLength(0);
  });

  it("uses captured_at for the event timestamp when ts is absent", async () => {
    const rows = [manualRow({ ts: undefined })];
    const events: CustomEvent<{ createdAt: string; tentId: string }>[] = [];
    const listener = (event: Event) => {
      events.push(event as CustomEvent<{ createdAt: string; tentId: string }>);
    };
    window.addEventListener("verdant:sensor-reading-created", listener);

    const { result } = renderHook(() => useInsertSensorReadings(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync(rows);
    });

    await waitFor(() => expect(events).toHaveLength(1));
    window.removeEventListener("verdant:sensor-reading-created", listener);
    expect(events[0]?.detail.createdAt).toBe(CAPTURED);
  });
});
