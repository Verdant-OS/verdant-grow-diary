/**
 * originatingTimelineEventAdapter — unit coverage.
 * Pure read-path adapter. No I/O, no React, no Supabase.
 */
import { describe, expect, it } from "vitest";

import {
  adaptOriginatingTimelineEventsColumn,
  adaptOriginatingTimelineEventsFromRow,
  EMPTY_ORIGINATING_TIMELINE_EVENTS,
  FORBIDDEN_REF_FIELDS,
} from "@/lib/originatingTimelineEventAdapter";

describe("adaptOriginatingTimelineEventsColumn", () => {
  it("returns [] for null/undefined/non-array values", () => {
    expect(adaptOriginatingTimelineEventsColumn(null)).toEqual([]);
    expect(adaptOriginatingTimelineEventsColumn(undefined)).toEqual([]);
    expect(adaptOriginatingTimelineEventsColumn("not-an-array")).toEqual([]);
    expect(adaptOriginatingTimelineEventsColumn(42)).toEqual([]);
    expect(adaptOriginatingTimelineEventsColumn({ id: "x" })).toEqual([]);
  });

  it("accepts valid refs and normalizes their source label", () => {
    const out = adaptOriginatingTimelineEventsColumn([
      { id: "evt-a", kind: "grow_event", source: "manual", occurred_at: "2026-06-01T10:00:00Z" },
      { id: "evt-b", kind: "sensor_snapshot", source: "live", occurred_at: "2026-06-01T11:00:00Z" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe("evt-a");
    expect(out[0]?.source).toBe("manual");
    expect(out[1]?.source).toBe("live");
  });

  it("maps unknown/unrecognized source labels to 'unknown'", () => {
    const out = adaptOriginatingTimelineEventsColumn([
      { id: "x", kind: "diary_entry", source: "made-up-source" },
      { id: "y", kind: "diary_entry" /* missing source */ },
    ]);
    expect(out).toHaveLength(2);
    for (const ev of out) {
      expect(ev.source).toBe("unknown");
    }
  });

  it("drops entries missing or with non-string ids", () => {
    const out = adaptOriginatingTimelineEventsColumn([
      { kind: "grow_event", source: "manual" },
      { id: "", kind: "grow_event", source: "manual" },
      { id: 123, kind: "grow_event", source: "manual" },
      { id: "ok", kind: "grow_event", source: "manual" },
    ]);
    expect(out.map((e) => e.id)).toEqual(["ok"]);
  });

  it("rejects refs that carry raw-payload / token / secret fields", () => {
    for (const forbidden of FORBIDDEN_REF_FIELDS) {
      const out = adaptOriginatingTimelineEventsColumn([
        { id: "leaky", kind: "grow_event", source: "manual", [forbidden]: "boom" },
        { id: "clean", kind: "grow_event", source: "manual" },
      ]);
      expect(out.map((e) => e.id)).toEqual(["clean"]);
    }
  });

  it("dedupes by id (first occurrence wins)", () => {
    const out = adaptOriginatingTimelineEventsColumn([
      { id: "dup", kind: "grow_event", source: "manual", occurred_at: "2026-06-01T10:00:00Z" },
      { id: "dup", kind: "diary_entry", source: "csv", occurred_at: "2026-06-02T10:00:00Z" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe("manual");
  });

  it("sorts deterministically by occurred_at then id", () => {
    const out = adaptOriginatingTimelineEventsColumn([
      { id: "b", source: "manual", occurred_at: "2026-06-02T10:00:00Z" },
      { id: "a", source: "manual", occurred_at: "2026-06-01T10:00:00Z" },
      { id: "c", source: "manual" }, // null occurred_at sorts last
      { id: "d", source: "manual", occurred_at: "2026-06-01T10:00:00Z" },
    ]);
    expect(out.map((e) => e.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("ignores garbage entries (primitives, nulls, arrays)", () => {
    const out = adaptOriginatingTimelineEventsColumn([
      null,
      undefined,
      "string",
      42,
      [],
      { id: "ok", source: "manual" },
    ]);
    expect(out.map((e) => e.id)).toEqual(["ok"]);
  });
});

describe("adaptOriginatingTimelineEventsFromRow", () => {
  it("returns [] for null row", () => {
    expect(adaptOriginatingTimelineEventsFromRow(null)).toEqual([]);
    expect(adaptOriginatingTimelineEventsFromRow(undefined)).toEqual([]);
  });

  it("pulls the column off a row-like object", () => {
    const out = adaptOriginatingTimelineEventsFromRow({
      originating_timeline_events: [
        { id: "evt-1", source: "csv", occurred_at: "2026-06-10T00:00:00Z" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("evt-1");
    expect(out[0]?.source).toBe("csv");
  });

  it("returns [] when the column is missing", () => {
    expect(adaptOriginatingTimelineEventsFromRow({})).toEqual([]);
  });
});

describe("EMPTY_ORIGINATING_TIMELINE_EVENTS", () => {
  it("is a frozen empty array literal", () => {
    expect(EMPTY_ORIGINATING_TIMELINE_EVENTS).toEqual([]);
    expect(Object.isFrozen(EMPTY_ORIGINATING_TIMELINE_EVENTS)).toBe(true);
  });
});
