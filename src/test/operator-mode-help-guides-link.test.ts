/**
 * Static test: Operator Mode exposes a Help/Guides link to the public
 * cannabis plant care FAQ guide.
 *
 * This is a navigation-only, read-only surface. No Supabase, AI, Action
 * Queue, or device-control behavior is introduced by this link.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SIDEBAR_SRC = readFileSync(resolve(__dirname, "../components/AppSidebar.tsx"), "utf8");

describe("Operator Mode Help/Guides link", () => {
  it("AppSidebar exposes a 'Help/Guides' item under Operator Mode", () => {
    expect(SIDEBAR_SRC).toMatch(/Help\/Guides/);
    expect(SIDEBAR_SRC).toMatch(/\/guides\/cannabis-plant-care/);
  });

  it("Help/Guides link is grouped with operator-only items", () => {
    // The operatorGroups array is the only place that renders operator-only
    // navigation items, and it is gated by useHasRole("operator").
    const operatorGroupsStart = SIDEBAR_SRC.indexOf("const operatorGroups");
    const operatorGroupsEnd = SIDEBAR_SRC.indexOf("];", operatorGroupsStart) + 2;
    const operatorGroupsBlock = SIDEBAR_SRC.slice(operatorGroupsStart, operatorGroupsEnd);
    expect(operatorGroupsBlock).toMatch(/Help\/Guides/);
    expect(operatorGroupsBlock).toMatch(/\/guides\/cannabis-plant-care/);
  });
});
