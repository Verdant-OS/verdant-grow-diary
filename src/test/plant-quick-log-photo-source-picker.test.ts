/**
 * Quick Log photo source picker — static + structural tests for the
 * "Take Photo" vs "Choose from Library" split inside PlantQuickLog.
 *
 * Pure source scan so we don't need to spin up Supabase / auth / query
 * client mocks for a small UI affordance change. Behavior-bearing logic
 * (file → uploaded path → diary_entries write) is already covered by
 * src/test/plant-quick-log.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../components/PlantQuickLog.tsx"),
  "utf8",
);

function countMatches(re: RegExp): number {
  return SRC.match(re)?.length ?? 0;
}

describe("PlantQuickLog photo source picker", () => {
  it("renders a 'Take Photo' button wired to the camera-capture input", () => {
    expect(SRC).toMatch(/Take Photo/);
    expect(SRC).toMatch(/data-testid="plant-quick-log-take-photo-button"/);
    expect(SRC).toMatch(/onClick=\{\(\) => fileRef\.current\?\.click\(\)\}/);
  });

  it("renders a 'Choose from Library' button wired to a separate input", () => {
    expect(SRC).toMatch(/Choose from Library/);
    expect(SRC).toMatch(/data-testid="plant-quick-log-choose-library-button"/);
    expect(SRC).toMatch(/onClick=\{\(\) => libraryFileRef\.current\?\.click\(\)\}/);
  });

  it("renders helper copy explaining the two photo sources", () => {
    expect(SRC).toMatch(/Add a new photo or pick one already on your phone/i);
  });

  it("exposes two hidden file inputs, both accepting image/* only", () => {
    expect(countMatches(/type="file"/g)).toBe(2);
    expect(countMatches(/accept="image\/\*"/g)).toBe(2);
    // Both inputs must be hidden but reachable via their accessible buttons.
    expect(countMatches(/className="hidden"/g)).toBeGreaterThanOrEqual(2);
  });

  it("keeps camera capture on the 'Take Photo' input only", () => {
    expect(countMatches(/capture="environment"/g)).toBe(1);
    // The library input must NOT carry the capture attribute.
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
    // Behavior-preserving safety — keep storage bucket + table writes intact.
    expect(SRC).toMatch(/\.from\("diary-photos"\)/);
    expect(countMatches(/from\("diary-photos"\)/g)).toBeGreaterThanOrEqual(2);
  });

  it("does not introduce any non-image accept value", () => {
    expect(SRC).not.toMatch(/accept="(?!image\/\*)[^"]*"/);
  });
});
