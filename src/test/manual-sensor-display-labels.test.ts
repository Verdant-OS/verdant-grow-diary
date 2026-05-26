/**
 * Display-surface tests for manual sensor source/device labels.
 *
 * Verifies that once a manual snapshot is saved with a sanitized device
 * note in `sensor_readings.device_id` (e.g. `manual:SwitchBot CO2 Monitor`),
 * display surfaces use the shared `formatSensorSourceLabel` helper so
 * growers see "Manual reading · SwitchBot CO2 Monitor" instead of bare
 * "Manual" — without ever upgrading the row to live/synced/connected.
 *
 * Pure / static checks. No writes, no AI Coach, no action_queue, no
 * automation, no device control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { snapshotFromReadings, SOURCE_LABEL } from "@/lib/sensorSnapshot";
import {
  formatSensorSourceLabel,
  MANUAL_DEVICE_ID_PREFIX,
  MANUAL_READING_LABEL,
} from "@/lib/manualSensorSourceLabel";
import { formatSensorDeviceDetail } from "@/lib/sensorDeviceLabels";
import { buildPlantTentEnvironmentView } from "@/lib/plantTentEnvironmentRules";
import { buildTentSensorHeaderView } from "@/lib/tentSensorChartRules";

const MANUAL_DEVICE_ID = `${MANUAL_DEVICE_ID_PREFIX}SwitchBot CO2 Monitor`;

function manualRow(metric: string, value: number, deviceId: string | null = MANUAL_DEVICE_ID) {
  return {
    ts: "2026-05-26T08:00:00Z",
    metric,
    value,
    source: "manual",
    device_id: deviceId,
  };
}

function liveRow(metric: string, value: number) {
  return {
    ts: "2026-05-26T08:00:00Z",
    metric,
    value,
    source: "live",
    device_id: "shelly-ht-gen4",
  };
}

describe("snapshotFromReadings — device_id propagation", () => {
  it("carries a manual device_id from the latest manual row", () => {
    const snap = snapshotFromReadings([
      manualRow("temperature_c", 24),
      manualRow("humidity_pct", 55),
    ])!;
    expect(snap.source).toBe("manual");
    expect(snap.device_id).toBe(MANUAL_DEVICE_ID);
  });

  it("leaves device_id null when no manual device note exists", () => {
    const snap = snapshotFromReadings([manualRow("temperature_c", 24, null)])!;
    expect(snap.source).toBe("manual");
    expect(snap.device_id).toBeNull();
  });

  it("preserves the live device_id for live readings", () => {
    const snap = snapshotFromReadings([
      liveRow("temperature_c", 24),
      liveRow("humidity_pct", 55),
    ])!;
    expect(snap.source).toBe("live");
    expect(snap.device_id).toBe("shelly-ht-gen4");
  });

  it("never upgrades a manual row to live when device_id is present", () => {
    const snap = snapshotFromReadings([
      manualRow("temperature_c", 24),
      manualRow("humidity_pct", 55),
    ])!;
    expect(snap.source).toBe("manual");
    expect(SOURCE_LABEL[snap.source]).not.toBe("Live sensor");
  });
});

describe("formatSensorDeviceDetail — manual prefix support", () => {
  it("returns the extracted manual note for a manual: device_id", () => {
    expect(formatSensorDeviceDetail(MANUAL_DEVICE_ID)).toBe(
      "SwitchBot CO2 Monitor",
    );
  });

  it("returns null for plain manual sources with no note", () => {
    expect(formatSensorDeviceDetail(null)).toBeNull();
    expect(formatSensorDeviceDetail("")).toBeNull();
  });

  it("still returns the Shelly H&T label for live webhook ingest", () => {
    expect(formatSensorDeviceDetail("shelly-ht-gen4")).toBe("Shelly H&T Gen4");
    expect(formatSensorDeviceDetail("shelly-ht-gen4:kitchen-1")).toBe(
      "Shelly H&T Gen4",
    );
  });

  it("returns null for unknown device ids", () => {
    expect(formatSensorDeviceDetail("acme-sensor-9000")).toBeNull();
  });
});

describe("plantTentEnvironmentRules — combined source/device label", () => {
  it("renders 'Manual reading · SwitchBot CO2 Monitor' for manual + device note", () => {
    const view = buildPlantTentEnvironmentView([
      manualRow("temperature_c", 24),
      manualRow("humidity_pct", 55),
    ]);
    expect(view.sourceLabel).toBe(
      `${MANUAL_READING_LABEL} · SwitchBot CO2 Monitor`,
    );
  });

  it("renders 'Manual reading' alone when no device note exists", () => {
    const view = buildPlantTentEnvironmentView([
      manualRow("temperature_c", 24, null),
    ]);
    expect(view.sourceLabel).toBe(MANUAL_READING_LABEL);
  });

  it("renders 'Live sensor' unchanged for live rows", () => {
    const view = buildPlantTentEnvironmentView([liveRow("temperature_c", 24)]);
    expect(view.sourceLabel).toBe("Live sensor");
  });
});

describe("tentSensorChartRules — combined source/device label", () => {
  it("uses formatSensorSourceLabel for the latest snapshot header", () => {
    const view = buildTentSensorHeaderView([
      manualRow("temperature_c", 24),
      manualRow("humidity_pct", 55),
    ]);
    expect(view.sourceLabel).toBe(
      `${MANUAL_READING_LABEL} · SwitchBot CO2 Monitor`,
    );
  });
});

describe("formatSensorSourceLabel — manual cannot be relabeled as live/synced/connected", () => {
  it("returns 'Manual reading · …' for manual + device note", () => {
    expect(
      formatSensorSourceLabel({ source: "manual", deviceId: MANUAL_DEVICE_ID }),
    ).toBe(`${MANUAL_READING_LABEL} · SwitchBot CO2 Monitor`);
  });

  it("never returns Live / Synced / Connected for manual source", () => {
    const label = formatSensorSourceLabel({
      source: "manual",
      deviceId: MANUAL_DEVICE_ID,
    });
    expect(label.toLowerCase()).not.toContain("live");
    expect(label.toLowerCase()).not.toContain("synced");
    expect(label.toLowerCase()).not.toContain("connected");
  });

  it("ignores a spoofed deviceNote on a non-manual source", () => {
    expect(
      formatSensorSourceLabel({ source: "live", deviceNote: "Totally Live" }),
    ).toBe("Live sensor");
  });
});

// -------------------------------------------------------------------------
// Static safety / wiring audit on the changed display surfaces.
// -------------------------------------------------------------------------

const ROOT = resolve(__dirname, "..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("Display-surface wiring — uses shared helper, stays safe", () => {
  const DASHBOARD = read("pages/Dashboard.tsx");
  const PLANT_RULES = read("lib/plantTentEnvironmentRules.ts");
  const TENT_RULES = read("lib/tentSensorChartRules.ts");
  const DEVICE_LABELS = read("lib/sensorDeviceLabels.ts");

  it("Dashboard latest-env card uses formatSensorSourceLabel with snapshot.device_id", () => {
    expect(DASHBOARD).toContain(
      'import { formatSensorSourceLabel } from "@/lib/manualSensorSourceLabel"',
    );
    expect(DASHBOARD).toMatch(
      /formatSensorSourceLabel\(\{[\s\S]{0,200}source:\s*sensorState\.snapshot\.source[\s\S]{0,200}deviceId:\s*sensorState\.snapshot\.device_id/,
    );
  });

  it("plantTentEnvironmentRules + tentSensorChartRules use formatSensorSourceLabel", () => {
    expect(PLANT_RULES).toContain("formatSensorSourceLabel");
    expect(TENT_RULES).toContain("formatSensorSourceLabel");
  });

  it("sensorDeviceLabels augments — never duplicates — the SOURCE_LABEL map", () => {
    expect(DEVICE_LABELS).not.toMatch(/SOURCE_LABEL\s*[:=]\s*\{/);
    expect(DEVICE_LABELS).toContain("extractManualDeviceNote");
  });

  it("no new unsafe surfaces in changed files", () => {
    for (const src of [DASHBOARD, PLANT_RULES, TENT_RULES, DEVICE_LABELS]) {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/ai[_-]?coach/i);
      expect(src).not.toMatch(/\bmqtt\b/i);
      expect(src).not.toMatch(/home[_-]?assistant/i);
      expect(src).not.toMatch(/\bpi[_-]?bridge\b/i);
      expect(src).not.toMatch(/\bwebhook\b/i);
      expect(src).not.toMatch(/\brelay\b/i);
      expect(src).not.toMatch(/\bactuator\b/i);
      expect(src).not.toMatch(/device[_-]?command/i);
    }
  });

  it("changed rule files stay pure / read-only (no Supabase writes)", () => {
    for (const src of [PLANT_RULES, TENT_RULES, DEVICE_LABELS]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    }
  });
});
