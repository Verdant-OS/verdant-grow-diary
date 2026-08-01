/**
 * Static safety + contract tests for Plant Detail grow-context rescue.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { GROW_SETUP_BANNED_UI_TOKENS } from "@/constants/growSetupMessages";
import { resolvePlantGrowContextRescueView } from "@/lib/plantGrowContextRules";

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
    expect(CARD).not.toMatch(/\.from\(\s*["']tents["']\s*\)/);
    expect(CARD).not.toMatch(/diary_entries|action_queue|sensor_readings/);
  });

  it("uses tent-only pure rescue resolver (no active-grow assign path)", () => {
    expect(CARD).toMatch(/resolvePlantGrowContextRescueView/);
    expect(RULES).toMatch(/repair_from_tent/);
    expect(RULES).not.toMatch(/assign_active_grow|buildPlantAssignToActiveGrowPayload/);
  });

  it("never touches service_role, edge invoke, or mqtt device bridges", () => {
    expect(CARD).not.toMatch(/service_role/);
    expect(CARD).not.toMatch(/functions\.invoke/);
    expect(CARD).not.toMatch(/\bmqtt\b/i);
  });

  it("keeps grower-facing copy free of banned setup tokens", () => {
    const view = resolvePlantGrowContextRescueView({
      plant: { id: "p1", tent_id: "tent-a" },
      tents: [{ id: "tent-a", grow_id: "grow-1" }],
      tentSetupName: "Indoor 1",
    });
    const blob = [view.title, view.description, view.ctaLabel ?? ""].join(" ");
    for (const token of GROW_SETUP_BANNED_UI_TOKENS) {
      expect(blob.toLowerCase()).not.toContain(token);
    }
  });
});

describe("resolvePlantGrowContextRescueView", () => {
  const tents = [
    { id: "tent-a", grow_id: "grow-1" },
    { id: "tent-empty", grow_id: null },
  ];

  it("returns already_ok when plant has grow_id", () => {
    expect(
      resolvePlantGrowContextRescueView({
        plant: { id: "p1", grow_id: "grow-1", tent_id: "tent-a" },
        tents,
      }).kind,
    ).toBe("already_ok");
  });

  it("offers tent-derived repair payload when safe", () => {
    const view = resolvePlantGrowContextRescueView({
      plant: { id: "p1", grow_id: null, tent_id: "tent-a" },
      tents,
      tentSetupName: "Indoor 1",
    });
    expect(view.kind).toBe("repair_from_tent");
    expect(view.payload).toEqual({ grow_id: "grow-1" });
    expect(view.ctaLabel).toMatch(/Indoor 1/);
  });

  it("needs_tent when plant has no tent assignment", () => {
    expect(
      resolvePlantGrowContextRescueView({
        plant: { id: "p1", grow_id: null },
        tents,
      }).kind,
    ).toBe("needs_tent");
  });

  it("needs_setup when tent has no setup link", () => {
    const view = resolvePlantGrowContextRescueView({
      plant: { id: "p1", grow_id: null, tent_id: "tent-empty" },
      tents,
    });
    expect(view.kind).toBe("needs_setup");
    expect(view.payload).toBeNull();
    expect(view.secondaryHref).toMatch(/one_tent_activation/);
  });
});
