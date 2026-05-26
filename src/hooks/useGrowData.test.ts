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

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
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
  it("returns supabase rows on happy path", async () => {
    const live = [{ ...tents[0], id: "live-1", name: "Live" }];
    vi.mocked(repo.fetchTents).mockResolvedValue(live);
    const { result } = renderHook(() => useGrowTents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].id).toBe("live-1");
    expect(__growDataFallbacks.count).toBe(0);
  });

  it("falls back to mock on supabase error", async () => {
    vi.mocked(repo.fetchTents).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useGrowTents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(tents);
    expect(result.current.isError).toBe(false);
    expect(__growDataFallbacks.lastReason).toMatch(/tents:error/);
  });

  it("falls back to mock on empty result", async () => {
    vi.mocked(repo.fetchTents).mockResolvedValue([]);
    const { result } = renderHook(() => useGrowTents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(tents);
    expect(__growDataFallbacks.lastReason).toBe("tents:empty");
  });
});

describe("useGrowPlants", () => {
  it("filters mock by tentId on fallback", async () => {
    vi.mocked(repo.fetchPlants).mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useGrowPlants("t1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.every((p) => p.tentId === "t1")).toBe(true);
  });

  it("returns all mock plants when no tentId on fallback", async () => {
    vi.mocked(repo.fetchPlants).mockResolvedValue([]);
    const { result } = renderHook(() => useGrowPlants(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(plants);
  });
});

describe("useGrowSensorReadings", () => {
  it("filters mock by tentId on fallback", async () => {
    vi.mocked(repo.fetchSensorReadings).mockRejectedValue(new Error("x"));
    const { result } = renderHook(() => useGrowSensorReadings("t2"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.length).toBeGreaterThan(0);
    expect(result.current.data?.every((r) => r.tentId === "t2")).toBe(true);
  });

  it("returns live data when repo returns non-empty", async () => {
    const live = [
      { ts: "2026-01-01T00:00:00Z", tentId: "t1", temp: 22, rh: 50, vpd: 1, co2: 800, soil: 40 },
    ];
    vi.mocked(repo.fetchSensorReadings).mockResolvedValue(live);
    const { result } = renderHook(() => useGrowSensorReadings("t1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(live);
    expect(__growDataFallbacks.count).toBe(0);
  });
});

describe("useGrowTent / useGrowPlant", () => {
  it("useGrowTent falls back to mock match on error", async () => {
    vi.mocked(repo.fetchTent).mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useGrowTent("t1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("t1");
  });

  it("useGrowTent is disabled without id", () => {
    const { result } = renderHook(() => useGrowTent(undefined), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(repo.fetchTent).not.toHaveBeenCalled();
  });

  it("useGrowPlant returns null fallback when id not in mock", async () => {
    vi.mocked(repo.fetchPlant).mockRejectedValue(new Error("nope"));
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
});
