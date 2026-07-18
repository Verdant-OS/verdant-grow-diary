import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/growRepo", () => ({
  fetchTents: vi.fn(),
  fetchTent: vi.fn(),
  fetchPlants: vi.fn(),
  fetchPlant: vi.fn(),
  fetchSensorReadings: vi.fn(),
}));

import * as repo from "@/lib/growRepo";
import { tents, plants, sensorReadings } from "@/mock";
import {
  useGrowTents,
  useGrowTent,
  useGrowPlants,
  useGrowPlant,
  useGrowSensorReadings,
  __growDataFallbacks,
} from "./useGrowData";

function wrapper(retry: boolean | number = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  __growDataFallbacks.count = 0;
  __growDataFallbacks.lastReason = "";
});

describe("useGrowTents", () => {
  it("returns real Supabase rows on the happy path", async () => {
    const live = [{ ...tents[0], id: "live-1", name: "Live" }];
    vi.mocked(repo.fetchTents).mockResolvedValue(live);
    const { result } = renderHook(() => useGrowTents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(live);
    expect(__growDataFallbacks.count).toBe(0);
  });

  it("returns an honest empty list when Supabase has no tent rows", async () => {
    vi.mocked(repo.fetchTents).mockResolvedValue([]);
    const { result } = renderHook(() => useGrowTents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(result.current.data).not.toEqual(tents);
    expect(__growDataFallbacks.lastReason).toBe("tents:empty");
  });

  it("preserves a failed Supabase tent read as a query error", async () => {
    const error = new Error("boom");
    vi.mocked(repo.fetchTents).mockRejectedValue(error);
    const { result } = renderHook(() => useGrowTents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBe(error);
    expect(__growDataFallbacks.lastReason).toBe("tents:error");
  });
});

describe("useGrowPlants", () => {
  it("returns real Supabase plant rows", async () => {
    const live = [{ ...plants[0], id: "live-p1", name: "Live plant" }];
    vi.mocked(repo.fetchPlants).mockResolvedValue(live);
    const { result } = renderHook(() => useGrowPlants("tent-live"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(live);
  });

  it("returns an honest empty list when Supabase has no plant rows", async () => {
    vi.mocked(repo.fetchPlants).mockResolvedValue([]);
    const { result } = renderHook(() => useGrowPlants(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(result.current.data).not.toEqual(plants);
  });

  it("preserves a failed Supabase plant read as a query error", async () => {
    const error = new Error("nope");
    vi.mocked(repo.fetchPlants).mockRejectedValue(error);
    const { result } = renderHook(() => useGrowPlants("tent-live"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBe(error);
    expect(__growDataFallbacks.lastReason).toBe("plants:error");
  });
});

describe("useGrowSensorReadings", () => {
  it("preserves a failed sensor read as a retryable query error without automatic retries", async () => {
    const error = new Error("sensor read failed");
    vi.mocked(repo.fetchSensorReadings).mockRejectedValue(error);
    const { result } = renderHook(() => useGrowSensorReadings("t2"), {
      wrapper: wrapper(3),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBe(error);
    expect(repo.fetchSensorReadings).toHaveBeenCalledTimes(1);
  });

  it("returns empty (no mock fallback) when repo returns []", async () => {
    vi.mocked(repo.fetchSensorReadings).mockResolvedValue([]);
    const { result } = renderHook(() => useGrowSensorReadings(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("uses null as explicit no-scope and does not call the repository", async () => {
    const { result } = renderHook(() => useGrowSensorReadings(null), {
      wrapper: wrapper(),
    });
    await Promise.resolve();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(repo.fetchSensorReadings).not.toHaveBeenCalled();
  });

  it("returns live data when repo returns non-empty", async () => {
    const live = [
      {
        ts: "2026-01-01T00:00:00Z",
        tentId: "t1",
        temp: 22,
        rh: 50,
        vpd: 1,
        co2: 800,
        soil: 40,
        source: "live" as const,
        status: "usable" as const,
        capturedAt: "2026-01-01T00:00:00Z",
      },
    ];
    vi.mocked(repo.fetchSensorReadings).mockResolvedValue(live);
    const { result } = renderHook(() => useGrowSensorReadings("t1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(live);
    expect(__growDataFallbacks.count).toBe(0);
  });
});

describe("useGrowTent / useGrowPlant", () => {
  it("useGrowTent returns a real Supabase row", async () => {
    const live = { ...tents[0], id: "live-tent", name: "Live tent" };
    vi.mocked(repo.fetchTent).mockResolvedValue(live);
    const { result } = renderHook(() => useGrowTent("live-tent"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(live);
  });

  it("useGrowTent returns null when the row does not exist", async () => {
    vi.mocked(repo.fetchTent).mockResolvedValue(null);
    const { result } = renderHook(() => useGrowTent("missing-tent"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("useGrowTent preserves a failed read as a query error", async () => {
    const error = new Error("tent read failed");
    vi.mocked(repo.fetchTent).mockRejectedValue(error);
    const { result } = renderHook(() => useGrowTent("real-id"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();
  });

  it("useGrowTent is disabled without id", () => {
    const { result } = renderHook(() => useGrowTent(undefined), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(repo.fetchTent).not.toHaveBeenCalled();
  });

  it("useGrowPlant returns null when the row does not exist", async () => {
    vi.mocked(repo.fetchPlant).mockResolvedValue(null);
    const { result } = renderHook(() => useGrowPlant("does-not-exist"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("useGrowPlant returns supabase row on success", async () => {
    vi.mocked(repo.fetchPlant).mockResolvedValue({ ...plants[0], id: "live-p", name: "Live P" });
    const { result } = renderHook(() => useGrowPlant("live-p"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Live P");
  });

  it("useGrowPlant preserves a failed read as a query error", async () => {
    const error = new Error("plant read failed");
    vi.mocked(repo.fetchPlant).mockRejectedValue(error);
    const { result } = renderHook(() => useGrowPlant("real-plant-id"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();
  });
});
