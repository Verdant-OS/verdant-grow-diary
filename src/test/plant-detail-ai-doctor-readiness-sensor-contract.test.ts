/**
 * AI Doctor readiness — sensor-evidence wiring tests.
 *
 * Verifies the readiness builder honors the shared Sensor Snapshot
 * Status Contract v1 gate: only `usable` counts as healthy evidence;
 * `stale` shows as cautionary; `invalid`/`needs_review`/`no_data` are
 * blocked.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { classifyAiDoctorCurrentSensorEvidence } from "@/lib/aiDoctorCurrentSensorSnapshotRules";
import { buildPlantDetailAiDoctorReadiness } from "@/lib/plantDetailAiDoctorReadiness";
import { classifyAuditRow } from "@/lib/sensorSnapshotStatusContract";

const NOW = new Date("2026-05-23T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

const baseInput = {
  stage: "veg",
  hasTimelineEntries: true,
  hasRecentPhoto: true,
  hasSensorSnapshot: true, // will be overridden by sensorSnapshot
  hasRecentWateringOrFeed: true,
};

describe("AI Doctor readiness × sensor snapshot contract", () => {
  it("usable sensor snapshot counts as healthy evidence", () => {
    const classification = classifyAuditRow(
      { rowsReceived: 5, rowsAccepted: 5, capturedAt: minutesAgo(10) },
      { now: NOW },
    );
    const r = buildPlantDetailAiDoctorReadiness({
      ...baseInput,
      sensorSnapshot: classification,
    });
    expect(r.sensorEvidence.mode).toBe("healthy");
    expect(r.sensorEvidence.countsAsHealthyEvidence).toBe(true);
    expect(r.sensorEvidence.status).toBe("usable");
    expect(r.presentCount).toBe(5);
    expect(r.missing.find((m) => m.kind === "no_sensor_snapshot")).toBeUndefined();
  });

  it("stale shows as cautionary context, NOT healthy evidence", () => {
    const classification = classifyAuditRow(
      { rowsReceived: 5, rowsAccepted: 5, capturedAt: hoursAgo(48) },
      { now: NOW },
    );
    const r = buildPlantDetailAiDoctorReadiness({
      ...baseInput,
      sensorSnapshot: classification,
    });
    expect(r.sensorEvidence.status).toBe("stale");
    expect(r.sensorEvidence.mode).toBe("cautionary");
    expect(r.sensorEvidence.isCautionary).toBe(true);
    expect(r.sensorEvidence.countsAsHealthyEvidence).toBe(false);
    expect(r.sensorEvidence.label.toLowerCase()).toContain("stale");
    // Stale must not contribute to the present-signal count.
    expect(r.presentCount).toBe(4);
  });

  it("invalid is blocked as evidence (unsafe, never used for recommendations)", () => {
    const classification = classifyAuditRow(
      { rowsReceived: 5, rowsAccepted: 5, capturedAt: minutesAgo(5) },
      { now: NOW, validity: { isValid: false, reason: "out_of_range" } },
    );
    const r = buildPlantDetailAiDoctorReadiness({
      ...baseInput,
      sensorSnapshot: classification,
    });
    expect(r.sensorEvidence.status).toBe("invalid");
    expect(r.sensorEvidence.mode).toBe("unsafe");
    expect(r.sensorEvidence.isUnsafe).toBe(true);
    expect(r.sensorEvidence.countsAsHealthyEvidence).toBe(false);
  });

  it("remasure 76°F / 58% RH current manuals are not parked as needs-review", () => {
    const capturedAt = minutesAgo(2);
    const classified = classifyAiDoctorCurrentSensorEvidence(
      [
        {
          metric: "temp_f",
          value: 76,
          captured_at: capturedAt,
          source: "manual",
          quality: null,
        },
        {
          metric: "humidity",
          value: 58,
          captured_at: capturedAt,
          source: "manual",
          quality: null,
        },
      ],
      { now: NOW },
    );
    const r = buildPlantDetailAiDoctorReadiness({
      ...baseInput,
      sensorSnapshot: classified,
    });
    expect(classified.status).toBe("usable");
    expect(classified.reason).not.toBe("none_inserted");
    expect(r.sensorEvidence.mode).toBe("healthy");
    expect(r.sensorEvidence.isUnsafe).toBe(false);
    expect(r.sensorEvidence.label).not.toMatch(/needs review — not used for recommendations/i);
    expect(r.missing.find((m) => m.kind === "no_sensor_snapshot")).toBeUndefined();
  });

  it("9-hour valid tent manuals are usable Doctor evidence, not cautionary stale copy", () => {
    const capturedAt = hoursAgo(9);
    const classified = classifyAiDoctorCurrentSensorEvidence(
      [
        { metric: "temp_f", value: 75, captured_at: capturedAt, source: "manual", quality: null },
        { metric: "humidity", value: 60, captured_at: capturedAt, source: "manual", quality: null },
        { metric: "vpd", value: 1, captured_at: capturedAt, source: "manual", quality: null },
      ],
      { now: NOW },
    );
    const r = buildPlantDetailAiDoctorReadiness({
      ...baseInput,
      sensorSnapshot: classified,
    });
    expect(classified.status).toBe("usable");
    expect(r.sensorEvidence.mode).toBe("healthy");
    expect(r.sensorEvidence.mode).not.toBe("cautionary");
    expect(r.sensorEvidence.label).not.toMatch(/outside the stale window/i);
  });

  it("stale live tent rows do not produce cautionary copy when a 9-hour manual is usable", () => {
    const liveAt = minutesAgo(16);
    const manualAt = hoursAgo(9);
    const classified = classifyAiDoctorCurrentSensorEvidence(
      [
        { metric: "temperature_c", value: 24, captured_at: liveAt, source: "live", quality: "ok" },
        { metric: "humidity_pct", value: 55, captured_at: liveAt, source: "live", quality: "ok" },
        { metric: "temp_f", value: 75, captured_at: manualAt, source: "manual", quality: null },
        { metric: "humidity", value: 60, captured_at: manualAt, source: "manual", quality: null },
      ],
      { now: NOW },
    );
    const r = buildPlantDetailAiDoctorReadiness({
      ...baseInput,
      sensorSnapshot: classified,
    });
    expect(classified.status).toBe("usable");
    expect(r.sensorEvidence.mode).not.toBe("cautionary");
    expect(r.sensorEvidence.label).not.toMatch(/outside the stale window/i);
  });

  it("needs_review is blocked as evidence", () => {
    const classification = classifyAuditRow(
      { rowsReceived: 5, rowsAccepted: 0, capturedAt: minutesAgo(1) },
      { now: NOW },
    );
    const r = buildPlantDetailAiDoctorReadiness({
      ...baseInput,
      sensorSnapshot: classification,
    });
    expect(r.sensorEvidence.status).toBe("needs_review");
    expect(r.sensorEvidence.isUnsafe).toBe(true);
    expect(r.sensorEvidence.countsAsHealthyEvidence).toBe(false);
  });

  it("no_data is blocked as evidence (missing)", () => {
    const classification = classifyAuditRow({ rowsReceived: 0, rowsAccepted: 0 }, { now: NOW });
    const r = buildPlantDetailAiDoctorReadiness({
      ...baseInput,
      sensorSnapshot: classification,
    });
    expect(r.sensorEvidence.status).toBe("no_data");
    expect(r.sensorEvidence.isMissing).toBe(true);
    expect(r.sensorEvidence.countsAsHealthyEvidence).toBe(false);
    // The no_sensor_snapshot missing bullet should re-appear.
    expect(r.missing.find((m) => m.kind === "no_sensor_snapshot")).toBeDefined();
  });

  it("null/undefined classification → NOT healthy, regardless of raw hasSensorSnapshot boolean", () => {
    const r = buildPlantDetailAiDoctorReadiness({
      ...baseInput,
      hasSensorSnapshot: true, // legacy boolean — must NOT bypass the contract
    });
    expect(r.sensorEvidence.countsAsHealthyEvidence).toBe(false);
    expect(r.sensorEvidence.status).toBe("no_data");
    expect(r.sensorEvidence.isMissing).toBe(true);
    // 4 of 5 because the sensor signal is not healthy.
    expect(r.presentCount).toBe(4);
    // Missing bullet re-appears because the boolean was gated away.
    expect(r.missing.find((m) => m.kind === "no_sensor_snapshot")).toBeDefined();
  });

  it("explicit null classification → NOT healthy", () => {
    const r = buildPlantDetailAiDoctorReadiness({
      ...baseInput,
      hasSensorSnapshot: true,
      sensorSnapshot: null,
    });
    expect(r.sensorEvidence.countsAsHealthyEvidence).toBe(false);
    expect(r.presentCount).toBe(4);
  });

  describe("regressions — no bypass paths", () => {
    const states = ["stale", "invalid", "needs_review", "no_data"] as const;
    for (const status of states) {
      it(`status="${status}" never counts as healthy evidence`, () => {
        const r = buildPlantDetailAiDoctorReadiness({
          ...baseInput,
          sensorSnapshot: {
            status,
            reason: "unknown",
            isHealthyEvidence: false,
            label: `status ${status}`,
          },
        });
        expect(r.sensorEvidence.countsAsHealthyEvidence).toBe(false);
      });
    }

    it("only status='usable' grants healthy evidence", () => {
      const r = buildPlantDetailAiDoctorReadiness({
        ...baseInput,
        sensorSnapshot: {
          status: "usable",
          reason: "fresh_accepted",
          isHealthyEvidence: true,
          label: "ok",
        },
      });
      expect(r.sensorEvidence.countsAsHealthyEvidence).toBe(true);
    });
  });

  describe("static safety — no raw-boolean bypass in readiness module", () => {
    const src: string = fs.readFileSync(
      path.resolve(__dirname, "../lib/plantDetailAiDoctorReadiness.ts"),
      "utf8",
    );

    it("imports the contract's healthy-evidence gate", () => {
      expect(src).toMatch(/from\s+["']@\/lib\/sensorSnapshotStatusContract["']/);
      expect(src).toMatch(/countsAsHealthyEvidence/);
    });

    it("does not grant healthy evidence from the legacy boolean", () => {
      // The old bypass shape was: `if (input.hasSensorSnapshot) { ... countsAsHealthyEvidence: true ... }`
      // Assert that pattern is gone.
      expect(src).not.toMatch(
        /if\s*\(\s*input\.hasSensorSnapshot\s*\)\s*\{[\s\S]{0,400}countsAsHealthyEvidence\s*:\s*true/,
      );
    });
  });
});
