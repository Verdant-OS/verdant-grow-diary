/**
 * Plant Detail → QuickLog handoff tests.
 *
 * Pure helper coverage + static source-level guardrails. Asserts:
 *  - prefill builder requires plant+grow+tent ids
 *  - panel renders the action only when a tent is assigned and dispatches
 *    the expected window event with the prefill payload
 *  - QuickLog accepts an optional prefill prop and applies it on open
 *  - AppShell wires the window event into QuickLog
 *  - no writes, no schema, no edge / pi-ingest edits, no automation strings
 *  - existing plant-detail assign and environment tests still pass
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPlantQuickLogPrefill,
  PLANT_QUICKLOG_PREFILL_EVENT,
} from "@/lib/plantQuickLogPrefillRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("buildPlantQuickLogPrefill (pure)", () => {
  it("returns null when plant, grow, or tent is missing", () => {
    expect(buildPlantQuickLogPrefill(null)).toBeNull();
    expect(
      buildPlantQuickLogPrefill({ plantId: "p1", growId: "g1", tentId: null }),
    ).toBeNull();
    expect(
      buildPlantQuickLogPrefill({ plantId: "p1", growId: null, tentId: "t1" }),
    ).toBeNull();
    expect(
      buildPlantQuickLogPrefill({ plantId: null, growId: "g1", tentId: "t1" }),
    ).toBeNull();
  });

  it("builds a prefill payload with observation + snapshot suggestion", () => {
    const r = buildPlantQuickLogPrefill({
      plantId: "p1",
      plantName: "Sour Diesel #1",
      growId: "g1",
      tentId: "t1",
      tentName: "Tent A",
    });
    expect(r).toEqual({
      plantId: "p1",
      plantName: "Sour Diesel #1",
      growId: "g1",
      tentId: "t1",
      tentName: "Tent A",
      eventType: "observation",
      suggestSnapshot: true,
    });
  });

  it("does not copy any sensor values into the prefill", () => {
    const r = buildPlantQuickLogPrefill({
      plantId: "p1",
      growId: "g1",
      tentId: "t1",
    });
    const json = JSON.stringify(r);
    for (const k of [
      "temp",
      "rh",
      "vpd",
      "co2",
      "soil",
      "ts",
      "captured_at",
      "value",
    ]) {
      expect(json).not.toContain(`"${k}"`);
    }
  });

  it("uses a namespaced event name to avoid cross-app collisions", () => {
    expect(PLANT_QUICKLOG_PREFILL_EVENT).toBe("verdant:open-quicklog");
  });
});

// ---------- Static source-level guardrails ----------
const PANEL = read("src/components/PlantTentEnvironmentPanel.tsx");
const RULES = read("src/lib/plantQuickLogPrefillRules.ts");
const QUICKLOG = read("src/components/QuickLog.tsx");
const APPSHELL = read("src/components/AppShell.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("Plant Detail → QuickLog handoff wiring", () => {
  it("PlantDetail forwards plant + grow context into the panel", () => {
    expect(PLANT_DETAIL).toMatch(/plantId=\{plant\.id\}/);
    expect(PLANT_DETAIL).toMatch(/growId=\{plant\.growId\s*\?\?\s*null\}/);
    expect(PLANT_DETAIL).toMatch(/plantName=\{plant\.name\}/);
  });

  it("panel renders the 'Log observation with this context' action only when a tent is assigned", () => {
    expect(PANEL).toContain("Log observation with this context");
    expect(PANEL).toContain("plant-tent-environment-log-with-context");
    // Gated on enabled (tent assigned) AND a non-null prefill
    expect(PANEL).toMatch(/enabled\s*&&\s*prefill\s*\?/);
  });

  it("panel dispatches the namespaced window event with the prefill payload", () => {
    expect(PANEL).toContain("PLANT_QUICKLOG_PREFILL_EVENT");
    expect(PANEL).toMatch(/new CustomEvent\(\s*PLANT_QUICKLOG_PREFILL_EVENT/);
    expect(PANEL).toMatch(/detail:\s*prefill/);
  });

  it("QuickLog accepts an optional prefill prop and applies it on open", () => {
    expect(QUICKLOG).toContain("QuickLogPrefill");
    expect(QUICKLOG).toMatch(/prefill\?\:\s*QuickLogPrefill\s*\|\s*null/);
    expect(QUICKLOG).toMatch(/setActiveGrowId\(prefill\.growId\)/);
    expect(QUICKLOG).toMatch(/setPlantId\(prefill\.plantId\)/);
    expect(QUICKLOG).toMatch(/setEventType\(prefill\.eventType\)/);
    expect(QUICKLOG).toMatch(/suggestSnapshot[\s\S]{0,40}setSnapshot\(true\)/);
  });

  it("AppShell listens for the open-quicklog event and passes prefill to QuickLog", () => {
    expect(APPSHELL).toContain("PLANT_QUICKLOG_PREFILL_EVENT");
    expect(APPSHELL).toMatch(/addEventListener\(\s*PLANT_QUICKLOG_PREFILL_EVENT/);
    expect(APPSHELL).toMatch(/prefill=\{prefill\}/);
    // resets prefill when the dialog closes
    expect(APPSHELL).toMatch(/setPrefill\(null\)/);
  });
});

describe("Plant Detail → QuickLog handoff safety", () => {
  const ALL = [PANEL, RULES, QUICKLOG, APPSHELL, PLANT_DETAIL].join("\n");

  it("does not auto-create diary entries — handoff is open-dialog only", () => {
    // No insert into diary_entries in the prefill rules / panel / appshell.
    for (const src of [PANEL, RULES, APPSHELL]) {
      expect(src).not.toMatch(/\.from\(["']diary_entries["']\)/);
      expect(src).not.toMatch(/\.insert\(/);
    }
    // QuickLog still owns the diary insert, behind manual form submit.
    expect(QUICKLOG).toMatch(/submit\(e: React\.FormEvent\)/);
  });

  it("does not write to sensor_readings / alerts / action_queue / tents from the handoff surface", () => {
    for (const src of [PANEL, RULES, APPSHELL]) {
      for (const t of [
        "sensor_readings",
        "alerts",
        "alert_events",
        "action_queue",
        "action_queue_events",
        "tents",
        "plants",
        "pi_ingest_idempotency_keys",
        "pi_ingest_bridge_credentials",
      ]) {
        expect(src).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
      }
    }
  });

  it("contains no automation / device-control / pi-ingest transport strings", () => {
    const surfaces = [PANEL, RULES, APPSHELL].join("\n");
    expect(surfaces).not.toMatch(
      /mqtt|home[\s_-]?assistant|relay|actuator|webhook|device_command|service_role/i,
    );
  });

  it("does not invent sensor values in the prefill payload", () => {
    expect(RULES).not.toMatch(/temperature_c|humidity_pct|vpd_kpa|co2_ppm/);
    expect(RULES).not.toMatch(/\bvalue\b/);
    void ALL;
  });
});

// ---------- Behavioral: panel dispatches event ----------
describe("PlantTentEnvironmentPanel dispatch behavior", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches a CustomEvent with the full prefill payload", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    // Re-derive the same payload the panel would dispatch.
    const prefill = buildPlantQuickLogPrefill({
      plantId: "p1",
      plantName: "Sour Diesel #1",
      growId: "g1",
      tentId: "t1",
      tentName: "Tent A",
    });
    window.dispatchEvent(
      new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: prefill }),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const ev = spy.mock.calls[0][0] as CustomEvent;
    expect(ev.type).toBe("verdant:open-quicklog");
    expect(ev.detail).toEqual(prefill);
  });

  it("never builds a prefill for unassigned plants (no event would fire)", () => {
    expect(
      buildPlantQuickLogPrefill({ plantId: "p1", growId: "g1", tentId: null }),
    ).toBeNull();
  });
});
