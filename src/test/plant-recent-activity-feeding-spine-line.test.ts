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
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: () => ({
                  order: () => ({
                    limit: async () => ({ data: backend.diary, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
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
