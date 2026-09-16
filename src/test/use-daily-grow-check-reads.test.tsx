import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  diary: {} as Record<string, unknown>,
  sensors: {} as Record<string, unknown>,
  plants: {} as Record<string, unknown>,
  sensorScope: vi.fn(),
}));

vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => H.diary }));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: (scope: unknown) => {
    H.sensorScope(scope);
    return H.sensors;
  },
}));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => H.plants }));

import { useDailyGrowCheckReads } from "@/hooks/useDailyGrowCheckReads";

const tentId = "22222222-2222-4222-8222-222222222222";

function successful(data: unknown[] = []) {
  return {
    data,
    status: "success",
    isPending: false,
    isLoading: false,
    isError: false,
    isFetching: false,
    fetchStatus: "idle",
    refetch: vi.fn().mockResolvedValue({}),
  };
}

function createWrapper(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  H.diary = successful();
  H.sensors = successful();
  H.plants = successful();
  H.sensorScope.mockClear();
});

describe("useDailyGrowCheckReads", () => {
  it("returns ready when every required assigned-tent read resolves to an array", () => {
    const { result } = renderHook(() => useDailyGrowCheckReads(tentId), {
      wrapper: createWrapper(),
    });

    expect(result.current.state).toBe("ready");
    expect(result.current.rawDiary).toEqual([]);
    expect(result.current.rawReadings).toEqual([]);
    expect(result.current.plants).toEqual([]);
    expect(H.sensorScope).toHaveBeenLastCalledWith(tentId);
  });

  it("prefers error over loading when one required read fails", () => {
    H.diary = successful();
    H.sensors = { ...successful(), data: undefined, isError: true, status: "error" };
    H.plants = {
      ...successful(),
      data: undefined,
      isPending: true,
      isLoading: true,
      fetchStatus: "fetching",
    };

    const { result } = renderHook(() => useDailyGrowCheckReads(tentId), {
      wrapper: createWrapper(),
    });

    expect(result.current.state).toBe("error");
  });

  it("treats a settled non-array payload as failed even without isError", () => {
    H.sensors = {
      ...successful(),
      data: undefined,
      status: "success",
      isError: false,
    };

    const { result } = renderHook(() => useDailyGrowCheckReads(tentId), {
      wrapper: createWrapper(),
    });

    expect(result.current.state).toBe("error");
  });

  it("treats a settled null payload as failed even without isError", () => {
    H.plants = {
      ...successful(),
      data: null,
      status: "success",
      isError: false,
    };

    const { result } = renderHook(() => useDailyGrowCheckReads(tentId), {
      wrapper: createWrapper(),
    });

    expect(result.current.state).toBe("error");
  });

  it("keeps the first pending required read in loading state", () => {
    H.diary = {
      ...successful(),
      data: undefined,
      isPending: true,
      isLoading: true,
      fetchStatus: "fetching",
    };

    const { result } = renderHook(() => useDailyGrowCheckReads(tentId), {
      wrapper: createWrapper(),
    });

    expect(result.current.state).toBe("loading");
  });

  it("surfaces paused when any required read is pending with a paused fetch", () => {
    H.sensors = {
      ...successful(),
      data: undefined,
      isPending: true,
      fetchStatus: "paused",
    };

    const { result } = renderHook(() => useDailyGrowCheckReads(tentId), {
      wrapper: createWrapper(),
    });

    expect(result.current.state).toBe("paused");
  });

  it("aggregates isFetching across required reads", () => {
    H.diary = { ...successful(), isFetching: true };

    const { result } = renderHook(() => useDailyGrowCheckReads(tentId), {
      wrapper: createWrapper(),
    });

    expect(result.current.isFetching).toBe(true);
  });

  it("requires only diary reads for an unassigned plant", () => {
    H.diary = successful([{ id: "note-a" }]);
    H.sensors = { ...successful(), data: undefined, isError: true, status: "error" };
    H.plants = {
      ...successful(),
      data: undefined,
      isPending: true,
      fetchStatus: "fetching",
    };

    const { result } = renderHook(() => useDailyGrowCheckReads(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.state).toBe("ready");
    expect(result.current.rawDiary).toEqual([{ id: "note-a" }]);
    expect(result.current.rawReadings).toEqual([]);
    expect(result.current.plants).toEqual([]);
    expect(H.sensorScope).toHaveBeenLastCalledWith(null);
  });

  it("retries every required read for an assigned plant", async () => {
    const { result } = renderHook(() => useDailyGrowCheckReads(tentId), {
      wrapper: createWrapper(),
    });

    await result.current.retry();

    expect(H.diary.refetch).toHaveBeenCalledTimes(1);
    expect(H.sensors.refetch).toHaveBeenCalledTimes(1);
    expect(H.plants.refetch).toHaveBeenCalledTimes(1);
  });

  it("retries only diary for an unassigned plant", async () => {
    H.diary = { ...successful(), data: undefined, isError: true, status: "error" };

    const { result } = renderHook(() => useDailyGrowCheckReads(null), {
      wrapper: createWrapper(),
    });

    await result.current.retry();

    expect(H.diary.refetch).toHaveBeenCalledTimes(1);
    expect(H.sensors.refetch).not.toHaveBeenCalled();
    expect(H.plants.refetch).not.toHaveBeenCalled();
  });
});
