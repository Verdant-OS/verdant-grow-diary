/**
 * Sensor Truth residual #592 — EC tiers, realism bands, live membership,
 * and classifySnapshotTruth timestamp orphans.
 */
import { describe, expect, it } from "vitest";
import {
  AIR_TEMP_F_REALISTIC,
  EC_MSCM_SUSPICIOUS_MAX,
  EC_MSCM_UNIT_MISMATCH_AT,
  EC_SUSPICIOUS_MSCM_MAX,
  PH_CULTIVATION_SOFT,
  PH_PRESENTATION_REALISTIC,
  SENSOR_TRUTH_PRESENTATION_RANGES,
  SOIL_EC_MSCM_PLAUSIBLE,
} from "@/constants/sensorTruthRanges";
import { EC_SUSPICIOUS_MSCM_MAX as CSV_EC } from "@/constants/csvValidationRanges";
import {
  EC_SUSPICIOUS_MSCM_MAX as MANUAL_EC,
  PH_REALISTIC_RANGE as MANUAL_PH,
} from "@/lib/manualSensorSnapshotRules";
import {
  SOIL_EC_MSCM_UNIT_MISMATCH_AT,
  SOIL_EC_MSCM_RANGE,
  PH_REALISTIC,
  classifySnapshotTimestamp,
  classifySnapshotTruth,
  TRUTH_REASON_CHIP,
} from "@/lib/sensorTruthRules";
import {
  classifyLiveMembershipRoles,
  isReceivingTransportSource,
  isVerifiedSnapshotLiveRowSource,
  LIVE_WINDOW_ALIASES,
  RECEIVING_TRANSPORT_SOURCES,
  TRUST_LIVE_ALIASES,
  VERIFIED_SNAPSHOT_LIVE_ROW_SOURCES,
} from "@/lib/sensorLiveMembership";
import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = Date.UTC(2026, 7, 3, 12, 0, 0);

function snap(over: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "manual",
    ts: new Date(NOW - 60_000).toISOString(),
    temp: 24,
    rh: 55,
    vpd: 1.1,
    co2: null,
    soil: 35,
    soil_ec: 1.4,
    soil_temp: 22,
    ppfd: null,
    device_id: null,
    ...over,
  };
}

describe("sensorTruthRanges — two-tier EC model", () => {
  it("keeps presentation floor 20 and soft warning 50 as distinct tiers", () => {
    expect(EC_MSCM_UNIT_MISMATCH_AT).toBe(20);
    expect(EC_MSCM_SUSPICIOUS_MAX).toBe(50);
    expect(EC_SUSPICIOUS_MSCM_MAX).toBe(50);
    expect(EC_MSCM_UNIT_MISMATCH_AT).toBeLessThan(EC_MSCM_SUSPICIOUS_MAX);
    expect(SOIL_EC_MSCM_PLAUSIBLE.max).toBe(8);
    expect(SOIL_EC_MSCM_PLAUSIBLE.max).toBeLessThan(EC_MSCM_UNIT_MISMATCH_AT);
  });

  it("re-exports the same soft EC constant across CSV / manual / truth modules", () => {
    expect(CSV_EC).toBe(EC_MSCM_SUSPICIOUS_MAX);
    expect(MANUAL_EC).toBe(EC_MSCM_SUSPICIOUS_MAX);
    expect(SOIL_EC_MSCM_UNIT_MISMATCH_AT).toBe(EC_MSCM_UNIT_MISMATCH_AT);
    expect(SOIL_EC_MSCM_RANGE).toEqual(SOIL_EC_MSCM_PLAUSIBLE);
  });

  it("pins presentation pH 3–9 and soft cultivation 4.5–8.5", () => {
    expect(PH_PRESENTATION_REALISTIC).toEqual({ min: 3, max: 9 });
    expect(PH_CULTIVATION_SOFT).toEqual({ min: 4.5, max: 8.5 });
    expect(PH_REALISTIC).toEqual(PH_PRESENTATION_REALISTIC);
    expect(MANUAL_PH).toEqual(PH_CULTIVATION_SOFT);
    expect(AIR_TEMP_F_REALISTIC).toEqual({ min: 40, max: 110 });
    expect(SENSOR_TRUTH_PRESENTATION_RANGES.ecUnitMismatchAt).toBe(20);
  });
});

