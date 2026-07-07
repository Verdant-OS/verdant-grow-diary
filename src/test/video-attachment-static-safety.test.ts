/**
 * Static safety scan for the video attachment slice.
 *
 * Enforces:
 *  - Video helpers never import/reference sensor_readings, service_role,
 *    action_queue, alerts, AI Doctor, device control, or MCP.
 *  - The video diary builder never writes a non-null photo_url.
 *  - Photo evidence surfaces do not reference `details.video`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

const VIDEO_FILES = [
  "src/lib/videoAttachmentRules.ts",
  "src/lib/quickLogVideoDiaryEntry.ts",
  "src/lib/timelineVideoEntryRules.ts",
  "src/components/TimelineVideoCard.tsx",
];

const FORBIDDEN = [
  "service_role",
  "sensor_readings",
  "action_queue",
  "alerts.insert",
  "device_control",
  "ai-doctor",
  "aiDoctor",
  "src/lib/mcp/",
  "functions.invoke",
];

describe("video attachment static safety", () => {
  for (const f of VIDEO_FILES) {
    it(`${f} contains no forbidden runtime references`, () => {
      const src = read(f);
      for (const term of FORBIDDEN) {
        expect(
          src.includes(term),
          `${f} unexpectedly references "${term}"`,
        ).toBe(false);
      }
    });
  }

  it("video diary builder never sets a non-null photo_url", () => {
    const src = read("src/lib/quickLogVideoDiaryEntry.ts");
    expect(src).toMatch(/photo_url:\s*null/);
    // No pattern like `photo_url: <not-null>` is present.
    expect(src).not.toMatch(/photo_url:\s*(?!null\b)[^,\n}]+/);
  });

  it("photo evidence pipeline does not read details.video", () => {
    const photoFiles = [
      "src/lib/photoHistoryRules.ts",
      "src/lib/plantPhotoPreviewStrip.ts",
      "src/lib/plantPhotoEvidenceReconciliation.ts",
      "src/hooks/usePlantGalleryPhotoCount.ts",
    ];
    for (const f of photoFiles) {
      const src = read(f);
      expect(src.includes("details.video"), `${f} references details.video`).toBe(false);
      expect(src.includes("diary-videos"), `${f} references diary-videos bucket`).toBe(false);
    }
  });
});
