/**
 * Regression guard: Daily Check Step 3 footer must follow the grower's
 * temperature unit preference, not a hardcoded °F string in JSX.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const PAGE = read("src/pages/DailyCheck.tsx");
const RULES = read("src/lib/dailyCheckPostSubmitRules.ts");

describe("Daily Check manual snapshot footer regression guards", () => {
  it("routes the footer copy through dailyCheckManualSnapshotUnitNote(temperatureUnit)", () => {
    expect(PAGE).toMatch(/dailyCheckManualSnapshotUnitNote\(temperatureUnit\)/);
  });

  it("does not hardcode a temperature unit in the manual snapshot footer", () => {
    expect(PAGE).not.toMatch(/Temperature uses °F\./);
    expect(PAGE).not.toMatch(/Temperature uses °C\./);
  });

  it("derives footer symbols from getTemperatureUnitSymbol in rules", () => {
    expect(RULES).toMatch(/getTemperatureUnitSymbol\(unit\)/);
  });
});
