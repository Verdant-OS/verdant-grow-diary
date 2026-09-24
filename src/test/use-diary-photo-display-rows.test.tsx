import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, storageFromMock, createSignedUrlsMock } = vi.hoisted(() => {
  const createSignedUrlsMock = vi.fn();
  const storageFromMock = vi.fn(() => ({ createSignedUrls: createSignedUrlsMock }));
  return {
    useAuthMock: vi.fn(),
    storageFromMock,
    createSignedUrlsMock,
  };
});

vi.mock("@/store/auth", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: storageFromMock } },
}));

import { useDiaryPhotoDisplayRows } from "@/hooks/useDiaryPhotoDisplayRows";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe("useDiaryPhotoDisplayRows", () => {
  afterEach(() => {
    cleanup();
    onlineManager.setOnline(true);
  });
  beforeEach(() => {
    useAuthMock.mockReturnValue({ user: { id: "owner-1" } });
    storageFromMock.mockClear();
    createSignedUrlsMock.mockReset();
  });

  const ownedRows = [{ id: "owned-photo", photo_url: "owner-1/grow-1/leaf.jpg" }];
  const signed = {
    data: [{ path: "owner-1/grow-1/leaf.jpg", signedUrl: "https://project.example/leaf.jpg" }],
    error: null,
  };

  it("keeps an offline first signing request pending, then resolves on reconnect", async () => {
    onlineManager.setOnline(false);
    createSignedUrlsMock.mockResolvedValue(signed);
    const { result } = renderHook(() => useDiaryPhotoDisplayRows(ownedRows), {
      wrapper: makeWrapper(),
    });
    expect(result.current.hasPhotoReference).toBe(true);
    expect(result.current.isResolvingPrivatePhotos).toBe(true);
    expect(result.current.isPrivatePhotoReadPaused).toBe(true);
    expect(result.current.rows[0].photo_url).toBeNull();
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    await waitFor(() =>
      expect(result.current.rows[0].photo_url).toBe("https://project.example/leaf.jpg"),
    );
    expect(result.current.isPrivatePhotoReadPaused).toBe(false);
  });

  it("retries a failed signing request with unchanged diary rows and recovers the image", async () => {
    createSignedUrlsMock.mockResolvedValue({ data: null, error: { message: "private failure" } });
    const { result } = renderHook(() => useDiaryPhotoDisplayRows(ownedRows), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.hasPrivatePhotoError).toBe(true));
    const attemptsBeforeRetry = createSignedUrlsMock.mock.calls.length;
    createSignedUrlsMock.mockResolvedValue(signed);
    await act(async () => {
      await result.current.refetchPrivatePhotos();
    });
    await waitFor(() =>
      expect(result.current.rows[0].photo_url).toBe("https://project.example/leaf.jpg"),
    );
    expect(createSignedUrlsMock).toHaveBeenCalledTimes(attemptsBeforeRetry + 1);
    expect(result.current.hasPrivatePhotoError).toBe(false);
  });

  it("hides cached private previews after a failed refresh while preserving external photos", async () => {
    createSignedUrlsMock.mockResolvedValue(signed);
    const rows = [
      ...ownedRows,
      { id: "external", photo_url: "https://images.example.com/external.jpg" },
    ];
    const { result } = renderHook(() => useDiaryPhotoDisplayRows(rows), { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(result.current.rows[0].photo_url).toBe("https://project.example/leaf.jpg"),
    );
    createSignedUrlsMock.mockResolvedValue({ data: null, error: { message: "failed refresh" } });
    await act(async () => {
      await result.current.refetchPrivatePhotos();
    });
    await waitFor(() => expect(result.current.hasPrivatePhotoError).toBe(true));
    expect(result.current.rows[0].photo_url).toBeNull();
    expect(result.current.rows[1].photo_url).toBe("https://images.example.com/external.jpg");
  });

  it("does not reuse or retry the prior owner's signed path after the viewer changes", async () => {
    createSignedUrlsMock.mockResolvedValue(signed);
    const { result, rerender } = renderHook(() => useDiaryPhotoDisplayRows(ownedRows), {
      wrapper: makeWrapper(),
    });
    await waitFor(() =>
      expect(result.current.rows[0].photo_url).toBe("https://project.example/leaf.jpg"),
    );
    const attempts = createSignedUrlsMock.mock.calls.length;
    useAuthMock.mockReturnValue({ user: { id: "owner-2" } });
    rerender();
    expect(result.current.rows[0].photo_url).toBeNull();
    expect(result.current.hasPhotoReference).toBe(false);
    await act(async () => {
      await result.current.refetchPrivatePhotos();
    });
    expect(createSignedUrlsMock).toHaveBeenCalledTimes(attempts);
  });

  it.each([
    ["missing batch", null],
    ["empty batch", []],
    ["per-path error", [{ path: "owner-1/grow-1/leaf.jpg", signedUrl: null, error: "not found" }]],
    [
      "different path",
      [{ path: "owner-1/grow-1/other.jpg", signedUrl: "https://project.example/other.jpg" }],
    ],
  ])("reports %s as unavailable rather than successful empty history", async (_name, data) => {
    createSignedUrlsMock.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => useDiaryPhotoDisplayRows(ownedRows), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.hasPrivatePhotoError).toBe(true));
    expect(result.current.hasPhotoReference).toBe(true);
    expect(result.current.rows[0].photo_url).toBeNull();
  });

  it.each([
    ["empty", []],
    ["external", [{ photo_url: "https://images.example.com/leaf.jpg" }]],
    ["wrong owner", [{ photo_url: "other-owner/grow-1/leaf.jpg" }]],
  ])("does not enable an unnecessary signing read when retrying %s rows", async (_name, rows) => {
    const { result } = renderHook(() => useDiaryPhotoDisplayRows(rows), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.refetchPrivatePhotos();
    });
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
  });

  it("signs only a validated owner-scoped private path and exposes its temporary display URL", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [
        {
          path: "owner-1/grow-1/leaf.jpg",
          signedUrl:
            "https://project.supabase.co/storage/v1/object/sign/diary-photos/leaf.jpg?token=short-lived",
        },
      ],
      error: null,
    });
    const { result } = renderHook(
      () =>
        useDiaryPhotoDisplayRows([
          {
            id: "photo-entry-1",
            photo_url: "owner-1/grow-1/leaf.jpg",
          },
        ]),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.rows[0]?.photo_url).toMatch(/^https:\/\//);
    });
    expect(storageFromMock).toHaveBeenCalledWith("diary-photos");
    expect(createSignedUrlsMock).toHaveBeenCalledWith(["owner-1/grow-1/leaf.jpg"], 1800);
    expect(result.current.rows[0]?.photo_url).not.toContain("owner-1/grow-1/leaf.jpg");
  });

  it("does not request a signed URL for a wrong-owner path", () => {
    const { result } = renderHook(
      () =>
        useDiaryPhotoDisplayRows([
          {
            id: "other-entry",
            photo_url: "other-owner/grow-1/leaf.jpg",
          },
        ]),
      { wrapper: makeWrapper() },
    );

    expect(result.current.rows[0]?.photo_url).toBeNull();
    expect(result.current.hasPhotoReference).toBe(false);
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
  });

  it("passes an existing https URL through without any storage request", () => {
    const { result } = renderHook(
      () =>
        useDiaryPhotoDisplayRows([
          {
            id: "external-entry",
            photo_url: "https://images.example.com/leaf.jpg",
          },
        ]),
      { wrapper: makeWrapper() },
    );

    expect(result.current.rows[0]?.photo_url).toBe("https://images.example.com/leaf.jpg");
    expect(result.current.hasPhotoReference).toBe(true);
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
  });

  it("uses a valid historical details.photo_url when top-level photo_url is unusable", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [
        {
          path: "owner-1/grow-1/fallback.jpg",
          signedUrl: "https://project.example/signed/fallback.jpg",
        },
      ],
      error: null,
    });
    const { result } = renderHook(
      () =>
        useDiaryPhotoDisplayRows([
          {
            photo_url: "javascript:bad()",
            details: { photo_url: "owner-1/grow-1/fallback.jpg" },
          },
        ]),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.rows[0]?.photo_url).toBe("https://project.example/signed/fallback.jpg");
    });
  });
});
