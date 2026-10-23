/**
 * #2171 regression fence: plant profile and /plants cards must format health
 * through plantHealthStatusLabel so null, "unknown", and corrupted values never
 * render as raw "unknown" or ISO timestamps. Complements rendered tests in
 * plant-detail-health-display and plant-health-not-assessed-ui-integration.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const PLANT_DETAIL = readSource("src/pages/PlantDetail.tsx");
const PLANTS = readSource("src/pages/Plants.tsx");

describe("plant health not assessed display wiring (#2171)", () => {
  it("plants list card copy routes through plantHealthStatusLabel", () => {
    expect(PLANTS).toMatch(/function formatPlantHealthLabel/);
    expect(PLANTS).toMatch(/plantHealthStatusLabel\(health\)/);
    expect(PLANTS).toMatch(/formatPlantHealthLabel\(p\.health\)/);
    expect(PLANTS).not.toMatch(/Plant health: \$\{health \?\? "unknown"\}/);
    expect(PLANTS).not.toMatch(/Plant health status: \$\{health \?\? "unknown"\}/);
  });

  it("plant profile health row uses plantHealthStatusLabel, not raw health", () => {
    expect(PLANT_DETAIL).toMatch(/data-testid="plant-detail-health"/);
    expect(PLANT_DETAIL).toMatch(/plantHealthStatusLabel\(plant\.health\)/);
    expect(PLANT_DETAIL).toMatch(/normalizePlantHealth\(plant\.health\)/);
    expect(PLANT_DETAIL).not.toMatch(/className="capitalize">\{plant\.health\}/);
    expect(PLANT_DETAIL).not.toMatch(/>\{plant\.health\}<\/div>/);
  });
});
