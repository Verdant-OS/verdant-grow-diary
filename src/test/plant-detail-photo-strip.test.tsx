/**
 * Plant Detail recent photo preview strip — pure helper + render coverage
 * + static safety. Read-only and presentation-only. No uploads, writes,
 * schema/RLS/migrations, edge functions, storage changes, auth, automation,
 * device control, calendar/notification/email/reminder scheduling,
 * service_role, functions.invoke, or fake-live sensor data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("react-router-dom", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) =>
    React.createElement(
      "a",
      { href: typeof to === "string" ? to : "", ...rest },
      children,
    ),
}));

const useDiaryEntriesMock = vi.fn();
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => useDiaryEntriesMock(),
}));

const createSignedUrlsMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: (...a: unknown[]) => createSignedUrlsMock(...a),
      }),
    },
  },
}));

import {
  buildPlantPhotoStripItems,
  PLANT_PHOTO_STRIP_DEFAULT_LIMIT,
  PLANT_PHOTO_STRIP_MAX_LIMIT,
} from "@/lib/plantPhotoPreviewStrip";
import type { PhotoHistoryRow } from "@/lib/photoHistoryRules";
import PlantDetailPhotoStrip from "@/components/PlantDetailPhotoStrip";

const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/plantPhotoPreviewStrip.ts"),
  "utf8",
);
const COMPONENT = readFileSync(
  resolve(ROOT, "src/components/PlantDetailPhotoStrip.tsx"),
  "utf8",
);
const PAGE = readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8");

const FORBIDDEN = [
  /service_role/,
  /supabase\.from\(/,
  /functions\.invoke\(/,
  /\.rpc\(/,
  /\.insert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.upsert\(/,
  /calendar_events/,
  /\bnotifications\b/i,
  /\bemail\b/i,
  /\bsendgrid\b/i,
  /\bmailgun\b/i,
  /\bresend\b/i,
  /\bautopilot\b/i,
  /\bauto[-\s]?(execute|run|control)\b/i,
];

function row(partial: Partial<PhotoHistoryRow>): PhotoHistoryRow {
  return {
    id: "row-1",
    occurredAt: "2026-05-30T10:00:00.000Z",
    occurredAtLabel: "May 30",
    growId: null,
    plantId: "p1",
    tentId: null,
    stage: null,
    eventType: "photo",
    photoUrl: "https://example.com/img.jpg",
    caption: "",
    warnings: [],
    ...partial,
  };
}

describe("buildPlantPhotoStripItems", () => {
  it("returns empty when plantId missing", () => {
    expect(
      buildPlantPhotoStripItems({ plantId: null, rows: [row({})] }),
    ).toEqual([]);
    expect(
      buildPlantPhotoStripItems({ plantId: "  ", rows: [row({})] }),
    ).toEqual([]);
  });

  it("filters by plantId exact match", () => {
    const items = buildPlantPhotoStripItems({
      plantId: "p1",
      rows: [
        row({ id: "a", plantId: "p1" }),
        row({ id: "b", plantId: "p2" }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].thumbnailUrl).toBe("https://example.com/img.jpg");
  });

  it("preserves newest-first order from input rows", () => {
    const items = buildPlantPhotoStripItems({
      plantId: "p1",
      rows: [
        row({
          id: "n",
          occurredAt: "2026-05-30T10:00:00.000Z",
          photoUrl: "https://example.com/new.jpg",
        }),
        row({
          id: "o",
          occurredAt: "2026-04-01T10:00:00.000Z",
          photoUrl: "https://example.com/old.jpg",
        }),
      ],
    });
    expect(items.map((i) => i.thumbnailUrl)).toEqual([
      "https://example.com/new.jpg",
      "https://example.com/old.jpg",
    ]);
  });

  it("skips rows with no valid photoUrl", () => {
    const items = buildPlantPhotoStripItems({
      plantId: "p1",
      rows: [
        row({ id: "x", photoUrl: null }),
        row({ id: "y", photoUrl: "https://example.com/ok.jpg" }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].thumbnailUrl).toBe("https://example.com/ok.jpg");
  });

  it("clamps limit to [3, 5] and defaults to 5", () => {
    const many = Array.from({ length: 10 }).map((_, i) =>
      row({
        id: `r${i}`,
        photoUrl: `https://example.com/${i}.jpg`,
      }),
    );
    expect(
      buildPlantPhotoStripItems({ plantId: "p1", rows: many }),
    ).toHaveLength(PLANT_PHOTO_STRIP_DEFAULT_LIMIT);
    expect(
      buildPlantPhotoStripItems({ plantId: "p1", rows: many, limit: 1 }),
    ).toHaveLength(3);
    expect(
      buildPlantPhotoStripItems({ plantId: "p1", rows: many, limit: 99 }),
    ).toHaveLength(PLANT_PHOTO_STRIP_MAX_LIMIT);
  });

  it("derives alt text including date label, with fallback", () => {
    const [a] = buildPlantPhotoStripItems({
      plantId: "p1",
      rows: [row({ occurredAt: "2026-05-30T10:00:00.000Z" })],
    });
    expect(a.altText).toMatch(/^Plant photo from /);
    const [b] = buildPlantPhotoStripItems({
      plantId: "p1",
      rows: [row({ occurredAt: null, occurredAtLabel: "" })],
    });
    expect(b.altText).toBe("Plant photo");
  });

  it("renders a category label for non-photo event types", () => {
    const [a] = buildPlantPhotoStripItems({
      plantId: "p1",
      rows: [row({ eventType: "watering" })],
    });
    expect(a.categoryLabel).toBe("Watering");
    const [b] = buildPlantPhotoStripItems({
      plantId: "p1",
      rows: [row({ eventType: "photo" })],
    });
    expect(b.categoryLabel).toBe("");
  });

  it("never leaks internal id, raw payload, growId or tentId", () => {
    const items = buildPlantPhotoStripItems({
      plantId: "p1",
      rows: [
        row({
          id: "secret-id",
          growId: "secret-grow",
          tentId: "secret-tent",
        }),
      ],
    });
    const text = JSON.stringify(items);
    expect(text).not.toMatch(/secret-id/);
    expect(text).not.toMatch(/secret-grow/);
    expect(text).not.toMatch(/secret-tent/);
  });
});

describe("PlantDetailPhotoStrip render", () => {
  beforeEach(() => {
    useDiaryEntriesMock.mockReset();
    createSignedUrlsMock.mockReset();
    createSignedUrlsMock.mockResolvedValue({ data: [] });
  });

  it("renders heading", () => {
    useDiaryEntriesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);
    expect(screen.getByText(/Recent photos/i)).toBeInTheDocument();
  });

  it("renders loading state", () => {
    useDiaryEntriesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);
    expect(
      screen.getByTestId("plant-detail-photo-strip-loading"),
    ).toBeInTheDocument();
  });

  it("renders empty state copy", () => {
    useDiaryEntriesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);
    expect(screen.getByText(/No photos yet\./)).toBeInTheDocument();
    expect(
      screen.getByText(/Add a photo to start building visual plant memory\./),
    ).toBeInTheDocument();
  });

  it("renders error state with retry that refetches", () => {
    const refetch = vi.fn();
    useDiaryEntriesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);
    fireEvent.click(screen.getByTestId("plant-detail-photo-strip-retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders up to 5 photos with date and alt text for the current plant", () => {
    const raw = Array.from({ length: 7 }).map((_, i) => ({
      id: `r${i}`,
      plant_id: "p1",
      entry_at: `2026-05-${String(20 + i).padStart(2, "0")}T10:00:00.000Z`,
      entry_type: "photo",
      photo_url: `https://example.com/${i}.jpg`,
      note: "",
    }));
    // Different plant — must be filtered out
    raw.push({
      id: "other",
      plant_id: "p2",
      entry_at: "2026-06-01T10:00:00.000Z",
      entry_type: "photo",
      photo_url: "https://example.com/other.jpg",
      note: "",
    });
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);
    const items = screen.getAllByTestId("plant-detail-photo-strip-item");
    expect(items).toHaveLength(5);
    const imgs = screen.getAllByRole("img");
    for (const img of imgs) {
      expect(img.getAttribute("alt") ?? "").toMatch(/^Plant photo/);
      expect(img.getAttribute("src") ?? "").not.toContain("other.jpg");
    }
  });

  it("signs and renders a Photo entry whose path only lives in details.photo_url", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [
        {
          path: "user-1/grow-1/167123.jpg",
          signedUrl: "https://signed.example.com/167123.jpg?token=abc",
        },
      ],
    });
    const raw = [
      {
        id: "companion-1",
        plant_id: "p1",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: null,
        details: { event_type: "photo", photo_url: "user-1/grow-1/167123.jpg" },
        note: "",
      },
    ];
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);

    await waitFor(() => expect(createSignedUrlsMock).toHaveBeenCalledTimes(1));
    expect(createSignedUrlsMock).toHaveBeenCalledWith(
      ["user-1/grow-1/167123.jpg"],
      3600,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("plant-detail-photo-strip-item")).toHaveLength(1),
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe(
      "https://signed.example.com/167123.jpg?token=abc",
    );
  });

  it("shows the error state (not the empty state) when signing resolves with an error", async () => {
    createSignedUrlsMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const raw = [
      {
        id: "companion-1",
        plant_id: "p1",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: null,
        details: { event_type: "photo", photo_url: "user-1/grow-1/167123.jpg" },
        note: "",
      },
    ];
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);

    await waitFor(() =>
      expect(screen.getByTestId("plant-detail-photo-strip-error")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("plant-detail-photo-strip-empty")).not.toBeInTheDocument();
  });

  it("shows the error state when the signing request rejects", async () => {
    createSignedUrlsMock.mockRejectedValue(new Error("network down"));
    const raw = [
      {
        id: "companion-1",
        plant_id: "p1",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: null,
        details: { event_type: "photo", photo_url: "user-1/grow-1/167123.jpg" },
        note: "",
      },
    ];
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);

    await waitFor(() =>
      expect(screen.getByTestId("plant-detail-photo-strip-error")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("plant-detail-photo-strip-empty")).not.toBeInTheDocument();
  });

  it("Retry re-attempts signing after a failure and recovers on success", async () => {
    createSignedUrlsMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const refetch = vi.fn();
    const raw = [
      {
        id: "companion-1",
        plant_id: "p1",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: null,
        details: { event_type: "photo", photo_url: "user-1/grow-1/167123.jpg" },
        note: "",
      },
    ];
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch,
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);

    await waitFor(() =>
      expect(screen.getByTestId("plant-detail-photo-strip-error")).toBeInTheDocument(),
    );

    createSignedUrlsMock.mockResolvedValueOnce({
      data: [
        {
          path: "user-1/grow-1/167123.jpg",
          signedUrl: "https://signed.example.com/167123.jpg?token=retry",
        },
      ],
    });
    fireEvent.click(screen.getByTestId("plant-detail-photo-strip-retry"));

    expect(refetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(createSignedUrlsMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getAllByTestId("plant-detail-photo-strip-item")).toHaveLength(1),
    );
    expect(
      screen.queryByTestId("plant-detail-photo-strip-error"),
    ).not.toBeInTheDocument();
  });

  it("keeps showing the loading skeleton while signing is in flight, not the empty state", async () => {
    let resolveSigning: (v: unknown) => void = () => {};
    createSignedUrlsMock.mockImplementation(
      () => new Promise((res) => (resolveSigning = res)),
    );
    const raw = [
      {
        id: "companion-1",
        plant_id: "p1",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: null,
        details: { event_type: "photo", photo_url: "u/g/1.jpg" },
        note: "",
      },
    ];
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);

    await waitFor(() => expect(createSignedUrlsMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("plant-detail-photo-strip-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-detail-photo-strip-empty")).not.toBeInTheDocument();

    await act(async () => {
      resolveSigning({ data: [{ path: "u/g/1.jpg", signedUrl: "https://signed.example.com/1.jpg" }] });
    });
    await waitFor(() =>
      expect(screen.getAllByTestId("plant-detail-photo-strip-item")).toHaveLength(1),
    );
  });

  it("scopes signing requests to the current plant's rows only", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [{ path: "u/g/p1.jpg", signedUrl: "https://signed.example.com/p1.jpg" }],
    });
    const raw = [
      {
        id: "p1-row",
        plant_id: "p1",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: null,
        details: { event_type: "photo", photo_url: "u/g/p1.jpg" },
        note: "",
      },
      {
        id: "p2-row",
        plant_id: "p2",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: null,
        details: { event_type: "photo", photo_url: "u/g/p2.jpg" },
        note: "",
      },
    ];
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);

    await waitFor(() => expect(createSignedUrlsMock).toHaveBeenCalledTimes(1));
    expect(createSignedUrlsMock).toHaveBeenCalledWith(["u/g/p1.jpg"], 3600);
  });

  it("does not let another plant's signing failure blank out this plant's gallery", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [{ path: "u/g/p1.jpg", signedUrl: "https://signed.example.com/p1.jpg" }],
    });
    const raw = [
      {
        id: "p1-row",
        plant_id: "p1",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: null,
        details: { event_type: "photo", photo_url: "u/g/p1.jpg" },
        note: "",
      },
      // p2's companion path would fail to sign, but p1's strip must never
      // even request it.
      {
        id: "p2-row",
        plant_id: "p2",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: null,
        details: { event_type: "photo", photo_url: "u/g/p2-missing.jpg" },
        note: "",
      },
    ];
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);

    await waitFor(() =>
      expect(screen.getAllByTestId("plant-detail-photo-strip-item")).toHaveLength(1),
    );
    expect(screen.queryByTestId("plant-detail-photo-strip-error")).not.toBeInTheDocument();
  });

  it("treats a per-object signing error as a failure, not a silently dropped photo", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [{ path: "u/g/1.jpg", signedUrl: null, error: "Object not found" }],
    });
    const raw = [
      {
        id: "companion-1",
        plant_id: "p1",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: null,
        details: { event_type: "photo", photo_url: "u/g/1.jpg" },
        note: "",
      },
    ];
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);

    await waitFor(() =>
      expect(screen.getByTestId("plant-detail-photo-strip-error")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("plant-detail-photo-strip-empty")).not.toBeInTheDocument();
  });

  it("does not call Storage when every photo_url is already http(s)", async () => {
    const raw = [
      {
        id: "r1",
        plant_id: "p1",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        photo_url: "https://example.com/a.jpg",
        note: "",
      },
    ];
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId={null} />);
    await waitFor(() =>
      expect(screen.getAllByTestId("plant-detail-photo-strip-item")).toHaveLength(1),
    );
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
  });

  it("upload CTA invokes onUploadPhoto and does NOT navigate to /logs", () => {
    useDiaryEntriesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const onUploadPhoto = vi.fn();
    render(
      <PlantDetailPhotoStrip
        plantId="p1"
        growId="g1"
        onUploadPhoto={onUploadPhoto}
      />,
    );
    const btn = screen.getByTestId("plant-detail-photo-strip-upload");
    // No anchor / href when handler is provided — must stay on Plant Detail.
    expect(btn.tagName.toLowerCase()).toBe("button");
    expect(btn.getAttribute("href")).toBeNull();
    fireEvent.click(btn);
    expect(onUploadPhoto).toHaveBeenCalledTimes(1);
  });

  it("CTA copy is 'Add photo log' (honest about the underlying flow)", () => {
    useDiaryEntriesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(
      <PlantDetailPhotoStrip
        plantId="p1"
        growId="g1"
        onUploadPhoto={vi.fn()}
      />,
    );
    const btn = screen.getByTestId("plant-detail-photo-strip-upload");
    expect(btn.textContent ?? "").toMatch(/Add photo log/i);
    expect(btn.textContent ?? "").not.toMatch(/Upload photo/i);
  });

  it("falls back to a contextual link (NOT /logs) when no handler is given", () => {
    useDiaryEntriesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId="g1" />);
    const link = screen.getByTestId("plant-detail-photo-strip-upload");
    // Fallback still preserves grow context via query string.
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("growId=g1");
  });

  it("upload CTA renders disabled when plant context missing", () => {
    useDiaryEntriesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId={null} growId={null} />);
    const btn = screen.getByTestId(
      "plant-detail-photo-strip-upload-disabled",
    );
    expect(btn).toBeDisabled();
  });

  it("does not leak internal IDs, tokens, or storage paths in visible UI", () => {
    const raw = [
      {
        id: "diary-uuid-1234",
        plant_id: "p1",
        entry_at: "2026-05-30T10:00:00.000Z",
        entry_type: "photo",
        user_id: "user-uuid-5678",
        photo_url: "https://example.com/safe.jpg",
        details: {
          storage_path: "private/buckets/secret.jpg",
          token: "tok_secret",
        },
        note: "",
      },
    ];
    useDiaryEntriesMock.mockReturnValue({
      data: raw,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { container } = render(
      <PlantDetailPhotoStrip plantId="p1" growId={null} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("diary-uuid-1234");
    expect(text).not.toContain("user-uuid-5678");
    expect(text).not.toContain("private/buckets/secret.jpg");
    expect(text).not.toContain("tok_secret");
  });
});

describe("Plant Detail photo strip — static safety", () => {
  it("helper has no React, fetch, supabase, or writes", () => {
    expect(HELPER).not.toMatch(/from\s+["']react["']/);
    expect(HELPER).not.toMatch(/\bfetch\(/);
    expect(HELPER).not.toMatch(/supabase/i);
    for (const re of FORBIDDEN) expect(HELPER).not.toMatch(re);
  });

  it("component contains no writes, RPC, or unsafe paths", () => {
    for (const re of FORBIDDEN) expect(COMPONENT).not.toMatch(re);
  });

  it("page wires the photo strip in", () => {
    expect(PAGE).toMatch(/PlantDetailPhotoStrip/);
  });

  it("page passes an onUploadPhoto handler that opens the plant Quick Log (no /logs nav)", () => {
    expect(PAGE).toMatch(/onUploadPhoto\s*=\s*\{[^}]*setQuickLogOpen\(true\)/);
  });
});
