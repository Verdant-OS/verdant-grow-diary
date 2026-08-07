import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const sheet = readFileSync(resolve(ROOT, "src/components/QuickLogV2Sheet.tsx"), "utf8");
const badges = readFileSync(resolve(ROOT, "src/components/DiaryEntryBadges.tsx"), "utf8");
const memory = readFileSync(resolve(ROOT, "src/components/TimelineMemorySection.tsx"), "utf8");

describe("Quick Log archive window safety wiring", () => {
  it("limits archive entry to the note path and validates before the existing payload builder", () => {
    expect(sheet).toContain('form.action === "note"');
    expect(sheet).toContain("validateArchiveWindow(archiveWindowForm)");
    expect(sheet.indexOf("validateArchiveWindow(archiveWindowForm)")).toBeLessThan(
      sheet.indexOf("buildQuickLogV2SavePayload({"),
    );
  });

  it("renders archive pointers on both timeline surfaces without live terminology", () => {
    expect(badges).toContain("diary-entry-archive-window-badge");
    expect(memory).toContain("timeline-memory-archive-window-badge");
    expect(`${badges}\n${memory}`).not.toMatch(/archive[^\n]{0,80}\bLive\b/i);
    expect(`${badges}\n${memory}`).toContain("Footage stays on your camera");
  });
});
