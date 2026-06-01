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
import { render, screen, fireEvent } from "@testing-library/react";

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
  beforeEach();
  function beforeEach() {
    useDiaryEntriesMock.mockReset();
  }

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
      details: { photo_url: `https://example.com/${i}.jpg` },
      note: "",
    }));
    // Different plant — must be filtered out
    raw.push({
      id: "other",
      plant_id: "p2",
      entry_at: "2026-06-01T10:00:00.000Z",
      entry_type: "photo",
      details: { photo_url: "https://example.com/other.jpg" },
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

  it("upload CTA renders enabled with plant context", () => {
    useDiaryEntriesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<PlantDetailPhotoStrip plantId="p1" growId="g1" />);
    const link = screen.getByTestId("plant-detail-photo-strip-upload");
    expect(link.getAttribute("href") ?? "").toMatch(/\/logs/);
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
        details: {
          photo_url: "https://example.com/safe.jpg",
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
});
