/**
 * Quick Log photo source picker — static + structural tests for the
 * "Take Photo" vs "Choose from Library" split inside PlantQuickLog.
 *
 * Pure source scan so we don't need to spin up Supabase / auth / query
 * client mocks for a small UI affordance change. Behavior-bearing logic
 * (file → uploaded path → diary_entries write) is covered by:
 *   - src/test/plant-quick-log.test.ts
 *   - src/test/plant-quick-log-photo-source-picker.integration.test.tsx
 *
 * PlantQuickLog consumes visible picker copy from quickLogPhotoGateRules
 * so the QuickLogV2Sheet gate and the active PlantQuickLog picker cannot
 * drift on labels/aria-labels.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildQuickLogPhotoGateState } from "@/lib/quickLogPhotoGateRules";

const SRC = readFileSync(
  resolve(__dirname, "../components/PlantQuickLog.tsx"),
  "utf8",
);

function countMatches(re: RegExp): number {
  return SRC.match(re)?.length ?? 0;
}

describe("PlantQuickLog photo source picker", () => {
  it("imports and consumes the shared quickLogPhotoGateRules helper", () => {
    expect(SRC).toMatch(/from "@\/lib\/quickLogPhotoGateRules"/);
    expect(SRC).toMatch(/buildQuickLogPhotoGateState\(\)/);
    expect(SRC).toMatch(/photoGate\.takePhotoLabel/);
    expect(SRC).toMatch(/photoGate\.chooseLibraryLabel/);
    expect(SRC).toMatch(/photoGate\.cameraInputAriaLabel/);
    expect(SRC).toMatch(/photoGate\.libraryInputAriaLabel/);
  });

  it("shared helper exposes the labels PlantQuickLog renders", () => {
    const gate = buildQuickLogPhotoGateState();
    expect(gate.takePhotoLabel).toBe("Take Photo");
    expect(gate.chooseLibraryLabel).toBe("Choose from Library");
    expect(gate.pickerHelperText).toMatch(/already on your phone/i);
    expect(gate.cameraInputAriaLabel).toMatch(/camera/i);
    expect(gate.libraryInputAriaLabel).toMatch(/library/i);
  });

  it("renders a 'Take Photo' button wired to the camera-capture input", () => {
    expect(SRC).toMatch(/data-testid="plant-quick-log-take-photo-button"/);
    expect(SRC).toMatch(/onClick=\{\(\) => fileRef\.current\?\.click\(\)\}/);
  });

  it("renders a 'Choose from Library' button wired to a separate input", () => {
    expect(SRC).toMatch(/data-testid="plant-quick-log-choose-library-button"/);
    expect(SRC).toMatch(/onClick=\{\(\) => libraryFileRef\.current\?\.click\(\)\}/);
  });

  it("exposes two hidden file inputs, both accepting image/* only", () => {
    expect(countMatches(/type="file"/g)).toBe(2);
    expect(countMatches(/accept="image\/\*"/g)).toBe(2);
    expect(countMatches(/className="sr-only"/g)).toBeGreaterThanOrEqual(2);
  });

  it("keeps camera capture on the 'Take Photo' input only", () => {
    expect(countMatches(/capture="environment"/g)).toBe(1);
    const libBlock = SRC.match(
      /ref=\{libraryFileRef\}[\s\S]{0,400}?data-testid="plant-quick-log-photo-library-input"/,
    );
    expect(libBlock).not.toBeNull();
    expect(libBlock![0]).not.toMatch(/\bcapture=/);
  });

  it("routes both inputs through the same handleFileSelected path", () => {
    expect(countMatches(/handleFileSelected\(e\.target\.files\?\.\[0\] \?\? null\)/g)).toBe(2);
  });

  it("preserves the diary-photos upload contract (no storage bucket change)", () => {
    expect(SRC).toMatch(/\.from\("diary-photos"\)/);
    expect(countMatches(/from\("diary-photos"\)/g)).toBeGreaterThanOrEqual(2);
  });

  it("does not introduce any non-image accept value", () => {
    expect(SRC).not.toMatch(/accept="(?!image\/\*)[^"]*"/);
  });
});
