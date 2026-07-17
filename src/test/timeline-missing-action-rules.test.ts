/**
 * timelineMissingActionRules — pure cadence/missing-action inference.
 *
 * Covers: category resolution (delegated to the canonical classifier),
 * rhythm inference (median gap, clamps, minimum samples), most-behind
 * selection with deterministic tie-breaks, scroll-anchor lookup, copy
 * builders, and a static safety scan of the module source.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildMissingActionCopy,
  findNewestEntryIdForCategory,
  findNextMissingAction,
  inferCareCadence,
  MISSING_ACTION_CATEGORIES,
  MISSING_ACTION_DISCLAIMER_COPY,
  MISSING_ACTION_MAX_GAP_DAYS,
  MISSING_ACTION_MIN_GAP_DAYS,
  MISSING_ACTION_MIN_SAMPLES,
  MISSING_ACTION_NOT_ENOUGH_HISTORY_COPY,
  MISSING_ACTION_NOTHING_MISSING_COPY,
  resolveMissingActionCategory,
  type MissingActionRow,
} from "@/lib/timelineMissingActionRules";

const NOW = new Date("2026-07-17T12:00:00.000Z");

function row(id: string, eventType: string | null, entryAt: string | null): MissingActionRow {
  return {
    id,
    entry_at: entryAt,
    details: eventType === null ? {} : { event_type: eventType },
  };
}

/** N days before NOW as ISO. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("resolveMissingActionCategory", () => {
  it("maps care event types through the canonical classifier", () => {
    expect(resolveMissingActionCategory(row("1", "watering", daysAgo(1)))).toBe("watering");
    expect(resolveMissingActionCategory(row("2", "feeding", daysAgo(1)))).toBe("feeding");
    expect(resolveMissingActionCategory(row("3", "training", daysAgo(1)))).toBe("training");
    expect(resolveMissingActionCategory(row("4", "defoliation", daysAgo(1)))).toBe("training");
  });

  it("maps environment evidence (checks, snapshots, measurements) to environment", () => {
    expect(resolveMissingActionCategory(row("1", "environment", daysAgo(1)))).toBe("environment");
    expect(resolveMissingActionCategory(row("2", "environment_check", daysAgo(1)))).toBe("environment");
    expect(resolveMissingActionCategory(row("3", "manual_snapshot", daysAgo(1)))).toBe("environment");
    expect(resolveMissingActionCategory(row("4", "measurement", daysAgo(1)))).toBe("environment");
  });

  it("returns null for non-care entries", () => {
    for (const t of ["note", "photo", "harvest", "pest_disease", "transplant", "reminder", null]) {
      expect(resolveMissingActionCategory(row("x", t, daysAgo(1)))).toBeNull();
    }
  });
});

describe("inferCareCadence", () => {
  it("requires the minimum sample count before inferring anything", () => {
    const rows = [row("1", "watering", daysAgo(2)), row("2", "watering", daysAgo(4))];
    expect(rows.length).toBeLessThan(MISSING_ACTION_MIN_SAMPLES);
    expect(inferCareCadence(rows, "watering")).toBeNull();
  });

  it("uses the median gap in days", () => {
    // Gaps: 1 day, 2 days, 10 days → median 2.
    const rows = [
      row("1", "watering", daysAgo(13)),
      row("2", "watering", daysAgo(3)),
      row("3", "watering", daysAgo(1)),
      row("4", "watering", daysAgo(0)),
    ];
    const cadence = inferCareCadence(rows, "watering");
    expect(cadence?.typicalGapDays).toBe(2);
    expect(cadence?.sampleCount).toBe(4);
    expect(cadence?.lastAtIso).toBe(daysAgo(0));
  });

  it("clamps inferred gaps into the sane range", () => {
    // Sub-day gaps clamp up to the minimum.
    const tight = [
      row("1", "feeding", new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString()),
      row("2", "feeding", new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString()),
      row("3", "feeding", new Date(NOW.getTime() - 1 * 60 * 60 * 1000).toISOString()),
    ];
    expect(inferCareCadence(tight, "feeding")?.typicalGapDays).toBe(MISSING_ACTION_MIN_GAP_DAYS);
    // Huge gaps clamp down to the maximum.
    const sparse = [
      row("1", "feeding", daysAgo(200)),
      row("2", "feeding", daysAgo(100)),
      row("3", "feeding", daysAgo(0)),
    ];
    expect(inferCareCadence(sparse, "feeding")?.typicalGapDays).toBe(MISSING_ACTION_MAX_GAP_DAYS);
  });

  it("ignores rows with unparseable timestamps instead of guessing", () => {
    const rows = [
      row("1", "watering", "not-a-date"),
      row("2", "watering", null),
      row("3", "watering", daysAgo(4)),
      row("4", "watering", daysAgo(2)),
      row("5", "watering", daysAgo(0)),
    ];
    const cadence = inferCareCadence(rows, "watering");
    expect(cadence?.sampleCount).toBe(3);
    expect(cadence?.typicalGapDays).toBe(2);
  });
});

describe("findNextMissingAction", () => {
  it("returns not_enough_history when no category has a rhythm", () => {
    const rows = [row("1", "watering", daysAgo(1)), row("2", "note", daysAgo(2))];
    expect(findNextMissingAction(rows, NOW)).toEqual({ status: "not_enough_history" });
  });

  it("returns nothing_missing when every rhythm is within its gap", () => {
    const rows = [
      row("1", "watering", daysAgo(6)),
      row("2", "watering", daysAgo(4)),
      row("3", "watering", daysAgo(2)),
      row("4", "watering", daysAgo(1)),
    ];
    expect(findNextMissingAction(rows, NOW).status).toBe("nothing_missing");
  });

  it("surfaces the most-behind category with honest numbers", () => {
    const rows = [
      // Watering rhythm every 2 days, last 3 days ago → 1 day behind.
      row("w1", "watering", daysAgo(9)),
      row("w2", "watering", daysAgo(7)),
      row("w3", "watering", daysAgo(5)),
      row("w4", "watering", daysAgo(3)),
      // Feeding rhythm every 2 days, last 8 days ago → 6 days behind (winner).
      row("f1", "feeding", daysAgo(14)),
      row("f2", "feeding", daysAgo(12)),
      row("f3", "feeding", daysAgo(10)),
      row("f4", "feeding", daysAgo(8)),
    ];
    const result = findNextMissingAction(rows, NOW);
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.suggestion.category).toBe("feeding");
      expect(result.suggestion.categoryLabel).toBe("Feeding");
      expect(result.suggestion.typicalGapDays).toBe(2);
      expect(result.suggestion.daysSinceLast).toBe(8);
      expect(result.suggestion.lastAtIso).toBe(daysAgo(8));
    }
  });

  it("is deterministic for the injected now", () => {
    const rows = [
      row("w1", "watering", daysAgo(9)),
      row("w2", "watering", daysAgo(7)),
      row("w3", "watering", daysAgo(5)),
    ];
    const a = findNextMissingAction(rows, NOW);
    const b = findNextMissingAction(rows, NOW);
    expect(a).toEqual(b);
  });
});

describe("findNewestEntryIdForCategory", () => {
  it("returns the newest timestamped row id for the category", () => {
    const rows = [
      row("old", "watering", daysAgo(5)),
      row("new", "watering", daysAgo(1)),
      row("other", "feeding", daysAgo(0)),
      row("broken", "watering", "not-a-date"),
    ];
    expect(findNewestEntryIdForCategory(rows, "watering")).toBe("new");
    expect(findNewestEntryIdForCategory(rows, "training")).toBeNull();
  });
});

describe("copy", () => {
  it("builds suggestion copy with singular/plural day forms", () => {
    expect(
      buildMissingActionCopy({
        category: "watering",
        categoryLabel: "Watering",
        typicalGapDays: 1,
        daysSinceLast: 1,
        lastAtIso: daysAgo(1),
      }),
    ).toBe("Watering may be due — last logged 1 day ago; your logged rhythm is every day.");
    expect(
      buildMissingActionCopy({
        category: "environment",
        categoryLabel: "Environment check",
        typicalGapDays: 3,
        daysSinceLast: 7,
        lastAtIso: daysAgo(7),
      }),
    ).toBe(
      "Environment check may be due — last logged 7 days ago; your logged rhythm is about every 3 days.",
    );
  });

  it("exports honest empty/disclaimer copy", () => {
    expect(MISSING_ACTION_NOT_ENOUGH_HISTORY_COPY).toContain("Not enough logged history");
    expect(MISSING_ACTION_NOTHING_MISSING_COPY).toContain("logged history");
    expect(MISSING_ACTION_DISCLAIMER_COPY).toBe(
      "Based only on your logged history. You decide what your plants need.",
    );
    expect(MISSING_ACTION_CATEGORIES).toEqual(["watering", "feeding", "environment", "training"]);
  });
});

describe("static safety — module source", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../lib/timelineMissingActionRules.ts"),
    "utf8",
  );

  it("stays pure: no I/O, React, DOM, or Supabase", () => {
    expect(src).not.toMatch(/from ["'][^"']*supabase/i);
    expect(src).not.toMatch(/from ["']react["']/);
    expect(src).not.toMatch(/\bdocument\.|\bwindow\./);
    expect(src).not.toMatch(/fetch\(|\.rpc\(|functions\.invoke/);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(src).not.toMatch(/service_role|raw_payload|bridge_token/i);
  });

  it("delegates classification to the canonical module", () => {
    expect(src).toMatch(/from "@\/lib\/timelineEntryClassification"/);
    expect(src).toMatch(/classifyTimelineEntry\(/);
  });

  it("keeps over-claim and device vocabulary out", () => {
    expect(src).not.toMatch(
      /\b(healthy|guaranteed|fixed|urgent|critical|ideal|autopilot|automatically)\b/i,
    );
    expect(src).not.toMatch(/\b(relay|actuator|mqtt|webhook|dispatchCommand)\b/i);
    expect(src).not.toMatch(/\b(turn|activate)\b[^\n]*\b(fan|light|pump|heater|humidifier|dehumidifier)\b/i);
  });

  it("suggestion copy stays hedged — 'may be due', never a command", () => {
    expect(src).toContain("may be due");
    expect(src).not.toMatch(/\bmust\s+(water|feed|train)\b/i);
    expect(src).not.toMatch(/\boverdue\b[^\n]*!\s*"/);
  });
});
