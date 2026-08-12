import { describe, it, expect } from "vitest";
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

describe("QUICK_LOG unified post-save copy", () => {
  it("exposes the same title, save-failed copy, and CTA labels", () => {
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
  it("uses the current setup name when supplied", () => {
    const desc = buildQuickLogPostSaveDescription({
      setupName: "Fall 2025",
      targetName: "Skywalker #2",
      tentName: "Tent A",
      growName: "Fall 2025",
      action: "note",
      photoAttached: false,
    });
    expect(desc).toBe("Added to Fall 2025.");
  });

  it("uses the legacy grow-name input when a dedicated setup name is absent", () => {
    const desc = buildQuickLogPostSaveDescription({
      targetName: "Skywalker #2",
      growName: "Tent 3 setup",
      action: "note",
      photoAttached: true,
    });
    expect(desc).toBe("Added to Tent 3 setup.");
  });

  it("trims setup copy and falls back to a calm diary confirmation", () => {
    const desc = buildQuickLogPostSaveDescription({
      setupName: "  ",
      targetName: "Blue Dream",
      action: "",
      photoAttached: false,
    });
    expect(desc).toBe("Added to your diary.");
  });

  it("never claims an outcome, quality, or diagnosis", () => {
    const desc = buildQuickLogPostSaveDescription({
      targetName: "P1",
      action: "harvest",
      photoAttached: true,
    });
    expect(desc).not.toMatch(/yield|quality|diagnos|grade|certain/i);
  });

  it("is deterministic across identical inputs", () => {
    const input = {
      targetName: "P1",
      tentName: "T",
      growName: "G",
      action: "note",
      photoAttached: false,
    } as const;
    const a = buildQuickLogPostSaveDescription(input);
    const b = buildQuickLogPostSaveDescription(input);
    expect(a).toBe(b);
  });
});

describe("shouldBlockQuickLogClose", () => {
  it("blocks close while saving", () => {
    expect(shouldBlockQuickLogClose({ saving: true, inFlight: false })).toBe(true);
  });
  it("blocks close while sync in-flight ref is claimed", () => {
    expect(shouldBlockQuickLogClose({ saving: false, inFlight: true })).toBe(true);
  });
  it("allows close when idle", () => {
    expect(shouldBlockQuickLogClose({ saving: false, inFlight: false })).toBe(false);
  });
  it("blocks close on any active combination", () => {
    expect(shouldBlockQuickLogClose({ saving: true, inFlight: true })).toBe(true);
  });
});
