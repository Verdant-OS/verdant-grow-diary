import { describe, it, expect } from "vitest";
import {
  isQuickLogPhotoSavingSupported,
  buildQuickLogPhotoGateState,
} from "@/lib/quickLogPhotoGateRules";

describe("quickLogPhotoGateRules", () => {
  it("isQuickLogPhotoSavingSupported returns false in Gate 1", () => {
    expect(isQuickLogPhotoSavingSupported()).toBe(false);
  });

  it("buildQuickLogPhotoGateState returns supported=false", () => {
    const gate = buildQuickLogPhotoGateState();
    expect(gate.supported).toBe(false);
    expect(gate.reason).toBe("photo_saving_not_enabled");
  });

  it("gate state includes calm disabled copy", () => {
    const gate = buildQuickLogPhotoGateState();
    expect(gate.disabledTitle).toBe("Photo saving is not enabled yet");
    expect(gate.disabledCopy).toMatch(/not enabled yet/i);
    expect(gate.disabledCopy).not.toMatch(/upload works/i);
    expect(gate.disabledCopy).not.toMatch(/live/i);
  });

  it("gate state includes aria label and helper text", () => {
    const gate = buildQuickLogPhotoGateState();
    expect(gate.ariaLabel).toMatch(/unavailable/i);
    expect(gate.helperText).toMatch(/not be stored/i);
  });

  it("gate state includes future action label", () => {
    const gate = buildQuickLogPhotoGateState();
    expect(gate.futureActionLabel).toBe("Add photo");
  });

  it("gate state is deterministic (same output every call)", () => {
    const a = buildQuickLogPhotoGateState();
    const b = buildQuickLogPhotoGateState();
    expect(a).toEqual(b);
  });
});
