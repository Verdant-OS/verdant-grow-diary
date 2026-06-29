/**
 * Sensor Snapshot → Alert Evidence Ref Population v1 — environment alert
 * write-path lock test.
 *
 * Audit verdict: BLOCKED. `SensorSnapshot` (the aggregated env snapshot
 * available at the env-alert write boundary in usePersistEnvironmentAlerts)
 * does NOT carry an `id`. There is no explicit sensor_reading.id /
 * snapshot.id at write time, so v1 may not populate refs from this path —
 * the helper exists for callers that DO have a real id, and the hook
 * must continue to persist `[]` via saveAlert's default.
 *
 * This file is a regression fence: it fails the moment the env-alert path
 * starts inferring refs from timestamps, tent/plant/metric, alert prose,
 * or the alert id itself.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const HOOK = "src/hooks/usePersistEnvironmentAlerts.ts";

describe("Sensor Snapshot Ref Population v1 — env-alert write path is blocked", () => {
  it("env-alert hook does not import the snapshot evidence helper (no safe id available)", () => {
    const src = read(HOOK);
    expect(src.includes("sensorSnapshotEvidenceRefRules")).toBe(false);
    expect(src.includes("buildSensorSnapshotEvidenceRefs")).toBe(false);
  });

  it("env-alert hook does not pass originating_timeline_events to saveAlert", () => {
    const src = read(HOOK);
    // The hook must rely on saveAlert's default ([] persistence). Asserting
    // the field is never named in the writer payload is the strongest fence.
    expect(src.includes("originating_timeline_events")).toBe(false);
  });

  it("saveAlert default persists [] when no refs are passed", () => {
    const src = read("src/lib/alerts.ts");
    expect(src).toMatch(/normalizeOriginatingTimelineEvents/);
    // refs are normalized from input; absent input → [] via the rules helper.
    expect(src).toMatch(/originating_timeline_events:\s*refs/);
  });

  it("env-alert hook does not infer refs from prose, metric, or timestamp matching", () => {
    const src = read(HOOK).toLowerCase();
    const forbidden = [
      "nearest reading",
      "nearest_reading",
      "closest reading",
      "match.*captured_at", // regex tokens are fine as plain substrings here
      "alert.id as snapshot",
      "synthetic snapshot",
      "fabricate",
      "raw_payload",
      "service_role",
      "bridge_token",
      "api_token",
      "automatically executed",
      "auto-execute",
      "auto execute",
      "send command",
      "set fan",
      "set light",
      "set irrigation",
      "dose nutrients",
    ];
    for (const tok of forbidden) {
      expect(src.includes(tok), `unexpected token: ${tok}`).toBe(false);
    }
  });

  it("env-alert hook does not reuse alert.id, tent_id, plant_id, or metric as a snapshot id", () => {
    const src = read(HOOK);
    // No assignment shape that synthesizes a snapshot id from these fields.
    expect(src).not.toMatch(/id:\s*alert\.id/);
    expect(src).not.toMatch(/id:\s*tent_id/);
    expect(src).not.toMatch(/id:\s*plant_id/);
    expect(src).not.toMatch(/id:\s*metric/);
    expect(src).not.toMatch(/snapshot_id\s*:\s*alert/i);
  });
});
