/**
 * Quick Log save fan-out collapse (live audit #9/#10/#11 cluster).
 *
 * One confirmed quicklog_save_manual save persists up to three rows:
 *   - a manual watering/observation `grow_events` spine row
 *   - a same-instant sibling `environment` grow_event when sensor values exist
 *   - an unlinked `diary_entries` companion when structured details exist
 * (quicklog_save_event companions carry details.linked_grow_event_id instead).
 *
 * The Timeline recent lane must render each save exactly once:
 *   - the Cultivation Calendar counted spine + sibling + companion (~3x
 *     waterings from a handful of real logs)
 *   - the Watering History panel must list the spine's event_type='watering'
 *     row with its watering_events child measurements
 *   - companion-only structure (environment_check envelopes, sensor
 *     snapshots) must keep rendering once on the surviving spine row.
 *
 * Two post-merge Codex/Copilot review rounds found real gaps in the first
 * fix and are covered below:
 *   round 1 — a linked companion's parent that IS fetched but soft-deleted
 *     must not resurrect (collapseQuickLogSaveFanOut's own contract);
 *   round 2 — Timeline's grow_events page is is_deleted-filtered AND
 *     capped/date-bounded, so a deleted or merely out-of-window parent can
 *     be absent from the primary page for reasons that have nothing to do
 *     with is_deleted. A supplemental by-id lookup (findMissingLinkedGrowEventIds
 *     + a small `.in("id", ...)` fetch) resolves exactly the ids a loaded
 *     companion references but the primary page doesn't include, and only
 *     that resolved set feeds collapseQuickLogSaveFanOut — the primary
 *     `growEvents` state stays untouched for the UI-copy gates and
 *     evidence-window checks that read it directly.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  collapseQuickLogSaveFanOut,
  findMissingLinkedGrowEventIds,
  mergeTimelineSources,
} from "@/lib/timelineMergeRules";
import {
  mapGrowEventsToRecentRawEntries,
  type GrowEventRowForRecent,
} from "@/lib/growEventToDiaryRawEntry";
import {
  buildDiaryCalendarViewModel,
  summarizeDiaryCalendar,
  type DiaryCalendarRawEntry,
} from "@/lib/diaryCalendarViewModel";
import {
  isEnvironmentCheckTimelineEntry,
  resolveEffectiveQuickLogCareType,
  type EnvironmentCheckTimelineRawEntry,
} from "@/lib/environmentCheckTimelineViewModel";
import WateringHistoryPanel from "@/components/WateringHistoryPanel";
import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";

const TIMELINE_SRC = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

const T = "2026-07-20T18:30:00.000Z";

interface DiaryStateRow {
  id: string;
  note: string | null;
  photo_url: string | null;
  stage: string | null;
  details: Record<string, unknown> | null;
  entry_at: string;
  plant_id: string | null;
  tent_id: string | null;
}

/** The manual watering save's grow_events spine row (with typed child). */
function wateringSpine(overrides: Partial<GrowEventRowForRecent> = {}): GrowEventRowForRecent {
  return {
    id: "ge-water",
    grow_id: "g1",
    tent_id: "t1",
    plant_id: "p1",
    event_type: "watering",
    occurred_at: T,
    note: "Watered today.",
    source: "manual",
    is_deleted: false,
    watering_events: [
      {
        volume_ml: 500,
        ph: 6.3,
        ec_ms_cm: 1.4,
        runoff_ml: 60,
        runoff_ph: 6.1,
        runoff_ec: 1.6,
        water_temp_c: 20.5,
      },
    ],
    ...overrides,
  };
}

/** Same-instant sibling environment row written because sensors were present. */
function environmentSibling(overrides: Partial<GrowEventRowForRecent> = {}): GrowEventRowForRecent {
  return {
    id: "ge-env-sibling",
    grow_id: "g1",
    tent_id: "t1",
    plant_id: "p1",
    event_type: "environment",
    occurred_at: T,
    note: null,
    source: "manual",
    is_deleted: false,
    ...overrides,
  };
}

