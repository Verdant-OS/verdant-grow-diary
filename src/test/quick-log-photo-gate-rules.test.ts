import { describe, it, expect } from "vitest";
import {
  isQuickLogPhotoSavingSupported,
  buildQuickLogPhotoGateState,
} from "@/lib/quickLogPhotoGateRules";

describe("quickLogPhotoGateRules", () => {
  it("isQuickLogPhotoSavingSupported returns true for active Quick Log attachments", () => {
    expect(isQuickLogPhotoSavingSupported()).toBe(true);
  });

  it("buildQuickLogPhotoGateState returns supported=true", () => {
    const gate = buildQuickLogPhotoGateState();
    expect(gate.supported).toBe(true);
    expect(gate.reason).toBe("enabled");
  });

  it("enabled gate state has no disabled copy", () => {
    const gate = buildQuickLogPhotoGateState();
    expect(gate.disabledTitle).toBe("");
    expect(gate.disabledCopy).toBe("");
    expect(gate.helperText).toBe("");
    expect(gate.ariaLabel).toBe("Photo saving is available");
  });

  it("gate state includes future action label", () => {
    const gate = buildQuickLogPhotoGateState();
    expect(gate.futureActionLabel).toBe("Add photo");
  });

  it("gate state exposes active picker labels", () => {
    const gate = buildQuickLogPhotoGateState();
    expect(gate.takePhotoLabel).toBe("Take Photo");
    expect(gate.chooseLibraryLabel).toBe("Choose from Library");
    expect(gate.pickerHelperText).toMatch(/already on your phone/i);
    expect(gate.pickerHelperText).toMatch(/optional/i);
    expect(gate.cameraInputAriaLabel).toMatch(/camera/i);
    expect(gate.libraryInputAriaLabel).toMatch(/library/i);
  });

  it("gate state is deterministic (same output every call)", () => {
    const a = buildQuickLogPhotoGateState();
    const b = buildQuickLogPhotoGateState();
    expect(a).toEqual(b);
  });
});
