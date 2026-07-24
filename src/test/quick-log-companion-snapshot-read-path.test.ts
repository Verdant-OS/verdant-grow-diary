import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateAiDoctorContextFromSources } from "@/lib/aiDoctorContextViewModel";
import {
  attachQuickLogCompanionSnapshots,
  buildTimelineMemoryDisplayItems,
  selectQuickLogCompanionLinkedGrowEventIds,
  type QuickLogCompanionSnapshotDiaryRow,
} from "@/lib/quickLogCompanionSnapshotReadModel";
import {
  groupQuickLogTimelineEntries,
  type QuickLogActionEvent,
  type QuickLogTimelineEntry,
} from "@/lib/quickLogTimelineGroupingViewModel";
import type { QuickLogV2EnvironmentRow } from "@/lib/quickLogV2ManualSnapshotAdapter";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";

const PLANT_ID = "plant-1";
const OTHER_PLANT_ID = "plant-2";
const TENT_ID = "tent-1";
const OTHER_TENT_ID = "tent-2";
const ACTION_AT = "2026-07-19T12:00:00.000Z";
const SNAPSHOT_AT = "2026-07-18T03:00:00.000Z";

function action(overrides: Partial<QuickLogActionEvent> = {}): QuickLogActionEvent {
  return {
    id: "water-1",
    kind: "water",
    source: "manual",
    plantId: PLANT_ID,
    tentId: TENT_ID,
    occurredAt: ACTION_AT,
    volumeMl: 500,
    noteText: null,
    ...overrides,
  };
}

function actionEntries(actions: QuickLogActionEvent[]): QuickLogTimelineEntry[] {
  return groupQuickLogTimelineEntries({
    actions,
    environmentRows: [],
    scope: { kind: "plant", plantId: PLANT_ID, tentId: TENT_ID },
  });
}

function companion(
  overrides: Partial<QuickLogCompanionSnapshotDiaryRow> & {
    details?: Record<string, unknown>;
  } = {},
): QuickLogCompanionSnapshotDiaryRow {
  return {
    id: "diary-1",
    entry_at: ACTION_AT,
    plant_id: PLANT_ID,
    tent_id: TENT_ID,
    note: null,
    photo_url: null,
    details: {
      linked_grow_event_id: "water-1",
      sensor_snapshot: {
        source: "manual",
        captured_at: SNAPSHOT_AT,
        metrics: {
          temperature_c: 24,
          humidity_pct: 55,
          vpd_kpa: 1.1,
        },
      },
    },
    ...overrides,
  };
}

