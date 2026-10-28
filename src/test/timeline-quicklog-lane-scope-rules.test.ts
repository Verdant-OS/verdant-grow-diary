/**
 * Pure scope helper for Timeline Quick Log history lanes (filming bug #3).
 * Matches plant/tent id logic in `timelineEvidenceRowMatches`.
 */
import { describe, expect, it } from "vitest";
import { scopeTimelineQuickLogLaneRows } from "@/lib/timelineQuickLogLaneScopeRules";

const PLANT_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const PLANT_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const TENT_1 = "cccccccc-0000-4000-8000-000000000001";
const TENT_2 = "cccccccc-0000-4000-8000-000000000002";

function row(id: string, plant_id: string | null, tent_id: string | null) {
  return { id, plant_id, tent_id };
}

const ROWS = [
  row("a", PLANT_A, TENT_1),
  row("b", PLANT_B, TENT_2),
  row("orphan-plant", null, TENT_1),
  row("orphan-tent", PLANT_A, null),
] as const;

describe("scopeTimelineQuickLogLaneRows", () => {
  it("returns a shallow copy when no plant or tent scope is set", () => {
    const out = scopeTimelineQuickLogLaneRows(ROWS, {});
    expect(out).toEqual([...ROWS]);
    expect(out).not.toBe(ROWS);
  });

  it("treats whitespace-only scope as no filter", () => {
    expect(scopeTimelineQuickLogLaneRows(ROWS, { plantId: "  ", tentId: "\t" })).toEqual([...ROWS]);
  });

  it("filters by trimmed plant id with exact match", () => {
    expect(
      scopeTimelineQuickLogLaneRows(ROWS, { plantId: `  ${PLANT_A}  ` }).map((r) => r.id),
    ).toEqual(["a", "orphan-tent"]);
  });

  it("filters by trimmed tent id with exact match", () => {
    expect(scopeTimelineQuickLogLaneRows(ROWS, { tentId: TENT_2 }).map((r) => r.id)).toEqual(["b"]);
  });

  it("requires both plant and tent when both are scoped", () => {
    expect(
      scopeTimelineQuickLogLaneRows(ROWS, { plantId: PLANT_A, tentId: TENT_1 }).map((r) => r.id),
    ).toEqual(["a"]);
    expect(
      scopeTimelineQuickLogLaneRows(ROWS, { plantId: PLANT_A, tentId: TENT_2 }).map((r) => r.id),
    ).toEqual([]);
  });

  it("excludes rows whose plant_id is null when a plant filter is active", () => {
    expect(
      scopeTimelineQuickLogLaneRows(ROWS, { plantId: PLANT_A }).map((r) => r.id),
    ).not.toContain("orphan-plant");
  });

  it("excludes rows whose tent_id is null when a tent filter is active", () => {
    expect(scopeTimelineQuickLogLaneRows(ROWS, { tentId: TENT_1 }).map((r) => r.id)).not.toContain(
      "orphan-tent",
    );
  });
});
