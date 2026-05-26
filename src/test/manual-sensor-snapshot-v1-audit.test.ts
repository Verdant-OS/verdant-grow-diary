/**
 * Manual Sensor Snapshot v1 — consolidated audit.
 *
 * Verifies the eleven build requirements for manual sensor snapshot entry
 * and Sensor Context source labeling in one focused regression file. No
 * automation, no device control, no action_queue, no fake-live data paths
 * are introduced or relied upon.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateManualEntry,
  computeVpdKpa,
  buildManualReadingPayloads,
  fahrenheitToCelsius,
} from "@/lib/sensorReadingManualEntryRules";
import {
  snapshotFromReadings,
  SOURCE_LABEL,
  isStale,
  STALE_THRESHOLD_MS,
} from "@/lib/sensorSnapshot";
import { buildPlantTentEnvironmentView } from "@/lib/plantTentEnvironmentRules";

const ROOT = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("Manual Sensor Snapshot v1 — entry + VPD", () => {
  it("(1+2) saves valid temp/humidity with deterministic computed VPD", () => {
    const v = validateManualEntry({ airTempF: "77", humidityPct: "55" });
    expect(v.ok).toBe(true);
    const vpdRow = v.metrics.find((m) => m.metric === "vpd_kpa");
    expect(vpdRow?.derived).toBe(true);
    // Deterministic: identical inputs → identical output across calls.
    const a = computeVpdKpa(fahrenheitToCelsius(77), 55);
    const b = computeVpdKpa(fahrenheitToCelsius(77), 55);
    expect(a).toBe(b);
    expect(vpdRow?.value).toBe(a);
  });

  it("(3) rejects impossible humidity values", () => {
    expect(validateManualEntry({ humidityPct: "-5" }).ok).toBe(false);
    expect(validateManualEntry({ humidityPct: "120" }).ok).toBe(false);
  });

  it("(4) allows missing optional fields", () => {
    const v = validateManualEntry({ airTempF: "75", humidityPct: "50" });
    expect(v.ok).toBe(true);
    // CO₂ / soil moisture omitted is fine.
    expect(v.metrics.some((m) => m.metric === "co2_ppm")).toBe(false);
  });

  it("payloads always carry source='manual', never live", () => {
    const v = validateManualEntry({ airTempF: "75", humidityPct: "50" });
    const payloads = buildManualReadingPayloads({
      tentId: "t1",
      metrics: v.metrics,
    });
    expect(payloads.every((p) => p.source === "manual")).toBe(true);
  });
});

describe("Sensor Context — source labeling", () => {
  it("(5) manual readings render as Manual, never Live", () => {
    const snap = snapshotFromReadings([
      { ts: "2025-01-01T00:00:00Z", metric: "temperature_c", value: 24, source: "manual" },
      { ts: "2025-01-01T00:00:00Z", metric: "humidity_pct", value: 55, source: "manual" },
    ])!;
    expect(snap.source).toBe("manual");
    expect(SOURCE_LABEL[snap.source]).toBe("Manual");
    expect(SOURCE_LABEL[snap.source]).not.toBe("Live sensor");
  });

  it("(6) sim/demo readings render as Simulated, never Live", () => {
    const snap = snapshotFromReadings([
      { ts: "2025-01-01T00:00:00Z", metric: "temperature_c", value: 24, source: "sim" },
    ])!;
    expect(snap.source).toBe("sim");
    expect(SOURCE_LABEL[snap.source]).toBe("Simulated");
    expect(SOURCE_LABEL[snap.source]).not.toBe("Live sensor");
  });

  it("Live source label is reserved for pi_bridge/live rows only", () => {
    const snap = snapshotFromReadings([
      { ts: "2025-01-01T00:00:00Z", metric: "temperature_c", value: 24, source: "pi_bridge" },
    ])!;
    expect(snap.source).toBe("live");
    expect(SOURCE_LABEL[snap.source]).toBe("Live sensor");
  });

  it("(7) stale readings beyond threshold are flagged stale", () => {
    const ts = "2025-01-01T00:00:00Z";
    const now = new Date(ts).getTime() + STALE_THRESHOLD_MS + 1;
    expect(isStale(ts, now)).toBe(true);
    expect(isStale(ts, new Date(ts).getTime() + 1000)).toBe(false);
  });

  it("(8) empty readings yield empty view, not fake live numbers", () => {
    const view = buildPlantTentEnvironmentView([]);
    expect(view.hasReadings).toBe(false);
    expect(view.sourceLabel).toBeNull();
    expect(view.capturedAt).toBeNull();
    expect(view.metrics).toEqual([]);
  });

  it("(9) Sensor Context view exposes capturedAt timestamp", () => {
    const ts = "2025-01-01T12:00:00Z";
    const view = buildPlantTentEnvironmentView(
      [
        { ts, metric: "temperature_c", value: 24, source: "manual" },
        { ts, metric: "humidity_pct", value: 50, source: "manual" },
      ],
      new Date(ts).getTime() + 1000,
    );
    expect(view.capturedAt).toBe(ts);
    expect(view.sourceLabel).toBe("Manual reading");
  });
});

describe("Manual Sensor Snapshot v1 — static safety", () => {
  const RULES = read("lib/sensorReadingManualEntryRules.ts");
  const CARD = read("components/ManualSensorReadingCard.tsx");
  const SNAP = read("lib/sensorSnapshot.ts");
  const PANEL = read("components/PlantTentEnvironmentPanel.tsx");

  it("(10) no automation, device control, action_queue, or service_role in manual entry path", () => {
    for (const src of [RULES, CARD, SNAP, PANEL]) {
      expect(src).not.toMatch(/action_queue/i);
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/device[_-]?control/i);
      expect(src).not.toMatch(/automation/i);
      expect(src).not.toMatch(/webhook/i);
    }
  });

  it("(10) manual entry never emits source='live' or 'pi_bridge'", () => {
    expect(RULES).toMatch(/source:\s*"manual"/);
    expect(RULES).not.toMatch(/source:\s*"(live|pi_bridge)"/);
  });

  it("(11) UI components do not duplicate sensor source classification tables", () => {
    // The single source of truth for source→label mapping is SOURCE_LABEL
    // in sensorSnapshot.ts. UI components must read from it, not redefine.
    expect(SNAP).toMatch(/SOURCE_LABEL/);
    expect(CARD).not.toMatch(/SOURCE_LABEL\s*[:=]\s*\{/);
    expect(PANEL).not.toMatch(/SOURCE_LABEL\s*[:=]\s*\{/);
    // No inline {manual:"...", live:"..."} maps in components.
    expect(CARD).not.toMatch(/manual:\s*"Manual"[\s\S]{0,80}live:/);
    expect(PANEL).not.toMatch(/manual:\s*"Manual"[\s\S]{0,80}live:/);
  });
});
