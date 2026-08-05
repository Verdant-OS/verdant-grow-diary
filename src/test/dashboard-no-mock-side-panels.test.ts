/**
 * Dashboard must not render mock fixture rows for AI Insights or promote the
 * retired standalone Tasks surface. When no real insight data exists, the
 * Dashboard shows honest empty-state copy instead.
 *
 * Static safety scan — read-only.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const DASH = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const EXEC = stripSourceComments(DASH);

describe("Dashboard — no mock side-panel data", () => {
  it("does not import useTasks or useAIInsights from the mock hooks", () => {
    expect(EXEC).not.toMatch(/useTasks\s*[,}]/);
    expect(EXEC).not.toMatch(/useAIInsights\s*[,}]/);
    expect(EXEC).not.toMatch(/from\s+["']@\/hooks\/useMockData["']/);
  });

  it("renders an honest empty state for AI Insights", () => {
    expect(DASH).toMatch(/No AI insights yet\./);
    expect(DASH).toMatch(/AI insights will appear after enough grow context/);
    expect(DASH).toMatch(/aria-label="AI insights empty state"/);
  });

  it("does not iterate mock insight fixtures in JSX", () => {
    // Old shape was `insights.slice(0, 3).map((i) => ...)` rendering
    // title/confidence/summary directly from the mock array.
    expect(EXEC).not.toMatch(/insights\.slice\(/);
    expect(EXEC).not.toMatch(/i\.confidence/);
    expect(EXEC).not.toMatch(/aiInsights/);
  });

  it("does not promote or render the retired standalone Tasks surface", () => {
    expect(DASH).not.toMatch(/label=["']Due today["']/);
    expect(DASH).not.toMatch(/No tasks yet/);
    expect(EXEC).not.toMatch(/const\s+tasks\b/);
    expect(EXEC).not.toMatch(/tasks\.slice\(/);
    expect(EXEC).not.toMatch(/tasks\.map\(/);
  });
});
