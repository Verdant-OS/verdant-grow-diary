import { describe, it, expect } from "vitest";
import {
  groupQuickLogTimelineEntries,
  type QuickLogActionEvent,
} from "@/lib/quickLogTimelineGroupingViewModel";
import { QUICK_LOG_TIMELINE_GROUPING_WINDOW_MS } from "@/constants/quickLogTimelineGrouping";
import type { QuickLogV2EnvironmentRow } from "@/lib/quickLogV2ManualSnapshotAdapter";

const TENT_A = "tent-a";
const TENT_B = "tent-b";
const PLANT_1 = "plant-1";
const PLANT_2 = "plant-2";

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function action(
  overrides: Partial<QuickLogActionEvent> & Pick<QuickLogActionEvent, "id" | "kind" | "occurredAt">,
): QuickLogActionEvent {
  return {
    source: "manual",
    plantId: PLANT_1,
    tentId: TENT_A,
    ...overrides,
  };
}

function envRow(
  overrides: Partial<QuickLogV2EnvironmentRow> & Pick<QuickLogV2EnvironmentRow, "id" | "occurred_at">,
): QuickLogV2EnvironmentRow {
  return {
    plant_id: null,
    tent_id: TENT_A,
    event_type: "environment",
    source: "manual",
    environment: { temperature_c: 24, humidity_pct: 55 },
    ...overrides,
  };
}

const T0 = Date.parse("2026-06-02T12:00:00.000Z");

