import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/pages/Sensors.tsx"), "utf8");

describe("Sensors page persisted-tent selection wiring", () => {
  it("starts without a fabricated tent and reconciles authenticated rows", () => {
    expect(source).toMatch(/useState<string \| null>\(null\)/);
    expect(source).toMatch(/resolveGrowTentSelection\(\{ currentTentId, tents \}\)/);
    expect(source).not.toMatch(/useState<[^>]+>\([^\n]*["']t1["']/);
  });

  it("uses an explicit no-scope sentinel for the tent-scoped trend query", () => {
    expect(source).toMatch(/useSensorReadings\(defaultManualTentId \?\? null, 60\)/);
  });
});
