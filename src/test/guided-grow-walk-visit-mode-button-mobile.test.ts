/**
 * Contract + wiring for mobile-safe Field Edition visit-mode buttons (#2204).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME } from "@/lib/guidedGrowWalkPanelRules";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const PANEL = stripSourceComments(
  readFileSync(resolve(ROOT, "src/components/GuidedGrowWalkPanel.tsx"), "utf8"),
);

describe("GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME (#2204)", () => {
  it("overrides shadcn Button nowrap and fixed height for 2-column mobile grids", () => {
    expect(GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME).toContain("whitespace-normal");
    expect(GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME).toContain("h-auto");
    expect(GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME).toContain("min-h-9");
    expect(GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME).toContain("min-w-0");
    expect(GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME).toContain("break-words");
    const tokens = GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME.split(/\s+/);
    expect(tokens).not.toContain("h-9");
    expect(tokens).not.toContain("whitespace-nowrap");
  });
});

describe("GuidedGrowWalkPanel wiring", () => {
  it("applies the shared visit-mode button classname on every mode button", () => {
    expect(PANEL).toContain("GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME");
    expect(PANEL).toMatch(/className=\{GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME\}/);
  });
});
