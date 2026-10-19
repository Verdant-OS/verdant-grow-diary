import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatRelativeTimelineHeader,
  type RelativeTimelineItem,
} from "@/lib/relativeTimelineProjectionRules";

/**
 * Ported from draft #2213 (the cases not already on base). The America/Chicago
 * case for this timestamp is pinned in src/test/plant-last-updated-local-date-2206.test.tsx
 * and the UTC-midnight cases in src/test/plant-last-updated-utc-midnight-2206.test.tsx.
 */
const PROJECTION_RULES_SRC = readFileSync(
  resolve(process.cwd(), "src/lib/relativeTimelineProjectionRules.ts"),
  "utf8",
);

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function withTimeZone<T>(tz: string, fn: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

// 2026-10-16T01:30:00Z is still Oct 15 evening in US Pacific, but Oct 16 in UTC and Tokyo.
const EVENING_UTC_ISO = "2026-10-16T01:30:00Z";

function timelineItem(id: string): RelativeTimelineItem {
  return {
    id,
    eventType: "note",
    title: "Evening check",
    occurredAt: EVENING_UTC_ISO,
    occurredAtLabel: EVENING_UTC_ISO,
    plantDay: 14,
    stageDay: null,
    source: "note",
    stagePreset: null,
    plantId: "plant-regression",
    tentId: null,
  };
}

describe("Plant last-updated header: host-timezone calendar day (#2206)", () => {
  // Absence fence: proves the UTC pin construct is not present in formatHeaderDate.
  it("formatHeaderDate does not pin the calendar day to UTC", () => {
    const fnStart = PROJECTION_RULES_SRC.indexOf("function formatHeaderDate");
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = PROJECTION_RULES_SRC.indexOf("\nfunction ", fnStart + 1);
    const fnBody =
      fnEnd === -1
        ? PROJECTION_RULES_SRC.slice(fnStart)
        : PROJECTION_RULES_SRC.slice(fnStart, fnEnd);
    expect(fnBody).not.toMatch(/timeZone:\s*["']UTC["']/);
    expect(fnBody).toMatch(/Intl\.DateTimeFormat\(/);
  });

  it.each([
    ["UTC", "Last updated October 16, 2026"],
    ["America/Los_Angeles", "Last updated October 15, 2026"],
    ["Asia/Tokyo", "Last updated October 16, 2026"],
  ])("formats an Oct 16 01:30Z entry in %s as %s", (tz, expected) => {
    withTimeZone(tz, () => {
      expect(formatRelativeTimelineHeader([timelineItem(`e-${tz}`)]).lastUpdatedLabel).toBe(
        expected,
      );
    });
  });
});
