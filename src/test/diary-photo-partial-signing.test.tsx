import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sign, auth } = vi.hoisted(() => ({ sign: vi.fn(), auth: vi.fn() }));
vi.mock("@/store/auth", () => ({ useAuth: () => auth() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrls: sign }) } },
}));

import { useDiaryPhotoDisplayRows } from "@/hooks/useDiaryPhotoDisplayRows";

const goodPath = "owner-1/grow-1/good.jpg";
const missingPath = "owner-1/grow-1/missing.jpg";
const goodUrl = "https://photos.example/good.jpg?token=temporary";
const recoveredUrl = "https://photos.example/recovered.jpg?token=temporary";
const externalUrl = "https://images.example/external.jpg";
const rows = [
  { id: "good", photo_url: goodPath },
  { id: "missing", photo_url: `storage://diary-photos/${missingPath}` },
  { id: "external", photo_url: externalUrl },
];
const goodSignature = { path: goodPath, signedUrl: goodUrl, error: null };
const fullBatch = {
  data: [goodSignature, { path: missingPath, signedUrl: recoveredUrl, error: null }],
  error: null,
};
const clients: QueryClient[] = [];

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={clients[clients.length - 1]}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  auth.mockReturnValue({ user: { id: "owner-1" } });
  sign.mockReset();
  clients.push(new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } }));
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
});

describe("VER-295 shared private-photo partial signing", () => {
  it.each([
    ["omitted item", []],
    ["missing URL", [{ path: missingPath, signedUrl: null, error: null }]],
    ["per-item error", [{ path: missingPath, signedUrl: null, error: "Object not found" }]],
  ])("keeps the successful image and reports an unavailable %s", async (_label, missing) => {
    sign.mockResolvedValue({ data: [goodSignature, ...missing], error: null });
    const { result } = renderHook(() => useDiaryPhotoDisplayRows(rows), { wrapper });

    await waitFor(() => expect(result.current.isResolvingPrivatePhotos).toBe(false));
    expect(result.current.rows.map((row) => row.photo_url)).toEqual([goodUrl, null, externalUrl]);
    expect(result.current.hasPrivatePhotoError).toBe(true);
    expect(result.current.hasPhotoReference).toBe(true);
    expect(sign).toHaveBeenCalledWith([goodPath, missingPath], 1800);
    expect(rows[0].photo_url).toBe(goodPath);
  });

  it("does not display a failed item's URL even when the response includes one", async () => {
    sign.mockResolvedValue({
      data: [
        goodSignature,
        { path: missingPath, signedUrl: recoveredUrl, error: "Object not found" },
      ],
      error: null,
    });
    const { result } = renderHook(() => useDiaryPhotoDisplayRows(rows), { wrapper });

    await waitFor(() => expect(result.current.isResolvingPrivatePhotos).toBe(false));
    expect(result.current.rows.map((row) => row.photo_url)).toEqual([goodUrl, null, externalUrl]);
    expect(result.current.hasPrivatePhotoError).toBe(true);
  });

  it.each([
    ["whole-call error", { data: [goodSignature], error: { message: "Storage unavailable" } }],
    ["missing data", { data: null, error: null }],
    ["empty data", { data: [], error: null }],
    [
      "all item errors",
      {
        data: [goodPath, missingPath].map((path) => ({
          path,
          signedUrl: null,
          error: "Object not found",
        })),
        error: null,
      },
    ],
  ])("fails closed for %s while retaining external photos", async (_label, response) => {
    sign.mockResolvedValue(response);
    const { result } = renderHook(() => useDiaryPhotoDisplayRows(rows), { wrapper });

    await waitFor(() => expect(result.current.hasPrivatePhotoError).toBe(true));
    expect(result.current.rows.map((row) => row.photo_url)).toEqual([null, null, externalUrl]);
    expect(result.current.hasPhotoReference).toBe(true);
  });

  it("never signs or displays another owner's path in a partially successful batch", async () => {
    const foreignPath = "other-owner/grow-1/private.jpg";
    sign.mockResolvedValue({
      data: [
        goodSignature,
        { path: foreignPath, signedUrl: "https://photos.example/foreign.jpg", error: null },
      ],
      error: null,
    });
    const { result } = renderHook(
      () =>
        useDiaryPhotoDisplayRows([
          ...rows,
          { id: "foreign-bare", photo_url: foreignPath },
          { id: "foreign-storage", photo_url: `storage://diary-photos/${foreignPath}` },
        ]),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isResolvingPrivatePhotos).toBe(false));
    expect(sign).toHaveBeenCalledWith([goodPath, missingPath], 1800);
    expect(sign.mock.calls.every(([paths]) => !paths.includes(foreignPath))).toBe(true);
    expect(result.current.rows.map((row) => row.photo_url)).toEqual([
      goodUrl,
      null,
      externalUrl,
      null,
      null,
    ]);
  });

  it("clears the partial error when an explicit retry recovers every photo", async () => {
    sign.mockResolvedValue({ data: [goodSignature], error: null });
    const { result } = renderHook(() => useDiaryPhotoDisplayRows(rows), { wrapper });
    await waitFor(() => expect(result.current.hasPrivatePhotoError).toBe(true));
    sign.mockResolvedValue(fullBatch);

    await act(async () => {
      await result.current.refetchPrivatePhotos();
    });
    await waitFor(() => expect(result.current.hasPrivatePhotoError).toBe(false));
    expect(result.current.rows.map((row) => row.photo_url)).toEqual([
      goodUrl,
      recoveredUrl,
      externalUrl,
    ]);
    expect(result.current.hasPrivatePhotoError).toBe(false);
  });

  it("replaces a previous full batch with only the fresh successful signatures", async () => {
    sign.mockResolvedValue(fullBatch);
    const { result } = renderHook(() => useDiaryPhotoDisplayRows(rows), { wrapper });
    await waitFor(() => expect(result.current.rows[1].photo_url).toBe(recoveredUrl));
    sign.mockResolvedValue({ data: [goodSignature], error: null });

    await act(async () => {
      await result.current.refetchPrivatePhotos();
    });
    await waitFor(() => expect(result.current.hasPrivatePhotoError).toBe(true));
    expect(result.current.rows.map((row) => row.photo_url)).toEqual([goodUrl, null, externalUrl]);
  });
});
