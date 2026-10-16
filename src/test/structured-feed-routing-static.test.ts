import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("structured Feed routing static fences", () => {
  it("validates Feed window events before opening Quick Log v2", () => {
    const appShell = read("src/components/AppShell.tsx");
    expect(appShell).toContain("isQuickLogV2FeedOpenIntent");
    expect(appShell).toContain("QUICK_LOG_V2_FEED_OPEN_EVENT");

    const dailyCheckSection = read("src/components/QuickLogAllActivitiesSection.tsx");
    expect(dailyCheckSection).toContain("buildQuickLogV2FeedOpenIntent");
    expect(dailyCheckSection).toContain("QUICK_LOG_V2_FEED_OPEN_EVENT");
  });
});
