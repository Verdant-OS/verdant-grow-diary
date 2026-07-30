/**
 * Daily Check grow-context resolution.
 *
 * Found in the 2026-07-28 authenticated browser loop: opening `/daily-check`
 * from the sidebar (no `?growId=`, no plant selected yet) left every Quick Log
 * action disabled behind "Select a grow to enable Quick Log actions", even
 * though the workspace HAD an active grow. `growId` was resolved from only the
 * selected plant and the URL scope; the store's active grow was never
 * consulted.
 *
 * This pins the precedence chain as a pure rule so the page and any future
 * caller cannot drift: plant's own grow → explicit URL scope → active grow.
 * Static-scans the page to prove it uses that order.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE = readFileSync(resolve(__dirname, "../pages/DailyCheck.tsx"), "utf8");

/** The precedence the page implements, expressed independently. */
function resolveDailyCheckGrowId(input: {
  selectedPlantGrowId?: string | null;
  urlGrowId?: string | null;
  activeGrowId?: string | null;
}): string | null {
  return input.selectedPlantGrowId ?? input.urlGrowId ?? input.activeGrowId ?? null;
}

const PLANT_GROW = "plant-grow";
const URL_GROW = "url-grow";
const ACTIVE_GROW = "active-grow";

describe("Daily Check grow-context precedence", () => {
  it("prefers the selected plant's own grow above everything", () => {
    expect(
      resolveDailyCheckGrowId({
        selectedPlantGrowId: PLANT_GROW,
        urlGrowId: URL_GROW,
        activeGrowId: ACTIVE_GROW,
      }),
    ).toBe(PLANT_GROW);
  });

  it("uses the explicit URL scope when no plant is selected", () => {
    expect(
      resolveDailyCheckGrowId({
        selectedPlantGrowId: null,
        urlGrowId: URL_GROW,
        activeGrowId: ACTIVE_GROW,
      }),
    ).toBe(URL_GROW);
  });

  it("falls back to the active grow for a bare /daily-check visit (the regression)", () => {
    expect(
      resolveDailyCheckGrowId({
        selectedPlantGrowId: null,
        urlGrowId: null,
        activeGrowId: ACTIVE_GROW,
      }),
    ).toBe(ACTIVE_GROW);
  });

  it("stays null when the workspace genuinely has no grow — the gate is still honest", () => {
    expect(
      resolveDailyCheckGrowId({
        selectedPlantGrowId: null,
        urlGrowId: null,
        activeGrowId: null,
      }),
    ).toBeNull();
  });

  it("never invents a grow from an out-of-scope plant (null plant grow is not a match)", () => {
    expect(
      resolveDailyCheckGrowId({ selectedPlantGrowId: null, urlGrowId: null }),
    ).toBeNull();
  });
});

describe("DailyCheck page wiring", () => {
  it("consumes the active grow from the store", () => {
    expect(PAGE).toContain('from "@/store/grows"');
    expect(PAGE).toMatch(/const \{ activeGrowId \} = useGrows\(\)/);
  });

  it("resolves growId in plant → url → active order", () => {
    const start = PAGE.indexOf("const growId =");
    expect(start).toBeGreaterThan(-1);
    const expression = PAGE.slice(start, PAGE.indexOf(";", start));
    const plantIndex = expression.indexOf("grow_id");
    const urlIndex = expression.indexOf("urlGrowId");
    const activeIndex = expression.indexOf("activeGrowId");
    expect(plantIndex).toBeGreaterThan(-1);
    expect(urlIndex).toBeGreaterThan(plantIndex);
    expect(activeIndex).toBeGreaterThan(urlIndex);
  });
});
