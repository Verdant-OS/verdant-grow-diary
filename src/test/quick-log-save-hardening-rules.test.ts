import { describe, expect, it } from "vitest";
import {
  QUICK_LOG_CLOSE_BLOCKED_HINT,
  QUICK_LOG_POST_SAVE_ANOTHER_LABEL,
  QUICK_LOG_POST_SAVE_CLOSE_LABEL,
  QUICK_LOG_POST_SAVE_TITLE,
  QUICK_LOG_POST_SAVE_VIEW_LABEL,
  QUICK_LOG_SAVE_FAILED_MESSAGE,
  buildQuickLogPostSaveDescription,
  shouldBlockQuickLogClose,
} from "@/lib/quickLogSaveGuardRules";

describe("Quick Log successful-save language", () => {
  it("uses the approved diary copy on both Quick Log presenters", () => {
    expect(QUICK_LOG_POST_SAVE_TITLE).toBe("Saved to your diary");
    expect(QUICK_LOG_POST_SAVE_VIEW_LABEL).toBe("View diary");
    expect(QUICK_LOG_POST_SAVE_ANOTHER_LABEL).toBe("Log another");
    expect(QUICK_LOG_POST_SAVE_CLOSE_LABEL).toBe("Dismiss");
    expect(QUICK_LOG_SAVE_FAILED_MESSAGE).toBe(
      "Save failed. Your draft is still here. Check your connection and try again.",
    );
    expect(QUICK_LOG_CLOSE_BLOCKED_HINT).toContain("Save in progress");
  });
});

describe("buildQuickLogPostSaveDescription", () => {
  it("names the human-readable setup and no opaque ids", () => {
    const description = buildQuickLogPostSaveDescription({
      targetName: "Skywalker #2",
      tentName: "Tent A",
      growName: "Fall 2026",
      action: "note",
      photoAttached: false,
    });
    expect(description).toBe("Added to Fall 2026.");
    expect(description).not.toMatch(/grow[_-]?id|plant[_-]?id|tent[_-]?id/i);
  });

  it("falls back conservatively when the setup name is unavailable", () => {
    expect(
      buildQuickLogPostSaveDescription({
        targetName: "Plant 1",
        growName: null,
        action: "watering",
        photoAttached: true,
      }),
    ).toBe("Saved to your diary.");
  });

  it("is deterministic and never claims yield, quality, or diagnosis", () => {
    const input = {
      targetName: "P1",
      tentName: "T1",
      growName: "G1",
      action: "harvest",
      photoAttached: true,
    } as const;
    expect(buildQuickLogPostSaveDescription(input)).toBe(buildQuickLogPostSaveDescription(input));
    expect(buildQuickLogPostSaveDescription(input)).not.toMatch(
      /yield|quality|diagnos|grade|certain/i,
    );
  });
});

describe("shouldBlockQuickLogClose", () => {
  it("blocks close while saving or synchronously in flight", () => {
    expect(shouldBlockQuickLogClose({ saving: true, inFlight: false })).toBe(true);
    expect(shouldBlockQuickLogClose({ saving: false, inFlight: true })).toBe(true);
    expect(shouldBlockQuickLogClose({ saving: true, inFlight: true })).toBe(true);
  });

  it("allows close when idle", () => {
    expect(shouldBlockQuickLogClose({ saving: false, inFlight: false })).toBe(false);
  });
});
