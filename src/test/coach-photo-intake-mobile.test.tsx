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

const SOURCE = readFileSync(resolve(__dirname, "../pages/Coach.tsx"), "utf8");

describe("Coach AI Doctor photo intake — mobile take + upload", () => {
  it("exposes a 'Take photo' control", () => {
    expect(SOURCE).toMatch(/Take photo/);
    expect(SOURCE).toMatch(/data-testid="coach-photo-take"/);
  });

  it("exposes an 'Upload from device' control", () => {
    expect(SOURCE).toMatch(/Upload from device/);
    expect(SOURCE).toMatch(/data-testid="coach-photo-upload"/);
  });

  function findInputBlock(testid: string): string {
    const blocks = SOURCE.split(/<input\b/)
      .slice(1)
      .map((b) => "<input" + b.split("/>")[0] + "/>");
    return blocks.find((b) => b.includes(testid)) ?? "";
  }

  it('has a take-photo file input that may use capture="environment"', () => {
    const block = findInputBlock("coach-photo-take-input");
    expect(block, "take-photo input not found").toBeTruthy();
    expect(block).toMatch(/type="file"/);
    expect(block).toMatch(/accept="image\/\*"/);
    expect(block).toMatch(/capture="environment"/);
  });

  it("has an upload file input that does NOT use the capture attribute", () => {
    const block = findInputBlock("coach-photo-upload-input");
    expect(block, "upload input not found").toBeTruthy();
    expect(block).toMatch(/type="file"/);
    expect(block).toMatch(/accept="image\/\*"/);
    expect(block).not.toMatch(/capture=/);
  });

  it("routes both inputs through the same handleFile preview pipeline", () => {
    const takeBlock = findInputBlock("coach-photo-take-input");
    const uploadBlock = findInputBlock("coach-photo-upload-input");
    expect(takeBlock).toMatch(/handleFile\(/);
    expect(uploadBlock).toMatch(/handleFile\(/);
  });

  it("stacks the diagnosis actions on narrow screens and restores two columns at sm", () => {
    expect(SOURCE).toMatch(
      /className="grid grid-cols-1 gap-2 sm:grid-cols-2"[\s\S]*?Diagnose photo[\s\S]*?What should I do next\?/,
    );
  });

  it("decodes validated photos to a canvas instead of sending DOM file data to an HTML sink", () => {
    expect(SOURCE).toMatch(/validatePlantProfilePhotoFile\(f\)/);
    expect(SOURCE).toMatch(
      /createImageBitmap\(photoFile,\s*\{[\s\S]*?resizeWidth:\s*AI_DOCTOR_PHOTO_PREVIEW_WIDTH/,
    );
    expect(SOURCE).toMatch(
      /isRasterPhotoPreviewBitmapWithinBounds\(bitmap\.width, bitmap\.height\)/,
    );
    expect(SOURCE).toMatch(/<canvas/);
    expect(SOURCE).not.toMatch(/URL\.createObjectURL/);
    expect(SOURCE).not.toMatch(/src=\{(?:safe)?[Pp]review\}/);
  });

  it("revalidates the photo before upload and uses normalized type metadata", () => {
    expect(SOURCE).toMatch(/validatePlantProfilePhotoFile\(photoFile\)/);
    expect(SOURCE).toMatch(/photoValidation\.extension/);
    expect(SOURCE).toMatch(/contentType:\s*photoValidation\.mime/);
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
