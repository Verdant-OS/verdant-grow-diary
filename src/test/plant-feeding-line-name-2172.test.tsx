import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const useRecentMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/usePlantRecentActivity")>();
  return {
    ...actual,
    usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
  };
});

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

import PlantDetailRecentActivityRecap from "@/components/PlantDetailRecentActivityRecap";
import PlantRecentActivityPanel from "@/components/PlantRecentActivityPanel";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { buildPlantRecentActivityRecap } from "@/lib/plantRecentActivityRecap";
import { resolvePlantLastActivitySummary } from "@/lib/plantLastActivityRules";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import { buildFeedingHistory } from "@/lib/feedingHistoryRules";
import { applyLinkedEventTypes } from "@/lib/diaryLinkedEventTypeRules";

const PLANT_ID = "33333333-3333-4333-8333-333333333333";
const SPINE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SPINE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function quickLogFeedingDiaryRow(opts: {
  id: string;
  lineId: string;
  entryAt: string;
  note?: string;
  volumeMl?: number;
  ph?: number;
  ecIn?: number;
}) {
  return {
    id: opts.id,
    plant_id: PLANT_ID,
    tent_id: "tent-1",
    grow_id: "grow-1",
    note: opts.note ?? "(quick log)",
    entry_at: opts.entryAt,
    created_at: opts.entryAt,
    details: {
      event_type: "feeding",
      feeding: {
        line_id: opts.lineId,
        products: [{ name: "Micro", amount: 2, unit: "ml/L" }],
        volume_ml: opts.volumeMl ?? 1000,
        ...(opts.ph !== undefined ? { ph: opts.ph } : {}),
        ...(opts.ecIn !== undefined ? { ec_in: opts.ecIn } : {}),
      },
      quick_log_version: 2,
      linked_grow_event_id: opts.id === "feed-a" ? SPINE_A : SPINE_B,
    },
  };
}

