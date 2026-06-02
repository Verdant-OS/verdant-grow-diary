/**
 * manualSensorSnapshotViewModel — pure view-model + timeline projection.
 */
import { describe, it, expect } from "vitest";

import { validateManualSnapshot } from "@/lib/manualSensorSnapshotRules";
import {
  buildManualSnapshotTimelineCard,
  selectManualSnapshotsForTimeline,
  MANUAL_SNAPSHOT_CARD_TITLE,
  MANUAL_SNAPSHOT_SOURCE_LABEL,
  type ManualSnapshotRecord,
} from "@/lib/manualSensorSnapshotViewModel";

function mkRecord(overrides: Partial<ManualSnapshotRecord>): ManualSnapshotRecord {
  const base: ManualSnapshotRecord = {
    id: overrides.id ?? "snap-1",
    capturedAt: overrides.capturedAt ?? "2026-01-01T10:00:00.000Z",
    tentId: overrides.tentId ?? "tent-1",
    plantId: overrides.plantId ?? null,
    notes: overrides.notes ?? null,
    validation:
      overrides.validation ??
      validateManualSnapshot({ airTemp: 75, airTempUnit: "F", humidityPct: 55 }),
  };
  return base;
}

describe("buildManualSnapshotTimelineCard", () => {
  it("renders a manual snapshot card with the source label", () => {
    const card = buildManualSnapshotTimelineCard(mkRecord({}));
    expect(card.title).toBe(MANUAL_SNAPSHOT_CARD_TITLE);
    expect(card.sourceLabel).toBe(MANUAL_SNAPSHOT_SOURCE_LABEL);
    expect(card.source).toBe("manual");
    expect(card.readings.length).toBeGreaterThan(0);
    // Readings sorted by canonical field name.
    const fields = card.readings.map((r) => r.field);
    expect(fields).toEqual([...fields].sort());
  });

  it("never exposes a 'live' label, even as a substring", () => {
    const card = buildManualSnapshotTimelineCard(
      mkRecord({ notes: "  manual handheld read  " }),
    );
    const blob = JSON.stringify(card).toLowerCase();
    expect(blob).not.toMatch(/"live"/);
    expect(blob).not.toMatch(/"synced"/);
    expect(blob).not.toMatch(/"persisted"/);
  });

  it("derives severity from validation (ok / warning / invalid)", () => {
    const okCard = buildManualSnapshotTimelineCard(mkRecord({}));
    expect(okCard.severity).toBe("ok");

    const warnCard = buildManualSnapshotTimelineCard(
      mkRecord({
        validation: validateManualSnapshot({
          airTemp: 24,
          airTempUnit: "F",
          humidityPct: 50,
        }),
      }),
    );
    expect(warnCard.severity).toBe("warning");

    const invalidCard = buildManualSnapshotTimelineCard(
      mkRecord({
        validation: validateManualSnapshot({ humidityPct: 150 }),
      }),
    );
    expect(invalidCard.severity).toBe("invalid");
  });

  it("trims notes and reports null when notes are empty/whitespace", () => {
    expect(buildManualSnapshotTimelineCard(mkRecord({ notes: "   " })).notes).toBe(null);
    expect(buildManualSnapshotTimelineCard(mkRecord({ notes: "  hi " })).notes).toBe("hi");
  });
});

describe("selectManualSnapshotsForTimeline — scoping", () => {
  const records: ManualSnapshotRecord[] = [
    mkRecord({
      id: "a",
      capturedAt: "2026-01-01T10:00:00.000Z",
      tentId: "tent-1",
      plantId: "plant-1",
    }),
    mkRecord({
      id: "b",
      capturedAt: "2026-01-02T10:00:00.000Z",
      tentId: "tent-1",
      plantId: null, // tent-level
    }),
    mkRecord({
      id: "c",
      capturedAt: "2026-01-03T10:00:00.000Z",
      tentId: "tent-2",
      plantId: "plant-9",
    }),
  ];

  it("plant-linked snapshots appear in plant timeline", () => {
    const out = selectManualSnapshotsForTimeline({ records, plantId: "plant-1" });
    expect(out.map((c) => c.id)).toEqual(["a"]);
    expect(out[0].plantId).toBe("plant-1");
    expect(out[0].isTentLevel).toBe(false);
  });

  it("tent-level snapshots appear in tent timeline without requiring plant_id", () => {
    const out = selectManualSnapshotsForTimeline({ records, tentId: "tent-1" });
    // Both 'a' (plant-1 in tent-1) and 'b' (tent-level in tent-1) belong.
    const ids = out.map((c) => c.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).not.toContain("c");
    // Sorted by capturedAt desc.
    expect(out[0].id).toBe("b");
    // Tent-level card flagged.
    expect(out.find((c) => c.id === "b")?.isTentLevel).toBe(true);
  });

  it("can exclude tent-level rows when includeTentLevel=false", () => {
    const out = selectManualSnapshotsForTimeline({
      records,
      tentId: "tent-1",
      includeTentLevel: false,
    });
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });

  it("is deterministic given the same input", () => {
    const a = selectManualSnapshotsForTimeline({ records, tentId: "tent-1" });
    const b = selectManualSnapshotsForTimeline({ records, tentId: "tent-1" });
    expect(a).toEqual(b);
  });
});
