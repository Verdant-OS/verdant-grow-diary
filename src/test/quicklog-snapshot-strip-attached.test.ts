/**
 * Adapter tests for the `attached` toggle (Quick Log strip ↔ "Attach
 * sensor snapshot" switch). Confirms the strip never claims the log
 * will include sensor context when the grower has the toggle OFF.
 */
import { describe, it, expect } from "vitest";
import { buildQuickLogSnapshotStrip } from "@/lib/quickLogSnapshotStripAdapter";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = new Date("2026-06-02T12:00:00Z");
const FIVE_MIN_AGO = "2026-06-02T11:55:00Z";

function usableSnapshot(): SensorSnapshot {
  return {
    source: "live",
    ts: FIVE_MIN_AGO,
    temp: 24.3,
    rh: 55,
    vpd: 1.12,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    device_id: null,
  };
}

describe("quickLogSnapshotStripAdapter — attach toggle copy contract", () => {
  it("usable + attached=true → 'will include' copy", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: usableSnapshot(),
      attached: true,
      now: NOW,
    });
    expect(v.status).toBe("usable");
    expect(v.title).toBe("Sensor context ready");
    expect(v.description).toBe("This log will include current sensor context.");
  });

  it("usable + attached=false → 'available, not attached' copy, no 'will include'", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: usableSnapshot(),
      attached: false,
      now: NOW,
    });
    expect(v.status).toBe("usable");
    expect(v.title).toBe("Sensor snapshot available");
    expect(v.description).not.toMatch(/will include/i);
    expect(v.description).toMatch(/Attach sensor snapshot/i);
    expect(v.action.kind).toBe("none");
  });

  it("default attached omitted → behaves as attached=true (back-compat)", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: usableSnapshot(), now: NOW });
    expect(v.description).toBe("This log will include current sensor context.");
  });
});