describe("Issue #2172 part 2 — plant-page feedings show the nutrient line name instead of '(quick log)'", () => {
  beforeEach(() => {
    useRecentMock.mockReset();
  });

  it("renders the nutrient line names for consecutive Quick Log feedings in PlantDetailRecentActivityRecap instead of 'FEEDING (quick log)'", () => {
    const nowIso = new Date().toISOString();
    const earlierIso = new Date(Date.now() - 60_000).toISOString();
    useRecentMock.mockReturnValue({
      data: [
        quickLogFeedingDiaryRow({
          id: "feed-b",
          lineId: "Cronk Bonnie & Clyde",
          entryAt: nowIso,
        }),
        quickLogFeedingDiaryRow({
          id: "feed-a",
          lineId: "Flora Series",
          entryAt: earlierIso,
        }),
      ],
      isLoading: false,
      isPending: false,
      isError: false,
      isFetching: false,
      fetchStatus: "idle",
      refetch: vi.fn(),
    });

    render(<PlantDetailRecentActivityRecap plantId={PLANT_ID} />);

    const items = screen.getAllByTestId("plant-detail-recent-activity-recap-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Feeding");
    expect(items[0]).toHaveTextContent("Cronk Bonnie & Clyde");
    expect(items[0]).not.toHaveTextContent("(quick log)");
    expect(items[1]).toHaveTextContent("Feeding");
    expect(items[1]).toHaveTextContent("Flora Series");
    expect(items[1]).not.toHaveTextContent("(quick log)");
  });

  it("keeps both the nutrient line name and a custom grower note when both are present", () => {
    const nowIso = new Date().toISOString();
    useRecentMock.mockReturnValue({
      data: [
        quickLogFeedingDiaryRow({
          id: "feed-note",
          lineId: "Athena Pro",
          entryAt: nowIso,
          note: "Half strength feed",
        }),
      ],
      isLoading: false,
      isPending: false,
      isError: false,
      isFetching: false,
      fetchStatus: "idle",
      refetch: vi.fn(),
    });

    render(<PlantDetailRecentActivityRecap plantId={PLANT_ID} />);

    const item = screen.getByTestId("plant-detail-recent-activity-recap-item");
    expect(item).toHaveTextContent("Athena Pro");
    expect(item).toHaveTextContent("Half strength feed");
  });

  it("strips the '(quick log)' placeholder in buildPlantRecentActivityRecap and falls back to structured summary", () => {
    const rows = buildPlantRecentActivity(
      [
        {
          id: "feed-no-line",
          plant_id: PLANT_ID,
          note: "(quick log)",
          entry_at: "2026-10-16T10:00:00.000Z",
          details: {
            event_type: "feeding",
            ec: 1.4,
            ph: 6.1,
            watering_amount_ml: 750,
          },
        },
      ],
      { plantId: PLANT_ID },
    );

    const recap = buildPlantRecentActivityRecap({ rows });
    expect(recap).toHaveLength(1);
    expect(recap[0].categoryLabel).toBe("Feeding");
    expect(recap[0].summary).toBe("EC 1.4 · pH 6.1 · 750 ml");
    expect(recap[0].summary).not.toContain("(quick log)");
  });

  it("surfaces the nutrient line name in PlantRecentActivityPanel and hides '(quick log)'", () => {
    const nowIso = new Date().toISOString();
    useRecentMock.mockReturnValue({
      data: [
        quickLogFeedingDiaryRow({
          id: "feed-panel",
          lineId: "Cronk Bonnie & Clyde",
          entryAt: nowIso,
          volumeMl: 1000,
          ph: 6.2,
          ecIn: 1.4,
        }),
      ],
      isLoading: false,
      isPending: false,
      isError: false,
      isFetching: false,
      fetchStatus: "idle",
      refetch: vi.fn(),
    });

    render(<PlantRecentActivityPanel plantId={PLANT_ID} plantName="Blue Dream" />);

    const row = screen.getByTestId("plant-recent-activity-row");
    expect(row).toHaveTextContent("Cronk Bonnie & Clyde");
    expect(row).not.toHaveTextContent("(quick log)");
    // Codex P2 at 1a1985f3: the line name renders once, not as note and badge.
    expect(row.textContent?.split("Cronk Bonnie & Clyde").length).toBe(2);
  });

  it("resolves Plant Detail Last activity summary with the nutrient line name instead of '(quick log)'", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");
    const summary = resolvePlantLastActivitySummary({
      status: "ready",
      rows: [
        quickLogFeedingDiaryRow({
          id: "feed-last",
          lineId: "Cronk Bonnie & Clyde",
          entryAt: "2026-10-16T11:30:00.000Z",
        }),
      ],
      now,
    });

    expect(summary).toEqual({
      eventType: "feeding",
      text: "Cronk Bonnie & Clyde",
    });
  });

  it("extracts recipe, metrics, and products from nested details.feeding in buildFeedingHistory and strips '(quick log)'", () => {
    const raw = quickLogFeedingDiaryRow({
      id: "feed-hist",
      lineId: "Cronk Bonnie & Clyde",
      entryAt: "2026-10-16T11:00:00.000Z",
      volumeMl: 1000,
      ph: 6.2,
      ecIn: 1.4,
    });
    const rows = buildFeedingHistory(normalizeDiaryEntries({ rawEntries: [raw] }));
    expect(rows).toHaveLength(1);
    expect(rows[0].recipe).toBe("Cronk Bonnie & Clyde");
    expect(rows[0].volumeMl).toBe(1000);
    expect(rows[0].ph).toBe(6.2);
    expect(rows[0].ec).toBe(1.4);
    expect(rows[0].nutrients).toEqual([{ name: "Micro", amount: 2, unit: "ml/L" }]);
    expect(rows[0].notePreview).toBe("");
  });

  it("recovers feeding type and nutrient line from linked spine rows when a diary mirror is untyped", () => {
    const untypedMirror = {
      id: "d-mirror",
      plant_id: PLANT_ID,
      note: "(quick log)",
      entry_at: new Date().toISOString(),
      details: { linked_grow_event_id: SPINE_A },
    };
    const resolved = applyLinkedEventTypes(
      [untypedMirror],
      new Map([[SPINE_A, { event_type: "feeding", line_id: "Athena Blended" }]]),
    );
    useRecentMock.mockReturnValue({
      data: resolved,
      isLoading: false,
      isPending: false,
      isError: false,
      isFetching: false,
      fetchStatus: "idle",
      refetch: vi.fn(),
    });

    render(<PlantDetailRecentActivityRecap plantId={PLANT_ID} />);
    const item = screen.getByTestId("plant-detail-recent-activity-recap-item");
    expect(item).toHaveTextContent("Feeding");
    expect(item).toHaveTextContent("Athena Blended");
    expect(item).not.toHaveTextContent("(quick log)");
  });

  it("never surfaces a secret-like string or 'default' placeholder as a nutrient line name", () => {
    const nowIso = new Date().toISOString();
    useRecentMock.mockReturnValue({
      data: [
        quickLogFeedingDiaryRow({
          id: "feed-secret",
          lineId: "service_role=secret-leak",
          entryAt: nowIso,
          ph: 6.0,
        }),
      ],
      isLoading: false,
      isPending: false,
      isError: false,
      isFetching: false,
      fetchStatus: "idle",
      refetch: vi.fn(),
    });

    render(<PlantDetailRecentActivityRecap plantId={PLANT_ID} />);
    const item = screen.getByTestId("plant-detail-recent-activity-recap-item");
    expect(item).not.toHaveTextContent("service_role");
    expect(item).not.toHaveTextContent("(quick log)");
  });
});
