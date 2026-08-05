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
  it("marks real Supabase rows as Supabase / not demo", async () => {
    vi.mocked(repo.fetchTents).mockResolvedValue([{ ...tents[0], id: "live-1", name: "Live" }]);
    const { result } = renderHook(() => useGrowTents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const meta = getGrowDataMeta(["grow", "tents", "all"]);
    expect(meta.dataSource).toBe("supabase");
    expect(meta.isDemoData).toBe(false);
    expect(meta.sourceReason).toBe("supabase:rows");
  });

  it("marks an empty Supabase tent result unavailable without demo substitution", async () => {
    vi.mocked(repo.fetchTents).mockResolvedValue([]);
    const { result } = renderHook(() => useGrowTents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const meta = getGrowDataMeta(["grow", "tents", "all"]);
    expect(result.current.data).toEqual([]);
    expect(meta.dataSource).toBe("unavailable");
    expect(meta.isDemoData).toBe(false);
    expect(meta.sourceReason).toBe("no-rows");
  });

  it("marks a failed Supabase plant result unavailable and does not leak the error", async () => {
    vi.mocked(repo.fetchPlants).mockRejectedValue(new Error("secret token leaked details"));
    const { result } = renderHook(() => useGrowPlants("t1"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const meta = getGrowDataMeta(["grow", "plants", "t1", "all"]);
    expect(result.current.data).toBeUndefined();
    expect(meta.dataSource).toBe("unavailable");
    expect(meta.isDemoData).toBe(false);
    expect(meta.sourceReason).toBe("fetch-error");
    // Must NOT leak raw error message.
    expect(meta.sourceReason).not.toMatch(/secret|leaked|token/i);
  });

  it("marks unknown tentId with no mock match as unavailable", async () => {
    vi.mocked(repo.fetchSensorReadings).mockResolvedValue([]);
    const { result } = renderHook(() => useGrowSensorReadings("nope-no-such-tent"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const meta = getGrowDataMeta(["grow", "sensors", "nope-no-such-tent"]);
    expect(meta.dataSource).toBe("unavailable");
    expect(meta.isDemoData).toBe(false);
  });

  it("metadata is deterministic for the same outcome", async () => {
    vi.mocked(repo.fetchTents).mockResolvedValue([]);
    const a = renderHook(() => useGrowTents("g1"), { wrapper: wrapper() });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    const m1 = getGrowDataMeta(["grow", "tents", "g1"]);
    __resetGrowDataMeta();
    vi.mocked(repo.fetchTents).mockResolvedValue([]);
    const b = renderHook(() => useGrowTents("g1"), { wrapper: wrapper() });
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
    const m2 = getGrowDataMeta(["grow", "tents", "g1"]);
    expect(m1).toEqual(m2);
    expect(m1).toEqual({
      isDemoData: false,
      dataSource: "unavailable",
      sourceReason: "no-rows",
    });
  });

  it("getGrowDataMeta returns a safe default for unknown keys", () => {
    expect(getGrowDataMeta(["grow", "tents", "never-set"])).toEqual(DEFAULT_GROW_DATA_META);
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
      sourceReason: "supabase:rows",
    };
    expect(combineGrowDataMeta([one, { ...one }])).toEqual(one);
  });

  it("marks mixed when supabase and mock are both present", () => {
    const out = combineGrowDataMeta([
      { isDemoData: false, dataSource: "supabase", sourceReason: "supabase:rows" },
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
      {
        isDemoData: false,
        dataSource: "supabase" as const,
        sourceReason: "supabase:rows",
      },
      { isDemoData: true, dataSource: "mock" as const, sourceReason: "fallback:empty" },
    ];
    expect(combineGrowDataMeta(input)).toEqual(combineGrowDataMeta(input));
  });

  // REGRESSION: a plant created via the real Create Plant flow, with no
  // tent assigned yet, showed a "Demo / sample data — not live tent data"
  // badge on its own Plant Detail page — despite every field on the page
  // correctly reading "No tent assigned" / "NO READING" (an honest empty
  // state, not fabricated content).
  //
  // Root cause: PlantDetail.tsx combines [plantMeta, tentMeta]. plantMeta is
  // real ("supabase"); tentMeta defaults to "unavailable" because
  // plant?.tentId is null, so no tent query ever runs. The fallback branch
  // used to return `dataSource: hasReal ? "mixed" : "unavailable"` for ANY
  // two-distinct-source combination — so {supabase, unavailable} (no mock
  // anywhere) became "mixed", contradicting this function's own comment
  // ("any combination involving unavailable is treated as unavailable-
  // degraded"). plantDetailDataSourceView.ts then treats every "mixed"
  // record source as "Demo", so a plain "no tent yet" state was mislabeled
  // as simulated data.
  it("REGRESSION: real + unavailable (no mock) stays real, never mixed/demo", () => {
    const real = {
      isDemoData: false,
      dataSource: "supabase" as const,
      sourceReason: "supabase:rows",
    };
    const unavailable = {
      isDemoData: false,
      dataSource: "unavailable" as const,
      sourceReason: "no-data",
    };

    const combined = combineGrowDataMeta([real, unavailable]);
    expect(combined.dataSource).toBe("supabase");
    expect(combined.isDemoData).toBe(false);

    // Order must not matter — the bug reproduced with metas in exactly this
    // sequence in PlantDetail.tsx (plantMeta first, tentMeta second).
    expect(combineGrowDataMeta([unavailable, real]).dataSource).toBe("supabase");
  });

  it("still marks mixed/demo when real, mock, AND unavailable are all present", () => {
    // mock's presence must still win the demo disclosure even alongside an
    // unavailable section — a partially-loaded demo scenario is still demo.
    const out = combineGrowDataMeta([
      { isDemoData: false, dataSource: "supabase", sourceReason: "supabase:rows" },
      { isDemoData: true, dataSource: "mock", sourceReason: "fallback:empty" },
      { isDemoData: false, dataSource: "unavailable", sourceReason: "no-data" },
    ]);
    expect(out.dataSource).toBe("mixed");
    expect(out.isDemoData).toBe(true);
  });

  it("preserves nested mixed live/manual provenance when combined with Supabase", () => {
    const live = {
      isDemoData: false,
      dataSource: "supabase" as const,
      sourceReason: "supabase:rows",
    };
    const liveAndManual = {
      isDemoData: false,
      dataSource: "mixed" as const,
      sourceReason: "mixed:live-and-manual",
    };

    expect(combineGrowDataMeta([live, liveAndManual])).toEqual({
      isDemoData: false,
      dataSource: "mixed",
      sourceReason: "mixed:preserved",
    });
  });

  it("never erases explicit demo truth when unavailable and Supabase metas combine", () => {
    const live = {
      isDemoData: false,
      dataSource: "supabase" as const,
      sourceReason: "supabase:rows",
    };
    const demoMarkedUnavailable = {
      isDemoData: true,
      dataSource: "unavailable" as const,
      sourceReason: "demo:unavailable",
    };

    expect(combineGrowDataMeta([live, demoMarkedUnavailable])).toEqual({
      isDemoData: true,
      dataSource: "mixed",
      sourceReason: "mixed:real-and-demo",
    });
  });

  it("keeps pure Supabase metadata real and non-demo", () => {
    const live = {
      isDemoData: false,
      dataSource: "supabase" as const,
      sourceReason: "supabase:rows",
    };

    expect(combineGrowDataMeta([live, { ...live }])).toEqual(live);
  });

  it("is order-invariant for nested mixed and explicit demo provenance", () => {
    const live = {
      isDemoData: false,
      dataSource: "supabase" as const,
      sourceReason: "supabase:rows",
    };
    const liveAndManual = {
      isDemoData: false,
      dataSource: "mixed" as const,
      sourceReason: "mixed:live-and-manual",
    };
    const demoMarkedUnavailable = {
      isDemoData: true,
      dataSource: "unavailable" as const,
      sourceReason: "demo:unavailable",
    };

    expect(combineGrowDataMeta([live, liveAndManual])).toEqual(
      combineGrowDataMeta([liveAndManual, live]),
    );
    expect(combineGrowDataMeta([live, demoMarkedUnavailable])).toEqual(
      combineGrowDataMeta([demoMarkedUnavailable, live]),
    );
  });

  it("reports unavailable when nothing real or mock is present", () => {
    const out = combineGrowDataMeta([
      { isDemoData: false, dataSource: "unavailable", sourceReason: "no-data" },
      { isDemoData: false, dataSource: "unavailable", sourceReason: "fetch-error" },
    ]);
    expect(out.dataSource).toBe("unavailable");
  });
});
