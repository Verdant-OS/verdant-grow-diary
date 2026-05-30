/**
 * Static guardrails for the Add Existing Plant move/categorization
 * behavior and the Plants-above-Tents navigation order.
 *
 * Source-level only — no rendering. Captures intent so the dialog
 * cannot regress to "unassigned-only" or unsafe writes, and the nav
 * cannot regress to Tents-above-Plants.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const DIALOG = read("src/components/AddExistingPlantDialog.tsx");
const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const SIDEBAR = read("src/components/AppSidebar.tsx");
const MOBILE_NAV = read("src/components/MobileNav.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("AddExistingPlantDialog · categorization + move semantics", () => {
  it("groups eligible plants into Unassigned and Plants in another tent", () => {
    expect(DIALOG).toContain("Unassigned plants");
    expect(DIALOG).toContain("Plants in another tent");
  });

  it("shows plants already in the current tent as disabled (not assignable)", () => {
    expect(DIALOG).toContain("Already in this tent");
    expect(DIALOG).toMatch(/value=\{p\.id\}[\s\S]{0,80}disabled[\s\S]{0,200}add-existing-plant-option-current/);
  });

  it("categorizes client-side from a single same-grow query", () => {
    expect(DIALOG).toMatch(/p\.tent_id == null/);
    expect(DIALOG).toMatch(/p\.tent_id === tentId/);
  });

  it("guards against cross-grow assignment by requiring growId", () => {
    expect(DIALOG).toMatch(/hasGrowContext/);
    expect(DIALOG).toContain("missing grow context");
    // Query is only enabled when growId is present.
    expect(DIALOG).toMatch(/enabled:\s*open\s*&&\s*hasGrowContext/);
  });

  it("refuses to assign a plant already in the current tent", () => {
    expect(DIALOG).toContain("Plant is already in this tent");
  });

  it("invalidates plants / grow / tent caches after a write", () => {
    expect(DIALOG).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["plants"\]/);
    expect(DIALOG).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["grow",\s*"plants"\]/);
    expect(DIALOG).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["tent-detail"\]/);
  });

  it("never sets user_id / grow_id / strain / stage in the update payload", () => {
    const updates = [...DIALOG.matchAll(/\.update\(\s*\{([^}]*)\}\s*\)/g)];
    expect(updates.length).toBeGreaterThan(0);
    for (const m of updates) {
      const payload = m[1];
      expect(payload).not.toMatch(/\buser_id\b/);
      expect(payload).not.toMatch(/\bgrow_id\b/);
      expect(payload).not.toMatch(/\bstrain\b/);
      expect(payload).not.toMatch(/\bstage\b/);
    }
  });

  it("does not write to alerts / action_queue / sensor / pi-ingest tables", () => {
    for (const t of [
      "action_queue",
      "action_queue_events",
      "alerts",
      "alert_events",
      "sensor_readings",
      "pi_ingest_idempotency_keys",
      "pi_ingest_bridge_credentials",
    ]) {
      expect(DIALOG).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
    }
  });

  it("contains no automation / device-control / pi-ingest transport strings", () => {
    expect(DIALOG).not.toMatch(/mqtt|home[\s_-]?assistant|relay|actuator|webhook|device_command|service_role/i);
  });
});

describe("TentDetail wiring", () => {
  it("still surfaces both 'Add Plant to This Tent' and 'Add Existing Plant'", () => {
    expect(TENT_DETAIL).toContain("Add Plant to This Tent");
    expect(TENT_DETAIL).toContain("AddExistingPlantDialog");
  });

  it("renders the tent plant grid that links to Plant Detail", () => {
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-plants-grid"');
    expect(TENT_DETAIL).toMatch(/plantDetailPath\(/);
  });
});

describe("PlantDetail wiring", () => {
  it("still exposes a way to view the parent tent", () => {
    expect(PLANT_DETAIL).toMatch(/tentDetailPath\(/);
  });
});

function navOrder(text: string, paths: string[]): number[] {
  return paths.map((p) => text.indexOf(`to: "${p}"`));
}

describe("Navigation order · Tents above Plants (workspace-first)", () => {
  it("AppSidebar lists Tents before Plants", () => {
    const [tents, plants] = navOrder(SIDEBAR, ["/tents", "/plants"]);
    expect(tents).toBeGreaterThan(-1);
    expect(plants).toBeGreaterThan(-1);
    expect(tents).toBeLessThan(plants);
  });

  it("MobileNav lists Tents before Plants when both are present", () => {
    const [tents, plants] = navOrder(MOBILE_NAV, ["/tents", "/plants"]);
    expect(tents).toBeGreaterThan(-1);
    expect(plants).toBeGreaterThan(-1);
    expect(tents).toBeLessThan(plants);
  });

  it("Dashboard / Grow Room stay above Tents and Plants in the sidebar", () => {
    const dashIdx = SIDEBAR.indexOf('to: "/"');
    const tentsIdx = SIDEBAR.indexOf('to: "/tents"');
    expect(dashIdx).toBeGreaterThan(-1);
    expect(tentsIdx).toBeGreaterThan(-1);
    expect(dashIdx).toBeLessThan(tentsIdx);
  });
});
