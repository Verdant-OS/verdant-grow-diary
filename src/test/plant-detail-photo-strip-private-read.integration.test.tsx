/**
 * Plant Detail photo strip — integration coverage for owned private previews.
 *
 * Exercises the real useDiaryPhotoDisplayRows hook wired through
 * PlantDetailPhotoStrip so regressions cannot hide behind a mocked hook.
 * Read-only: no writes, schema, RLS, edge functions, or device control.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, storageFromMock, createSignedUrlsMock, useDiaryEntriesMock } = vi.hoisted(
  () => {
    const createSignedUrlsMock = vi.fn();
    const storageFromMock = vi.fn(() => ({ createSignedUrls: createSignedUrlsMock }));
    const useDiaryEntriesMock = vi.fn();
    const useAuthMock = vi.fn();
    return { useAuthMock, storageFromMock, createSignedUrlsMock, useDiaryEntriesMock };
  },
);

vi.mock("@/store/auth", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: storageFromMock } },
}));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => useDiaryEntriesMock(),
}));
vi.mock("@/lib/react-router-compat", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => React.createElement("a", { href: typeof to === "string" ? to : "", ...rest }, children),
}));

import PlantDetailPhotoStrip from "@/components/PlantDetailPhotoStrip";

const OWNER_ID = "owner-1";
const PLANT_ID = "plant-1";
const PRIVATE_PATH = `${OWNER_ID}/grow-1/leaf.jpg`;
const SIGNED_URL = "https://project.example/storage/v1/object/sign/leaf.jpg?token=short";

function privatePhotoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "photo-private-1",
    plant_id: PLANT_ID,
    entry_at: "2026-05-30T10:00:00.000Z",
    entry_type: "photo",
    photo_url: PRIVATE_PATH,
    note: "",
    ...overrides,
  };
}

function renderStrip(plantId: string | null = PLANT_ID) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlantDetailPhotoStrip plantId={plantId} growId={null} />
    </QueryClientProvider>,
  );
}

describe("PlantDetailPhotoStrip private read integration", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthMock.mockReturnValue({ user: { id: OWNER_ID } });
    storageFromMock.mockClear();
    createSignedUrlsMock.mockReset();
    useDiaryEntriesMock.mockReset();
    useDiaryEntriesMock.mockReturnValue({
      data: [privatePhotoRow()],
      isLoading: false,
      isPending: false,
      isFetching: false,
      fetchStatus: "idle",
      isError: false,
      refetch: vi.fn(),
    });
  });

  it("renders a signed private preview instead of the false empty state", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [{ path: PRIVATE_PATH, signedUrl: SIGNED_URL }],
      error: null,
    });

    renderStrip();

    await waitFor(() => {
      expect(screen.getByRole("img")).toHaveAttribute("src", SIGNED_URL);
    });
    expect(screen.queryByText("No photos yet.")).toBeNull();
    expect(createSignedUrlsMock).toHaveBeenCalledWith([PRIVATE_PATH], 1800);
  });

  it("shows loading while the first private signing request is in flight", async () => {
    let resolveSigning: (value: unknown) => void = () => undefined;
    createSignedUrlsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSigning = resolve;
        }),
    );

    renderStrip();

    expect(screen.getByTestId("plant-detail-photo-strip-loading")).toBeInTheDocument();
    expect(screen.queryByText("No photos yet.")).toBeNull();

    resolveSigning({
      data: [{ path: PRIVATE_PATH, signedUrl: SIGNED_URL }],
      error: null,
    });

    await waitFor(() => {
      expect(screen.getByRole("img")).toHaveAttribute("src", SIGNED_URL);
    });
  });

  it("surfaces unavailable previews instead of empty history when signing fails", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: null,
      error: { message: "storage unavailable" },
    });

    renderStrip();

    await waitFor(() => {
      expect(screen.getByTestId("plant-detail-photo-strip-error")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Recent photo previews are unavailable right now."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No photos yet.")).toBeNull();
  });

  it("signs and renders only the selected plant's private previews", async () => {
    const otherPlantRow = privatePhotoRow({
      id: "photo-other-plant",
      plant_id: "plant-2",
      photo_url: `${OWNER_ID}/grow-1/other.jpg`,
    });
    useDiaryEntriesMock.mockReturnValue({
      data: [privatePhotoRow(), otherPlantRow],
      isLoading: false,
      isPending: false,
      isFetching: false,
      fetchStatus: "idle",
      isError: false,
      refetch: vi.fn(),
    });
    createSignedUrlsMock.mockResolvedValue({
      data: [{ path: PRIVATE_PATH, signedUrl: SIGNED_URL }],
      error: null,
    });

    renderStrip(PLANT_ID);

    await waitFor(() => {
      expect(screen.getByRole("img")).toHaveAttribute("src", SIGNED_URL);
    });
    expect(createSignedUrlsMock).toHaveBeenCalledWith([PRIVATE_PATH], 1800);
    expect(screen.getAllByTestId("plant-detail-photo-strip-item")).toHaveLength(1);
  });
});
