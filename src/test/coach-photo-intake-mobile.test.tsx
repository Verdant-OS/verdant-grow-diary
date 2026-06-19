/**
 * AI Doctor (Coach) photo intake — mobile upload + camera safety.
 *
 * Bug guarded: on mobile, the Coach photo input previously hard-coded
 * `capture="environment"` which forced the OS camera and blocked
 * "Upload from device" / photo-library selection.
 *
 * This test asserts the structural contract of the intake markup
 * without booting the full Coach page (which pulls in supabase, auth,
 * router, etc.). It reads the JSX source directly — same pattern used
 * by other static safety scanners in this repo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(
  resolve(__dirname, "../pages/Coach.tsx"),
  "utf8",
);

describe("Coach AI Doctor photo intake — mobile take + upload", () => {
  it("exposes a 'Take photo' control", () => {
    expect(SOURCE).toMatch(/Take photo/);
    expect(SOURCE).toMatch(/data-testid="coach-photo-take"/);
  });

  it("exposes an 'Upload from device' control", () => {
    expect(SOURCE).toMatch(/Upload from device/);
    expect(SOURCE).toMatch(/data-testid="coach-photo-upload"/);
  });

  it("has a take-photo file input that may use capture=\"environment\"", () => {
    const block = SOURCE.match(
      /coach-photo-take-input[\s\S]{0,400}?\/>/,
    )?.[0];
    expect(block, "take-photo input not found").toBeTruthy();
    expect(block!).toMatch(/type="file"/);
    expect(block!).toMatch(/accept="image\/\*"/);
    expect(block!).toMatch(/capture="environment"/);
  });

  it("has an upload file input that does NOT use the capture attribute", () => {
    const block = SOURCE.match(
      /coach-photo-upload-input[\s\S]{0,400}?\/>/,
    )?.[0];
    expect(block, "upload input not found").toBeTruthy();
    expect(block!).toMatch(/type="file"/);
    expect(block!).toMatch(/accept="image\/\*"/);
    expect(block!).not.toMatch(/capture=/);
  });

  it("routes both inputs through the same handleFile preview pipeline", () => {
    const takeBlock = SOURCE.match(
      /coach-photo-take-input[\s\S]{0,400}?\/>/,
    )?.[0] ?? "";
    const uploadBlock = SOURCE.match(
      /coach-photo-upload-input[\s\S]{0,400}?\/>/,
    )?.[0] ?? "";
    expect(takeBlock).toMatch(/handleFile\(/);
    expect(uploadBlock).toMatch(/handleFile\(/);
  });

  it("keeps cautious diagnosis copy — no 'confirmed diagnosis' wording added", () => {
    expect(SOURCE).not.toMatch(/confirmed diagnosis/i);
    expect(SOURCE).not.toMatch(/guaranteed/i);
  });

  it("gives every hidden file input an accessible label", () => {
    const inputs = SOURCE.match(/<input[\s\S]*?\/>/g) ?? [];
    const fileInputs = inputs.filter((i) => /type="file"/.test(i));
    expect(fileInputs.length).toBeGreaterThanOrEqual(3);
    for (const input of fileInputs) {
      expect(input, `missing aria-label: ${input}`).toMatch(/aria-label="/);
    }
  });
});
