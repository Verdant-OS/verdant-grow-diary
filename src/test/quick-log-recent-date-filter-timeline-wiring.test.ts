/**
 * Regression guard for QA 2026-10-20 bug 6: Timeline must tell Recent Quick Logs
 * when the lane is scoped by a date filter so empty copy names the range.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Timeline → Recent Quick Logs dateFiltered wiring", () => {
  it("passes dateFiltered when either effective date bound is set", () => {
    const timelineSrc = readFileSync(path.resolve(__dirname, "../pages/Timeline.tsx"), "utf8");
    expect(timelineSrc).toMatch(
      /dateFiltered=\{Boolean\(effectiveStartDate \|\| effectiveEndDate\)\}/,
    );
    expect(timelineSrc).toMatch(/<RecentQuickLogActivityPanel[\s\S]*dateFiltered=/);
  });
});
