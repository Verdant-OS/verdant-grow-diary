import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatRelativeTimelineHeader,
  type RelativeTimelineItem,
} from "@/lib/relativeTimelineProjectionRules";

const ROOT = resolve(__dirname, "../..");
const PROJECTION_RULES_SRC = readFileSync(
  resolve(ROOT, "src/lib/relativeTimelineProjectionRules.ts"),
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

// 2026-10-16T01:30:00Z is still Oct 15 evening in US Central / Pacific, but Oct 16 in UTC and Tokyo.
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

describe("Plant last-updated header — regression fence (#2206)", () => {
  it("formatHeaderDate must not pin calendar day to UTC", () => {
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

  it("formatRelativeTimelineHeader follows host timezone for calendar day", () => {
    withTimeZone("UTC", () => {
      expect(formatRelativeTimelineHeader([timelineItem("e-utc")]).lastUpdatedLabel).toBe(
        "Last updated October 16, 2026",
      );
    });

    withTimeZone("America/Chicago", () => {
      expect(formatRelativeTimelineHeader([timelineItem("e-ct")]).lastUpdatedLabel).toBe(
        "Last updated October 15, 2026",
      );
    });

    withTimeZone("America/Los_Angeles", () => {
      expect(formatRelativeTimelineHeader([timelineItem("e-pt")]).lastUpdatedLabel).toBe(
        "Last updated October 15, 2026",
      );
    });

    withTimeZone("Asia/Tokyo", () => {
      expect(formatRelativeTimelineHeader([timelineItem("e-jst")]).lastUpdatedLabel).toBe(
        "Last updated October 16, 2026",
      );
    });
  });
});
