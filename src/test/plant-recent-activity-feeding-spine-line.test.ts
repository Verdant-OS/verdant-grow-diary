/**
 * Regression: untyped Quick Log feeding mirrors recover both event_type and
 * nutrient line from grow_events.feeding_events (line_id, then nutrient_brand).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { buildPlantRecentActivityRecap } from "@/lib/plantRecentActivityRecap";
import { enrichPlantFeedingDiaryRows } from "@/lib/plantFeedingDisplayRules";

const PLANT = "33333333-3333-4333-8333-333333333333";
const SPINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function feedingMirror() {
  return {
    id: "d-feed",
    plant_id: PLANT,
    note: "(quick log)",
    entry_at: "2026-10-16T08:00:00.000Z",
    created_at: "2026-10-16T08:00:01.000Z",
    details: { linked_grow_event_id: SPINE },
  };
}

function recapSummary(rows: readonly unknown[]) {
  const enriched = enrichPlantFeedingDiaryRows(rows);
  return buildPlantRecentActivityRecap({
    rows: buildPlantRecentActivity(enriched, { plantId: PLANT, limit: 5 }),
  }).map((item) => item.summary);
}

const backend = vi.hoisted(() => ({
  diary: [] as unknown[],
  spine: [] as unknown[],
}));

vi.mock("@/lib/quick-log/retractionFilterCompat", () => ({
  selectWithRetractionCompat: (build: (withFilter: boolean) => unknown) => build(false),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "diary_entries") {
        // Fluent double shared by Recent activity (3 orders) and the full
        // Relative Timeline page fetch (2 orders, exact count).
        const chain: Record<string, unknown> = {};
        chain.eq = () => chain;
        chain.order = () => chain;
        chain.limit = async () => ({
          data: backend.diary,
          error: null,
          count: backend.diary.length,
        });
        return { select: () => chain };
      }
      if (table === "grow_events") {
        return {
          select: () => ({
            in: async () => ({ data: backend.spine, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

beforeEach(() => {
  backend.diary = [];
  backend.spine = [];
});

describe("fetchPlantRecentActivityRows — feeding spine nutrient line", () => {
  it("prefers feeding_events.line_id and surfaces the line name after enrichment", async () => {
    const { fetchPlantRecentActivityRows } = await import("@/hooks/usePlantRecentActivity");
    backend.diary = [feedingMirror()];
    backend.spine = [
      {
        id: SPINE,
        event_type: "feeding",
        feeding_events: [{ line_id: "Flora Series", nutrient_brand: "Other Brand" }],
      },
    ];
    const rows = await fetchPlantRecentActivityRows(PLANT);
    const details = rows[0]?.details as Record<string, unknown>;
    expect(details.event_type).toBe("feeding");
    expect(details.line_id).toBe("Flora Series");
    expect(recapSummary(rows)).toEqual(["Flora Series"]);
  });

  it("falls back to nutrient_brand when line_id is blank", async () => {
    const { fetchPlantRecentActivityRows } = await import("@/hooks/usePlantRecentActivity");
    backend.diary = [feedingMirror()];
    backend.spine = [
      {
        id: SPINE,
        event_type: "feeding",
        feeding_events: { line_id: "  ", nutrient_brand: "General Hydroponics" },
      },
    ];
    const rows = await fetchPlantRecentActivityRows(PLANT);
    const details = rows[0]?.details as Record<string, unknown>;
    expect(details.line_id).toBe("General Hydroponics");
    expect(recapSummary(rows)).toEqual(["General Hydroponics"]);
  });
});

describe("fetchPlantRelativeHistoryPage — feeding spine nutrient line", () => {
  it("resolves an untyped linked mirror's feeding type and line before enrichment", async () => {
    // Codex P2 at 1a1985f3: the full Relative Timeline never ran the spine
    // lookup, so this mirror stayed a Note showing "(quick log)".
    const { fetchPlantRelativeHistoryPage } =
      await import("@/hooks/usePlantRelativeTimelineHistory");
    backend.diary = [feedingMirror()];
    backend.spine = [
      {
        id: SPINE,
        event_type: "feeding",
        feeding_events: [{ line_id: "Flora Series", nutrient_brand: null }],
      },
    ];
    const page = await fetchPlantRelativeHistoryPage(PLANT, null);
    const details = page.rows[0]?.details as Record<string, unknown>;
    expect(details.event_type).toBe("feeding");
    expect(details.line_id).toBe("Flora Series");
    expect(page.totalCount).toBe(1);
    expect(recapSummary(page.rows)).toEqual(["Flora Series"]);
  });
});
