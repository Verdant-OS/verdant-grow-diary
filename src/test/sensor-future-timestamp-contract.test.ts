import { describe, expect, it } from "vitest";
import { SENSOR_TRUTH_FUTURE_SKEW_MS } from "@/constants/sensorTruthRanges";
import type { SensorReadingRow } from "@/lib/db";
import { groupSensorReadingRows } from "@/lib/growAdapters";
import { classifyGrowDataSource } from "@/lib/growDataSourceLabelRules";
import { buildSensorReadingsCsv } from "@/lib/sensorChartExport";
import { classifySensorReadingTrust } from "@/lib/sensorReadingSelectionRules";
import {
  classifyAuditRow,
  classificationFromStatusResult,
  classifySensorSnapshotStatus,
  countsAsHealthyEvidence,
  evaluateSensorSnapshotEvidence,
} from "@/lib/sensorSnapshotStatusContract";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

describe("future capture time cannot become healthy sensor evidence", () => {
  for (const source of ["live", "manual"] as const) {
    it.each([SENSOR_TRUTH_FUTURE_SKEW_MS, SENSOR_TRUTH_FUTURE_SKEW_MS + 1, 600_000, 1_800_000])(
      `${source} applies the canonical future boundary at +%i ms in both contracts`,
      (offsetMs) => {
        const row = { rowsReceived: 1, rowsAccepted: 1, capturedAt: at(offsetMs), source };
        const audit = classifyAuditRow(row, { now: NOW });
        const snapshot = classifySensorSnapshotStatus({ ...row, now: NOW });
        const allowed = offsetMs <= SENSOR_TRUTH_FUTURE_SKEW_MS;
        expect(audit.status).toBe(allowed ? "usable" : "invalid");
        expect(snapshot.status).toBe(allowed ? "usable" : "invalid");
        expect(countsAsHealthyEvidence(audit)).toBe(allowed);
        expect(evaluateSensorSnapshotEvidence(snapshot).countsAsHealthyEvidence).toBe(allowed);
        if (!allowed) {
          expect(audit.reason).toBe("future_timestamp");
          expect(snapshot.reasonCode).toBe("future_timestamp");
          expect(classificationFromStatusResult(snapshot)).toMatchObject({
            status: "invalid",
            reason: "future_timestamp",
            isHealthyEvidence: false,
          });
        }
      },
    );

    it(`${source} preserves its past freshness window`, () => {
      const windowMs = source === "manual" ? 86_400_000 : 900_000;
      const row = { rowsReceived: 1, rowsAccepted: 1, source, capturedAt: at(-windowMs) };
      expect(classifySensorSnapshotStatus({ ...row, now: NOW }).status).toBe("usable");
      expect(classifyAuditRow(row, { now: NOW }).status).toBe("usable");
      const expired = { ...row, capturedAt: at(-windowMs - 1) };
      expect(classifySensorSnapshotStatus({ ...expired, now: NOW }).status).toBe("stale");
      expect(classifyAuditRow(expired, { now: NOW }).status).toBe("stale");
    });

    it(`${source} keeps values and provenance but exports mapped future rows as invalid`, () => {
      const capturedAt = at(600_000);
      const row: SensorReadingRow = {
        id: "reading-a",
        user_id: "owner-a",
        tent_id: "tent-a",
        source,
        metric: "temperature_c",
        value: 25,
        quality: "ok",
        ts: capturedAt,
        captured_at: capturedAt,
        created_at: NOW.toISOString(),
        device_id: null,
        raw_payload: null,
      };
      const input = structuredClone(row);
      const readings = groupSensorReadingRows([row], NOW);
      expect(readings).toHaveLength(1);
      expect(readings[0]).toMatchObject({
        source,
        status: "invalid",
        temp: 25,
        capturedAt,
        observedMetrics: ["temp"],
      });
      expect(classifySensorReadingTrust(readings[0])).toEqual({
        isUsable: false,
        isStale: false,
        isInvalid: true,
      });
      expect(buildSensorReadingsCsv(readings)).toContain(`,${source},invalid,2026-09-24 12:10:00`);
      expect(row).toEqual(input);
      expect(groupSensorReadingRows([row], NOW)).toEqual(readings);
    });
  }

  it.each(["live", "sensor", "supabase", "gateway", "manual", "user", "entry", "log"])(
    "%s cannot label future values as trusted current context",
    (source) => {
      const input = { source, value: 25, timestamp: at(SENSOR_TRUTH_FUTURE_SKEW_MS + 1) };
      const result = classifyGrowDataSource(input, { now: NOW });
      expect(result.label).toBe("Unavailable");
      expect(result.severity).toBe("warning");
      expect(result.isTrustedForAi).toBe(false);
      expect(result.message).toMatch(/future/i);
      expect(classifyGrowDataSource(input, { now: NOW })).toEqual(result);
    },
  );

  it("does not enlarge the future allowance when the stale window is overridden", () => {
    const input = { source: "manual", value: 25, timestamp: at(600_000) };
    expect(
      classifyGrowDataSource(input, { now: NOW, staleThresholdMs: 86_400_000 }).isTrustedForAi,
    ).toBe(false);
    expect(
      classifySensorSnapshotStatus({
        rowsReceived: 1,
        rowsAccepted: 1,
        capturedAt: input.timestamp,
        source: "manual",
        staleWindowMs: 86_400_000,
        now: NOW,
      }).status,
    ).toBe("invalid");
  });

  it("preserves CSV history and explicit demo labels", () => {
    for (const [source, label] of [
      ["csv", "CSV history"],
      ["demo", "Demo"],
    ]) {
      const result = classifyGrowDataSource(
        { source, value: 25, timestamp: at(600_000) },
        { now: NOW },
      );
      expect(result.label).toBe(label);
      expect(result.isTrustedForAi).toBe(false);
    }
  });

  it("keeps existing no-data, partial-accept and missing-time precedence", () => {
    const row = { rowsReceived: 0, rowsAccepted: 0, capturedAt: at(600_000), source: "live" };
    expect(classifyAuditRow(row, { now: NOW }).status).toBe("no_data");
    expect(classifySensorSnapshotStatus({ ...row, now: NOW }).status).toBe("no_data");
    expect(
      classifyAuditRow({ ...row, rowsReceived: 2, rowsAccepted: 1 }, { now: NOW }).reason,
    ).toBe("partial_accept");
    expect(
      classifySensorSnapshotStatus({ ...row, rowsReceived: 2, rowsAccepted: 1, now: NOW })
        .reasonCode,
    ).toBe("partial_accept");
    expect(
      classifySensorSnapshotStatus({
        ...row,
        rowsReceived: 1,
        rowsAccepted: 1,
        capturedAt: null,
        now: NOW,
      }).status,
    ).toBe("needs_review");
  });
});
