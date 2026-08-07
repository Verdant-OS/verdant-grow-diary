/**
 * Sensor Snapshot → Alert Evidence Ref Population — UNBLOCKED in v2
 * ("Per-Metric Sensor Evidence Refs v1") and extended in #603
 * ("Diary Evidence Refs for Environment Check").
 *
 * The env-alert write path now forwards EXPLICIT ids only:
 *  - per-metric `sensor_readings.id` from `SensorSnapshot.metric_refs`
 *  - `diary_entries.id` from `SensorSnapshot.diary_evidence_ref` (env check)
 *
 * No nearest matching, no metric-only DB lookup, no prose inference.
 *
 * This file is the regression fence for both paths: it asserts that
 * the only ref sources remain those two explicit snapshot fields
 * (no fabrication, no payload leakage, no device-control language).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const HOOK = "src/hooks/usePersistEnvironmentAlerts.ts";

describe("Per-Metric Sensor Evidence Refs v1 — env-alert write path", () => {
  it("env-alert hook imports the snapshot evidence helper", () => {
    const src = read(HOOK);
    expect(src.includes("buildSensorSnapshotEvidenceRefs")).toBe(true);
    expect(src.includes("sensorSnapshotEvidenceRefRules")).toBe(true);
  });

  it("env-alert hook also imports the diary evidence helper (#603)", () => {
    const src = read(HOOK);
    expect(src.includes("buildDiaryEntryEvidenceRefs")).toBe(true);
    expect(src.includes("diaryEntryEvidenceRefRules")).toBe(true);
  });

  it("env-alert hook sources ref ids only from explicit snapshot fields", () => {
    const src = read(HOOK);
    // Allowed ref origins: metric_refs and diary_evidence_ref.
    expect(src).toMatch(/metric_refs/);
    expect(src).toMatch(/diary_evidence_ref/);
    // No DB-side metric/diary lookup, no nearest-row search.
    expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
    expect(src).not.toMatch(/from\(["']diary_entries["']\)/);
    expect(src).not.toMatch(/nearestReading|closestReading|fuzzyMatch/);
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
    expect(src).not.toMatch(/id:\s*metric\b/);
  });

  it("latest-sensor-snapshot selects diary id for env-check evidence (#603)", () => {
    const src = read("src/hooks/useLatestSensorSnapshot.ts");
    expect(src).toMatch(/select\(["']id,entry_at,details,tent_id["']\)/);
    expect(src).toMatch(/diaryEntryId/);
  });
});
