/**
 * Dashboard Environment Snapshot — empty/stale/invalid/source states.
 *
 * Static (source-level) assertions focused on the Dashboard JSX. We avoid
 * mounting the full Dashboard because it pulls in QueryClient, Auth,
 * Grows providers, and Supabase. Source-level checks are sufficient to
 * verify the safety-critical strings, IDs, and conditional branches.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DASH = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");
const SIDEBAR = readFileSync(resolve(ROOT, "src/components/AppSidebar.tsx"), "utf8");
const GROW_DETAIL = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8");
const GRM = readFileSync(resolve(ROOT, "src/pages/GrowRoomMode.tsx"), "utf8");
const SRC_LABEL_RULES = readFileSync(
  resolve(ROOT, "src/lib/sensorSourceLabelRules.ts"),
  "utf8",
);

describe("Dashboard Environment Snapshot · empty / stale / invalid states", () => {
  it("renders an honest empty title when there is no latest reading", () => {
    expect(DASH).toContain('data-testid="dashboard-environment-snapshot-empty"');
    expect(DASH).toMatch(/No sensor snapshot yet/);
  });

  it("empty state includes the Ecowitt-or-manual helper copy", () => {
    expect(DASH).toMatch(/Add a manual reading or/);
    expect(DASH).toMatch(/connect Ecowitt/);
    expect(DASH).toMatch(/to see your environment here\./);
  });

  it("empty state has Import sensor data link to Sensors page anchor", () => {
    expect(DASH).toContain('data-testid="dashboard-environment-snapshot-import-sensor-data"');
    expect(DASH).toMatch(/to="\/sensors#import-sensor-data"/);
    expect(DASH).toMatch(/Import sensor data/);
  });

  it("stale/invalid status banner is rendered above the snapshot grid", () => {
    expect(DASH).toContain(
      'data-testid="dashboard-environment-snapshot-status-banner"',
    );
    expect(DASH).toMatch(/Latest reading is stale/);
    expect(DASH).toMatch(/Latest reading looks invalid/);
  });

  it("uses evaluateSensorQuality + isStale to drive the banner (no JSX-local thresholds)", () => {
    expect(DASH).toMatch(/evaluateSensorQuality\s*\(/);
    expect(DASH).toMatch(/isStale\s*\(/);
    // No inline 30-minute or millisecond freshness thresholds in JSX.
    expect(DASH).not.toMatch(/30\s*\*\s*60\s*\*\s*1000/);
  });

  it("does not invent a snapshot or promote stale/invalid to current", () => {
    expect(DASH).not.toMatch(/fallback.*demo/i);
    expect(DASH).not.toMatch(/source:\s*["']live["']/);
  });
});

describe("Source label rules (used by Environment Snapshot via SensorSourceBadge)", () => {
  it("supports Ecowitt vendor lineage", () => {
    expect(SRC_LABEL_RULES).toMatch(/ecowitt/);
    expect(SRC_LABEL_RULES).toMatch(/Ecowitt/);
  });

  it("supports Manual and CSV labels", () => {
    expect(SRC_LABEL_RULES).toMatch(/manual:\s*"Manual"/);
    expect(SRC_LABEL_RULES).toMatch(/csv:\s*"CSV"/);
  });

  it("supports Stale and Invalid canonical labels", () => {
    expect(SRC_LABEL_RULES).toMatch(/stale:\s*"Stale"/);
    expect(SRC_LABEL_RULES).toMatch(/invalid:\s*"Invalid"/);
  });

  it("unknown source resolves to Unknown — never Live", () => {
    expect(SRC_LABEL_RULES).toMatch(/label:\s*"Unknown"/);
  });
});

describe("Legacy Live Dashboard route + copy cleanup", () => {
  it("App redirects /grow-room to /", () => {
    expect(APP).toMatch(
      /path=["']\/grow-room["']\s+element=\{<Navigate\s+to=["']\/["']\s+replace\s*\/>\}/,
    );
  });

  it("App no longer mounts GrowRoomMode at any route", () => {
    expect(APP).not.toMatch(/<GrowRoomMode\s*\/?>/);
  });

  it("Sidebar has no Live Dashboard nav entry", () => {
    expect(SIDEBAR).not.toMatch(/Live Dashboard/);
    expect(SIDEBAR).not.toMatch(/\/grow-room/);
  });

  it("GrowDetail hub no longer says 'live dashboard'", () => {
    expect(GROW_DETAIL).not.toMatch(/live dashboard/i);
  });

  it("Legacy operator-view page header no longer says 'Live Dashboard'", () => {
    expect(GRM).not.toMatch(/title=["']Live Dashboard["']/);
  });
});

describe("Static safety · Dashboard + nav + operator view", () => {
  const files: Record<string, string> = { DASH, APP, SIDEBAR, GROW_DETAIL, GRM };
  for (const [name, body] of Object.entries(files)) {
    it(`${name} contains no forbidden strings`, () => {
      expect(body).not.toMatch(/service_role/);
      expect(body).not.toMatch(/SUPABASE_SERVICE_ROLE/);
      expect(body).not.toMatch(/autopilot/i);
      expect(body).not.toMatch(/_executed["'`]/);
      expect(body).not.toMatch(/source:\s*["']live["']\s*\/\/\s*fake/i);
    });
  }

  it("Dashboard does not render demo/sample fallback readings in the snapshot", () => {
    expect(DASH).not.toMatch(/sampleReadings|demoReadings|mockSnapshot/);
  });
});
