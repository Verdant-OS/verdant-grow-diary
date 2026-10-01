/**
 * Daily Check grow-context resolution and page wiring.
 *
 * A bare Daily Check visit uses the workspace's active grow. A selected
 * plant's own grow, or a matching assigned tent for a legacy plant, takes
 * precedence so another active grow cannot redirect its save context.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveDailyCheckGrowContext } from "@/lib/dailyCheckGrowContextRules";

const PAGE = readFileSync(resolve(__dirname, "../pages/DailyCheck.tsx"), "utf8");

const PLANT_GROW = "plant-grow";
const URL_GROW = "url-grow";
const ACTIVE_GROW = "active-grow";

describe("Daily Check grow-context precedence", () => {
  it("prefers the selected plant's own grow above everything", () => {
    expect(
      resolveDailyCheckGrowContext({
        plant: { grow_id: PLANT_GROW, tent_id: "assigned-tent" },
        assignedTent: { id: "assigned-tent", grow_id: "tent-grow" },
        urlGrowId: URL_GROW,
        activeGrowId: ACTIVE_GROW,
      }),
    ).toBe(PLANT_GROW);
  });

  it("recovers a legacy plant's grow only from its matching assigned tent", () => {
    expect(
      resolveDailyCheckGrowContext({
        plant: { grow_id: null, tent_id: "assigned-tent" },
        assignedTent: { id: "assigned-tent", grow_id: PLANT_GROW },
        urlGrowId: URL_GROW,
        activeGrowId: ACTIVE_GROW,
      }),
    ).toBe(PLANT_GROW);
    expect(
      resolveDailyCheckGrowContext({
        plant: { grow_id: null, tent_id: "assigned-tent" },
        assignedTent: { id: "other-tent", grow_id: PLANT_GROW },
        urlGrowId: URL_GROW,
        activeGrowId: ACTIVE_GROW,
      }),
    ).toBe(URL_GROW);
  });

  it("uses the explicit URL scope when no plant is selected", () => {
    expect(
      resolveDailyCheckGrowContext({
        plant: null,
        urlGrowId: URL_GROW,
        activeGrowId: ACTIVE_GROW,
      }),
    ).toBe(URL_GROW);
  });

  it("falls back to the active grow for a bare Daily Check visit (the regression)", () => {
    expect(
      resolveDailyCheckGrowContext({ plant: null, urlGrowId: null, activeGrowId: ACTIVE_GROW }),
    ).toBe(ACTIVE_GROW);
  });

  it("stays null when the workspace genuinely has no grow - the gate is still honest", () => {
    expect(
      resolveDailyCheckGrowContext({ plant: null, urlGrowId: null, activeGrowId: null }),
    ).toBeNull();
  });

  it("never invents a grow from an out-of-scope plant or unrelated tent", () => {
    expect(
      resolveDailyCheckGrowContext({
        plant: { grow_id: null, tent_id: "assigned-tent" },
        assignedTent: { id: "other-tent", grow_id: PLANT_GROW },
      }),
    ).toBeNull();
  });
});

describe("DailyCheck page wiring", () => {
  it("consumes the active grow from the store", () => {
    expect(PAGE).toContain('from "@/store/grows"');
    expect(PAGE).toMatch(/const \{ activeGrowId \} = useGrows\(\)/);
  });

  it("passes selected plant, assigned tent, URL and workspace grow to the resolver", () => {
    expect(PAGE).toMatch(
      /const growId = resolveDailyCheckGrowContext\(\{\s*plant: selectedPlant,\s*assignedTent: selectedTent,\s*urlGrowId,\s*activeGrowId,\s*\}\)/,
    );
  });
});
