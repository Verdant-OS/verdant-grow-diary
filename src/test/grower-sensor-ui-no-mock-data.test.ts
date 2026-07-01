/**
 * Verdant Sensor Truth P0 — grower-facing sensor UI must not fall back
 * to mock/demo sensor readings.
 *
 * Static guard: assert that key grower-facing sensor surfaces do NOT
 * import the mock sensor readings hook (`useSensorReadings` from
 * `@/hooks/useMockData`) and that the shared grow-sensor hook does not
 * silently return mock rows when the real slice is empty.
 *
 * Runtime guard: `useGrowSensorReadings` withFallback fallback is an
 * empty array (no mock rows) — enforced by inspecting the module
 * source.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const GROWER_SENSOR_SURFACES = [
  "src/pages/Sensors.tsx",
  "src/pages/Tents.tsx",
  "src/pages/TentDetail.tsx",
  "src/pages/Dashboard.tsx",
];

describe("grower sensor UI — no mock/demo fallback (Sensor Truth P0)", () => {
  it.each(GROWER_SENSOR_SURFACES)(
    "%s does not import useSensorReadings from useMockData",
    (path) => {
      const src = read(path);
      // Block importing the mock-backed useSensorReadings hook.
      expect(
        /from\s+["']@\/hooks\/useMockData["']/.test(src) &&
          /\buseSensorReadings\b/.test(src),
        `${path} must not use mock useSensorReadings`,
      ).toBe(false);
    },
  );

  it.each(GROWER_SENSOR_SURFACES)(
    "%s does not import the mock sensorReadings fixture directly",
    (path) => {
      const src = read(path);
      expect(src).not.toMatch(
        /import[^;]*\bsensorReadings\b[^;]*from\s+["']@\/mock/,
      );
    },
  );

  it("useGrowSensorReadings uses an empty-array fallback (no mock rows)", () => {
    const src = read("src/hooks/useGrowData.ts");
    // The fallback lambda after the `fetchSensorReadings` line must
    // return an empty array literal — not `sensorReadings` or a filter
    // over it.
    const hookSection = src.slice(src.indexOf("useGrowSensorReadings"));
    expect(hookSection).toMatch(/\[\]\s+as\s+SensorReading\[\]/);
    // Explicitly guard against the previous mock-fallback shape.
    expect(hookSection).not.toMatch(/sensorReadings\.filter\(/);
    expect(hookSection.split("\n").slice(0, 30).join("\n")).not.toMatch(
      /=>\s*sensorReadings\b/,
    );
  });

  it("Sensors.tsx does not synthesize a 'demo' source for real rows lacking a source label", () => {
    const src = read("src/pages/Sensors.tsx");
    // Previous bug: `latest ? "demo" : null` — re-labeled real rows as demo.
    expect(src).not.toMatch(/latest\s*\?\s*"demo"\s*:\s*null/);
  });
});
