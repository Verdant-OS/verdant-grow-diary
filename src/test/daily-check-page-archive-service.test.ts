/**
 * The Daily Check page must not keep its own plants archive query.
 * The service owns that read.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Daily Check archive read ownership", () => {
  it("routes the page read through the archive service", () => {
    const src = readFileSync("src/pages/DailyCheck.tsx", "utf8");
    expect(src).toMatch(/dailyCheckPlantArchiveReadService/);
    expect(src).not.toMatch(/from\(\s*["']plants["']\s*\)/);
  });
});
