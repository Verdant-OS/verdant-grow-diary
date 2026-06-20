import { describe, it, expect } from "vitest";
import { mergeTimelineSources } from "@/lib/timelineMergeRules";

const T = (iso: string) => iso;

describe("mergeTimelineSources", () => {
  it("interleaves grow_events and diary_entries newest-first", () => {
    const out = mergeTimelineSources({
      diaryEntries: [
        { id: "d1", entry_at: T("2026-06-01T10:00:00Z"), note: "diary 10" },
        { id: "d2", entry_at: T("2026-06-01T08:00:00Z"), note: "diary 8" },
      ],
      growEvents: [
        { id: "g1", occurred_at: T("2026-06-01T09:00:00Z"), event_type: "feed" },
        { id: "g2", occurred_at: T("2026-06-01T11:00:00Z"), event_type: "water" },
      ],
    });
    expect(out.map((e) => e.source_id)).toEqual(["g2", "d1", "g1", "d2"]);
    expect(out[0].source_table).toBe("grow_events");
    expect(out[1].source_table).toBe("diary_entries");
  });

  it("prefers grow_events on exact timestamp ties", () => {
    const ts = T("2026-06-01T10:00:00Z");
    const out = mergeTimelineSources({
      diaryEntries: [{ id: "d1", entry_at: ts }],
      growEvents: [{ id: "g1", occurred_at: ts }],
    });
    expect(out[0].source_table).toBe("grow_events");
    expect(out[1].source_table).toBe("diary_entries");
  });

  it("tie-breaks lexically by source_id when same table and same timestamp", () => {
    const ts = T("2026-06-01T10:00:00Z");
    const out = mergeTimelineSources({
      diaryEntries: [],
      growEvents: [
        { id: "g_z", occurred_at: ts },
        { id: "g_a", occurred_at: ts },
        { id: "g_m", occurred_at: ts },
      ],
    });
    expect(out.map((e) => e.source_id)).toEqual(["g_a", "g_m", "g_z"]);
  });

  it("deduplicates exact duplicate source rows", () => {
    const out = mergeTimelineSources({
      diaryEntries: [
        { id: "d1", entry_at: T("2026-06-01T10:00:00Z") },
        { id: "d1", entry_at: T("2026-06-01T10:00:00Z") },
      ],
      growEvents: [
        { id: "g1", occurred_at: T("2026-06-01T11:00:00Z") },
        { id: "g1", occurred_at: T("2026-06-01T11:00:00Z") },
      ],
    });
    expect(out).toHaveLength(2);
  });

  it("logical dedup: drops diary mirror row when matching grow_event present", () => {
    const out = mergeTimelineSources({
      diaryEntries: [
        {
          id: "d1",
          entry_at: T("2026-06-01T10:00:00Z"),
          grow_event_id: "g1",
          note: "diary mirror",
        },
      ],
      growEvents: [
        { id: "g1", occurred_at: T("2026-06-01T10:00:00Z"), note: "canonical" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].source_table).toBe("grow_events");
    expect(out[0].note).toBe("canonical");
  });

  it("preserves legacy diary-only rows (no grow_events present)", () => {
    const out = mergeTimelineSources({
      diaryEntries: [
        { id: "d1", entry_at: T("2026-06-01T10:00:00Z"), note: "legacy" },
      ],
      growEvents: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source_table: "diary_entries",
      source_id: "d1",
      note: "legacy",
    });
  });

  it("handles missing optional fields safely (no throw, no dropped rows)", () => {
    const out = mergeTimelineSources({
      diaryEntries: [{ id: "d_no_ts" } as never],
      growEvents: [{ id: "g_no_ts" } as never],
    });
    expect(out).toHaveLength(2);
    // Missing-timestamp rows sort to the end; both have null epoch so
    // grow_events-first tie-break + lexical fallback applies.
    expect(out[0].source_table).toBe("grow_events");
    expect(out[1].source_table).toBe("diary_entries");
    expect(out[0].occurred_at).toBeNull();
  });

  it("filters soft-deleted grow_events", () => {
    const out = mergeTimelineSources({
      diaryEntries: [],
      growEvents: [
        { id: "g1", occurred_at: T("2026-06-01T10:00:00Z"), is_deleted: true },
        { id: "g2", occurred_at: T("2026-06-01T09:00:00Z"), is_deleted: false },
      ],
    });
    expect(out.map((e) => e.source_id)).toEqual(["g2"]);
  });

  it("emits stable React-safe key", () => {
    const out = mergeTimelineSources({
      diaryEntries: [{ id: "d1", entry_at: T("2026-06-01T10:00:00Z") }],
      growEvents: [{ id: "g1", occurred_at: T("2026-06-01T11:00:00Z") }],
    });
    expect(out[0].key).toBe("grow_events:g1");
    expect(out[1].key).toBe("diary_entries:d1");
  });

  it("rejects rows with missing/blank id (defensive)", () => {
    const out = mergeTimelineSources({
      diaryEntries: [
        { id: "", entry_at: T("2026-06-01T10:00:00Z") } as never,
        { id: "d_ok", entry_at: T("2026-06-01T10:00:00Z") },
      ],
      growEvents: [{ id: "", occurred_at: T("2026-06-01T10:00:00Z") } as never],
    });
    expect(out.map((e) => e.source_id)).toEqual(["d_ok"]);
  });

  it("is deterministic across repeated calls with same input", () => {
    const input = {
      diaryEntries: [
        { id: "d1", entry_at: T("2026-06-01T10:00:00Z") },
        { id: "d2", entry_at: T("2026-06-01T09:00:00Z") },
      ],
      growEvents: [
        { id: "g1", occurred_at: T("2026-06-01T10:00:00Z") },
      ],
    };
    const a = mergeTimelineSources(input);
    const b = mergeTimelineSources(input);
    expect(a.map((e) => e.key)).toEqual(b.map((e) => e.key));
  });
});
