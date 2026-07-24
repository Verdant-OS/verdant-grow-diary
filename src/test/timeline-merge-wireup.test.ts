/**
 * Timeline — mergeTimelineSources wire-up verification.
 *
 * Confirms that `src/pages/Timeline.tsx` consumes the tested merge helper
 * (`mergeTimelineSources` from `src/lib/timelineMergeRules.ts`) instead of
 * the prior ad-hoc array concatenation, and that the integration
 * preserves load-bearing behaviors:
 *   - diary-only entries still flow through
 *   - grow_events-only Quick Log v2 entries still flow through
 *   - interleaved sources sort newest-first via the helper
 *   - duplicate logical events collapse via the helper's dedup rules
 *   - the `verdant:entry-created` window event still triggers reload
 *
 * Render-level coverage for the panel-side rendering of these entries is
 * already provided by `timeline-merge-rules.test.ts` (helper behavior)
 * and existing Timeline integration tests. This file pins the *wiring*
 * so a future refactor cannot silently revert to ad-hoc concatenation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { mergeTimelineSources } from "@/lib/timelineMergeRules";

const TIMELINE_SRC = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

describe("Timeline.tsx — mergeTimelineSources wire-up", () => {
  it("imports mergeTimelineSources from the rules layer", () => {
    expect(TIMELINE_SRC).toMatch(/from\s+["']@\/lib\/timelineMergeRules["']/);
    expect(TIMELINE_SRC).toMatch(/\bmergeTimelineSources\b/);
  });

  it("invokes mergeTimelineSources with both diaryEntries and growEvents", () => {
    const call = TIMELINE_SRC.match(/mergeTimelineSources\s*\(\s*\{[\s\S]*?\}\s*\)/);
    expect(call).not.toBeNull();
    const body = call![0];
    expect(body).toMatch(/diaryEntries\s*:/);
    // Object shorthand `growEvents,` or explicit `growEvents:` both acceptable.
    expect(body).toMatch(/\bgrowEvents\b\s*[:,}]/);
  });

  it("no longer uses the ad-hoc `[...entries, ...mapGrowEventsToRecentRawEntries(growEvents)]` concat", () => {
    // The original ad-hoc merge was a plain spread/concat with no dedup
    // and no deterministic tie-break. Guard against regression.
    expect(TIMELINE_SRC).not.toMatch(
      /\[\s*\.\.\.entries\s*,\s*\.\.\.mapGrowEventsToRecentRawEntries\s*\(\s*growEvents\s*\)\s*\]/,
    );
  });

  it("preserves the verdant:entry-created refresh listener", () => {
    expect(TIMELINE_SRC).toMatch(/verdant:entry-created/);
    expect(TIMELINE_SRC).toMatch(/addEventListener\(\s*["']verdant:entry-created["']/);
  });

  it("still fetches both diary_entries and grow_events from supabase", () => {
    expect(TIMELINE_SRC).toMatch(/from\(\s*["']diary_entries["']\s*\)/);
    expect(TIMELINE_SRC).toMatch(/from\(\s*["']grow_events["']\s*\)/);
  });

  it("uses the shared allowlisted root-zone projection for grow_events", () => {
    expect(TIMELINE_SRC).toMatch(
      /import\s*\{\s*ROOT_ZONE_GROW_EVENT_SELECT\s*\}\s*from\s*["']@\/lib\/rootZoneObservationRules["']/,
    );
    expect(TIMELINE_SRC).toMatch(/\.select\(ROOT_ZONE_GROW_EVENT_SELECT\)/);
  });

  it("applies the active date bounds to the typed grow_events query", () => {
    expect(TIMELINE_SRC).toMatch(
      /growEventsQuery\s*=\s*growEventsQuery\.gte\(\s*["']occurred_at["']/,
    );
    expect(TIMELINE_SRC).toMatch(
      /growEventsQuery\s*=\s*growEventsQuery\.lte\(\s*["']occurred_at["']/,
    );
  });

  it("feeds the merged read stream into both root-zone history panels", () => {
    expect(TIMELINE_SRC).toMatch(/<WateringHistoryPanel\s+rawEntries=\{recentLaneRawEntries\}/);
    expect(TIMELINE_SRC).toMatch(/<FeedingHistoryPanel\s+rawEntries=\{recentLaneRawEntries\}/);
  });
});

// ---------------------------------------------------------------------------
// Behavior assertions that mirror what Timeline gets out of the helper.
// These match the production call shape (diary `entry_at`, optional
// `details.grow_event_id` link, grow_events `occurred_at`).
// ---------------------------------------------------------------------------

describe("mergeTimelineSources — Timeline integration contract", () => {
  it("interleaves diary_entries and grow_events newest-first", () => {
    const out = mergeTimelineSources({
      diaryEntries: [
        { id: "d1", entry_at: "2026-06-19T10:00:00Z" },
        { id: "d2", entry_at: "2026-06-19T12:00:00Z" },
      ],
      growEvents: [
        { id: "g1", occurred_at: "2026-06-19T11:00:00Z" },
        { id: "g2", occurred_at: "2026-06-19T13:00:00Z" },
      ],
    });
    expect(out.map((e) => e.source_id)).toEqual(["g2", "d2", "g1", "d1"]);
  });

  it("keeps diary-only entries when no grow_events match", () => {
    const out = mergeTimelineSources({
      diaryEntries: [{ id: "d1", entry_at: "2026-06-19T10:00:00Z" }],
      growEvents: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0].source_table).toBe("diary_entries");
  });

  it("keeps grow_events-only Quick Log v2 entries when diary is empty", () => {
    const out = mergeTimelineSources({
      diaryEntries: [],
      growEvents: [
        {
          id: "g1",
          occurred_at: "2026-06-19T12:00:00Z",
          event_type: "watering",
          source: "manual",
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].source_table).toBe("grow_events");
    expect(out[0].source).toBe("manual");
  });

  it("collapses a diary mirror of a grow_event into the single grow_events row", () => {
    const out = mergeTimelineSources({
      diaryEntries: [
        {
          id: "d-mirror",
          entry_at: "2026-06-19T12:00:00Z",
          grow_event_id: "g1",
        },
      ],
      growEvents: [{ id: "g1", occurred_at: "2026-06-19T12:00:00Z" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].source_table).toBe("grow_events");
    expect(out[0].source_id).toBe("g1");
  });

  it("does not crash on rows missing optional fields", () => {
    expect(() =>
      mergeTimelineSources({
        diaryEntries: [{ id: "d1" }],
        growEvents: [
          { id: "g1" } as Parameters<typeof mergeTimelineSources>[0]["growEvents"][number],
        ],
      }),
    ).not.toThrow();
  });
});


describe("Captured (logged_at) mirror-inherit", () => {
  it("the kept grow_events spine row inherits its diary mirror's logged_at ordering", async () => {
    const { mergeTimelineSources } = await import("@/lib/timelineMergeRules");
    const merged = mergeTimelineSources({
      growEvents: [
        { id: "ge-1", occurred_at: "2026-07-24T02:00:00.000Z", event_type: "training" },
      ],
      diaryEntries: [
        {
          id: "d-1",
          entry_at: "2026-07-24T02:00:01.000Z",
          details: { linked_grow_event_id: "ge-1", logged_at: "2026-07-22T21:00:00.000Z" },
        },
      ],
    });
    // Dedup keeps the spine row; it must carry the mirror's Captured moment.
    expect(merged).toHaveLength(1);
    expect(merged[0].source_table).toBe("grow_events");
    expect(merged[0].occurred_at).toBe("2026-07-22T21:00:00.000Z");
  });

  it("a diary row with logged_at orders by it directly", async () => {
    const { mergeTimelineSources } = await import("@/lib/timelineMergeRules");
    const merged = mergeTimelineSources({
      growEvents: [],
      diaryEntries: [
        {
          id: "d-2",
          entry_at: "2026-07-24T02:00:00.000Z",
          details: { logged_at: "2026-07-20T10:00:00.000Z" },
        },
      ],
    });
    expect(merged[0].occurred_at).toBe("2026-07-20T10:00:00.000Z");
  });
});
