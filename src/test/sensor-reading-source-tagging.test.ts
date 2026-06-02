/**
 * Tests for the SensorReading mock factory tagging — Slice 1 sensor-truth.
 *
 * Verifies:
 *  - Mock readings are always tagged with source: "demo"
 *  - Mock readings carry capturedAt
 *  - Mock readings never carry a "usable"/healthy contract status
 *  - countsAsHealthyEvidence rejects every mock reading's status
 */
import { describe, it, expect } from "vitest";
import { sensorReadings } from "@/mock";
import { countsAsHealthyEvidence } from "@/lib/sensorSnapshotStatusContract";

describe("mock sensorReadings provenance + status tagging", () => {
  it("is non-empty so the assertion is meaningful", () => {
    expect(sensorReadings.length).toBeGreaterThan(0);
  });

  it("tags every mock reading with source: 'demo'", () => {
    for (const r of sensorReadings) {
      expect(r.source).toBe("demo");
    }
  });

  it("never tags a mock reading with the healthy 'usable' status", () => {
    for (const r of sensorReadings) {
      expect(r.status).not.toBe("usable");
    }
  });

  it("countsAsHealthyEvidence rejects every mock reading status", () => {
    for (const r of sensorReadings) {
      expect(countsAsHealthyEvidence(r.status)).toBe(false);
    }
  });

  it("carries a capturedAt timestamp on every mock reading", () => {
    for (const r of sensorReadings) {
      expect(typeof r.capturedAt).toBe("string");
      expect(r.capturedAt.length).toBeGreaterThan(0);
    }
  });
});