/** Unlinked manual-path diary companion sharing the exact (plant, instant). */
function manualCompanion(overrides: Partial<DiaryStateRow> = {}): DiaryStateRow {
  return {
    id: "de-companion",
    note: "Watered today.",
    photo_url: null,
    stage: "veg",
    details: { sensor: { source: "manual" }, plant_name: "Mango #1" },
    entry_at: T,
    plant_id: "p1",
    tent_id: "t1",
    ...overrides,
  };
}

/**
 * Mirror of the Timeline recentLaneRawEntries memo, using the real helpers.
 * `growEvents` mirrors the primary, is_deleted-filtered page; the optional
 * `supplementalGrowEvents` mirrors Timeline's separate by-id lookup for
 * grow_event ids a loaded diary companion references but the primary page
 * doesn't include (deleted, or simply outside its own date/limit bound).
 */
function buildRecentLane(
  entries: readonly DiaryStateRow[],
  growEvents: readonly GrowEventRowForRecent[],
  supplementalGrowEvents: readonly GrowEventRowForRecent[] = [],
): Array<Record<string, unknown>> {
  const diaryInputs = entries.map((e) => {
    const details = (e.details ?? null) as Record<string, unknown> | null;
    const grow_event_id =
      details && typeof details["grow_event_id"] === "string"
        ? (details["grow_event_id"] as string)
        : null;
    const linked_grow_event_id =
      details && typeof details["linked_grow_event_id"] === "string"
        ? (details["linked_grow_event_id"] as string)
        : null;
    return {
      id: e.id,
      entry_at: e.entry_at,
      plant_id: e.plant_id,
      tent_id: e.tent_id,
      stage: e.stage,
      note: e.note,
      photo_url: e.photo_url,
      details,
      grow_event_id,
      linked_grow_event_id,
    };
  });
  const growEventsForCollapse =
    supplementalGrowEvents.length === 0
      ? growEvents
      : (() => {
          const seen = new Set(growEvents.map((row) => row.id));
          const extra = supplementalGrowEvents.filter((row) => !seen.has(row.id));
          return extra.length > 0 ? [...growEvents, ...extra] : growEvents;
        })();
  const collapsed = collapseQuickLogSaveFanOut({
    diaryEntries: diaryInputs,
    growEvents: growEventsForCollapse,
  });
  const merged = mergeTimelineSources({
    diaryEntries: collapsed.diaryEntries,
    growEvents: collapsed.growEvents,
  });
  const diaryById = new Map(entries.map((e) => [e.id, e] as const));
  const growMappedById = new Map(
    mapGrowEventsToRecentRawEntries(collapsed.growEvents).map((r) => [r.id, r] as const),
  );
  for (const [spineId, companions] of collapsed.droppedCompanionsBySpineId) {
    const mapped = growMappedById.get(spineId);
    if (!mapped) continue;
    const companionDetails: Record<string, unknown> = {};
    for (const companion of companions) {
      const det = (companion.details ?? null) as Record<string, unknown> | null;
      if (det && typeof det === "object") Object.assign(companionDetails, det);
    }
    delete companionDetails.linked_grow_event_id;
    delete companionDetails.grow_event_id;
    if (Object.keys(companionDetails).length === 0) continue;
    growMappedById.set(spineId, {
      ...mapped,
      details: { ...companionDetails, ...mapped.details },
    });
  }
  const out: Array<Record<string, unknown>> = [];
  for (const m of merged) {
    if (m.source_table === "diary_entries") {
      const e = diaryById.get(m.source_id);
      if (e) out.push(e as unknown as Record<string, unknown>);
    } else {
      const g = growMappedById.get(m.source_id);
      if (g) out.push(g as unknown as Record<string, unknown>);
    }
  }
  return out;
}

