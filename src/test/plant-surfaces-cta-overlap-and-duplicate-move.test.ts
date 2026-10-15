/**
 * #2002 — plant card "Start check" must not sit on top of "Add sensor snapshot",
 * and the plant page must not render a second "Move Plant" in the action row.
 *
 * The Tent-field AssignTentDialog stays. plant-detail-assign-tent.test.ts requires
 * at least three AssignTentDialog mentions in PlantDetail.tsx.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PLANTS = readFileSync(resolve(process.cwd(), "src/pages/Plants.tsx"), "utf8");
const ACTIONS = readFileSync(
  resolve(process.cwd(), "src/components/PlantCardActionsMenu.tsx"),
  "utf8",
);
const DETAIL = readFileSync(resolve(process.cwd(), "src/pages/PlantDetail.tsx"), "utf8");

function rowVariantSource(source: string): string {
  const start = source.indexOf('if (variant === "row")');
  expect(start).toBeGreaterThan(-1);
  const menuReturn = source.indexOf("\n  return (", start);
  expect(menuReturn).toBeGreaterThan(start);
  return source.slice(start, menuReturn);
}

describe("plant surfaces #2002", () => {
  it("reserves right padding on the daily-check actions row under the Start check pill", () => {
    const actionsAt = PLANTS.indexOf('data-testid="plant-card-daily-check-actions"');
    expect(actionsAt).toBeGreaterThan(-1);
    const window = PLANTS.slice(Math.max(0, actionsAt - 280), actionsAt + 80);
    const className = window.match(/className="([^"]+)"/);
    expect(className?.[1] ?? "").toMatch(/\bpr-28\b/);
    expect(PLANTS).toMatch(/data-testid="plant-card-daily-check-cta"/);
  });

  it("row variant does not render a second Move Plant button", () => {
    const row = rowVariantSource(ACTIONS);
    expect(row).not.toContain("plant-detail-move-plant");
    expect(row).not.toContain("Move Plant");
    expect(DETAIL.match(/AssignTentDialog/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
