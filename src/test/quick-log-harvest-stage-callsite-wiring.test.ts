import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function allActivitiesCall(path: string) {
  const match = source(path).match(/<QuickLogAllActivitiesSection[\s\S]*?\/>/);
  expect(match, `${path} must mount QuickLogAllActivitiesSection`).not.toBeNull();
  return match![0];
}

describe("Quick Log harvest stage call-site wiring", () => {
  it("passes the selected plant's persisted stage from QuickLog", () => {
    const call = allActivitiesCall("src/components/QuickLog.tsx");

    expect(call).toMatch(/plantStage=\{[\s\S]*?selectedPlant[\s\S]*?stage/);
    expect(call).not.toMatch(/plantStage=\{stage\}/);
  });

  it("passes the selected plant's persisted stage from DailyCheck", () => {
    const call = allActivitiesCall("src/pages/DailyCheck.tsx");

    expect(call).toMatch(/plantStage=\{[\s\S]*?selectedPlant[\s\S]*?stage/);
    expect(call).not.toMatch(/plantStage=\{stage\}/);
  });
});
