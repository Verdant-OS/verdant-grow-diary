/**
 * Plant Detail + QuickLog mobile-UX copy pass.
 *
 * Asserts the user-facing rename pass for grower-native language without
 * touching data model, queries, scopes, or safety strings. Static guardrails
 * only — no React render here; runtime behavior is already covered by
 * existing Plant Detail / QuickLog tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const QUICKLOG = read("src/components/QuickLog.tsx");
const ENV_PANEL = read("src/components/PlantTentEnvironmentPanel.tsx");
const ALERTS_PANEL = read("src/components/PlantAssignedTentAlertsPanel.tsx");
const ACTIONS_PANEL = read("src/components/PlantAssignedTentActionsPanel.tsx");
const SIDEBAR = read("src/components/AppSidebar.tsx");
const GRM_PAGE = read("src/pages/GrowRoomMode.tsx");
const STRIP = read("src/components/PlantStatusStrip.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("Copy renames are applied", () => {
  it("QuickLog renames 'Workspace' to 'Current Setup' (and never 'Strain')", () => {
    expect(QUICKLOG).toMatch(/<Label[^>]*>Current Setup<\/Label>/);
    expect(QUICKLOG).not.toMatch(/<Label[^>]*>Workspace<\/Label>/);
    expect(QUICKLOG).not.toMatch(/<Label[^>]*>Strain<\/Label>/);
  });

  it("QuickLog preserves activeGrowId scoping (grow_id stays under the hood)", () => {
    expect(QUICKLOG).toMatch(/!activeGrowId/);
    expect(QUICKLOG).toMatch(/grow_id:\s*activeGrowId/);
  });

  it("Tent environment panel title is 'Current Environment'", () => {
    expect(ENV_PANEL).toContain("Current Environment");
    expect(ENV_PANEL).not.toContain("Assigned Tent Environment");
  });

  it("Tent alerts panel title is 'Tent Alerts'", () => {
    expect(ALERTS_PANEL).toMatch(/>\s*Tent Alerts/);
    expect(ALERTS_PANEL).not.toContain("Assigned Tent Alerts");
  });

  it("Tent actions panel title is 'Pending Tasks'", () => {
    expect(ACTIONS_PANEL).toContain("Pending Tasks");
    expect(ACTIONS_PANEL).not.toContain("Assigned Tent Action Queue");
  });

  it("Sidebar surfaces 'Live Dashboard' instead of 'Grow-Room Mode'", () => {
    expect(SIDEBAR).toContain('label: "Live Dashboard"');
    expect(SIDEBAR).not.toContain('"Grow-Room Mode"');
  });

  it("Live Dashboard page header reads 'Live Dashboard'", () => {
    expect(GRM_PAGE).toMatch(/title=["']Live Dashboard["']/);
    expect(GRM_PAGE).not.toMatch(/title=["']Grow-Room Mode["']/);
  });
});

describe("Plant Detail status strip surfaces the four key signals", () => {
  it("PlantDetail mounts PlantStatusStrip", () => {
    expect(PLANT_DETAIL).toContain("PlantStatusStrip");
  });

  it("strip exposes tent / environment / alerts / tasks chips", () => {
    expect(STRIP).toContain('data-testid="plant-status-strip"');
    expect(STRIP).toContain('data-testid="plant-status-tent"');
    expect(STRIP).toContain('data-testid="plant-status-environment"');
    expect(STRIP).toContain('data-testid="plant-status-alerts"');
    expect(STRIP).toContain('data-testid="plant-status-tasks"');
  });

  it("strip never invents counts — exposes 'Unknown' when data is not loaded", () => {
    expect(STRIP).toMatch(/Unknown/);
  });

  it("strip preserves View Tent link by linking to /tents/:id when assigned", () => {
    expect(STRIP).toMatch(/tentDetailPath\(tentId\)/);
  });
});

describe("Plant Detail keeps the V0 loop wiring intact", () => {
  it.each([
    "PlantTentEnvironmentPanel",
    "PlantRecentActivityPanel",
    "PlantAssignedTentAlertsPanel",
    "PlantAssignedTentActionsPanel",
    "AssignTentDialog",
  ])("PlantDetail still renders %s", (name) => {
    expect(PLANT_DETAIL).toContain(name);
  });

  it("'Log observation with this context' button copy is untouched", () => {
    expect(ENV_PANEL).toContain("Log observation with this context");
  });

  it("Open Logs link still present", () => {
    expect(PLANT_DETAIL).toContain("Open Logs");
  });
});

describe("Safety: copy pass introduces no risky surfaces", () => {
  const FORBIDDEN = [
    "service_role",
    "mqtt",
    "home_assistant",
    "pi_bridge",
    "actuator",
    "device_command",
    "autopilot",
  ];
  const FILES: Array<[string, string]> = [
    ["QuickLog", QUICKLOG],
    ["PlantTentEnvironmentPanel", ENV_PANEL],
    ["PlantAssignedTentAlertsPanel", ALERTS_PANEL],
    ["PlantAssignedTentActionsPanel", ACTIONS_PANEL],
    ["PlantStatusStrip", STRIP],
    ["PlantDetail", PLANT_DETAIL],
    ["AppSidebar", SIDEBAR],
    ["GrowRoomMode", GRM_PAGE],
  ];
  for (const [name, src] of FILES) {
    for (const needle of FORBIDDEN) {
      it(`${name} does not contain ${needle}`, () => {
        expect(src.toLowerCase()).not.toContain(needle);
      });
    }
  }

  it("PlantStatusStrip performs no writes", () => {
    for (const verb of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(STRIP.includes(verb)).toBe(false);
    }
  });

  it("no new migrations were added by the copy pass", () => {
    const dir = resolve(ROOT, "supabase/migrations");
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    expect(
      entries.every(
        (f) =>
          !f.includes("plant-detail-copy-pass") &&
          !f.includes("mobile-copy-pass"),
      ),
    ).toBe(true);
    // Reference `join` to satisfy lint without polluting assertions.
    void join;
  });
});
