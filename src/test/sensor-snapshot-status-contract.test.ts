/**
 * Sensor Snapshot Status Contract v1 — tests.
 *
 * Covers:
 *  - canonical status classification (usable / stale / invalid /
 *    needs_review / no_data)
 *  - reason codes kept separate from status
 *  - stale-window config (default + per-source override)
 *  - AI Doctor sensor-evidence gating
 *  - timeline/manual severity adapter does not flatten unsafe state
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SENSOR_SNAPSHOT_STALE_WINDOW_MS,
  classifySensorSnapshotStatus,
  evaluateSensorSnapshotEvidence,
  mapSensorSnapshotStatusToSeverity,
  resolveSensorSnapshotStaleWindowMs,
  type SensorSnapshotStatus,
} from "@/lib/sensorSnapshotStatusContract";

const NOW = new Date("2026-05-23T12:00:00Z");
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

describe("classifySensorSnapshotStatus", () => {
  it("1. fresh accepted snapshot returns usable", () => {
    const r = classifySensorSnapshotStatus({
      rowsReceived: 3,
      rowsAccepted: 3,
      capturedAt: minutesAgo(5),
      now: NOW,
    });
    expect(r.status).toBe("usable");
    expect(r.reasonCode).toBe("fresh_accept");
  });

  it("2. old accepted snapshot returns stale", () => {
    const r = classifySensorSnapshotStatus({
      rowsReceived: 3,
      rowsAccepted: 3,
      capturedAt: hoursAgo(48),
      now: NOW,
    });
    expect(r.status).toBe("stale");
    expect(r.reasonCode).toBe("stale_timestamp");
  });

  it("3. malformed snapshot returns invalid", () => {
    const r = classifySensorSnapshotStatus({
      malformed: true,
      rowsReceived: 1,
      rowsAccepted: 1,
      capturedAt: minutesAgo(1),
      now: NOW,
    });
    expect(r.status).toBe("invalid");
    expect(r.reasonCode).toBe("malformed_payload");
  });

  it("4. missing snapshot returns no_data when nothing was received", () => {
    const r = classifySensorSnapshotStatus({ now: NOW });
    expect(r.status).toBe("no_data");
    expect(r.reasonCode).toBe("none_received");
  });

  it("5. rows_received: 0, rows_accepted: 0 returns no_data", () => {
    const r = classifySensorSnapshotStatus({
      rowsReceived: 0,
      rowsAccepted: 0,
      capturedAt: minutesAgo(1),
      now: NOW,
    });
    expect(r.status).toBe("no_data");
  });

  it("6. rows_received: 5, rows_accepted: 0 returns needs_review", () => {
    const r = classifySensorSnapshotStatus({
      rowsReceived: 5,
      rowsAccepted: 0,
      capturedAt: minutesAgo(1),
      now: NOW,
    });
    expect(r.status).toBe("needs_review");
    expect(r.reasonCode).toBe("none_accepted");
  });

  it("6b. partial accept (5/2) returns needs_review", () => {
    const r = classifySensorSnapshotStatus({
      rowsReceived: 5,
      rowsAccepted: 2,
      capturedAt: minutesAgo(1),
      now: NOW,
    });
    expect(r.status).toBe("needs_review");
    expect(r.reasonCode).toBe("partial_accept");
  });

  it("7. reason codes are separate from status (status enum excludes reason codes)", () => {
    const allStatuses: SensorSnapshotStatus[] = [
      "usable",
      "stale",
      "invalid",
      "needs_review",
      "no_data",
    ];
    const reasonsThatLookLikeStatuses = [
      "stale_manual",
      "invalid_source",
      "stale_partial",
      "invalid_payload",
    ] as const;
    for (const r of reasonsThatLookLikeStatuses) {
      expect(allStatuses).not.toContain(r as unknown as SensorSnapshotStatus);
    }
  });
});

describe("stale window config", () => {
  it("8. stale window comes from shared config helper, not JSX", () => {
    expect(typeof resolveSensorSnapshotStaleWindowMs).toBe("function");
    expect(DEFAULT_SENSOR_SNAPSHOT_STALE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(resolveSensorSnapshotStaleWindowMs()).toBe(
      DEFAULT_SENSOR_SNAPSHOT_STALE_WINDOW_MS,
    );
  });

  it("9. per-source stale-window override works", () => {
    const overrides = { ecowitt: 60 * 60 * 1000 } as const;
    const ms = resolveSensorSnapshotStaleWindowMs({
      source: "ecowitt",
      overrides,
    });
    expect(ms).toBe(60 * 60 * 1000);

    // Classifier respects the override.
    const r = classifySensorSnapshotStatus({
      rowsReceived: 1,
      rowsAccepted: 1,
      capturedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      source: "ecowitt",
      now: NOW,
      staleWindowMs: ms,
    });
    expect(r.status).toBe("stale");
  });

  it("10. default stale-window fallback works for unknown source", () => {
    const ms = resolveSensorSnapshotStaleWindowMs({ source: "unknown_source" });
    expect(ms).toBe(DEFAULT_SENSOR_SNAPSHOT_STALE_WINDOW_MS);
  });
});

describe("AI Doctor sensor-evidence gating", () => {
  it("11. usable sensor status counts as healthy evidence", () => {
    const e = evaluateSensorSnapshotEvidence({
      status: "usable",
      reasonCode: "fresh_accept",
    });
    expect(e.countsAsHealthyEvidence).toBe(true);
  });

  it("12. stale does not count as healthy evidence", () => {
    const e = evaluateSensorSnapshotEvidence({
      status: "stale",
      reasonCode: "stale_timestamp",
    });
    expect(e.countsAsHealthyEvidence).toBe(false);
    expect(e.status).toBe("stale");
    expect(e.reasonCode).toBe("stale_timestamp");
  });

  it("13. invalid does not count as healthy evidence", () => {
    const e = evaluateSensorSnapshotEvidence({
      status: "invalid",
      reasonCode: "malformed_payload",
    });
    expect(e.countsAsHealthyEvidence).toBe(false);
  });

  it("14. needs_review and no_data do not count as healthy evidence", () => {
    expect(
      evaluateSensorSnapshotEvidence({
        status: "needs_review",
        reasonCode: "none_accepted",
      }).countsAsHealthyEvidence,
    ).toBe(false);
    expect(
      evaluateSensorSnapshotEvidence({
        status: "no_data",
        reasonCode: "none_received",
      }).countsAsHealthyEvidence,
    ).toBe(false);
    // Null/undefined input collapses to no_data, never healthy.
    expect(evaluateSensorSnapshotEvidence(null).countsAsHealthyEvidence).toBe(
      false,
    );
    expect(
      evaluateSensorSnapshotEvidence(undefined).countsAsHealthyEvidence,
    ).toBe(false);
  });
});

describe("Timeline/manual snapshot severity adapter", () => {
  it("15. preserves severity/status and never relabels unsafe/unknown as healthy", () => {
    expect(mapSensorSnapshotStatusToSeverity("usable")).toBe("ok");
    expect(mapSensorSnapshotStatusToSeverity("stale")).toBe("warning");
    expect(mapSensorSnapshotStatusToSeverity("needs_review")).toBe("warning");
    expect(mapSensorSnapshotStatusToSeverity("invalid")).toBe("danger");
    expect(mapSensorSnapshotStatusToSeverity("no_data")).toBe("empty");

    // Hard guarantee: no unsafe/unknown status maps to "ok".
    for (const s of [
      "stale",
      "needs_review",
      "invalid",
      "no_data",
    ] as SensorSnapshotStatus[]) {
      expect(mapSensorSnapshotStatusToSeverity(s)).not.toBe("ok");
    }
  });
});
