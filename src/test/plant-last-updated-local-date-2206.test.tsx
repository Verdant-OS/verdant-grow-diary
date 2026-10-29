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

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: vi.fn(),
  PLANT_RECENT_ACTIVITY_LIMIT: 10,
}));
vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: vi.fn(),
}));
vi.mock("@/hooks/usePlantAssignedTentActions", () => ({
  usePlantAssignedTentActions: vi.fn(),
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

import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { usePlantAssignedTentAlerts } from "@/hooks/usePlantAssignedTentAlerts";
import { usePlantAssignedTentActions } from "@/hooks/usePlantAssignedTentActions";
import { usePlantRelativeTimelineHistory } from "@/hooks/usePlantRelativeTimelineHistory";
import PlantQuickStatusStrip from "@/components/PlantQuickStatusStrip";
import PlantRelativeTimelineSection from "@/components/PlantRelativeTimelineSection";

const mockRecentActivity = usePlantRecentActivity as unknown as ReturnType<typeof vi.fn>;
const mockAlerts = usePlantAssignedTentAlerts as unknown as ReturnType<typeof vi.fn>;
const mockActions = usePlantAssignedTentActions as unknown as ReturnType<typeof vi.fn>;
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

const PLANT_ID = "plant-uuid-2206";
const PLANT_STARTED = "2026-10-01T00:00:00Z";
// 2026-10-16T01:30:00Z is 8:30 PM CDT on October 15, 2026 in America/Chicago (past midnight UTC).
const EVENING_CT_ISO = "2026-10-16T01:30:00Z";

function makeItem(overrides: Partial<RelativeTimelineItem> & { id: string }): RelativeTimelineItem {
  return {
    eventType: "note",
    title: "Evening check",
    occurredAt: EVENING_CT_ISO,
    occurredAtLabel: EVENING_CT_ISO,
    plantDay: 14,
    stageDay: null,
    source: "note",
    stagePreset: null,
    plantId: PLANT_ID,
    tentId: null,
    ...overrides,
  };
}

describe("Plant page 'Last updated' local date formatting (#2206)", () => {
  it("formatRelativeTimelineHeader formats an Oct 15 evening America/Chicago timestamp as October 15, 2026", () => {
    withTimeZone("America/Chicago", () => {
      const header = formatRelativeTimelineHeader([
        makeItem({ id: "e-oct15-ct", occurredAt: EVENING_CT_ISO }),
      ]);
      expect(header.lastUpdatedLabel).toBe("Last updated October 15, 2026");
      expect(header.compact).toBe("1 timeline entry · Last updated October 15, 2026");
      expect(header.lastUpdatedIsFallback).toBe(false);
    });
  });

  it("buildPlantQuickStatusView derives 'Last updated October 15, 2026' on Oct 15 evening America/Chicago", () => {
    withTimeZone("America/Chicago", () => {
      const view = buildPlantQuickStatusView({
        stage: "vegetation",
        timelineItems: [makeItem({ id: "e-oct15-ct", occurredAt: EVENING_CT_ISO })],
      });
      expect(view.lastUpdateLabel).toBe("Last updated October 15, 2026");
      expect(view.compact).toContain("Last updated October 15, 2026");
    });
  });

  it("PlantQuickStatusStrip renders 'Last updated October 15, 2026' (not October 16) in America/Chicago", () => {
    withTimeZone("America/Chicago", () => {
      mockRecentActivity.mockReturnValue({
        data: [
          {
            id: "e-oct15-ct",
            plant_id: PLANT_ID,
            entry_at: EVENING_CT_ISO,
            entry_type: "note",
            note: "Evening check",
            photo_url: null,
            details: null,
          },
        ],
        isLoading: false,
        isPending: false,
        isError: false,
        isFetching: false,
        fetchStatus: "idle",
        refetch: vi.fn(),
      });
      mockAlerts.mockReturnValue({
        rows: [],
        openCount: 0,
        activeCount: 0,
        status: "ok",
      });
      mockActions.mockReturnValue({
        rows: [],
        isLoading: false,
      });

      render(
        <PlantQuickStatusStrip
          plantId={PLANT_ID}
          plantStartedAt={PLANT_STARTED}
          stage="vegetation"
          tentId="tent-1"
          growId="grow-1"
        />,
      );

      const lastUpdateEl = screen.getByTestId("plant-quick-status-last-update");
      expect(lastUpdateEl).toHaveTextContent("Last updated October 15, 2026");
      expect(lastUpdateEl).not.toHaveTextContent("October 16, 2026");
    });
  });

  it("PlantRelativeTimelineSection header renders 'Last updated October 15, 2026' in America/Chicago", () => {
    withTimeZone("America/Chicago", () => {
      mockTimelineHistory.mockReturnValue({
        data: [
          {
            id: "e-oct15-ct",
            plant_id: PLANT_ID,
            entry_at: EVENING_CT_ISO,
            entry_type: "note",
            note: "Evening check",
            photo_url: null,
            details: null,
          },
        ],
        totalCount: 1,
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

      render(
        <PlantRelativeTimelineSection
          plantId={PLANT_ID}
          plantStartedAt={PLANT_STARTED}
          currentStage="vegetation"
        />,
      );

      const headerLastUpdated = screen.getByTestId("relative-timeline-header-last-updated");
      expect(headerLastUpdated).toHaveTextContent("Last updated October 15, 2026");
      expect(headerLastUpdated).not.toHaveTextContent("October 16, 2026");
    });
  });
});
