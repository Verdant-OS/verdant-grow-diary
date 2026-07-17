import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe("useDiaryPhotoDisplayRows", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ user: { id: "owner-1" } });
    storageFromMock.mockClear();
    createSignedUrlsMock.mockReset();
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
