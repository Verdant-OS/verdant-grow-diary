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
    expect(QUICK_LOG_POST_SAVE_TITLE).toBe("Saved");
    expect(QUICK_LOG_POST_SAVE_VIEW_LABEL).toBe("View timeline");
    expect(QUICK_LOG_POST_SAVE_ANOTHER_LABEL).toBe("Log another");
    expect(QUICK_LOG_POST_SAVE_CLOSE_LABEL).toBe("Close");
    expect(QUICK_LOG_SAVE_FAILED_MESSAGE).toBe(
      "Save failed. Your draft is still here. Check your connection and try again.",
    );
    expect(QUICK_LOG_CLOSE_BLOCKED_HINT).toContain("Save in progress");
  });
});

describe("buildQuickLogPostSaveDescription", () => {
  it("includes verb, target, tent, and grow when supplied", () => {
    const desc = buildQuickLogPostSaveDescription({
      targetName: "Skywalker #2",
      tentName: "Tent A",
      growName: "Fall 2025",
      action: "note",
      photoAttached: false,
    });
    expect(desc).toBe("Logged note to Skywalker #2 · Tent A · Fall 2025 · just now");
  });

  it("mentions photo when a photo was attached", () => {
    const desc = buildQuickLogPostSaveDescription({
      targetName: "Skywalker #2",
      action: "note",
      photoAttached: true,
    });
    expect(desc).toContain("with photo");
  });

  it("falls back to 'entry' when action is blank", () => {
    const desc = buildQuickLogPostSaveDescription({
      targetName: "Blue Dream",
      action: "",
      photoAttached: false,
    });
    expect(desc.startsWith("Logged entry ")).toBe(true);
  });

  it("omits scope when no target name is supplied", () => {
    const desc = buildQuickLogPostSaveDescription({
      targetName: null,
      action: "watering",
      photoAttached: false,
    });
    expect(desc).toBe("Logged watering · just now");
  });

  it("never claims yield / quality / diagnosis", () => {
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
