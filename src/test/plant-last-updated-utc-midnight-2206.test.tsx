import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatRelativeTimelineHeader,
  type RelativeTimelineItem,
} from "@/lib/relativeTimelineProjectionRules";
import { buildPlantQuickStatusView } from "@/lib/plantQuickStatusRules";

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

// No QueryClient here: private photo signing stays unresolved (the pending
// state). Thumbnail signing is covered in plant-relative-timeline-photo-thumbnail.
vi.mock("@/hooks/useDiaryPhotoDisplayRows", () => ({
  useDiaryPhotoDisplayRows: (rows: ReadonlyArray<Record<string, unknown>> | undefined) => ({
    rows: (rows ?? []).map((row) => ({ ...row, photo_url: null })),
    isResolvingPrivatePhotos: false,
    isPrivatePhotoReadPaused: false,
    hasPrivatePhotoError: false,
    hasPhotoReference: false,
    refetchPrivatePhotos: async () => {},
  }),
}));
vi.mock("@/hooks/usePlantRelativeTimelineHistory", () => ({
  usePlantRelativeTimelineHistory: vi.fn(),
}));

import { usePlantRelativeTimelineHistory } from "@/hooks/usePlantRelativeTimelineHistory";
import PlantRelativeTimelineSection from "@/components/PlantRelativeTimelineSection";

const mockTimelineHistory = usePlantRelativeTimelineHistory as unknown as ReturnType<typeof vi.fn>;

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function withTimeZone<T>(tz: string, fn: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

const PLANT_ID = "plant-uuid-2206-utc-midnight";
const PLANT_STARTED = "2026-04-01T00:00:00Z";

function makeItem(overrides: Partial<RelativeTimelineItem> & { id: string }): RelativeTimelineItem {
  return {
    eventType: "note",
    title: "t",
    occurredAt: "2026-04-05T00:00:00Z",
    occurredAtLabel: "2026-04-05T00:00:00Z",
    plantDay: 0,
    stageDay: null,
    source: "note",
    stagePreset: null,
    plantId: PLANT_ID,
    tentId: null,
    ...overrides,
  };
}

describe("Plant Last updated — UTC-midnight diary events format in the viewer's local time zone (#2206)", () => {
  it("formatRelativeTimelineHeader formats a UTC-midnight timestamp as the previous calendar day in America/Chicago and same day in UTC", () => {
    withTimeZone("America/Chicago", () => {
      const h = formatRelativeTimelineHeader([
        makeItem({ id: "a", occurredAt: "2026-04-10T00:00:00Z" }),
        makeItem({ id: "b", occurredAt: "2026-05-31T00:00:00Z" }),
        makeItem({ id: "c", occurredAt: "2026-05-01T00:00:00Z" }),
      ]);
      expect(h.lastUpdatedAt).toBe("2026-05-31T00:00:00Z");
      expect(h.lastUpdatedLabel).toBe("Last updated May 30, 2026");
    });

    withTimeZone("UTC", () => {
      const h = formatRelativeTimelineHeader([
        makeItem({ id: "a", occurredAt: "2026-04-10T00:00:00Z" }),
        makeItem({ id: "b", occurredAt: "2026-05-31T00:00:00Z" }),
        makeItem({ id: "c", occurredAt: "2026-05-01T00:00:00Z" }),
      ]);
      expect(h.lastUpdatedAt).toBe("2026-05-31T00:00:00Z");
      expect(h.lastUpdatedLabel).toBe("Last updated May 31, 2026");
    });
  });

  it("buildPlantQuickStatusView formats a UTC-midnight timestamp in America/Chicago as May 30, 2026", () => {
    withTimeZone("America/Chicago", () => {
      const v = buildPlantQuickStatusView({
        stage: "vegetation",
        timelineItems: [
          makeItem({ id: "a", occurredAt: "2026-04-10T00:00:00Z" }),
          makeItem({ id: "b", occurredAt: "2026-05-31T00:00:00Z" }),
          makeItem({ id: "c", occurredAt: "2026-04-20T00:00:00Z" }),
        ],
      });
      expect(v.lastUpdateLabel).toBe("Last updated May 30, 2026");
      expect(v.lastUpdateIsFallback).toBe(false);
    });
  });

  it("PlantRelativeTimelineSection header renders 'Last updated May 30, 2026' for a UTC-midnight entry in America/Chicago", () => {
    withTimeZone("America/Chicago", () => {
      mockTimelineHistory.mockReturnValue({
        data: [
          {
            id: "w",
            plant_id: PLANT_ID,
            entry_at: "2026-04-05T00:00:00Z",
            entry_type: "watering",
            note: "n",
            photo_url: null,
            details: null,
          },
          {
            id: "f",
            plant_id: PLANT_ID,
            entry_at: "2026-04-06T00:00:00Z",
            entry_type: "feeding",
            note: "n",
            photo_url: null,
            details: null,
          },
          {
            id: "n",
            plant_id: PLANT_ID,
            entry_at: "2026-05-31T00:00:00Z",
            entry_type: "note",
            note: "n",
            photo_url: null,
            details: null,
          },
        ],
        totalCount: 3,
        status: "success",
        isLoading: false,
        isPending: false,
        isError: false,
        isFetching: false,
        isFetchingNextPage: false,
        isFetchNextPageError: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: vi.fn(),
      });

      render(<PlantRelativeTimelineSection plantId={PLANT_ID} plantStartedAt={PLANT_STARTED} />);
      expect(screen.getByTestId("relative-timeline-header-last-updated")).toHaveTextContent(
        "Last updated May 30, 2026",
      );
    });
  });
});
