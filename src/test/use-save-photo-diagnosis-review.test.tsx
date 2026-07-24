import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, insertMock, toastError, toastSuccess } = vi.hoisted(() => {
  const insertMock = vi.fn(() => Promise.resolve({ error: null }));
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  return {
    fromMock,
    insertMock,
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock },
}));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

import { useSavePhotoDiagnosisReview } from "@/hooks/useSavePhotoDiagnosisReview";

const photo = {
  photo_id: "photo-diary-entry-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
};

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe("useSavePhotoDiagnosisReview", () => {
  beforeEach(() => {
    fromMock.mockClear();
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it("inserts exactly one append-only grower review without sending user_id", async () => {
    const client = new QueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(
      () =>
        useSavePhotoDiagnosisReview({
          now: () => new Date("2026-07-17T15:30:00.000Z"),
        }),
      { wrapper: makeWrapper(client) },
    );

    await act(async () => {
      await expect(
        result.current.save({
          photo,
          observation: "Leaf edges look even after the morning check.",
          reviewStatus: "reviewed",
        }),
      ).resolves.toEqual({ ok: true });
    });

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("diary_entries");
    expect(insertMock).toHaveBeenCalledWith({
      grow_id: "grow-1",
      plant_id: "plant-1",
      tent_id: "tent-1",
      note: "Leaf edges look even after the morning check.",
      entry_at: "2026-07-17T15:30:00.000Z",
      details: {
        event_type: "photo_diagnosis_note",
        details_version: 1,
        photo_id: "photo-diary-entry-1",
        review_status: "reviewed",
        observation: "Leaf edges look even after the morning check.",
        recorded_by: "grower",
        recorded_at: "2026-07-17T15:30:00.000Z",
        append_only: true,
      },
    });
    const payload = (insertMock.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload) return;
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).not.toHaveProperty("photo_url");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["diary_entries"] });
    expect(toastSuccess).toHaveBeenCalledWith("Grower review saved to plant memory.");
  });

  it("fails closed before any write when the observation is blank", async () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useSavePhotoDiagnosisReview(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.save({
          photo,
          observation: "   ",
          reviewStatus: "needs_follow_up",
          recordedAt: "2026-07-17T15:30:00.000Z",
        }),
      ).resolves.toEqual({ ok: false, reason: "missing_observation" });
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does not refresh plant memory after a failed insert", async () => {
    insertMock.mockResolvedValue({ error: { message: "denied" } });
    const client = new QueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSavePhotoDiagnosisReview(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.save({
          photo,
          observation: "I need another visual check.",
          reviewStatus: "needs_follow_up",
          recordedAt: "2026-07-17T15:30:00.000Z",
        }),
      ).resolves.toEqual({ ok: false, reason: "insert_failed" });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });
});