describe("groupQuickLogTimelineEntries — pairing", () => {
  it("groups Water + tent-level env in same tent within window", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [action({ id: "a1", kind: "water", occurredAt: iso(T0), volumeMl: 500 })],
      environmentRows: [envRow({ id: "e1", occurred_at: iso(T0 + 1000) })],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("grouped");
    if (out[0].kind === "grouped") {
      expect(out[0].action.id).toBe("a1");
      expect(out[0].environment.id).toBe("e1");
      expect(out[0].actionSourceLabel).toBe("Manual");
      expect(out[0].environmentSourceLabel).toBe("Manual");
      expect(out[0].environmentCard.sourceLabel).toBe("Manual");
    }
  });

  it("groups Note + tent-level env in same tent within window", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [action({ id: "a1", kind: "note", occurredAt: iso(T0), noteText: "leaves curling" })],
      environmentRows: [envRow({ id: "e1", occurred_at: iso(T0 - 1500) })],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("grouped");
  });

  it("groups plant-scoped env with same plant only", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [action({ id: "a1", kind: "water", occurredAt: iso(T0) })],
      environmentRows: [envRow({ id: "e1", occurred_at: iso(T0 + 500), plant_id: PLANT_1 })],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(out[0].kind).toBe("grouped");
  });

  it("does not group another plant's plant-scoped env in same tent", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [action({ id: "a1", kind: "water", occurredAt: iso(T0) })],
      environmentRows: [envRow({ id: "e1", occurred_at: iso(T0 + 500), plant_id: PLANT_2 })],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    // env is excluded by scope filter → action standalone, env not rendered
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("action");
  });

  it("does not group across tents", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [action({ id: "a1", kind: "water", occurredAt: iso(T0) })],
      environmentRows: [envRow({ id: "e1", occurred_at: iso(T0), tent_id: TENT_B })],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("action");
  });

  it("does not group when outside window", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [action({ id: "a1", kind: "water", occurredAt: iso(T0) })],
      environmentRows: [
        envRow({ id: "e1", occurred_at: iso(T0 + QUICK_LOG_TIMELINE_GROUPING_WINDOW_MS + 1) }),
      ],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.kind).sort()).toEqual(["action", "environment"]);
  });

  it("renders standalone env when no eligible action exists", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [],
      environmentRows: [envRow({ id: "e1", occurred_at: iso(T0) })],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("environment");
  });

  it("does not mutate inputs", () => {
    const actions = [action({ id: "a1", kind: "water", occurredAt: iso(T0) })];
    const rows = [envRow({ id: "e1", occurred_at: iso(T0) })];
    const snapshot = JSON.stringify({ actions, rows });
    groupQuickLogTimelineEntries({
      actions,
      environmentRows: rows,
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(JSON.stringify({ actions, rows })).toBe(snapshot);
  });

  it("orders newest first deterministically", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [
        action({ id: "a1", kind: "water", occurredAt: iso(T0) }),
        action({ id: "a2", kind: "note", occurredAt: iso(T0 + 60_000) }),
      ],
      environmentRows: [],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(out.map((e) => (e.kind === "action" ? e.action.id : ""))).toEqual([
      "a2",
      "a1",
    ]);
  });

  it("two QuickLog saves in window produce two correctly paired cards", () => {
    // Save 1 at T0: water + env. Save 2 at T0+200ms: note + env.
    // Mutual nearest neighbour → each action pairs with its own env.
    const out = groupQuickLogTimelineEntries({
      actions: [
        action({ id: "a-water", kind: "water", occurredAt: iso(T0) }),
        action({ id: "a-note", kind: "note", occurredAt: iso(T0 + 200) }),
      ],
      environmentRows: [
        envRow({ id: "e-water", occurred_at: iso(T0 + 10) }),
        envRow({ id: "e-note", occurred_at: iso(T0 + 210) }),
      ],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    const grouped = out.filter((e) => e.kind === "grouped");
    expect(grouped).toHaveLength(2);
    const pairs = grouped.map((e) =>
      e.kind === "grouped" ? `${e.action.id}|${e.environment.id}` : "",
    );
    expect(pairs.sort()).toEqual(["a-note|e-note", "a-water|e-water"]);
  });

  it("one env + two actions does not duplicate env across both cards", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [
        action({ id: "a1", kind: "water", occurredAt: iso(T0) }),
        action({ id: "a2", kind: "note", occurredAt: iso(T0 + 200) }),
      ],
      environmentRows: [envRow({ id: "e1", occurred_at: iso(T0 + 50) })],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    // env is unambiguously nearest a1 → group(a1,e1); a2 standalone.
    const grouped = out.filter((e) => e.kind === "grouped");
    expect(grouped).toHaveLength(1);
    if (grouped[0].kind === "grouped") {
      expect(grouped[0].action.id).toBe("a1");
      expect(grouped[0].environment.id).toBe("e1");
    }
    // env must NOT also appear standalone.
    const envEntries = out.filter((e) => e.kind === "environment");
    expect(envEntries).toHaveLength(0);
  });

  it("ambiguous equidistant env between two actions → no grouping", () => {
    // env exactly between two actions → mutual nearest tie → both standalone.
    const out = groupQuickLogTimelineEntries({
      actions: [
        action({ id: "a1", kind: "water", occurredAt: iso(T0) }),
        action({ id: "a2", kind: "note", occurredAt: iso(T0 + 1000) }),
      ],
      environmentRows: [envRow({ id: "e1", occurred_at: iso(T0 + 500) })],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(out.filter((e) => e.kind === "grouped")).toHaveLength(0);
    expect(out.filter((e) => e.kind === "environment")).toHaveLength(1);
    expect(out.filter((e) => e.kind === "action")).toHaveLength(2);
  });

  it("grouped card preserves invalid telemetry severity (not shown as healthy)", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [action({ id: "a1", kind: "water", occurredAt: iso(T0) })],
      environmentRows: [
        envRow({
          id: "e1",
          occurred_at: iso(T0 + 100),
          // Out-of-range humidity → invalid
          environment: { temperature_c: 24, humidity_pct: 250 },
        }),
      ],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("grouped");
    if (out[0].kind === "grouped") {
      expect(out[0].environmentCard.severity).not.toBe("ok");
      expect(
        out[0].environmentCard.errors.length +
          out[0].environmentCard.warnings.length,
      ).toBeGreaterThan(0);
    }
  });

  it("grouped card includes action details and env values", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [
        action({
          id: "a1",
          kind: "water",
          occurredAt: iso(T0),
          volumeMl: 750,
          noteText: "ph 6.2",
        }),
      ],
      environmentRows: [envRow({ id: "e1", occurred_at: iso(T0) })],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    expect(out[0].kind).toBe("grouped");
    if (out[0].kind === "grouped") {
      expect(out[0].action.volumeMl).toBe(750);
      expect(out[0].action.noteText).toBe("ph 6.2");
      expect(out[0].environmentCard.readings.length).toBeGreaterThan(0);
    }
  });

  it("grouping window constant is single-digit seconds", () => {
    expect(QUICK_LOG_TIMELINE_GROUPING_WINDOW_MS).toBeLessThan(10_000);
    expect(QUICK_LOG_TIMELINE_GROUPING_WINDOW_MS).toBeGreaterThan(0);
  });

  it("non-manual action source is never grouped", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [action({ id: "a1", kind: "water", occurredAt: iso(T0), source: "bridge" })],
      environmentRows: [envRow({ id: "e1", occurred_at: iso(T0) })],
      scope: { kind: "plant", plantId: PLANT_1, tentId: TENT_A },
    });
    // bridge action filtered out → env standalone
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("environment");
  });
});
