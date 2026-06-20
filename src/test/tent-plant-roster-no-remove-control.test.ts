/**
 * Roster recency must NOT add a generic per-plant destructive control.
 *
 * Static-source guard: the TentPlantRosterPanel must not import the
 * DiaryEntryRemoveButton. Removal lives in the Activity Panels surface,
 * scoped to a specific latest diary/photo entry id, never a plant row.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
function read(rel: string): string | null {
  const p = resolve(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

describe("Tent Plant Roster — no generic plant-row destructive control", () => {
  it("TentPlantRosterPanel does not import DiaryEntryRemoveButton", () => {
    const src =
      read("src/components/TentPlantRosterPanel.tsx") ??
      read("src/components/TentPlantRoster.tsx");
    expect(src, "roster panel source not found").not.toBeNull();
    expect(src!).not.toMatch(/DiaryEntryRemoveButton/);
    expect(src!).not.toMatch(/useRemoveDiaryEntry/);
  });

  it("tentPlantRosterViewModel does not expose remove handlers", () => {
    const src = read("src/lib/tentPlantRosterViewModel.ts");
    expect(src, "roster view model not found").not.toBeNull();
    expect(src!).not.toMatch(/remove(Log|Plant|Entry)/i);
  });
});
