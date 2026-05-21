import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/grow-diary-architecture.md");

describe("docs/grow-diary-architecture.md contract", () => {
  it("exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
  const lower = doc.toLowerCase();

  const mustInclude: Array<[string, string]> = [
    ["QuickLog", "QuickLog"],
    ["diary_entries table", "diary_entries"],
    ["details jsonb", "details jsonb"],
    ["diary-photos bucket", "diary-photos"],
    ["diaryEntryRules", "diaryEntryRules"],
    ["growDiaryTimelineRules", "growDiaryTimelineRules"],
    ["QuickLog preview validation", "quicklog preview validation"],
    ["AI context sufficiency", "context sufficiency"],
    ["malformed details degrade context/confidence", "malformed"],
    ["typed event table migration path", "grow_events"],
    ["watering_events typed table", "watering_events"],
    ["no raw details jsonb interpretation in UI", "must not interpret raw"],
  ];

  for (const [label, needle] of mustInclude) {
    it(`mentions ${label}`, () => {
      expect(lower).toContain(needle.toLowerCase());
    });
  }

  it("mentions that malformed details degrade AI confidence/context", () => {
    expect(lower).toMatch(/malformed[\s\S]{0,200}(context|confidence|sufficiency)/);
  });
});
