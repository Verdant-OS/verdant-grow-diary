/**
 * Sensors page — Sensor bridge status tile mount test.
 *
 * Verifies the read-only Sensor bridge status tile is wired into the
 * Sensors page without requiring a Supabase round-trip. Static-source
 * inspection keeps the test deterministic and CI-safe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const PAGE = read("src/pages/Sensors.tsx");

describe("Sensors page — Sensor bridge status tile", () => {
  it("imports SensorBridgeHealthCard from the presenter module", () => {
    expect(PAGE).toMatch(
      /import\s+SensorBridgeHealthCard\s+from\s+["']@\/components\/SensorBridgeHealthCard["']/,
    );
  });

  it("mounts <SensorBridgeHealthCard /> in the Sensors page tree", () => {
    expect(PAGE).toMatch(/<SensorBridgeHealthCard\s*\/>/);
  });

  it("never inlines raw bridge intake fields directly in the page JSX", () => {
    expect(PAGE).not.toMatch(/raw_payload/);
    expect(PAGE).not.toMatch(/token_hash/);
    expect(PAGE).not.toMatch(/secret_hash/);
    expect(PAGE).not.toMatch(/service_role/i);
  });
});
