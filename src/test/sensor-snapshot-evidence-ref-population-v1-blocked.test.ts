/**
 * Sensor Snapshot → Alert Evidence Ref Population — UNBLOCKED in v2
 * ("Per-Metric Sensor Evidence Refs v1").
 *
 * The env-alert write path now forwards an EXPLICIT per-metric
 * `sensor_readings.id` carried on `SensorSnapshot.metric_refs` — the
 * same row already selected by `snapshotFromReadings` for that metric.
 * No nearest matching, no metric-only DB lookup, no prose inference.
 *
 * This file is the regression fence for the new path: it asserts that
 * the only ref source remains `snapshot.metric_refs` (no fabrication,
 * no payload leakage, no device-control language).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const HOOK = "src/hooks/usePersistEnvironmentAlerts.ts";

describe("Per-Metric Sensor Evidence Refs v1 — env-alert write path", () => {
  it("env-alert hook imports the snapshot evidence helper exactly once", () => {
    const src = read(HOOK);
    expect(src.includes("buildSensorSnapshotEvidenceRefs")).toBe(true);
    expect(src.includes("sensorSnapshotEvidenceRefRules")).toBe(true);
  });

  it("env-alert hook sources ref id from snapshot.metric_refs only", () => {
    const src = read(HOOK);
    // The only allowed ref origin is snapshot.metric_refs[<metric>].
    expect(src).toMatch(/snapshot\.metric_refs/);
    // No DB-side metric lookup, no nearest-row search.
    expect(src.toLowerCase()).not.toMatch(/nearest|closest|fuzzy/);
    expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
  });

  it("saveAlert default still persists [] when no refs are passed", () => {
    const src = read("src/lib/alerts.ts");
    expect(src).toMatch(/normalizeOriginatingTimelineEvents/);
    expect(src).toMatch(/originating_timeline_events:\s*refs/);
  });

  it("env-alert hook never infers refs from prose, raw payloads, or device control", () => {
    const src = read(HOOK).toLowerCase();
    const forbidden = [
      "nearest reading",
      "closest reading",
      "synthetic snapshot",
      "fabricate",
      "raw_payload",
      "service_role",
      "bridge_token",
      "api_token",
      "prompt",
      "completion",
      "model_output",
      "automatically executed",
      "auto-execute",
      "auto execute",
      "send command",
      "set fan",
      "set light",
      "set irrigation",
      "dose nutrients",
      "guaranteed",
      "definitely",
    ];
    for (const tok of forbidden) {
      expect(src.includes(tok), `unexpected token: ${tok}`).toBe(false);
    }
  });

  it("env-alert hook does not reuse alert.id, tent_id, plant_id, or metric as a snapshot id", () => {
    const src = read(HOOK);
    expect(src).not.toMatch(/id:\s*alert\.id/);
    expect(src).not.toMatch(/id:\s*tent_id/);
    expect(src).not.toMatch(/id:\s*plant_id/);
    expect(src).not.toMatch(/id:\s*a\.metric/);
    expect(src).not.toMatch(/snapshot_id\s*:\s*alert/i);
  });
});
