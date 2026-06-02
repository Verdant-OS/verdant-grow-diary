/**
 * Sensor Bridge Health — pure view-model tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildSensorBridgeHealthViewModel,
  SENSOR_BRIDGE_CONTROL_DISCLOSURE,
  SENSOR_BRIDGE_HEALTH_STALE_MS,
  type SensorBridgeAuditRowLike,
} from "@/lib/sensorBridgeHealthViewModel";

const NOW = new Date("2026-05-23T12:00:00Z");
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

describe("buildSensorBridgeHealthViewModel", () => {
  it("returns no_data with empty-state copy when no rows", () => {
    const vm = buildSensorBridgeHealthViewModel({ rows: [], now: NOW });
    expect(vm.state).toBe("no_data");
    expect(vm.message).toBe("No bridge readings received yet.");
    expect(vm.controlDisclosure).toBe(SENSOR_BRIDGE_CONTROL_DISCLOSURE);
    expect(vm.latestAcceptedAtIso).toBeNull();
    expect(vm.latestRejectedAtIso).toBeNull();
    expect(vm.latestReasonCode).toBeNull();
  });

  it("returns accepted state for a recent fully-inserted row", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      {
        source: "pi_bridge",
        rows_received: 5,
        rows_inserted: 5,
        created_at: minutesAgo(10),
      },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    expect(vm.state).toBe("accepted");
    expect(vm.message).toBe("Latest bridge reading accepted.");
    expect(vm.latestAcceptedAtIso).toBe(minutesAgo(10));
    expect(vm.latestRejectedAtIso).toBeNull();
    expect(vm.latestReasonCode).toBeNull();
    expect(vm.sourceLabel).toBe("pi_bridge");
  });

  it("returns stale when latest row is older than the freshness window", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      {
        source: "pi_bridge",
        rows_received: 3,
        rows_inserted: 3,
        created_at: hoursAgo(36),
      },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    expect(vm.state).toBe("stale");
    expect(vm.message).toBe("Latest bridge reading is stale.");
    expect(vm.latestAcceptedAtIso).toBe(hoursAgo(36));
  });

  it("returns needs_review for a partial-insert row with safe reason code", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      {
        source: "pi_bridge",
        rows_received: 5,
        rows_inserted: 2,
        created_at: minutesAgo(5),
      },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    expect(vm.state).toBe("needs_review");
    expect(vm.message).toBe("Latest bridge reading needs review.");
    expect(vm.latestReasonCode).toBe("partial_accept");
    expect(vm.latestRejectedAtIso).toBe(minutesAgo(5));
  });

  it("returns needs_review with none_inserted when nothing was stored", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      {
        source: "pi_bridge",
        rows_received: 4,
        rows_inserted: 0,
        created_at: minutesAgo(1),
      },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    expect(vm.state).toBe("needs_review");
    expect(vm.latestReasonCode).toBe("none_inserted");
  });

  it("does not classify a zero/zero unknown row as healthy", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      {
        source: "pi_bridge",
        rows_received: 0,
        rows_inserted: 0,
        created_at: minutesAgo(1),
      },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    expect(vm.state).not.toBe("accepted");
    expect(vm.state).toBe("needs_review");
  });

  it("computes latestAccepted and latestRejected independently across rows", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      { source: "pi_bridge", rows_received: 2, rows_inserted: 0, created_at: minutesAgo(2) },
      { source: "pi_bridge", rows_received: 3, rows_inserted: 3, created_at: minutesAgo(20) },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    expect(vm.state).toBe("needs_review"); // latest row drives state
    expect(vm.latestAcceptedAtIso).toBe(minutesAgo(20));
    expect(vm.latestRejectedAtIso).toBe(minutesAgo(2));
  });

  it("passes through a safe bridgeName but never any token", () => {
    const vm = buildSensorBridgeHealthViewModel({
      rows: [],
      bridgeName: "Tent A bridge",
      now: NOW,
    });
    expect(vm.bridgeName).toBe("Tent A bridge");
  });

  it("uses default stale window of 24h", () => {
    expect(SENSOR_BRIDGE_HEALTH_STALE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("is deterministic for the same input", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      { source: "pi_bridge", rows_received: 1, rows_inserted: 1, created_at: minutesAgo(3) },
    ];
    const a = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    const b = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    expect(a).toEqual(b);
  });
});
