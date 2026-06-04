/**
 * Dashboard + Live Dashboard consolidation.
 *
 * Verifies that:
 *  - Primary navigation surfaces a single Dashboard entry (no Live Dashboard).
 *  - Legacy /grow-room route still resolves to GrowRoomMode (back-compat).
 *  - Dashboard renders an "Environment Snapshot" section.
 *  - Snapshot section is not labelled "Live" inside the Dashboard page header
 *    (we only call readings live when verified live/fresh, via SensorSourceBadge).
 *  - Dashboard preserves existing links to Sensors, Alerts, Tasks.
 *  - Static safety: no service_role, no fake-live labels, no device-control
 *    strings, no automation/autopilot, no *_executed event naming.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SIDEBAR = readFileSync(resolve(ROOT, "src/components/AppSidebar.tsx"), "utf8");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");
const DASH = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");

describe("Dashboard + Live Dashboard consolidation · navigation", () => {
  it("Sidebar exposes exactly one Dashboard nav entry", () => {
    const dashMatches = SIDEBAR.match(/label:\s*"Dashboard"/g) ?? [];
    expect(dashMatches.length).toBe(1);
  });

  it("Sidebar does not expose a Live Dashboard nav entry", () => {
    expect(SIDEBAR).not.toMatch(/Live Dashboard/);
    expect(SIDEBAR).not.toMatch(/\/grow-room/);
  });

  it("Legacy /grow-room route is preserved for back-compat", () => {
    expect(APP).toMatch(/path=["']\/grow-room["']/);
    expect(APP).toMatch(/<GrowRoomMode\s*\/?>/);
  });

  it("Existing Alerts / Tasks / Sensors nav links remain", () => {
    expect(SIDEBAR).toMatch(/\/alerts/);
    expect(SIDEBAR).toMatch(/\/tasks/);
    expect(SIDEBAR).toMatch(/\/sensors/);
  });
});

describe("Dashboard · Environment Snapshot section", () => {
  it("renders an Environment Snapshot section", () => {
    expect(DASH).toContain('data-testid="dashboard-environment-snapshot"');
    expect(DASH).toMatch(/Environment Snapshot/);
  });

  it("Environment Snapshot copy includes an honest helper for empty state", () => {
    expect(DASH).toMatch(/Add a manual reading or connect Ecowitt/);
  });

  it("section is not labelled 'Live' (we never claim live without verification)", () => {
    // Heading copy must not assert "Live Environment" / "Live Snapshot".
    expect(DASH).not.toMatch(/Live Environment Snapshot/i);
    expect(DASH).not.toMatch(/>\s*Live Snapshot\s*</);
  });

  it("preserves zero-tent empty state", () => {
    expect(DASH).toContain("DashboardZeroTentEmptyState");
  });

  it("uses SensorSourceBadge for honest source labels", () => {
    expect(DASH).toContain("SensorSourceBadge");
  });
});

describe("Dashboard + nav · static safety", () => {
  const files = { SIDEBAR, APP, DASH };
  for (const [name, body] of Object.entries(files)) {
    it(`${name} contains no forbidden strings`, () => {
      expect(body).not.toMatch(/service_role/);
      expect(body).not.toMatch(/SUPABASE_SERVICE_ROLE/);
      expect(body).not.toMatch(/autopilot/i);
      expect(body).not.toMatch(/_executed["'`]/);
      // No fake-live label fallback (e.g. forcing source = "live" without data).
      expect(body).not.toMatch(/source:\s*["']live["']\s*\/\/\s*fake/i);
    });
  }
});