describe("Quick Log companion snapshot read model", () => {
  it("attaches a manual snapshot by exact action id even when timestamps are far apart", () => {
    const result = attachQuickLogCompanionSnapshots(actionEntries([action()]), [companion()], {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].kind).toBe("grouped");
    if (result.entries[0].kind !== "grouped") return;
    expect(result.entries[0].action.id).toBe("water-1");
    expect(result.entries[0].environment.id).toBe("diary-1");
    expect(result.entries[0].environment.occurred_at).toBe(SNAPSHOT_AT);
    expect(result.entries[0].environment.source).toBe("manual");
    expect(result.entries[0].environmentCard.sourceLabel).toBe("Manual");
    expect(result.entries[0].environmentCard.readings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "air_temp_c", value: 24 }),
        expect.objectContaining({ field: "humidity_pct", value: 55 }),
        expect.objectContaining({ field: "vpd_kpa", value: 1.1 }),
      ]),
    );
    expect(result.companionItems).toHaveLength(1);
    expect(result.companionItems[0].kind).toBe("manual_sensor_snapshot");
  });

  it.each(["csv", "live", "demo", "stale", "invalid", undefined])(
    "rejects source=%s instead of relabeling it manual",
    (source) => {
      const row = companion({
        details: {
          linked_grow_event_id: "water-1",
          sensor_snapshot: {
            source,
            captured_at: SNAPSHOT_AT,
            metrics: { temperature_c: 24 },
          },
        },
      });
      const result = attachQuickLogCompanionSnapshots(actionEntries([action()]), [row], {
        kind: "plant",
        plantId: PLANT_ID,
        tentId: TENT_ID,
      });
      expect(result.entries[0].kind).toBe("action");
      expect(result.companionItems).toEqual([]);
    },
  );

  it.each([
    ["empty", {}],
    ["non-numeric", { temperature_c: "24", humidity_pct: null }],
    ["non-finite", { temperature_c: Number.NaN, humidity_pct: Number.POSITIVE_INFINITY }],
    ["unsupported-only", { co2_ppm: 800 }],
  ])("skips %s metrics without inventing a card", (_label, metrics) => {
    const row = companion({
      details: {
        linked_grow_event_id: "water-1",
        sensor_snapshot: {
          source: "manual",
          captured_at: SNAPSHOT_AT,
          metrics,
        },
      },
    });
    const result = attachQuickLogCompanionSnapshots(actionEntries([action()]), [row], {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });
    expect(result.entries[0].kind).toBe("action");
    expect(result.companionItems).toEqual([]);
  });

  it("skips malformed capture time", () => {
    const row = companion({
      details: {
        linked_grow_event_id: "water-1",
        sensor_snapshot: {
          source: "manual",
          captured_at: "not-a-date",
          metrics: { temperature_c: 24 },
        },
      },
    });
    const result = attachQuickLogCompanionSnapshots(actionEntries([action()]), [row], {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });
    expect(result.entries[0].kind).toBe("action");
  });

  it("rejects the wrong linked action id and wrong plant/tent scope", () => {
    const rows = [
      companion({
        id: "wrong-id",
        details: {
          ...(companion().details as Record<string, unknown>),
          linked_grow_event_id: "water-other",
        },
      }),
      companion({ id: "wrong-plant", plant_id: OTHER_PLANT_ID }),
      companion({ id: "wrong-tent", tent_id: OTHER_TENT_ID }),
    ];
    const result = attachQuickLogCompanionSnapshots(actionEntries([action()]), rows, {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].kind).toBe("action");
    expect(result.companionItems).toEqual([]);
  });

  it("leaves an already-grouped legacy sibling environment event unchanged", () => {
    const legacyEnvironment: QuickLogV2EnvironmentRow = {
      id: "legacy-environment-1",
      plant_id: PLANT_ID,
      tent_id: TENT_ID,
      occurred_at: ACTION_AT,
      event_type: "environment",
      source: "manual",
      environment: { temperature_c: 23, humidity_pct: 50, vpd_kpa: 0.9 },
    };
    const grouped = groupQuickLogTimelineEntries({
      actions: [action()],
      environmentRows: [legacyEnvironment],
      scope: { kind: "plant", plantId: PLANT_ID, tentId: TENT_ID },
    });
    const result = attachQuickLogCompanionSnapshots(
      grouped,
      [companion()],
      { kind: "plant", plantId: PLANT_ID, tentId: TENT_ID },
      [action()],
    );

    expect(result.entries).toEqual(grouped);
    expect(result.entries[0].kind).toBe("grouped");
    if (result.entries[0].kind === "grouped") {
      expect(result.entries[0].environment.id).toBe("legacy-environment-1");
    }
    expect(result.companionItems).toEqual([]);
  });

  it("projects a verified tent-target companion as standalone plant environment evidence", () => {
    const tentAction = action({ id: "tent-water", plantId: null });
    const row = companion({
      id: "tent-diary",
      plant_id: null,
      details: {
        ...(companion().details as Record<string, unknown>),
        linked_grow_event_id: "tent-water",
      },
    });
    const baseEntries = actionEntries([tentAction]);
    expect(baseEntries).toEqual([]);

    const result = attachQuickLogCompanionSnapshots(
      baseEntries,
      [row],
      { kind: "plant", plantId: PLANT_ID, tentId: TENT_ID },
      [tentAction],
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].kind).toBe("environment");
    if (result.entries[0].kind === "environment") {
      expect(result.entries[0].environment.id).toBe("tent-diary");
      expect(result.entries[0].environmentCard.isTentLevel).toBe(true);
    }
    expect(result.companionItems).toHaveLength(1);

    const wrongParent = attachQuickLogCompanionSnapshots(
      baseEntries,
      [row],
      { kind: "plant", plantId: PLANT_ID, tentId: TENT_ID },
      [action({ id: "other-tent-water", plantId: null })],
    );
    expect(wrongParent.entries).toEqual([]);
    expect(wrongParent.companionItems).toEqual([]);
  });

  it("selects duplicate exact-link candidates deterministically without mutating inputs", () => {
    const older = companion({
      id: "diary-z",
      details: {
        ...(companion().details as Record<string, unknown>),
        sensor_snapshot: {
          source: "manual",
          captured_at: "2026-07-18T01:00:00.000Z",
          metrics: { temperature_c: 21 },
        },
      },
    });
    const newer = companion({
      id: "diary-a",
      details: {
        ...(companion().details as Record<string, unknown>),
        sensor_snapshot: {
          source: "manual",
          captured_at: "2026-07-18T02:00:00.000Z",
          metrics: { temperature_c: 25 },
        },
      },
    });
    const entries = actionEntries([action()]);
    const before = JSON.stringify({ entries, older, newer });
    const first = attachQuickLogCompanionSnapshots(entries, [older, newer], {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });
    const second = attachQuickLogCompanionSnapshots(entries, [newer, older], {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });

    expect(first).toEqual(second);
    expect(first.companionItems[0].key).toBe("diary-a");
    expect(JSON.stringify({ entries, older, newer })).toBe(before);
  });

  it("selects exact eligible parent ids deterministically for bounded verification", () => {
    const rowB = companion({
      id: "diary-b",
      details: {
        ...(companion().details as Record<string, unknown>),
        linked_grow_event_id: "water-b",
      },
    });
    const rowA = companion({
      id: "diary-a",
      details: {
        ...(companion().details as Record<string, unknown>),
        linked_grow_event_id: "water-a",
      },
    });
    const invalid = companion({
      id: "invalid-source",
      details: {
        linked_grow_event_id: "water-invalid",
        sensor_snapshot: {
          source: "live",
          captured_at: SNAPSHOT_AT,
          metrics: { temperature_c: 24 },
        },
      },
    });
    const rows = [rowB, invalid, rowA, rowB];
    const before = JSON.stringify(rows);

    expect(selectQuickLogCompanionLinkedGrowEventIds(rows)).toEqual(["water-a", "water-b"]);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("feeds the projected manual companion into AI Doctor readiness", () => {
    const { companionItems } = attachQuickLogCompanionSnapshots(
      actionEntries([action()]),
      [companion()],
      { kind: "plant", plantId: PLANT_ID, tentId: TENT_ID },
    );
    const readiness = evaluateAiDoctorContextFromSources({
      plant: { id: PLANT_ID, stage: "veg", strain: "NL", medium: "coco" },
      timelineItems: companionItems,
      now: Date.parse("2026-07-18T04:00:00.000Z"),
    });
    expect(readiness.counts.recentManualSnapshots).toBe(1);
    expect(readiness.evidence).toContain("recent-manual-sensor-snapshot");
    expect(readiness.missing).not.toContain("recent-manual-sensor-snapshot");
  });

  it("hides only the exact companion card owned by the grouped timeline", () => {
    const projection = attachQuickLogCompanionSnapshots(actionEntries([action()]), [companion()], {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });
    const base: TimelineMemoryItem[] = [
      {
        kind: "diary",
        key: "ordinary-note",
        occurredAt: "2026-07-19T13:00:00.000Z",
        eventType: "note",
        hasPhoto: false,
        note: "Checked roots.",
      },
    ];

    expect(
      buildTimelineMemoryDisplayItems(base, projection.companionItems, projection.entries),
    ).toEqual(base);
  });

  it("keeps unowned companion evidence visible deterministically without mutation", () => {
    const projection = attachQuickLogCompanionSnapshots(actionEntries([action()]), [companion()], {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });
    const base: TimelineMemoryItem[] = [
      {
        kind: "diary",
        key: "older-note",
        occurredAt: "2026-07-17T13:00:00.000Z",
        eventType: "note",
        hasPhoto: false,
        note: "Root-zone check.",
      },
    ];
    const before = JSON.stringify({ base, companions: projection.companionItems });
    const first = buildTimelineMemoryDisplayItems(base, projection.companionItems, []);
    const second = buildTimelineMemoryDisplayItems(base, projection.companionItems, []);

    expect(first.map((item) => item.key)).toEqual(["diary-1", "older-note"]);
    expect(second).toEqual(first);
    expect(JSON.stringify({ base, companions: projection.companionItems })).toBe(before);
  });
});

