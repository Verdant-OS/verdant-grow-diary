import { describe, it, expect } from "vitest";
import { pickLatestSensorSnapshotByCapturedAt } from "@/lib/aiCoachLatestSensorSnapshot";

const row = (snap: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => ({
  details: snap === null ? null : { sensor_snapshot: snap, ...extra },
});

describe("pickLatestSensorSnapshotByCapturedAt", () => {
  it("returns null for empty/null input", () => {
    expect(pickLatestSensorSnapshotByCapturedAt([])).toBeNull();
    expect(pickLatestSensorSnapshotByCapturedAt(null)).toBeNull();
    expect(pickLatestSensorSnapshotByCapturedAt(undefined)).toBeNull();
  });

  it("ignores rows with no sensor_snapshot or no details", () => {
    const result = pickLatestSensorSnapshotByCapturedAt([
      { details: null },
      { details: { something: "else" } as Record<string, unknown> },
    ]);
    expect(result).toBeNull();
  });

  it("picks the newest snapshot by captured_at, ignoring array order", () => {
    const older = { source: "manual", captured_at: "2026-06-01T08:00:00Z", temperature_c: 21 };
    const newer = { source: "manual", captured_at: "2026-06-01T12:00:00Z", temperature_c: 24 };
    const result = pickLatestSensorSnapshotByCapturedAt([
      row(newer), // newest appears first
      row(older),
    ]);
    expect(result).toBe(newer);

    const reversed = pickLatestSensorSnapshotByCapturedAt([row(older), row(newer)]);
    expect(reversed).toBe(newer);
  });

  it("snapshots with missing/invalid timestamps cannot outrank a valid current reading", () => {
    const valid = { source: "live", captured_at: "2026-06-01T11:55:00Z", temperature_c: 23 };
    const missing = { source: "manual", temperature_c: 99 };
    const invalid = { source: "manual", captured_at: "not-a-date", temperature_c: 99 };
    const result = pickLatestSensorSnapshotByCapturedAt([
      row(missing),
      row(invalid),
      row(valid),
    ]);
    expect(result).toBe(valid);
  });

  it("falls back to the first snapshot when no valid timestamps exist", () => {
    const a = { source: "manual", temperature_c: 1 };
    const b = { source: "manual", captured_at: "broken", temperature_c: 2 };
    const result = pickLatestSensorSnapshotByCapturedAt([row(a), row(b)]);
    expect(result).toBe(a);
  });

  it("is deterministic for the same input", () => {
    const a = { source: "live", captured_at: "2026-06-01T10:00:00Z" };
    const b = { source: "manual", captured_at: "2026-06-01T11:00:00Z" };
    const rows = [row(a), row(b)];
    expect(pickLatestSensorSnapshotByCapturedAt(rows)).toBe(
      pickLatestSensorSnapshotByCapturedAt(rows),
    );
  });

  it("accepts numeric epoch timestamps (s and ms)", () => {
    const a = { source: "live", captured_at: 1748779200 }; // 2025-06-01 in seconds
    const b = { source: "live", captured_at: 1843473600000 }; // 2028 in ms
    const result = pickLatestSensorSnapshotByCapturedAt([row(a), row(b)]);
    expect(result).toBe(b);
  });
});
