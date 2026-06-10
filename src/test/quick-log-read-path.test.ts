import { describe, it, expect } from "vitest";
import {
  isQuickLogCompanionDiaryRow,
  extractQuickLogCompanionView,
} from "@/lib/quick-log/quickLogDiaryCompanionRules";
import {
  buildQuickLogAiContext,
  dedupeQuickLogCompanionsFromDiary,
} from "@/lib/quick-log/quickLogAiDoctorContextAdapter";

const COMPANION = {
  id: "diary-1",
  entry_at: "2026-06-09T12:00:05Z",
  note: "watered 1L",
  photo_url: null,
  tent_id: "tent-1",
  plant_id: "plant-1",
  details: {
    sensor_snapshot: {
      source: "csv",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: { temperature_c: 24.5, humidity_pct: 55 },
    },
    photo_url: "user-123/grow-abc/123.jpg",
    quick_log_version: 1,
    linked_grow_event_id: "ev-1",
  },
};

describe("quickLogDiaryCompanionRules", () => {
  it("identifies Quick Log companion rows by linked_grow_event_id", () => {
    expect(isQuickLogCompanionDiaryRow(COMPANION)).toBe(true);
    expect(isQuickLogCompanionDiaryRow({ ...COMPANION, details: {} })).toBe(false);
    expect(isQuickLogCompanionDiaryRow(null)).toBe(false);
  });

  it("extracts photo_url and a finite-metric-only snapshot, preserving source/captured_at verbatim", () => {
    const v = extractQuickLogCompanionView(COMPANION)!;
    expect(v.linkedGrowEventId).toBe("ev-1");
    expect(v.photoUrl).toBe("user-123/grow-abc/123.jpg");
    expect(v.sensorSnapshot).toEqual({
      source: "csv",
      capturedAt: "2026-06-09T12:00:00Z",
      metrics: { temperature_c: 24.5, humidity_pct: 55 },
    });
    expect(v.sensorSnapshot!.source).not.toBe("live");
  });

  it("returns sensorSnapshot=null when no usable metrics are present (no fake readings)", () => {
    const v = extractQuickLogCompanionView({
      ...COMPANION,
      details: {
        ...COMPANION.details,
        sensor_snapshot: { source: "csv", captured_at: "x", metrics: {} },
      },
    })!;
    expect(v.sensorSnapshot).toBeNull();
  });

  it("drops non-finite metric values rather than rendering them", () => {
    const v = extractQuickLogCompanionView({
      ...COMPANION,
      details: {
        ...COMPANION.details,
        sensor_snapshot: {
          source: "manual",
          captured_at: "2026-06-09T12:00:00Z",
          metrics: { temperature_c: 24, humidity_pct: "NaN", vpd_kpa: null },
        },
      },
    })!;
    expect(v.sensorSnapshot).toEqual({
      source: "manual",
      capturedAt: "2026-06-09T12:00:00Z",
      metrics: { temperature_c: 24 },
    });
  });
});

const GROW_EVENT_OBSERVE = {
  id: "ev-1",
  occurred_at: "2026-06-09T12:00:05Z",
  event_type: "observation",
  grow_id: "grow-abc",
  tent_id: "tent-1",
  plant_id: null,
  note: "looking healthy",
  is_deleted: false,
};

const GROW_EVENT_WATER = {
  id: "ev-2",
  occurred_at: "2026-06-09T13:00:00Z",
  event_type: "watering",
  grow_id: "grow-abc",
  tent_id: "tent-1",
  plant_id: "plant-1",
  note: null,
  is_deleted: false,
};

