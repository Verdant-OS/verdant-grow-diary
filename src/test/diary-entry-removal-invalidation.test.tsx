/**
 * useRemoveDiaryEntry — query invalidation behavior tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { deleteEq, deleteFn, toastSuccess, toastError } = vi.hoisted(() => {
  const deleteEq = vi.fn(() => Promise.resolve({ error: null }));
  const deleteFn = vi.fn(() => ({ eq: deleteEq }));
  return {
    deleteEq,
    deleteFn,
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(() => ({ delete: deleteFn })) },
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { useRemoveDiaryEntry } from "@/hooks/useRemoveDiaryEntry";

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  deleteEq.mockReset();
  deleteEq.mockImplementation(() => Promise.resolve({ error: null }));
  deleteFn.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("useRemoveDiaryEntry — query invalidation", () => {
  it("invalidates diary, plant recent activity, tent roster, and timeline caches on success", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRemoveDiaryEntry(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      const ok = await result.current.remove({
        id: "e1",
        isPhotoLog: false,
        plantId: "p1",
        tentId: "t1",
        growId: "g1",
      });
      expect(ok).toBe(true);
    });

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["diary_entries"]));
    expect(keys).toContain(JSON.stringify(["plant_recent_activity", "p1"]));
    expect(keys).toContain(JSON.stringify(["tent_plant_roster_activity", "p1"]));
    expect(keys).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
    expect(keys).toContain(JSON.stringify(["manual_snapshot_timeline_cards"]));
    expect(keys).toContain(JSON.stringify(["timeline_memory"]));
  });

  it("photo removal also invalidates Plant Detail recent activity (photo signal)", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRemoveDiaryEntry(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.remove({
        id: "e2",
        isPhotoLog: true,
        plantId: "p2",
      });
    });

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["plant_recent_activity", "p2"]));
    expect(toastSuccess).toHaveBeenCalledWith("Photo log removed.");
  });

  it("scopes invalidation to the source plant id and not unrelated plants", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRemoveDiaryEntry(), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.remove({
        id: "e3",
        isPhotoLog: false,
        plantId: "plant-A",
      });
    });
    const joined = spy.mock.calls
      .map((c) => JSON.stringify(c[0]?.queryKey))
      .join("|");
    expect(joined).toContain("plant-A");
    expect(joined).not.toContain("plant-B");
  });

  it("does NOT invalidate when the delete fails", async () => {
    deleteEq.mockImplementationOnce(() =>
      Promise.resolve({ error: { code: "42501", message: "denied" } }),
    );
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRemoveDiaryEntry(), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      const ok = await result.current.remove({
        id: "e4",
        isPhotoLog: false,
        plantId: "p1",
      });
      expect(ok).toBe(false);
    });
    expect(spy).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("does NOT invalidate when the delete throws", async () => {
    deleteEq.mockImplementationOnce(() => Promise.reject(new Error("network")));
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRemoveDiaryEntry(), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.remove({ id: "e5", isPhotoLog: false });
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("still calls onRemoved after invalidation on success", async () => {
    const client = new QueryClient();
    const onRemoved = vi.fn();
    const { result } = renderHook(() => useRemoveDiaryEntry(onRemoved), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.remove({ id: "e6", isPhotoLog: false, plantId: "p1" });
    });
    expect(onRemoved).toHaveBeenCalledWith("e6");
  });
});
