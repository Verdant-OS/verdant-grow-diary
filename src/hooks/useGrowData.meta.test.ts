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
import { tents } from "@/mock";
import {
  useGrowTents,
  useGrowPlants,
  useGrowSensorReadings,
  getGrowDataMeta,
  combineGrowDataMeta,
  DEFAULT_GROW_DATA_META,
  __resetGrowDataMeta,
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
  __resetGrowDataMeta();
});

describe("useGrowData source metadata", () => {
  it("marks real supabase rows as supabase / not demo", async () => {
    (repo.fetchTents as any).mockResolvedValue([
      { ...tents[0], id: "live-1", name: "Live" },
    ]);
    const { result } = renderHook(() => useGrowTents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const meta = getGrowDataMeta(["grow", "tents", "all"]);
    expect(meta.dataSource).toBe("supabase");
    expect(meta.isDemoData).toBe(false);
    expect(meta.sourceReason).toBe("live:rows");
  });

  it("marks empty supabase + mock fallback as mock / demo", async () => {
    (repo.fetchTents as any).mockResolvedValue([]);
    const { result } = renderHook(() => useGrowTents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const meta = getGrowDataMeta(["grow", "tents", "all"]);
    expect(meta.dataSource).toBe("mock");
    expect(meta.isDemoData).toBe(true);
    expect(meta.sourceReason).toBe("fallback:empty");
  });

  it("marks supabase error + mock fallback as mock / demo with error reason", async () => {
    (repo.fetchPlants as any).mockRejectedValue(
      new Error("secret token leaked details"),
    );
    const { result } = renderHook(() => useGrowPlants("t1"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const meta = getGrowDataMeta(["grow", "plants", "t1", "all"]);
    expect(meta.dataSource).toBe("mock");
    expect(meta.isDemoData).toBe(true);
    expect(meta.sourceReason).toBe("fallback:error");
    // Must NOT leak raw error message.
    expect(meta.sourceReason).not.toMatch(/secret|leaked|token/i);
  });

  it("marks unknown tentId with no mock match as unavailable", async () => {
    (repo.fetchSensorReadings as any).mockResolvedValue([]);
    const { result } = renderHook(
      () => useGrowSensorReadings("nope-no-such-tent"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const meta = getGrowDataMeta(["grow", "sensors", "nope-no-such-tent"]);
    expect(meta.dataSource).toBe("unavailable");
    expect(meta.isDemoData).toBe(false);
  });

  it("metadata is deterministic for the same outcome", async () => {
    (repo.fetchTents as any).mockResolvedValue([]);
    const a = renderHook(() => useGrowTents("g1"), { wrapper: wrapper() });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    const m1 = getGrowDataMeta(["grow", "tents", "g1"]);
    __resetGrowDataMeta();
    (repo.fetchTents as any).mockResolvedValue([]);
    const b = renderHook(() => useGrowTents("g1"), { wrapper: wrapper() });
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
    const m2 = getGrowDataMeta(["grow", "tents", "g1"]);
    expect(m1).toEqual(m2);
  });

  it("getGrowDataMeta returns a safe default for unknown keys", () => {
    expect(getGrowDataMeta(["grow", "tents", "never-set"])).toEqual(
      DEFAULT_GROW_DATA_META,
    );
  });
});

describe("combineGrowDataMeta", () => {
  it("returns default for empty input", () => {
    expect(combineGrowDataMeta([])).toEqual(DEFAULT_GROW_DATA_META);
  });

  it("returns the only meta when all sections agree", () => {
    const one = {
      isDemoData: false,
      dataSource: "supabase" as const,
      sourceReason: "live:rows",
    };
    expect(combineGrowDataMeta([one, { ...one }])).toEqual(one);
  });

  it("marks mixed when supabase and mock are both present", () => {
    const out = combineGrowDataMeta([
      { isDemoData: false, dataSource: "supabase", sourceReason: "live:rows" },
      { isDemoData: true, dataSource: "mock", sourceReason: "fallback:empty" },
    ]);
    expect(out.dataSource).toBe("mixed");
    expect(out.isDemoData).toBe(true);
  });

  it("never labels combined mock data as live/supabase", () => {
    const out = combineGrowDataMeta([
      { isDemoData: true, dataSource: "mock", sourceReason: "fallback:empty" },
      { isDemoData: true, dataSource: "mock", sourceReason: "fallback:error" },
    ]);
    expect(out.dataSource).not.toBe("supabase");
    expect(out.dataSource).toBe("mock");
    expect(out.isDemoData).toBe(true);
  });

  it("is deterministic", () => {
    const input = [
      { isDemoData: false, dataSource: "supabase" as const, sourceReason: "live:rows" },
      { isDemoData: true, dataSource: "mock" as const, sourceReason: "fallback:empty" },
    ];
    expect(combineGrowDataMeta(input)).toEqual(combineGrowDataMeta(input));
  });
});
