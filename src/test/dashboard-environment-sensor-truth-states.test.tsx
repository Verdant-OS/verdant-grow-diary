/**
 * Slice 7 — Sensor truth state coverage for Dashboard Environment cards.
 *
 * Static scan over src/pages/Dashboard.tsx that locks in the calm,
 * source-honest copy the Environment Snapshot and Latest Environment
 * cards must show across empty / loading / unavailable / stale states.
 *
 * No live data is constructed here. We do not render React; we verify
 * the source contains the required source-truth, status, and safety
 * strings so a future refactor cannot silently strip them.
 *
 * Read-only. No fetch, no Supabase, no schema work.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");

describe("Environment Snapshot (multi-tent overview) — sensor truth copy", () => {
  it("renders an honest section heading + subhead", () => {
    expect(DASHBOARD).toContain("Environment Snapshot");
    expect(DASHBOARD).toMatch(/Latest reading per tent with honest source labels/);
  });

  it("empty state offers a single primary 'Go to Sensors' CTA into /sensors", () => {
    expect(DASHBOARD).toMatch(/data-testid="dashboard-environment-snapshot-empty"/);
    expect(DASHBOARD).toMatch(
      /to="\/sensors"[\s\S]{0,200}data-testid="dashboard-environment-snapshot-go-to-sensors"/,
    );
  });

  it("secondary sensor actions point at the canonical /sensors anchors", () => {
    expect(DASHBOARD).toMatch(
      /to="\/sensors#manual-reading"[\s\S]{0,200}data-testid="dashboard-environment-snapshot-add-manual-reading"/,
    );
    expect(DASHBOARD).toMatch(
      /to="\/sensors#import-sensor-data"[\s\S]{0,200}data-testid="dashboard-environment-snapshot-import-sensor-data"/,
    );
  });

  it("exposes a source/status banner element (stale/invalid surfacing point)", () => {
    expect(DASHBOARD).toMatch(/data-testid="dashboard-environment-snapshot-status-banner"/);
  });

  it("uses isStale + evaluateSensorQuality to flag stale and suspicious snapshots", () => {
    expect(DASHBOARD).toMatch(/isStale\(/);
    expect(DASHBOARD).toMatch(/evaluateSensorQuality\(/);
  });
});

describe("Latest Environment (grow-scoped detail) — sensor truth copy", () => {
  it("section is labeled and clarifies its distinct purpose vs the multi-tent snapshot", () => {
    expect(DASHBOARD).toMatch(/aria-label="Latest environment"/);
    expect(DASHBOARD).toContain("Latest Environment");
    expect(DASHBOARD).toMatch(
      /Grow-scoped detail with per-tent filter and persisted alerts\. Not live device control\./,
    );
  });

  it("renders calm empty / unavailable / loading / stale state copy without faking values", () => {
    expect(DASHBOARD).toMatch(/No sensor data yet\./);
    expect(DASHBOARD).toMatch(/Sensor data unavailable\./);
    expect(DASHBOARD).toMatch(/Loading…/);
    expect(DASHBOARD).toMatch(/Stale reading/);
  });

  it("renders source labels via the shared formatSensorSourceLabel helper (no upgrade to live/synced/connected)", () => {
    expect(DASHBOARD).toMatch(
      /formatSensorSourceLabel\(\{[\s\S]{0,200}source:\s*sensorState\.snapshot\.source/,
    );
    expect(DASHBOARD).toMatch(/deviceId:\s*sensorState\.snapshot\.device_id/);
    // No fake live/synced/connected upgrade copy.
    expect(DASHBOARD).not.toMatch(/\bLive\s+device\b/i);
    expect(DASHBOARD).not.toMatch(/\bSynced live\b/i);
  });

  it("Timeline link uses the canonical /timeline route via timelinePath(scopedGrowId)", () => {
    expect(DASHBOARD).toMatch(
      /to=\{timelinePath\(scopedGrowId\)\}[\s\S]{0,200}Open Timeline/,
    );
    expect(DASHBOARD).not.toMatch(/logsPath\(/);
  });
});

describe("Adjacent Dashboard cards keep cautious-AI safety copy", () => {
  it("Sensor Data Quality is described as a heuristic, not a diagnosis", () => {
    expect(DASHBOARD).toMatch(/Sensor Data Quality/);
    expect(DASHBOARD).toMatch(
      /Heuristic check of the latest snapshot\. Not a plant-health diagnosis\./,
    );
    // Surfaces suspicious fields when present.
    expect(DASHBOARD).toMatch(/Suspicious:/);
  });

  it("Environment Trends is summary only, not a diagnosis", () => {
    expect(DASHBOARD).toMatch(/aria-label="Environment Trends"/);
    expect(DASHBOARD).toMatch(/Environment Trends/);
    expect(DASHBOARD).toMatch(/Recent readings summary\. Not a plant-health diagnosis\./);
  });

  it("Target Comparison is summary only, not a diagnosis", () => {
    expect(DASHBOARD).toMatch(
      /Latest snapshot vs configured grow targets\. Not a\s*\n?\s*plant-health diagnosis\./,
    );
  });
});

describe("Dashboard never claims live/healthy state for unknown or bad data", () => {
  it("does not declare the plant or environment 'Healthy' anywhere", () => {
    expect(DASHBOARD).not.toMatch(/\bHealthy\b/);
  });

  it("does not call demo or stale data 'Live'", () => {
    expect(DASHBOARD).not.toMatch(/\bDemo[\s-]*Live\b/i);
    expect(DASHBOARD).not.toMatch(/\bStale[\s-]*Live\b/i);
  });
});
