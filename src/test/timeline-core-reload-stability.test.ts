/**
 * The Timeline core diary read must stay in flight when the grow list settles.
 * directoryGrowId only unlocks the supplemental tent/sensor read.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TIMELINE = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

describe("timeline core reload stability", () => {
  it("does not rebuild the core loader when only the directory scope changes", () => {
    const match = TIMELINE.match(
      /const load = useCallback\(async \(\) => \{[\s\S]*?\n {2}\}, \[([^\]]+)\]\);/,
    );
    expect(match).not.toBeNull();
    expect(match?.[1]).not.toContain("directoryGrowId");
  });

  it("keeps the directory sensor read on its own loader", () => {
    expect(TIMELINE).toMatch(/if\s*\(\s*directoryGrowId\s*\)\s*\{/);
    expect(TIMELINE).toMatch(
      /\[activeGrowId,\s*activeReadKey,\s*directoryGrowId,\s*timelineDateRangeBounds,\s*user\]/,
    );
  });
});
