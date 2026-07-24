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
import { buildWateringHistory } from "@/lib/wateringHistoryRules";
import { buildFeedingHistory } from "@/lib/feedingHistoryRules";

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

  it("projects joined watering and feeding measurements into the existing history models", () => {
    const raw = mapGrowEventsToRecentRawEntries([
      {
        id: "water-typed",
        grow_id: "g1",
        plant_id: "p1",
        tent_id: "t1",
        event_type: "watering",
        occurred_at: "2026-07-19T12:00:00Z",
        source: "manual",
        watering_events: {
          volume_ml: 950,
          ph: 6.25,
          ec_ms_cm: 1.35,
          runoff_ml: 120,
          runoff_ph: 6.1,
          runoff_ec: 1.55,
          water_temp_c: 20.5,
        },
      },
      {
        id: "feed-typed",
        grow_id: "g1",
        plant_id: "p1",
        tent_id: "t1",
        event_type: "feeding",
        occurred_at: "2026-07-19T13:00:00Z",
        source: "csv",
        feeding_events: [
          {
            volume_ml: 1_100,
            ph: 5.9,
            ec_in: 1.8,
            ec_out: 2.1,
            runoff_ml: 180,
            runoff_ph: 6.05,
            runoff_ec: 2.05,
            water_temp_c: 21,
            nutrient_brand: "CRONK",
            products: [{ name: "Bonnie", amount: 2, unit: "ml/L" }],
          },
        ],
      },
    ]);
    const normalized = normalizeDiaryEntries({ rawEntries: raw });
    const wateringRows = buildWateringHistory(normalized);
    const feedingRows = buildFeedingHistory(normalized);

    expect(wateringRows).toHaveLength(1);
    expect(wateringRows.map((row) => row.id)).toEqual(["water-typed"]);
    expect(wateringRows[0]).toMatchObject({
      id: "water-typed",
      timelineAnchorId: "timeline-entry-water-typed",
      volumeMl: 950,
      ph: 6.25,
      ec: 1.35,
      runoffMl: 120,
      runoffPh: 6.1,
      runoffEc: 1.55,
      waterTempC: 20.5,
      source: "manual",
      sourceLabel: "Manual log",
      warnings: [],
    });
    expect(feedingRows).toHaveLength(1);
    expect(feedingRows.map((row) => row.id)).toEqual(["feed-typed"]);
    expect(feedingRows[0]).toMatchObject({
      id: "feed-typed",
      timelineAnchorId: "timeline-entry-feed-typed",
      volumeMl: 1_100,
      ph: 5.9,
      ec: 1.8,
      outputEc: 2.1,
      runoffMl: 180,
      runoffPh: 6.05,
      runoffEc: 2.05,
      waterTempC: 21,
      recipe: "CRONK",
      source: "csv",
      sourceLabel: "CSV log",
      warnings: [],
    });
    expect(feedingRows[0].nutrients).toEqual([{ name: "Bonnie", amount: 2, unit: "ml/L" }]);
  });

  it("marks typed root-zone rows with a missing child as unavailable", () => {
    const normalized = normalizeDiaryEntries({
      rawEntries: [
        mapGrowEventToRecentRawEntry({
          id: "missing-child",
          event_type: "watering",
          occurred_at: "2026-07-19T12:00:00Z",
          source: null,
        }),
      ],
    });

    expect(buildWateringHistory(normalized)[0]).toMatchObject({
      source: "unknown",
      sourceLabel: "Source unavailable",
    });
    expect(buildWateringHistory(normalized)[0].warnings).toContain(
      "Structured measurements unavailable",
    );
  });

  it("marks partially invalid typed measurements instead of presenting a clean row", () => {
    const raw = mapGrowEventToRecentRawEntry({
      id: "partial-water",
      event_type: "watering",
      occurred_at: "2026-07-19T12:00:00Z",
      source: "manual",
      watering_events: { volume_ml: 500, ph: 99 },
    });
    const [row] = buildWateringHistory(normalizeDiaryEntries({ rawEntries: [raw] }));

    expect(raw.details.root_zone_status).toBe("partial");
    expect(raw.details.root_zone_invalid_fields).toEqual(["inputPh"]);
    expect(row.volumeMl).toBe(500);
    expect(row.ph).toBeNull();
    expect(row.warnings).toContain("Some structured measurements were omitted as invalid");
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
