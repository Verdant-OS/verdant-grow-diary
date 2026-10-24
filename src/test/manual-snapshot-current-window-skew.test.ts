import { describe, expect, it } from "vitest";
import {
  MANUAL_SNAPSHOT_CURRENT_STALE_HOURS,
  isManualSnapshotCurrent,
} from "@/lib/manualSensorSnapshotQualityRules";

// CodeRabbit r4319498962 on #2114: a snapshot stamped by a client clock a few
// seconds ahead of this one must still read as current.
const TICK_MS = Date.parse("2026-10-14T12:00:00.000Z");
const at = (offsetMs: number) => new Date(TICK_MS + offsetMs).toISOString();

describe("isManualSnapshotCurrent", () => {
  it("treats a snapshot 30 seconds in the future (clock skew) as current", () => {
    expect(isManualSnapshotCurrent(at(30_000), TICK_MS)).toBe(true);
  });

  it("accepts exactly five minutes of future skew", () => {
    expect(isManualSnapshotCurrent(at(5 * 60_000), TICK_MS)).toBe(true);
  });

  it("rejects a snapshot six minutes in the future", () => {
    expect(isManualSnapshotCurrent(at(6 * 60_000), TICK_MS)).toBe(false);
  });

  it("keeps the 24-hour ceiling unchanged", () => {
    const ceiling = MANUAL_SNAPSHOT_CURRENT_STALE_HOURS * 3_600_000;
    expect(isManualSnapshotCurrent(at(-ceiling), TICK_MS)).toBe(true);
    expect(isManualSnapshotCurrent(at(-ceiling - 1), TICK_MS)).toBe(false);
  });

  it("is never current for an invalid timestamp", () => {
    expect(isManualSnapshotCurrent("not-a-date", TICK_MS)).toBe(false);
    expect(isManualSnapshotCurrent("", TICK_MS)).toBe(false);
  });

  it("is deterministic for the same inputs", () => {
    expect(isManualSnapshotCurrent(at(-60_000), TICK_MS)).toBe(
      isManualSnapshotCurrent(at(-60_000), TICK_MS),
    );
  });
});