describe("classifySnapshotTruth — timestamp orphans", () => {
  it("classifies missing / unparseable / future timestamps", () => {
    expect(classifySnapshotTimestamp(null, NOW)).toBe("missing");
    expect(classifySnapshotTimestamp("", NOW)).toBe("missing");
    expect(classifySnapshotTimestamp("not-a-date", NOW)).toBe("unparseable");
    expect(classifySnapshotTimestamp(new Date(NOW + 10 * 60_000).toISOString(), NOW)).toBe(
      "future",
    );
    expect(classifySnapshotTimestamp(new Date(NOW - 60_000).toISOString(), NOW)).toBe("ok");
  });

  it("marks missing timestamp as invalid evidence (not healthy, not stale)", () => {
    const r = classifySnapshotTruth(snap({ ts: null }), NOW);
    expect(r.timestampInvalid).toBe(true);
    expect(r.hasInvalid).toBe(true);
    expect(r.stale).toBe(false);
    expect(r.reasonCodes).toContain("invalid_timestamp");
    expect(r.reasonChips).toContain(TRUTH_REASON_CHIP.invalid_timestamp);
  });

  it("marks future timestamp as invalid, not stale", () => {
    const future = new Date(NOW + 30 * 60_000).toISOString();
    const r = classifySnapshotTruth(snap({ ts: future, source: "live" }), NOW);
    expect(r.timestampInvalid).toBe(true);
    expect(r.hasInvalid).toBe(true);
    expect(r.stale).toBe(false);
    expect(r.reasonCodes).toContain("future_timestamp");
  });

  it("keeps humidity stuck as suspicious without nulling RH", () => {
    const r = classifySnapshotTruth(snap({ rh: 0 }), NOW);
    expect(r.suspiciousFields).toContain("rh");
    expect(r.snapshot.rh).toBe(0);
    expect(r.reasonCodes).toContain("humidity_stuck_extreme");
    expect(r.hasInvalid).toBe(false);
  });
});

describe("sensorLiveMembership — four intentional live tables (#584 residual)", () => {
  it("keeps receiving transport distinct from verified snapshot live rows", () => {
    expect(isReceivingTransportSource("ecowitt")).toBe(true);
    expect(isVerifiedSnapshotLiveRowSource("ecowitt")).toBe(false);
    expect(isVerifiedSnapshotLiveRowSource("live")).toBe(true);
    expect(isVerifiedSnapshotLiveRowSource("pi_bridge")).toBe(true);
    expect(RECEIVING_TRANSPORT_SOURCES.has("mqtt")).toBe(true);
    expect(VERIFIED_SNAPSHOT_LIVE_ROW_SOURCES.has("mqtt")).toBe(false);
  });

  it("assigns live-window aliases without inventing trust live", () => {
    expect(LIVE_WINDOW_ALIASES.has("ecowitt_mqtt")).toBe(true);
    expect(TRUST_LIVE_ALIASES.has("ecowitt_mqtt")).toBe(false);
    expect(TRUST_LIVE_ALIASES.has("live")).toBe(true);
    const roles = classifyLiveMembershipRoles("pi_bridge");
    expect(roles).toContain("receiving_transport");
    expect(roles).toContain("live_window");
    expect(roles).toContain("verified_snapshot_row");
    // pi_bridge is first-party bridge — trust normalizer maps it to live.
    expect(normalizeSensorSource("pi_bridge")).toBe("live");
    expect(normalizeSensorSource("diary")).toBe("manual");
    expect(normalizeSensorSource("ecowitt_raw")).toBe("invalid");
  });
});