describe("Quick Log companion snapshot static safety", () => {
  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const read = (relativePath: string): string =>
    stripComments(readFileSync(resolve(process.cwd(), relativePath), "utf8"));
  const files = [
    "src/lib/quickLogCompanionSnapshotReadModel.ts",
    "src/hooks/useQuickLogGroupedTimeline.ts",
    "src/hooks/useTimelineMemory.ts",
  ];

  it("keeps the restoration read-only and schema-free", () => {
    for (const file of files) {
      const source = read(file);
      for (const forbidden of [
        ".insert(",
        ".upsert(",
        ".update(",
        ".delete(",
        ".rpc(",
        "functions.invoke",
        "service_role",
        "CREATE TABLE",
        "ALTER TABLE",
      ]) {
        expect(source, `${file}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("keeps companion fetch under the established grouped timeline query", () => {
    const hook = read("src/hooks/useQuickLogGroupedTimeline.ts");
    expect(hook).toContain('"quick_log_grouped_timeline"');
    expect(hook).toContain("Promise.all([");
    expect(hook).toContain("fetchQuickLogCompanionRows(scope, limit)");
    expect(hook).not.toContain("quick_log_grouped_timeline__companions");
  });

  it("keeps the pure projector free of React, Supabase, and I/O imports", () => {
    const helper = read("src/lib/quickLogCompanionSnapshotReadModel.ts");
    expect(helper).not.toMatch(/from\s+["']react["']/);
    expect(helper).not.toMatch(/@\/integrations\/supabase/);
    expect(helper).not.toMatch(/node:fs|node:path/);
  });
});
