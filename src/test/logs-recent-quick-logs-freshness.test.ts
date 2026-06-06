/**
 * /logs "Recent Quick Logs" freshness — pure adapter + integration with
 * `buildRecentQuickLogActivity`.
 *
 * Root cause covered: Quick Log v2 saves land in `grow_events` while the
 * Timeline page historically only read `diary_entries`. The adapter
 * lifts grow_events into the diary raw-entry shape so the panel's
 * existing newest-first sort orders the just-saved row above older
 * legacy entries.
 */
import { describe, it, expect } from "vitest";
import {
  mapGrowEventToRecentRawEntry,
  mapGrowEventsToRecentRawEntries,
} from "@/lib/growEventToDiaryRawEntry";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import { buildRecentQuickLogActivity } from "@/lib/quickLogHistoryRules";

describe("mapGrowEventToRecentRawEntry", () => {
  it("maps occurred_at to entry_at and preserves event_type/source", () => {
    const out = mapGrowEventToRecentRawEntry({
      id: "ge1",
      grow_id: "g1",
      plant_id: "p1",
      tent_id: "t1",
      event_type: "observation",
      occurred_at: "2026-06-06T01:26:41Z",
      note: "Gate 1 smoke test entry",
      source: "manual",
      is_deleted: false,
    });
    expect(out.entry_at).toBe("2026-06-06T01:26:41Z");
    expect(out.entry_type).toBe("observation");
    expect(out.details.event_type).toBe("observation");
    expect(out.details.source).toBe("manual");
    expect(out.note).toBe("Gate 1 smoke test entry");
  });

  it("filters out is_deleted rows and rows missing id/occurred_at", () => {
    const out = mapGrowEventsToRecentRawEntries([
      {
        id: "ge1",
        event_type: "observation",
        occurred_at: "2026-06-06T01:00:00Z",
        is_deleted: true,
      },
      { id: "", event_type: "observation", occurred_at: "2026-06-06T01:00:00Z" },
      { id: "ge2", event_type: "observation", occurred_at: "" },
      { id: "ge3", event_type: "observation", occurred_at: "2026-06-06T01:00:00Z" },
    ]);
    expect(out.map((r) => r.id)).toEqual(["ge3"]);
  });

  it("does not invent live/sensor labels", () => {
    const out = mapGrowEventToRecentRawEntry({
      id: "x",
      event_type: "observation",
      occurred_at: "2026-06-06T00:00:00Z",
      source: "manual",
    });
    expect(out.details.source).toBe("manual");
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/\blive\b|guaranteed/i);
  });
});

describe("Recent Quick Logs freshness — merged stream", () => {
  it("places a newer grow_events row above an older diary_entries row", () => {
    const merged = [
      // legacy diary entry from Jun 3
      {
        id: "d1",
        plant_id: "p1",
        entry_type: "observation",
        entry_at: "2026-06-03T12:00:00Z",
        note: "Older legacy diary entry",
      },
      // mapped grow_event from Jun 6 (smoke test row)
      ...mapGrowEventsToRecentRawEntries([
        {
          id: "ge-smoke",
          grow_id: "g1",
          plant_id: "p1",
          event_type: "observation",
          occurred_at: "2026-06-06T01:26:41Z",
          note: "Gate 1 smoke test entry",
          source: "manual",
        },
      ]),
    ];
    const normalized = normalizeDiaryEntries({ rawEntries: merged });
    const rows = buildRecentQuickLogActivity(normalized, 10);
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe("ge-smoke");
    expect(rows[1].id).toBe("d1");
  });

  it("returns empty cleanly when no entries exist (preserves empty state)", () => {
    const normalized = normalizeDiaryEntries({ rawEntries: [] });
    expect(buildRecentQuickLogActivity(normalized, 10)).toEqual([]);
  });
});