describe("buildQuickLogAiContext", () => {
  it("includes a Quick Log observation in the AI context", () => {
    const { entries } = buildQuickLogAiContext({
      growEvents: [GROW_EVENT_OBSERVE],
      diaryRows: [],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      growEventId: "ev-1",
      eventType: "observation",
      note: "looking healthy",
      sensorSnapshot: null,
      sensorSnapshotAbsent: true,
      photoUrl: null,
    });
  });

  it("includes plant-linked watering with tent/plant context", () => {
    const { entries } = buildQuickLogAiContext({
      growEvents: [GROW_EVENT_WATER],
      diaryRows: [],
    });
    expect(entries[0]).toMatchObject({
      growEventId: "ev-2",
      eventType: "watering",
      tentId: "tent-1",
      plantId: "plant-1",
    });
  });

  it("preserves sensor snapshot source/captured_at and never marks it healthy", () => {
    const { entries } = buildQuickLogAiContext({
      growEvents: [GROW_EVENT_OBSERVE],
      diaryRows: [COMPANION],
    });
    expect(entries[0].sensorSnapshot).toEqual({
      source: "csv",
      capturedAt: "2026-06-09T12:00:00Z",
      metrics: { temperature_c: 24.5, humidity_pct: 55 },
    });
    expect(entries[0].sensorSnapshotAbsent).toBe(false);
    // Provenance is preserved — never coerced to "live".
    expect(entries[0].sensorSnapshot!.source).not.toBe("live");
  });

  it("handles missing snapshot conservatively (no fake values)", () => {
    const diary = {
      ...COMPANION,
      details: {
        ...COMPANION.details,
        sensor_snapshot: null,
      },
    };
    const { entries } = buildQuickLogAiContext({
      growEvents: [GROW_EVENT_OBSERVE],
      diaryRows: [diary],
    });
    expect(entries[0].sensorSnapshot).toBeNull();
    expect(entries[0].sensorSnapshotAbsent).toBe(true);
    // No invented metric keys leaked through.
    expect(entries[0]).not.toHaveProperty("temperature_c");
  });

  it("reports companion rows whose parent grow_event is absent as orphans (never silently merged)", () => {
    const { entries, orphanCompanionIds } = buildQuickLogAiContext({
      growEvents: [],
      diaryRows: [COMPANION],
    });
    expect(entries).toEqual([]);
    expect(orphanCompanionIds).toEqual(["diary-1"]);
  });

  it("sorts newest-first with stable id tie-break and respects limit", () => {
    const tieA = { ...GROW_EVENT_OBSERVE, id: "ev-a", occurred_at: "2026-06-09T15:00:00Z" };
    const tieB = { ...GROW_EVENT_OBSERVE, id: "ev-b", occurred_at: "2026-06-09T15:00:00Z" };
    const older = { ...GROW_EVENT_OBSERVE, id: "ev-c", occurred_at: "2026-06-08T15:00:00Z" };
    const { entries } = buildQuickLogAiContext({
      growEvents: [older, tieB, tieA],
      diaryRows: [],
      limit: 2,
    });
    expect(entries.map((e) => e.growEventId)).toEqual(["ev-a", "ev-b"]);
  });

  it("drops soft-deleted grow_events from AI context", () => {
    const { entries } = buildQuickLogAiContext({
      growEvents: [{ ...GROW_EVENT_OBSERVE, is_deleted: true }],
      diaryRows: [],
    });
    expect(entries).toEqual([]);
  });
});

describe("dedupeQuickLogCompanionsFromDiary", () => {
  it("removes companion diary rows that match a grouped grow_event id", () => {
    const otherDiary = {
      id: "diary-2",
      entry_at: "2026-06-09T11:00:00Z",
      details: { observations: "regular diary entry" },
      photo_url: null,
      note: "plain",
      tent_id: "tent-1",
      plant_id: null,
    };
    const result = dedupeQuickLogCompanionsFromDiary(
      [COMPANION, otherDiary],
      ["ev-1"],
    );
    expect(result.map((r) => r.id)).toEqual(["diary-2"]);
  });

  it("keeps companion rows when the parent grow_event was not in the grouped set", () => {
    const result = dedupeQuickLogCompanionsFromDiary([COMPANION], []);
    expect(result).toHaveLength(1);
  });
});