describe("collapseQuickLogSaveFanOut (pure)", () => {
  it("collapses one save's spine + environment sibling + unlinked companion to the spine row", () => {
    const result = collapseQuickLogSaveFanOut({
      diaryEntries: [manualCompanion()],
      growEvents: [wateringSpine(), environmentSibling()],
    });
    expect(result.growEvents.map((g) => g.id)).toEqual(["ge-water"]);
    expect(result.diaryEntries).toEqual([]);
    expect([...result.droppedCompanionsBySpineId.keys()]).toEqual(["ge-water"]);
    expect(result.droppedCompanionsBySpineId.get("ge-water")?.map((d) => d.id)).toEqual([
      "de-companion",
    ]);
  });

  it("keeps a standalone environment check (no same-instant watering/observation sibling)", () => {
    const standalone = environmentSibling({
      id: "ge-env-alone",
      occurred_at: "2026-07-19T09:00:00.000Z",
    });
    const result = collapseQuickLogSaveFanOut({
      diaryEntries: [],
      growEvents: [wateringSpine(), standalone],
    });
    expect(result.growEvents.map((g) => g.id)).toEqual(["ge-water", "ge-env-alone"]);
  });

  it("passes non-manual grow events through untouched, even at a colliding instant", () => {
    const live = environmentSibling({ id: "ge-live", source: "live" });
    const result = collapseQuickLogSaveFanOut({
      diaryEntries: [],
      growEvents: [wateringSpine(), live],
    });
    expect(result.growEvents.map((g) => g.id)).toEqual(["ge-water", "ge-live"]);
  });

  it("drops a linked companion onto its fetched parent, and never resurrects an unfetched parent", () => {
    const linked = manualCompanion({
      id: "de-linked",
      details: { linked_grow_event_id: "ge-water", sensor_snapshot: { temp: 24 } },
    });
    const attached = collapseQuickLogSaveFanOut({
      diaryEntries: [linked],
      growEvents: [wateringSpine()],
    });
    expect(attached.diaryEntries).toEqual([]);
    expect(attached.droppedCompanionsBySpineId.get("ge-water")?.map((d) => d.id)).toEqual([
      "de-linked",
    ]);

    // Parent never fetched at all in this call (e.g. Timeline's grow_events
    // read is independently date-range-/keyset-bounded from its
    // diary_entries read, or a caller never fetches grow_events at all —
    // the quicklog_save_event Symptom Check E2E proof exercises exactly
    // this shape). The companion is the only evidence of that save in this
    // read; it must render standalone, not vanish (live audit regression:
    // symptom-check-branch.spec.ts's Timeline evidence-card alias anchor).
    const neverFetched = collapseQuickLogSaveFanOut({
      diaryEntries: [
        manualCompanion({
          id: "de-out-of-window",
          details: { linked_grow_event_id: "ge-not-in-this-read" },
        }),
      ],
      growEvents: [],
    });
    expect(neverFetched.diaryEntries.map((d) => d.id)).toEqual(["de-out-of-window"]);
    expect(neverFetched.droppedCompanionsBySpineId.size).toBe(0);

    // Parent WAS fetched in this call but did not survive the shared dedupe
    // (e.g. deleted, or a different tent/grow scope): known gone, so the
    // companion must not resurrect it as a second activity.
    const knownDeletedParent = wateringSpine({
      id: "ge-deleted-parent",
      is_deleted: true,
    });
    const orphaned = collapseQuickLogSaveFanOut({
      diaryEntries: [
        manualCompanion({
          id: "de-orphan",
          details: { linked_grow_event_id: "ge-deleted-parent" },
        }),
      ],
      growEvents: [knownDeletedParent],
    });
    expect(orphaned.diaryEntries).toEqual([]);
    expect(orphaned.droppedCompanionsBySpineId.size).toBe(0);
  });

  it("keeps unlinked diary rows that do not share a (plant, instant) pair with any fetched manual spine", () => {
    const legacyStandalone = manualCompanion({
      id: "de-legacy",
      entry_at: "2026-07-18T10:00:00.000Z",
      details: { event_type: "watering", watering_amount_ml: 250 },
    });
    const differentTimestampSpine = collapseQuickLogSaveFanOut({
      diaryEntries: [legacyStandalone],
      growEvents: [wateringSpine()],
    });
    expect(differentTimestampSpine.diaryEntries.map((d) => d.id)).toEqual(["de-legacy"]);

    // No grow_events fetched at all — same fall-through, no pair to match.
    const noGrowEventsFetched = collapseQuickLogSaveFanOut({
      diaryEntries: [legacyStandalone],
      growEvents: [],
    });
    expect(noGrowEventsFetched.diaryEntries.map((d) => d.id)).toEqual(["de-legacy"]);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const diaryEntries = [manualCompanion()];
    const growEvents = [wateringSpine(), environmentSibling()];
    const before = JSON.stringify({ diaryEntries, growEvents });
    const a = collapseQuickLogSaveFanOut({ diaryEntries, growEvents });
    const b = collapseQuickLogSaveFanOut({ diaryEntries, growEvents });
    expect(a.growEvents).toEqual(b.growEvents);
    expect(a.diaryEntries).toEqual(b.diaryEntries);
    expect([...a.droppedCompanionsBySpineId.entries()]).toEqual([
      ...b.droppedCompanionsBySpineId.entries(),
    ]);
    expect(JSON.stringify({ diaryEntries, growEvents })).toBe(before);
  });
});

