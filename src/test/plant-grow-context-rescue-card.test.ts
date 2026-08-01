/**
 * Static safety + contract tests for Plant Detail grow-context rescue.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const CARD = readFileSync(resolve(ROOT, "src/components/PlantGrowContextRescueCard.tsx"), "utf8");
const PAGE = readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8");
const RULES = readFileSync(resolve(ROOT, "src/lib/plantGrowContextRules.ts"), "utf8");

describe("PlantGrowContextRescueCard contract", () => {
  it("mounts on Plant Detail", () => {
    expect(PAGE).toMatch(/PlantGrowContextRescueCard/);
    expect(PAGE).toMatch(/plantGrowId=\{plant\.growId/);
  });

  it("exposes stable test ids for the rescue banner and CTA", () => {
    expect(CARD).toContain('data-testid="plant-grow-context-rescue"');
    expect(CARD).toContain('data-testid="plant-grow-context-rescue-cta"');
    expect(CARD).toContain("data-rescue-kind=");
  });

  it("writes only plants.grow_id via supabase update", () => {
    expect(CARD).toMatch(/\.from\(\s*["']plants["']\s*\)/);
    expect(CARD).toMatch(/\.update\(/);
    expect(CARD).toMatch(/\.eq\(\s*["']id["']\s*,\s*plantId\s*\)/);
    // No tent rewrites, no diary, no AQ
    expect(CARD).not.toMatch(/\.from\(\s*["']tents["']\s*\)/);
    expect(CARD).not.toMatch(/diary_entries|action_queue|sensor_readings/);
  });

  it("uses the pure rescue resolver (no free-form grow typing)", () => {
    expect(CARD).toMatch(/resolvePlantGrowRescue/);
    expect(RULES).toMatch(/assign_active_grow/);
    expect(RULES).toMatch(/repair_from_tent/);
    expect(RULES).toMatch(/buildPlantAssignToActiveGrowPayload/);
  });

  it("never touches service_role, edge invoke, or mqtt device bridges", () => {
    expect(CARD).not.toMatch(/service_role/);
    expect(CARD).not.toMatch(/functions\.invoke/);
    expect(CARD).not.toMatch(/\bmqtt\b/i);
    expect(CARD).not.toMatch(/service[_-]?role/);
  });
});
