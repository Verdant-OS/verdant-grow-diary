/**
 * #2171 / PR #2330: unassessed plant health must never read "unknown" on /plants
 * or the plant profile. Pins wiring so a revert to `health ?? "unknown"` fails fast.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const PLANTS = readSource("src/pages/Plants.tsx");
const PLANT_DETAIL = readSource("src/pages/PlantDetail.tsx");

describe("plant health not assessed display wiring (#2171)", () => {
  it("plants list card labels delegate to plantHealthStatusLabel", () => {
    expect(PLANTS).toMatch(
      /import[\s\S]*plantHealthStatusLabel[\s\S]*from "@\/lib\/plantHealthRules"/,
    );
    expect(PLANTS).toMatch(
      /function formatPlantHealthLabel\([\s\S]*?plantHealthStatusLabel\(health\)/,
    );
    expect(PLANTS).toMatch(
      /function formatPlantHealthAriaLabel\([\s\S]*?plantHealthStatusLabel\(health\)/,
    );
    expect(PLANTS).not.toMatch(/Plant health: \$\{health \?\? "unknown"\}/);
    expect(PLANTS).not.toMatch(/Plant health status: \$\{health \?\? "unknown"\}/);
  });

  it("plant detail profile health row uses plantHealthStatusLabel, not raw health", () => {
    expect(PLANT_DETAIL).toMatch(/plantHealthStatusLabel\(plant\.health\)/);
    expect(PLANT_DETAIL).toMatch(/data-testid="plant-detail-health"/);
    expect(PLANT_DETAIL).not.toMatch(/<div className="capitalize">\{plant\.health\}<\/div>/);
    expect(PLANT_DETAIL).toMatch(
      /normalizePlantHealth\(plant\.health\) === "unknown"[\s\S]*\? undefined : "capitalize"/,
    );
  });
});
