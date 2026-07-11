/**
 * Tests — diaryTimelineViewModel pure rules: deterministic sort,
 * empty-state selection, action labels, and source classification.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DIARY_TIMELINE_EMPTY_TITLE,
  DIARY_TIMELINE_EMPTY_HINT,
  DIARY_TIMELINE_FILTERED_EMPTY_COPY,
  classifyDiaryTimelineSource,
  diaryTimelineActionLabel,
  selectDiaryTimelineEmptyState,
  sortDiaryTimelineEntries,
} from "../lib/diaryTimelineViewModel";

describe("sortDiaryTimelineEntries", () => {
  it("sorts newest-first by occurred_at, then created_at, then id", () => {
    const entries = [
      { id: "b", occurred_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
      { id: "a", occurred_at: "2026-01-02T00:00:00Z", created_at: "2026-01-02T00:00:00Z" },
      { id: "d", occurred_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T01:00:00Z" },
      { id: "c", occurred_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
    ];
    const out = sortDiaryTimelineEntries(entries).map((e) => e.id);
    // a (newest occurred_at), then d (later created_at), then b<c by id.
    expect(out).toEqual(["a", "d", "b", "c"]);
  });

  it("falls back to captured_at when occurred_at is missing", () => {
    const out = sortDiaryTimelineEntries([
      { id: "x", captured_at: "2026-01-01T00:00:00Z" },
      { id: "y", captured_at: "2026-01-03T00:00:00Z" },
    ]).map((e) => e.id);
    expect(out).toEqual(["y", "x"]);
  });

  it("is deterministic on equal timestamps via id tiebreak", () => {
    const ts = "2026-01-01T00:00:00Z";
    const a = sortDiaryTimelineEntries([
      { id: "m", occurred_at: ts, created_at: ts },
      { id: "k", occurred_at: ts, created_at: ts },
      { id: "z", occurred_at: ts, created_at: ts },
    ]).map((e) => e.id);
    expect(a).toEqual(["k", "m", "z"]);
  });

  it("handles null / undefined / invalid input safely", () => {
    expect(sortDiaryTimelineEntries(null)).toEqual([]);
    expect(sortDiaryTimelineEntries(undefined)).toEqual([]);
    const out = sortDiaryTimelineEntries([
      { id: "a", occurred_at: "bad" },
      { id: "b", occurred_at: null, created_at: null },
    ]);
    expect(out.length).toBe(2);
  });

  it("does not mutate the input array", () => {
    const input = [
      { id: "b", occurred_at: "2026-01-01T00:00:00Z" },
      { id: "a", occurred_at: "2026-01-02T00:00:00Z" },
    ];
    const before = input.map((e) => e.id).join(",");
    sortDiaryTimelineEntries(input);
    expect(input.map((e) => e.id).join(",")).toBe(before);
  });
});

describe("selectDiaryTimelineEmptyState", () => {
  it("returns no-history copy when zero entries exist", () => {
    const s = selectDiaryTimelineEmptyState({
      hasAnyEntries: false,
      filtersActive: false,
    });
    expect(s.show).toBe(true);
    expect(s.variant).toBe("no-history");
    expect(s.title).toBe(DIARY_TIMELINE_EMPTY_TITLE);
    expect(s.hint).toBe(DIARY_TIMELINE_EMPTY_HINT);
  });

  it("returns filtered-empty when entries exist but filters hide them", () => {
    const s = selectDiaryTimelineEmptyState({
      hasAnyEntries: true,
      filtersActive: true,
    });
    expect(s.show).toBe(true);
    expect(s.variant).toBe("filtered-empty");
    expect(s.title).toBe(DIARY_TIMELINE_FILTERED_EMPTY_COPY);
    expect(s.hint).toBeNull();
  });

  it("hides empty state when entries exist and no filters", () => {
    const s = selectDiaryTimelineEmptyState({
      hasAnyEntries: true,
      filtersActive: false,
    });
    expect(s.show).toBe(false);
  });
});

describe("diaryTimelineActionLabel", () => {
  it("renders friendly labels for known kinds", () => {
    expect(diaryTimelineActionLabel("observation")).toBe("Diary note");
    expect(diaryTimelineActionLabel("watering")).toBe("Watering");
    expect(diaryTimelineActionLabel("environment")).toBe("Environment check");
    expect(diaryTimelineActionLabel("harvest")).toBe("Harvest");
    expect(diaryTimelineActionLabel("action_followup")).toBe("Follow-up");
  });
  it("falls back safely on unknown kind", () => {
    expect(diaryTimelineActionLabel(null)).toBe("Entry");
    expect(diaryTimelineActionLabel("xyz")).toBe("Entry");
  });
});

describe("classifyDiaryTimelineSource", () => {
  it("never promotes manual / csv / demo / stale / invalid / import to live", () => {
    for (const s of ["manual", "csv", "demo", "stale", "invalid", "import"]) {
      expect(classifyDiaryTimelineSource(s)).not.toBe("live");
    }
  });
  it("only labels truly live sources as live", () => {
    expect(classifyDiaryTimelineSource("live")).toBe("live");
  });
  it("refuses to call unknown/opaque sources Live", () => {
    expect(classifyDiaryTimelineSource(null)).not.toBe("live");
    expect(classifyDiaryTimelineSource("mystery-source")).not.toBe("live");
  });
  it("normalizes import → csv (display)", () => {
    expect(classifyDiaryTimelineSource("import")).toBe("csv");
  });
});

describe("diaryTimelineViewModel — static safety", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../lib/diaryTimelineViewModel.ts"),
    "utf8",
  );
  it("contains no Supabase, network, or model wiring", () => {
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    for (const t of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(SRC).not.toContain(t);
    }
  });
  it("contains no device-control / automation strings", () => {
    for (const t of [
      "execute_device",
      "setpoint_write",
      "irrigation_control",
      "auto_apply",
      "autopilot",
      "scheduler.run",
    ]) {
      expect(SRC).not.toContain(t);
    }
  });
});

import {
  DIARY_TIMELINE_ACTION_STYLES,
  DIARY_TIMELINE_TONE_CLASS,
  getDiaryTimelineActionStyle,
} from "../constants/diaryTimelineActionStyles";
import { getDiaryTimelineActionView } from "../lib/diaryTimelineViewModel";

describe("diary timeline action styles — icon + tone + aria", () => {
  const KINDS = [
    "diary_note",
    "watering",
    "feeding",
    "training",
    "photo",
    "environment",
    "diagnosis",
    "harvest",
    "action_followup",
  ] as const;

  it("every known action kind has a label, icon, tone, and ariaLabel", () => {
    for (const k of KINDS) {
      const style = getDiaryTimelineActionStyle(k);
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.iconName.length).toBeGreaterThan(0);
      expect(style.tone.length).toBeGreaterThan(0);
      expect(style.ariaLabel.length).toBeGreaterThan(0);
      expect(DIARY_TIMELINE_TONE_CLASS[style.tone]).toBeDefined();
    }
  });

  it("unknown / null kind falls back safely", () => {
    expect(getDiaryTimelineActionStyle(null).kind).toBe("unknown");
    expect(getDiaryTimelineActionStyle("xyz").label).toBe("Entry");
  });

  it("the view-model re-exports the style helper", () => {
    expect(getDiaryTimelineActionView("watering").iconName).toBe("Droplet");
    expect(getDiaryTimelineActionView("diagnosis").tone).toBe("warning");
  });

  it("style map covers every defined kind", () => {
    for (const [k, style] of Object.entries(DIARY_TIMELINE_ACTION_STYLES)) {
      expect(style.kind).toBe(k);
    }
  });
});

describe("diary timeline filtered-empty state — all filter combos", () => {
  const FILTER_KEYS = [
    "all",
    "notes",
    "watering",
    "feeding",
    "photos",
    "manual_sensor_snapshot",
    "warnings",
  ] as const;

  it("filtered-empty copy is identical regardless of which filter is active", () => {
    for (const _ of FILTER_KEYS) {
      const s = selectDiaryTimelineEmptyState({
        hasAnyEntries: true,
        filtersActive: true,
      });
      expect(s.variant).toBe("filtered-empty");
      expect(s.title).toBe(DIARY_TIMELINE_FILTERED_EMPTY_COPY);
    }
  });

  it("true empty state still renders the friendly Quick Log hint", () => {
    const s = selectDiaryTimelineEmptyState({
      hasAnyEntries: false,
      filtersActive: false,
    });
    expect(s.title).toBe(DIARY_TIMELINE_EMPTY_TITLE);
    expect(s.hint).toBe(DIARY_TIMELINE_EMPTY_HINT);
  });

  it("non-live sources still never render as Live across kinds", () => {
    for (const src of ["manual", "csv", "demo", "stale", "invalid", "import"]) {
      expect(classifyDiaryTimelineSource(src)).not.toBe("live");
    }
  });
});
