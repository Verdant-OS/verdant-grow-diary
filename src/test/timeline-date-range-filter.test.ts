/**
 * Timeline date-range filter (Pro "Advanced timeline filtering").
 *
 * Part 1 — pure rules: the new startDate/endDate dimension of
 * timelineEvidenceFilterRules (inclusive UTC-day bounds, malformed
 * values ignored, timestampless rows hidden while bounded).
 *
 * Part 2 — entitlement key: `advanced_timeline_filters` exists and
 * resolves Pro-only.
 *
 * Part 3 — static wiring pins on src/pages/Timeline.tsx: testids, URL
 * params, query-level bounds, gate wiring, and the missing-action seam.
 * The page's existing filters are pinned by their own suites; this file
 * pins only the additive advanced-filter surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  filterTimelineEvidenceRows,
  isTimelineDateFilterValue,
  isTimelineEvidenceFilterActive,
  timelineEvidenceRowMatches,
  type TimelineEvidenceRow,
} from "@/lib/timelineEvidenceFilterRules";
import { canUseFeature, FEATURE_KEYS } from "@/lib/featureEntitlements";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

function row(id: string, entryAt: string | null | undefined): TimelineEvidenceRow {
  return {
    id,
    note: "checked plants",
    stage: "veg",
    plant_id: null,
    tent_id: null,
    entry_at: entryAt ?? undefined,
    details: {},
  };
}

describe("isTimelineDateFilterValue", () => {
  it("accepts only plain ISO calendar dates", () => {
    expect(isTimelineDateFilterValue("2026-07-01")).toBe(true);
    for (const bad of ["2026-7-1", "07/01/2026", "2026-07-01T00:00:00Z", "", null, undefined, "not-a-date"]) {
      expect(isTimelineDateFilterValue(bad as string | null | undefined)).toBe(false);
    }
  });
});

describe("date-range matching", () => {
  const rows = [
    row("before", "2026-06-30T23:59:59.000Z"),
    row("start-day", "2026-07-01T00:00:00.000Z"),
    row("inside", "2026-07-05T12:00:00.000Z"),
    row("end-day", "2026-07-10T23:59:59.000Z"),
    row("after", "2026-07-11T00:00:00.000Z"),
    row("no-timestamp", null),
  ];

  it("bounds are inclusive of both endpoint days", () => {
    const kept = filterTimelineEvidenceRows(rows, {
      startDate: "2026-07-01",
      endDate: "2026-07-10",
    }).map((r) => r.id);
    expect(kept).toEqual(["start-day", "inside", "end-day"]);
  });

  it("supports open-ended ranges in either direction", () => {
    expect(
      filterTimelineEvidenceRows(rows, { startDate: "2026-07-05" }).map((r) => r.id),
    ).toEqual(["inside", "end-day", "after"]);
    expect(
      filterTimelineEvidenceRows(rows, { endDate: "2026-06-30" }).map((r) => r.id),
    ).toEqual(["before"]);
  });

  it("hides rows without a parseable timestamp only while a bound is active", () => {
    expect(
      timelineEvidenceRowMatches(row("x", null), { startDate: "2026-07-01" }),
    ).toBe(false);
    expect(timelineEvidenceRowMatches(row("x", null), {})).toBe(true);
  });

  it("ignores malformed bound values as no constraint", () => {
    const kept = filterTimelineEvidenceRows(rows, {
      startDate: "07/01/2026",
      endDate: "yesterday",
    });
    expect(kept).toHaveLength(rows.length);
  });

  it("composes with the other filter dimensions", () => {
    const mixed: TimelineEvidenceRow[] = [
      { ...row("a", "2026-07-05T10:00:00Z"), plant_id: "plant-1" },
      { ...row("b", "2026-07-05T11:00:00Z"), plant_id: "plant-2" },
      { ...row("c", "2026-07-20T11:00:00Z"), plant_id: "plant-1" },
    ];
    const kept = filterTimelineEvidenceRows(mixed, {
      plantId: "plant-1",
      startDate: "2026-07-01",
      endDate: "2026-07-10",
    }).map((r) => r.id);
    expect(kept).toEqual(["a"]);
  });

  it("marks the filter active for a lone date bound", () => {
    expect(isTimelineEvidenceFilterActive({ startDate: "2026-07-01" })).toBe(true);
    expect(isTimelineEvidenceFilterActive({ endDate: "2026-07-01" })).toBe(true);
    expect(isTimelineEvidenceFilterActive({ startDate: "garbage" })).toBe(false);
    expect(isTimelineEvidenceFilterActive({})).toBe(false);
  });
});

describe("advanced_timeline_filters entitlement key", () => {
  it("is a registered feature key", () => {
    expect(FEATURE_KEYS).toContain("advanced_timeline_filters");
  });

  it("resolves Pro-only", () => {
    const pro = {
      isActive: true,
      effectivePlanId: "pro_monthly",
      displayPlanId: "pro_monthly",
    } as ResolvedEntitlement;
    const free = {
      isActive: true,
      effectivePlanId: "free",
      displayPlanId: "free",
    } as ResolvedEntitlement;
    expect(canUseFeature(pro, "advanced_timeline_filters")).toBe(true);
    expect(canUseFeature(free, "advanced_timeline_filters")).toBe(false);
    expect(canUseFeature(null, "advanced_timeline_filters")).toBe(false);
  });
});

describe("static wiring — src/pages/Timeline.tsx", () => {
  const src = readFileSync(path.resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

  it("renders the date inputs and advanced-filter controls", () => {
    expect(src).toContain('data-testid="timeline-start-date"');
    expect(src).toContain('data-testid="timeline-end-date"');
    expect(src).toContain('data-testid="timeline-next-missing-action"');
    expect(src).toContain('data-testid="timeline-missing-action-banner"');
    expect(src).toContain('data-testid="timeline-missing-action-dismiss"');
    expect(src).toContain('data-testid="timeline-advanced-filters-locked"');
    expect(src).toContain('data-testid="timeline-date-range-error"');
  });

  it("gates the advanced surface through the canonical feature key", () => {
    expect(src).toMatch(/canUseFeature\(\s*entitlement,\s*"advanced_timeline_filters",?\s*\)/);
    expect(src).toMatch(/from "@\/hooks\/useMyEntitlements"/);
    expect(src).toMatch(/disabled=\{!advancedTimelineUnlocked\}/);
  });

  it("distinguishes entitlement verification failure from a verified Free plan", () => {
    expect(src).toMatch(/lookupFailed/);
    expect(src).toMatch(/refetch/);
    expect(src).toContain('data-testid="timeline-advanced-filters-verification-failed"');
    expect(src).toContain('data-testid="timeline-advanced-filters-retry"');
    expect(src).toMatch(/!lookupFailed\s*&&\s*\(/);
  });

  it("mirrors the range to ?start/?end URL params", () => {
    expect(src).toContain('const TIMELINE_START_DATE_PARAM = "start"');
    expect(src).toContain('const TIMELINE_END_DATE_PARAM = "end"');
  });

  it("applies the bounds at the query level for initial load AND keyset pagination", () => {
    const gteCount = (src.match(/\.gte\("entry_at"/g) ?? []).length;
    const lteCount = (src.match(/\.lte\("entry_at"/g) ?? []).length;
    expect(gteCount).toBeGreaterThanOrEqual(2);
    expect(lteCount).toBeGreaterThanOrEqual(2);
    expect(src).toContain("T00:00:00.000Z");
    expect(src).toContain("T23:59:59.999Z");
  });

  it("threads the dates through the evidence filter input and clear action", () => {
    expect(src).toMatch(/startDate:\s*effectiveStartDate/);
    expect(src).toMatch(/endDate:\s*effectiveEndDate/);
    expect(src).toContain('setStartDateFilter("")');
    expect(src).toContain('setEndDateFilter("")');
  });

  it("wires the missing-action jump through the pure rules module", () => {
    expect(src).toMatch(/from "@\/lib\/timelineMissingActionRules"/);
    expect(src).toMatch(/findNextMissingAction\(recentLaneRawEntries,\s*new Date\(\)\)/);
    expect(src).toMatch(/findNewestEntryIdForCategory\(entries,/);
    expect(src).toMatch(/scrollIntoView\(/);
    expect(src).toMatch(/prefers-reduced-motion/);
  });

  it("an inverted range applies nothing instead of guessing", () => {
    expect(src).toMatch(/dateRangeInvalid\s*\?\s*null\s*:\s*appliedStartDate/);
    expect(src).toMatch(/dateRangeInvalid\s*\?\s*null\s*:\s*appliedEndDate/);
  });
});
