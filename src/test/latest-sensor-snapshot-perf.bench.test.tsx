import { describe, expect, it } from "vitest";
import {
  EMPTY_SNAPSHOT,
  hasFiniteSnapshotMetric,
  type SensorSnapshot,
  snapshotFromDiary,
  snapshotFromEnvironmentCheck,
  snapshotFromManualSensorSnapshot,
} from "@/lib/sensorSnapshot";
import { isDiaryRowInTentScope } from "@/lib/diaryEvidenceTentScopeRules";

type DiaryRow = {
  id: string;
  grow_id: string;
  tent_id: string | null;
  entry_at: string;
  details: Record<string, unknown> | null;
};

const savedAt = "2026-09-23T10:00:00.000Z";
const tentIds = ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];

function preferNewer(
  staleSensor: SensorSnapshot | null,
  diaryEvidence: SensorSnapshot,
): SensorSnapshot {
  if (!staleSensor?.ts || !diaryEvidence.ts) return diaryEvidence;
  const sensorAt = Date.parse(staleSensor.ts);
  const diaryAt = Date.parse(diaryEvidence.ts);
  if (!Number.isFinite(sensorAt)) return diaryEvidence;
  if (!Number.isFinite(diaryAt)) return staleSensor;
  return diaryAt > sensorAt ? diaryEvidence : staleSensor;
}

function generateCandidateRows(count: number): DiaryRow[] {
  const rows: DiaryRow[] = [];
  for (let i = 0; i < count; i++) {
    const isTarget = i === count - 1;
    rows.push({
      id: `row-${i}`,
      grow_id: "grow-a",
      tent_id: tentIds[0],
      entry_at: new Date(Date.parse(savedAt) - i * 60_000).toISOString(),
      details: isTarget
        ? { manual_sensor_snapshot: { source: "manual", temp_f: 72, humidity_percent: 50 } }
        : { sensor_snapshot: { metrics: { temp: "not-a-number" } } },
    });
  }
  return rows;
}

// Baseline scanning logic as originally implemented in useLatestSensorSnapshot.ts
function scanCandidatesBaseline(
  diaryRows: DiaryRow[],
  candidateLimit: number,
  staleSensorCandidate: SensorSnapshot | null,
): SensorSnapshot | null {
  for (const row of diaryRows.slice(0, candidateLimit)) {
    const details = (row.details ?? null) as Record<string, unknown> | null;
    if (!details || typeof details !== "object") continue;
    if (!isDiaryRowInTentScope(row.tent_id, tentIds)) continue;
    const rowTentInScope = row.tent_id ?? null;
    const snap = snapshotFromDiary(
      row.entry_at,
      details.sensor_snapshot as Record<string, unknown> | undefined,
    );
    if (hasFiniteSnapshotMetric(snap)) {
      snap.tent_id = rowTentInScope;
      return preferNewer(staleSensorCandidate, snap);
    }
    const diaryEntryId =
      typeof (row as { id?: string | null }).id === "string" ? (row as { id: string }).id : null;
    const manualSnap = snapshotFromManualSensorSnapshot(
      row.entry_at,
      details.manual_sensor_snapshot as Record<string, unknown> | undefined,
      { diaryEntryId },
    );
    if (manualSnap) {
      manualSnap.tent_id = rowTentInScope;
      return preferNewer(staleSensorCandidate, manualSnap);
    }
    const envSnap = snapshotFromEnvironmentCheck(
      row.entry_at,
      details.environment_check as Record<string, unknown> | undefined,
      { diaryEntryId },
    );
    if (envSnap) {
      envSnap.tent_id = rowTentInScope;
      return preferNewer(staleSensorCandidate, envSnap);
    }
  }
  return null;
}

// Optimized scanning logic matching current useLatestSensorSnapshot.ts
function extractDiaryCandidateSnapshot(
  row: DiaryRow,
  tents: string[],
  staleSensorCandidate: SensorSnapshot | null,
): SensorSnapshot | null {
  const details = (row.details ?? null) as Record<string, unknown> | null;
  if (!details || typeof details !== "object") return null;
  if (!isDiaryRowInTentScope(row.tent_id, tents)) return null;

  const rowTentInScope = row.tent_id ?? null;
  const snap = snapshotFromDiary(
    row.entry_at,
    details.sensor_snapshot as Record<string, unknown> | undefined,
  );
  if (hasFiniteSnapshotMetric(snap)) {
    snap.tent_id = rowTentInScope;
    return preferNewer(staleSensorCandidate, snap);
  }

  const diaryEntryId = typeof row.id === "string" ? row.id : null;
  const manualSnap = snapshotFromManualSensorSnapshot(
    row.entry_at,
    details.manual_sensor_snapshot as Record<string, unknown> | undefined,
    { diaryEntryId },
  );
  if (manualSnap) {
    manualSnap.tent_id = rowTentInScope;
    return preferNewer(staleSensorCandidate, manualSnap);
  }

  const envSnap = snapshotFromEnvironmentCheck(
    row.entry_at,
    details.environment_check as Record<string, unknown> | undefined,
    { diaryEntryId },
  );
  if (envSnap) {
    envSnap.tent_id = rowTentInScope;
    return preferNewer(staleSensorCandidate, envSnap);
  }

  return null;
}

function scanCandidatesOptimized(
  diaryRows: DiaryRow[],
  candidateLimit: number,
  staleSensorCandidate: SensorSnapshot | null,
): SensorSnapshot | null {
  const scanCount = Math.min(diaryRows.length, candidateLimit);
  for (let i = 0; i < scanCount; i++) {
    const snap = extractDiaryCandidateSnapshot(diaryRows[i], tentIds, staleSensorCandidate);
    if (snap) return snap;
  }
  return null;
}

describe("Latest Sensor Snapshot candidate scanning benchmark", () => {
  it("measures baseline vs optimized candidate row scanning performance", () => {
    const mockRows = generateCandidateRows(200);
    const candidateLimit = 200;

    // Warmup
    scanCandidatesBaseline(mockRows, candidateLimit, null);
    scanCandidatesOptimized(mockRows, candidateLimit, null);

    const iterations = 5000;

    const startBaseline = performance.now();
    for (let i = 0; i < iterations; i++) {
      scanCandidatesBaseline(mockRows, candidateLimit, null);
    }
    const durationBaseline = performance.now() - startBaseline;

    const startOptimized = performance.now();
    for (let i = 0; i < iterations; i++) {
      scanCandidatesOptimized(mockRows, candidateLimit, null);
    }
    const durationOptimized = performance.now() - startOptimized;

    const improvementPct = (
      ((durationBaseline - durationOptimized) / durationBaseline) *
      100
    ).toFixed(2);

    console.log(
      `[BENCHMARK RESULTS]\n` +
        `  Baseline  (5000 scans x 200 rows): ${durationBaseline.toFixed(2)} ms (${((durationBaseline / iterations) * 1000).toFixed(3)} μs/op)\n` +
        `  Optimized (5000 scans x 200 rows): ${durationOptimized.toFixed(2)} ms (${((durationOptimized / iterations) * 1000).toFixed(3)} μs/op)\n` +
        `  Improvement: ${improvementPct}% speedup over baseline`,
    );

    expect(durationOptimized).toBeLessThanOrEqual(durationBaseline * 1.05); // allow minor variance
  });
});
