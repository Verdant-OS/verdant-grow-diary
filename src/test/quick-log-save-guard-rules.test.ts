import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_POST_SAVE_ANOTHER_LABEL,
  QUICK_LOG_POST_SAVE_CLOSE_LABEL,
  QUICK_LOG_POST_SAVE_VIEW_LABEL,
  buildQuickLogPostSaveMessage,
  rotateQuickLogIdempotencyKey,
  resolveQuickLogPostSaveTargetLabel,
  shouldAllowQuickLogSave,
} from "@/lib/quickLogSaveGuardRules";

describe("shouldAllowQuickLogSave", () => {
  it("allows a save when idle", () => {
    expect(shouldAllowQuickLogSave({ saving: false, inFlight: false, postSaveShown: false })).toBe(
      true,
    );
  });

  it("blocks when a save is already in-flight (React state)", () => {
    expect(shouldAllowQuickLogSave({ saving: true, inFlight: false, postSaveShown: false })).toBe(
      false,
    );
  });

  it("blocks when a save is already in-flight (sync ref, before React repaint)", () => {
    expect(shouldAllowQuickLogSave({ saving: false, inFlight: true, postSaveShown: false })).toBe(
      false,
    );
  });

  it("blocks when the post-save card is shown (must Log another to submit again)", () => {
    expect(shouldAllowQuickLogSave({ saving: false, inFlight: false, postSaveShown: true })).toBe(
      false,
    );
  });

  it("blocks all combinations of active + post-save", () => {
    for (const [saving, inFlight, postSaveShown] of [
      [true, true, true],
      [true, false, true],
      [false, true, true],
    ] as const) {
      expect(shouldAllowQuickLogSave({ saving, inFlight, postSaveShown })).toBe(false);
    }
  });
});

describe("rotateQuickLogIdempotencyKey", () => {
  it("advances monotonically", () => {
    expect(rotateQuickLogIdempotencyKey(1)).toBe(2);
    expect(rotateQuickLogIdempotencyKey(42)).toBe(43);
  });

  it("resets non-finite / negative to 1", () => {
    expect(rotateQuickLogIdempotencyKey(Number.NaN)).toBe(1);
    expect(rotateQuickLogIdempotencyKey(-5)).toBe(1);
    expect(rotateQuickLogIdempotencyKey(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("is deterministic (no random, no time)", () => {
    for (let i = 0; i < 5; i++) {
      expect(rotateQuickLogIdempotencyKey(7)).toBe(8);
    }
  });
});

describe("buildQuickLogPostSaveMessage", () => {
  it("mentions photo when a photo was attached", () => {
    expect(buildQuickLogPostSaveMessage("note", true)).toContain("Log and photo saved");
  });

  it("uses log-only copy when no photo", () => {
    expect(buildQuickLogPostSaveMessage("note", false)).toContain("Log saved");
  });

  it("appends the action label when present", () => {
    expect(buildQuickLogPostSaveMessage("feed", false)).toBe("Log saved — feed");
  });

  it("omits the trailing action separator when action is empty", () => {
    expect(buildQuickLogPostSaveMessage("", false)).toBe("Log saved");
  });

  it("never invents yield / quality copy", () => {
    const msg = buildQuickLogPostSaveMessage("water", true);
    expect(msg).not.toMatch(/yield|harvest|quality|grade|certain/i);
  });
});

describe("post-save CTA labels", () => {
  it("exposes stable, human-facing button copy", () => {
    expect(QUICK_LOG_POST_SAVE_VIEW_LABEL).toBe("View diary");
    expect(QUICK_LOG_POST_SAVE_ANOTHER_LABEL).toBe("Log another");
    expect(QUICK_LOG_POST_SAVE_CLOSE_LABEL).toBe("Dismiss");
  });
});

describe("resolveQuickLogPostSaveTargetLabel", () => {
  const options = Object.freeze([
    Object.freeze({ type: "plant" as const, id: "plant-one", label: "Plant One" }),
    Object.freeze({ type: "tent" as const, id: "tent-one", label: "Tent One" }),
  ]);

  it.each([
    ["plant", "plant-one", "Plant One"],
    ["tent", "tent-one", "Tent One"],
  ] as const)("uses the confirmed %s label", (targetType, targetId, label) => {
    expect(resolveQuickLogPostSaveTargetLabel({ targetType, targetId }, options)).toBe(label);
  });

  it("does not label a verified null target from the available draft options", () => {
    expect(
      resolveQuickLogPostSaveTargetLabel({ targetType: null, targetId: null }, options),
    ).toBeNull();
  });

  it.each([null, "", "   ", "unknown-plant"])("handles an unavailable target id %j", (targetId) => {
    expect(
      resolveQuickLogPostSaveTargetLabel({ targetType: "plant", targetId }, options),
    ).toBeNull();
  });

  it.each([null, undefined])("handles an absent saved state %j", (success) => {
    expect(resolveQuickLogPostSaveTargetLabel(success, options)).toBeNull();
  });

  it.each([null, undefined])("handles absent target options %j", (missingOptions) => {
    expect(
      resolveQuickLogPostSaveTargetLabel(
        { targetType: "plant", targetId: "plant-one" },
        missingOptions,
      ),
    ).toBeNull();
  });

  it("is deterministic and does not mutate its inputs", () => {
    const success = Object.freeze({ targetType: "plant" as const, targetId: "plant-one" });
    const before = structuredClone({ success, options });
    expect(resolveQuickLogPostSaveTargetLabel(success, options)).toBe(
      resolveQuickLogPostSaveTargetLabel(success, options),
    );
    expect({ success, options }).toEqual(before);
  });
});
