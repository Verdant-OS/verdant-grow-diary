/**
 * Two same-type entries on the same calendar day need distinct Open names.
 * The differentiator is optional, so callers that omit it keep the title-and-date name.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { timelineEntryOpenAccessibleName } from "@/lib/timelineEntryOpenLabelRules";

const TIMELINE = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

describe("timeline entry Open labels stay distinct on one day", () => {
  it("uses an optional differentiator so two same-type same-day entries differ", () => {
    const morning = timelineEntryOpenAccessibleName({
      title: "Water",
      occurredAtLabel: "Oct 12, 2026",
      differentiator: "8:00 AM",
    });
    const evening = timelineEntryOpenAccessibleName({
      title: "Water",
      occurredAtLabel: "Oct 12, 2026",
      differentiator: "6:30 PM",
    });
    expect(morning).toBe("Open Water Oct 12, 2026 8:00 AM");
    expect(evening).toBe("Open Water Oct 12, 2026 6:30 PM");
    expect(morning).not.toBe(evening);
  });

  it("keeps the title-and-date name when no differentiator is passed", () => {
    expect(
      timelineEntryOpenAccessibleName({
        title: "Water",
        occurredAtLabel: "Oct 12, 2026",
      }),
    ).toBe("Open Water Oct 12, 2026");
  });

  it("ignores a blank differentiator", () => {
    expect(
      timelineEntryOpenAccessibleName({
        title: "Water",
        occurredAtLabel: "Oct 12, 2026",
        differentiator: "   ",
      }),
    ).toBe("Open Water Oct 12, 2026");
  });

  it("passes the entry time into the Open name from the timeline card", () => {
    expect(TIMELINE).toMatch(/differentiator:\s*openDifferentiator/);
    expect(TIMELINE).toContain('format(new Date(e.entry_at), "p")');
  });
});
