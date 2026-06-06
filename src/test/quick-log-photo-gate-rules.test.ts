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

  it("gate state exposes active picker labels for PlantQuickLog reuse", () => {
    const gate = buildQuickLogPhotoGateState();
    expect(gate.takePhotoLabel).toBe("Take Photo");
    expect(gate.chooseLibraryLabel).toBe("Choose from Library");
    expect(gate.pickerHelperText).toMatch(/already on your phone/i);
    expect(gate.pickerHelperText).toMatch(/optional/i);
    expect(gate.cameraInputAriaLabel).toMatch(/camera/i);
    expect(gate.libraryInputAriaLabel).toMatch(/library/i);
  });

  it("active picker labels are present regardless of supported flag", () => {
    // Even while photo saving is gated off in QuickLogV2Sheet, PlantQuickLog
    // still renders the active picker, so labels must always be populated.
    const gate = buildQuickLogPhotoGateState();
    expect(gate.takePhotoLabel.length).toBeGreaterThan(0);
    expect(gate.chooseLibraryLabel.length).toBeGreaterThan(0);
    expect(gate.cameraInputAriaLabel.length).toBeGreaterThan(0);
    expect(gate.libraryInputAriaLabel.length).toBeGreaterThan(0);
  });

  it("gate state is deterministic (same output every call)", () => {
    const a = buildQuickLogPhotoGateState();
    const b = buildQuickLogPhotoGateState();
    expect(a).toEqual(b);
  });
});
