import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growRepo", () => ({
  insertSensorReadingsBatch: vi.fn(),
}));

vi.mock("@/lib/manualSensorSnapshotRecovery", () => ({
  confirmManualSnapshotConflict: vi.fn(),
}));

import * as repo from "@/lib/growRepo";
import { confirmManualSnapshotConflict } from "@/lib/manualSensorSnapshotRecovery";
import type { InsertSensorReadingPayload } from "./useInsertSensorReading";
import { useInsertSensorReadings } from "./useInsertSensorReadings";

const TENT_ID = "11111111-1111-4111-8111-111111111111";
const CAPTURED_AT = "2026-07-27T01:00:00.000Z";

const MANUAL_ROWS: InsertSensorReadingPayload[] = [
  {
    tent_id: TENT_ID,
    metric: "temperature_c",
    value: 24,
    source: "manual",
    ts: CAPTURED_AT,
    captured_at: CAPTURED_AT,
  },
  {
    tent_id: TENT_ID,
    metric: "humidity_pct",
    value: 55,
    source: "manual",
    ts: CAPTURED_AT,
    captured_at: CAPTURED_AT,
  },
];

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { invalidateSpy, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.insertSensorReadingsBatch).mockResolvedValue(undefined);
  vi.mocked(confirmManualSnapshotConflict).mockResolvedValue(false);
});

describe("useInsertSensorReadings", () => {
  it("commits one manual snapshot batch, invalidates every consumer, and emits one refresh event", async () => {
    const { invalidateSpy, wrapper } = makeWrapper();
    const createdEvents: Event[] = [];
    const onCreated = (event: Event) => createdEvents.push(event);
    window.addEventListener("verdant:sensor-reading-created", onCreated);

    try {
      const { result } = renderHook(() => useInsertSensorReadings(), { wrapper });
      result.current.mutate(MANUAL_ROWS);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(repo.insertSensorReadingsBatch).toHaveBeenCalledTimes(1);
      expect(repo.insertSensorReadingsBatch).toHaveBeenCalledWith(MANUAL_ROWS);
      expect(
        invalidateSpy.mock.calls.map(
          ([options]) => (options as { queryKey: readonly unknown[] }).queryKey,
        ),
      ).toEqual([
        ["grow", "sensors"],
        ["sensor_readings"],
        ["latest-sensor-snapshot"],
        ["plant-tent-environment"],
        ["environment-trends"],
      ]);
      expect(createdEvents).toHaveLength(1);
      expect(
        (
          createdEvents[0] as CustomEvent<{
            createdAt: string;
            tentId: string;
          }>
        ).detail,
      ).toEqual({
        createdAt: CAPTURED_AT,
        tentId: TENT_ID,
      });
    } finally {
      window.removeEventListener("verdant:sensor-reading-created", onCreated);
    }
  });

  it("treats a confirmed duplicate-key conflict as success without rethrowing", async () => {
    const duplicateError = Object.assign(new Error("duplicate key"), { code: "23505" });
    vi.mocked(repo.insertSensorReadingsBatch).mockRejectedValue(duplicateError);
    vi.mocked(confirmManualSnapshotConflict).mockResolvedValue(true);

    const { invalidateSpy, wrapper } = makeWrapper();
    const createdEvents: Event[] = [];
    const onCreated = (event: Event) => createdEvents.push(event);
    window.addEventListener("verdant:sensor-reading-created", onCreated);

    try {
      const { result } = renderHook(() => useInsertSensorReadings(), { wrapper });
      result.current.mutate(MANUAL_ROWS);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(confirmManualSnapshotConflict).toHaveBeenCalledWith(MANUAL_ROWS, duplicateError);
      expect(
        invalidateSpy.mock.calls.map(
          ([options]) => (options as { queryKey: readonly unknown[] }).queryKey,
        ),
      ).toEqual([
        ["grow", "sensors"],
        ["sensor_readings"],
        ["latest-sensor-snapshot"],
        ["plant-tent-environment"],
        ["environment-trends"],
      ]);
      expect(createdEvents).toHaveLength(1);
    } finally {
      window.removeEventListener("verdant:sensor-reading-created", onCreated);
    }
  });

  it("rethrows when duplicate recovery cannot confirm the existing snapshot", async () => {
    const duplicateError = Object.assign(new Error("duplicate key"), { code: "23505" });
    vi.mocked(repo.insertSensorReadingsBatch).mockRejectedValue(duplicateError);
    vi.mocked(confirmManualSnapshotConflict).mockResolvedValue(false);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInsertSensorReadings(), { wrapper });
    result.current.mutate(MANUAL_ROWS);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(duplicateError);
  });

  it("rethrows when conflict recovery declines a non-duplicate insert failure", async () => {
    const deniedError = Object.assign(new Error("permission denied"), { code: "42501" });
    vi.mocked(repo.insertSensorReadingsBatch).mockRejectedValue(deniedError);
    vi.mocked(confirmManualSnapshotConflict).mockResolvedValue(false);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInsertSensorReadings(), { wrapper });
    result.current.mutate(MANUAL_ROWS);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(confirmManualSnapshotConflict).toHaveBeenCalledWith(MANUAL_ROWS, deniedError);
    expect(result.current.error).toBe(deniedError);
  });
});
