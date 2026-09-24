/**
 * QA 2026-09-24: a Quick Log watering was listed as "NOTE" in Plant Detail's
 * Recent activity. quicklog_save_manual records 'watering' on the grow_events
 * spine but mirrors a diary row with only `linked_grow_event_id` in details,
 * so diary-only readers defaulted it to "note". The recent-activity read now
 * recovers the type from the linked spine row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLinkedEventTypes,
  collectLinkedEventIdsNeedingType,
} from "@/lib/diaryLinkedEventTypeRules";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { buildPlantRecentActivityRecap } from "@/lib/plantRecentActivityRecap";

const PLANT = "33333333-3333-4333-8333-333333333333";
const SPINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SPINE_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** The diary mirror quicklog_save_manual writes for p_action 'water'. */
function waterMirror(details: Record<string, unknown> = { linked_grow_event_id: SPINE }) {
  return {
    id: "d1",
    plant_id: PLANT,
    note: "(quick log)",
    entry_at: "2026-09-24T08:26:00.000Z",
    created_at: "2026-09-24T08:26:01.000Z",
    details,
  };
}

function recapLabels(rows: readonly unknown[]) {
  return buildPlantRecentActivityRecap({
    rows: buildPlantRecentActivity(rows, { plantId: PLANT, limit: 10 }),
  }).map((i) => i.categoryLabel);
}

const backend = vi.hoisted(() => ({
  diary: [] as unknown[],
  spine: [] as unknown[],
  spineError: null as unknown,
  spineThrows: false,
  spineCalls: [] as string[][],
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
              order: () => ({ limit: async () => ({ data: backend.diary, error: null }) }),
            }),
          }),
        };
      }
      if (table === "grow_events") {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => {
              backend.spineCalls.push(ids);
              if (backend.spineThrows) throw new Error("network");
              return { data: backend.spineError ? null : backend.spine, error: backend.spineError };
            },
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
  backend.spineError = null;
  backend.spineThrows = false;
  backend.spineCalls = [];
});

describe("diaryLinkedEventTypeRules", () => {
  it("QA repro: the untyped water mirror reads as Note today and Watering once resolved", () => {
    const rows = [waterMirror()];
    expect(recapLabels(rows)).toEqual(["Note"]);
    expect(collectLinkedEventIdsNeedingType(rows)).toEqual([SPINE]);
    const resolved = applyLinkedEventTypes(rows, new Map([[SPINE, "watering"]]));
    expect(recapLabels(resolved)).toEqual(["Watering"]);
  });

  it("promotes a quick_log wrapper but never overrides a canonical type", () => {
    const wrapper = waterMirror({ event_type: "quick_log", linked_grow_event_id: SPINE });
    const canonical = waterMirror({ event_type: "feeding", linked_grow_event_id: SPINE_2 });
    const topLevel = { ...waterMirror({ linked_grow_event_id: SPINE_2 }), entry_type: "training" };
    expect(collectLinkedEventIdsNeedingType([wrapper, canonical, topLevel])).toEqual([SPINE]);
    const out = applyLinkedEventTypes(
      [wrapper, canonical, topLevel],
      new Map([
        [SPINE, "watering"],
        [SPINE_2, "watering"],
      ]),
    );
    expect(out[0].details.event_type).toBe("watering");
    expect(out[1]).toBe(canonical);
    expect(out[2]).toBe(topLevel);
  });

  it("leaves a real note, an unknown spine type and a missing spine row as Note", () => {
    const rows = [
      waterMirror({ linked_grow_event_id: SPINE }),
      waterMirror({ linked_grow_event_id: SPINE_2 }),
      waterMirror({ linked_grow_event_id: "not-a-uuid" }),
    ];
    expect(collectLinkedEventIdsNeedingType(rows)).toEqual([SPINE, SPINE_2]);
    const out = applyLinkedEventTypes(rows, new Map([[SPINE, "note"]]));
    expect(out).toEqual(rows);
    expect(out[0]).toBe(rows[0]);
  });

  it("dedupes ids and tolerates malformed rows", () => {
    const rows = [waterMirror(), waterMirror(), null, "x", { details: "{}" }];
    expect(collectLinkedEventIdsNeedingType(rows)).toEqual([SPINE]);
    expect(applyLinkedEventTypes(rows, new Map())).toEqual(rows);
  });
});

describe("fetchPlantRecentActivityRows", () => {
  it("resolves the linked watering from grow_events in one lookup", async () => {
    const { fetchPlantRecentActivityRows } = await import("@/hooks/usePlantRecentActivity");
    backend.diary = [waterMirror(), { ...waterMirror(), id: "d2" }];
    backend.spine = [{ id: SPINE, event_type: "watering" }];
    const rows = await fetchPlantRecentActivityRows(PLANT);
    expect(backend.spineCalls).toEqual([[SPINE]]);
    expect(recapLabels(rows)).toEqual(["Watering", "Watering"]);
  });

  it("skips the lookup when every row is already typed", async () => {
    const { fetchPlantRecentActivityRows } = await import("@/hooks/usePlantRecentActivity");
    backend.diary = [waterMirror({ event_type: "watering", linked_grow_event_id: SPINE })];
    await fetchPlantRecentActivityRows(PLANT);
    expect(backend.spineCalls).toEqual([]);
  });

  it("a failed or throwing lookup returns the diary rows exactly as read", async () => {
    const { fetchPlantRecentActivityRows } = await import("@/hooks/usePlantRecentActivity");
    backend.diary = [waterMirror()];
    backend.spineError = { message: "boom" };
    expect(await fetchPlantRecentActivityRows(PLANT)).toEqual(backend.diary);
    backend.spineError = null;
    backend.spineThrows = true;
    expect(await fetchPlantRecentActivityRows(PLANT)).toEqual(backend.diary);
  });
});