describe("Timeline.tsx — fan-out collapse wire-up", () => {
  it("imports and applies collapseQuickLogSaveFanOut before the merge", () => {
    expect(TIMELINE_SRC).toMatch(
      /import\s*\{[^}]*collapseQuickLogSaveFanOut[^}]*\}\s*from\s*["']@\/lib\/timelineMergeRules["']/,
    );
    const call = TIMELINE_SRC.match(/collapseQuickLogSaveFanOut\s*\(\s*\{[\s\S]*?\}\s*\)/);
    expect(call).not.toBeNull();
    expect(call![0]).toMatch(/diaryEntries\s*:/);
    expect(call![0]).toMatch(/\bgrowEvents\b\s*[:,}]/);
  });

  it("feeds the collapsed sources into mergeTimelineSources and the recent-lane mapper", () => {
    expect(TIMELINE_SRC).toMatch(
      /mergeTimelineSources\s*\(\s*\{\s*diaryEntries:\s*collapsed\.diaryEntries\s*,\s*growEvents:\s*collapsed\.growEvents\s*,?\s*\}\s*\)/,
    );
    expect(TIMELINE_SRC).toMatch(
      /mapGrowEventsToRecentRawEntries\s*\(\s*collapsed\.growEvents\s*\)/,
    );
  });

  it("re-attaches dropped companion details to the surviving spine row", () => {
    expect(TIMELINE_SRC).toMatch(/droppedCompanionsBySpineId/);
  });

  it("keeps the primary grow_events page is_deleted-filtered (Codex/Copilot review round 2)", () => {
    // The visible-event page (its 100-row budget and the growEvents.length
    // UI-copy gates) must never show or be displaced by tombstones. Reverting
    // this filter was tried and reviewed off in round 1 — deleted-parent
    // resolution now happens via the supplemental by-id lookup below instead.
    const growEventsQueryChain = TIMELINE_SRC.match(
      /let growEventsQuery = supabase[\s\S]*?\.limit\(100\);/,
    );
    expect(growEventsQueryChain).not.toBeNull();
    expect(growEventsQueryChain![0]).toMatch(/\.eq\(\s*"is_deleted",\s*false\s*\)/);
  });

  it("resolves referenced-but-missing linked grow_event ids via a supplemental by-id lookup", () => {
    expect(TIMELINE_SRC).toMatch(
      /import\s*\{[^}]*findMissingLinkedGrowEventIds[^}]*\}\s*from\s*["']@\/lib\/timelineMergeRules["']/,
    );
    // The shared resolver helper computes the missing ids itself...
    expect(TIMELINE_SRC).toMatch(/async function resolveMissingLinkedGrowEventParents/);
    expect(TIMELINE_SRC).toMatch(
      /const missingLinkedGrowEventIds = findMissingLinkedGrowEventIds\(\{\s*diaryEntries\s*:/,
    );

    // ...and its fetch is an exact-id lookup: no is_deleted filter (an id
    // lookup has no window to fall outside of) and no date bound.
    const supplementalFetch = TIMELINE_SRC.match(
      /const linkedResult = await supabase[\s\S]*?\.in\(\s*"id",\s*missingLinkedGrowEventIds\s*\)\s*;/,
    );
    expect(supplementalFetch).not.toBeNull();
    expect(supplementalFetch![0]).not.toMatch(/is_deleted/);
    expect(supplementalFetch![0]).toMatch(/\.from\(\s*"grow_events"\s*\)/);
    expect(TIMELINE_SRC).toMatch(/setSupplementalLinkedGrowEvents/);
  });

  it("runs the resolver on the initial load AND on every loadOlder page (Codex round-3 P2)", () => {
    // Exactly two call sites — the initial load (primary page as the known
    // set) and loadOlder (primary page plus already-resolved supplemental
    // rows). A third caller or a removed one should fail this pin loudly.
    const callSites = TIMELINE_SRC.match(/resolveMissingLinkedGrowEventParents\(\{/g) ?? [];
    expect(callSites).toHaveLength(2);
    expect(TIMELINE_SRC).toMatch(/knownGrowEvents:\s*nextGrowEvents,/);
    expect(TIMELINE_SRC).toMatch(
      /knownGrowEvents:\s*\[\.\.\.growEvents,\s*\.\.\.supplementalLinkedGrowEvents\],/,
    );
  });

  it("clears supplemental state on every fresh core commit and only merges after (Codex round-3 P1)", () => {
    // Cleared in both fail-closed guards AND unconditionally in the success
    // commit, so rows resolved for a previous grow/date scope can never
    // survive into a new one — not while the new lookup is in flight, and
    // not indefinitely when it fails.
    const clears = TIMELINE_SRC.match(/setSupplementalLinkedGrowEvents\(\[\]\);/g) ?? [];
    expect(clears).toHaveLength(3);
    // Both resolver callbacks merge (functional update, deduped by id)
    // instead of replacing, so a loadOlder resolution never clobbers the
    // initial load's rows.
    const merges = TIMELINE_SRC.match(/setSupplementalLinkedGrowEvents\(\(current\) =>/g) ?? [];
    expect(merges).toHaveLength(2);
  });

  it("feeds the supplemental lookup into the collapse input, not into the primary growEvents", () => {
    const collapseCall = TIMELINE_SRC.match(/collapseQuickLogSaveFanOut\s*\(\s*\{[\s\S]*?\}\s*\)/);
    expect(collapseCall).not.toBeNull();
    expect(collapseCall![0]).toMatch(/growEvents:\s*growEventsForCollapse/);
    expect(TIMELINE_SRC).toMatch(/const growEventsForCollapse\s*=/);
  });

  it("keeps the growEvents.length UI-copy gates and evidence-window checks on the plain, filtered growEvents state (Codex/Copilot review round 2)", () => {
    // Both reviewers flagged that a page containing only tombstones must not
    // make the UI claim Quick Log activity is visible. Guarded here by
    // requiring every `growEvents.length` / `growEvents.map` site to read
    // the plain state, never the supplemental-augmented growEventsForCollapse.
    const rawGrowEventsSites = TIMELINE_SRC.match(/\bgrowEvents\.(length|map)\b/g) ?? [];
    expect(rawGrowEventsSites.length).toBeGreaterThan(0);
    expect(TIMELINE_SRC).not.toMatch(/growEventsForCollapse\.(length|map)\b/);
  });
});

describe("recent lane end-to-end (audit #9/#10 regression)", () => {
  it("the Cultivation Calendar counts one watering and zero environment rows for one sensor-carrying save", () => {
    const lane = buildRecentLane(
      [manualCompanion()],
      [wateringSpine(), environmentSibling()],
    ) as unknown as DiaryCalendarRawEntry[];
    const groups = buildDiaryCalendarViewModel(lane);
    const summary = summarizeDiaryCalendar(groups);
    expect(summary.counts.watering).toBe(1);
    expect(summary.counts.environment).toBe(0);
    expect(summary.totalEvents).toBe(1);
  });

  it("a standalone Environment Check still counts as one environment event", () => {
    const lane = buildRecentLane(
      [],
      [environmentSibling({ id: "ge-env-alone", occurred_at: "2026-07-19T09:00:00.000Z" })],
    ) as unknown as DiaryCalendarRawEntry[];
    const summary = summarizeDiaryCalendar(buildDiaryCalendarViewModel(lane));
    expect(summary.counts.environment).toBe(1);
    expect(summary.totalEvents).toBe(1);
  });

  it("the Watering History panel lists the spine watering exactly once, with its measurements (audit #11 alignment)", () => {
    const lane = buildRecentLane([manualCompanion()], [wateringSpine(), environmentSibling()]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <WateringHistoryPanel rawEntries={lane} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("1 entry")).toBeInTheDocument();
    expect(screen.getByText("500 ml")).toBeInTheDocument();
  });

  it("a legacy environment-check save (observation spine + envelope companion) keeps its envelope, once", () => {
    const spine = wateringSpine({
      id: "ge-obs",
      event_type: "observation",
      note: "Evening check.",
      watering_events: undefined,
    });
    const companion = manualCompanion({
      id: "de-env-check",
      note: "Evening check.",
      details: { environment_check: { room_temp_f: 78, humidity_pct: 55 } },
    });
    const lane = buildRecentLane([companion], [spine]);
    const envelopeCarriers = lane.filter((entry) =>
      isEnvironmentCheckTimelineEntry(entry as EnvironmentCheckTimelineRawEntry),
    );
    expect(envelopeCarriers).toHaveLength(1);
    expect((envelopeCarriers[0] as { id?: unknown }).id).toBe("ge-obs");
    expect(resolveEffectiveQuickLogCareType(envelopeCarriers[0])).toBe("environment");

    const summary = summarizeDiaryCalendar(
      buildDiaryCalendarViewModel(lane as unknown as DiaryCalendarRawEntry[]),
    );
    expect(summary.counts.environment).toBe(1);
    expect(summary.totalEvents).toBe(1);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <RecentQuickLogActivityPanel rawEntries={lane} />
      </QueryClientProvider>,
    );
    const section = screen.getByTestId("quicklog-history-section-recent");
    const rows = within(section).getAllByTestId("quicklog-history-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-event-type", "environment");
    expect(within(rows[0]).getByText("Environment check")).toBeInTheDocument();
  });

  it("re-attaches a Plant Quick Log manual snapshot to its surviving spine exactly once", () => {
    const spine = wateringSpine({
      id: "ge-manual-snapshot",
      event_type: "observation",
      note: "Manual room check",
      watering_events: undefined,
    });
    const companion = manualCompanion({
      id: "de-manual-snapshot",
      note: "Manual room check",
      details: {
        linked_grow_event_id: "ge-manual-snapshot",
        manual_sensor_snapshot: {
          temp_f: 82,
          humidity_percent: 48,
          ph: 6.2,
          ec: 1.65,
          source: "manual",
        },
      },
    });

    const lane = buildRecentLane([companion], [spine]);
    expect(lane).toHaveLength(1);
    expect((lane[0] as { id?: unknown }).id).toBe("ge-manual-snapshot");
    expect(
      (lane[0] as { details?: { manual_sensor_snapshot?: unknown } }).details
        ?.manual_sensor_snapshot,
    ).toEqual({
      temp_f: 82,
      humidity_percent: 48,
      ph: 6.2,
      ec: 1.65,
      source: "manual",
    });
  });

  it("keeps a quicklog_save_event linked companion standalone when its grow_event parent is never fetched (Symptom Check E2E regression)", () => {
    // Mirrors e2e/symptom-check-branch.spec.ts: quicklog_save_event returns
    // a diary_entries row with details.linked_grow_event_id pointing at a
    // grow_event id that this read's grow_events fetch never returns at all
    // (its own bounded/independent read, or a mock/backend that only
    // populates diary_entries for this RPC). The companion must still
    // render — under its own id, with its linked_grow_event_id intact — so
    // Timeline can render the alias anchor the "review evidence" link and
    // the Symptom Check checklist depend on.
    const linkedCompanion = manualCompanion({
      id: "de-symptom-check",
      details: {
        event_type: "observation",
        linked_grow_event_id: "ge-symptom-check-parent",
        subtype: "issue",
      },
    });
    const lane = buildRecentLane([linkedCompanion], []);
    expect(lane.map((e) => (e as { id?: unknown }).id)).toEqual(["de-symptom-check"]);
    const rendered = lane[0] as { details?: { linked_grow_event_id?: unknown } };
    expect(rendered.details?.linked_grow_event_id).toBe("ge-symptom-check-parent");
  });

  it("does not resurrect a grower-deleted parent's companion once it is resolved into the collapse input (Codex/Copilot review round 1)", () => {
    // Whatever fetch produced this deleted row — Timeline's primary page or
    // (in production) its supplemental by-id lookup below — the collapse
    // itself must treat a present-but-deleted parent as known gone, not
    // "never fetched". This is the pure-function half of the contract;
    // the "was it actually resolved into the input" half is covered by the
    // Timeline.tsx wire-up tests and the end-to-end test below.
    const deletedParent = wateringSpine({ id: "ge-deleted-parent", is_deleted: true });
    const companion = manualCompanion({
      id: "de-deleted-parent-companion",
      details: { event_type: "observation", linked_grow_event_id: "ge-deleted-parent" },
    });
    const lane = buildRecentLane([companion], [deletedParent]);
    expect(lane).toEqual([]);
  });

  it("resolves a deleted parent that falls outside the primary page's own window via the supplemental lookup (Codex/Copilot review round 2)", () => {
    // The deeper case both reviewers flagged: Timeline's grow_events page is
    // is_deleted-filtered AND capped/date-bounded, so a deleted (or merely
    // out-of-window) parent is absent from the primary fetch for a reason
    // that has nothing to do with is_deleted — a bare `.eq("is_deleted",
    // false)` removal doesn't help here. The primary page below is non-empty
    // (has real, unrelated activity) but genuinely lacks the referenced
    // parent; only the supplemental by-id lookup resolves it.
    const unrelatedRealActivity = wateringSpine({ id: "ge-unrelated", occurred_at: T });
    const outOfWindowDeletedParent = wateringSpine({
      id: "ge-out-of-window-deleted",
      occurred_at: "2026-06-01T00:00:00.000Z",
      is_deleted: true,
    });
    const companion = manualCompanion({
      id: "de-out-of-window-companion",
      details: {
        event_type: "observation",
        linked_grow_event_id: "ge-out-of-window-deleted",
      },
    });

    const missing = findMissingLinkedGrowEventIds({
      diaryEntries: [companion],
      growEvents: [unrelatedRealActivity],
    });
    expect(missing).toEqual(["ge-out-of-window-deleted"]);

    // Without the supplemental resolution, the primary page's absence alone
    // is indistinguishable from "never fetched" and wrongly resurrects it.
    const withoutSupplemental = buildRecentLane([companion], [unrelatedRealActivity]);
    expect(withoutSupplemental.map((e) => (e as { id?: unknown }).id)).toEqual([
      "ge-unrelated",
      "de-out-of-window-companion",
    ]);

    // With the supplemental lookup resolving exactly the missing id, the
    // deleted parent is now visible to the collapse and correctly known gone.
    const withSupplemental = buildRecentLane(
      [companion],
      [unrelatedRealActivity],
      [outOfWindowDeletedParent],
    );
    expect(withSupplemental.map((e) => (e as { id?: unknown }).id)).toEqual(["ge-unrelated"]);
  });
});

describe("findMissingLinkedGrowEventIds (pure)", () => {
  it("returns linked ids absent from growEvents, deduplicated and sorted", () => {
    const result = findMissingLinkedGrowEventIds({
      diaryEntries: [
        { id: "d1", details: { linked_grow_event_id: "ge-b" } },
        { id: "d2", details: { linked_grow_event_id: "ge-a" } },
        { id: "d3", details: { linked_grow_event_id: "ge-b" } },
        { id: "d4", details: { grow_event_id: "ge-fetched" } },
      ],
      growEvents: [{ id: "ge-fetched" }],
    });
    expect(result).toEqual(["ge-a", "ge-b"]);
  });

  it("returns an empty array when nothing is missing or nothing is linked", () => {
    expect(
      findMissingLinkedGrowEventIds({
        diaryEntries: [{ id: "d1", details: {} }],
        growEvents: [],
      }),
    ).toEqual([]);
    expect(
      findMissingLinkedGrowEventIds({
        diaryEntries: [{ id: "d1", details: { linked_grow_event_id: "ge-1" } }],
        growEvents: [{ id: "ge-1" }],
      }),
    ).toEqual([]);
  });

  it("ignores malformed rows without throwing", () => {
    expect(
      findMissingLinkedGrowEventIds({
        diaryEntries: [null, undefined, { id: "d1", details: null }] as never,
        growEvents: [null, undefined] as never,
      }),
    ).toEqual([]);
  });
});
