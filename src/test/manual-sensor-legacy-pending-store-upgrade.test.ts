import { beforeEach, describe, expect, it } from "vitest";
import {
  claimPendingManualSnapshot,
  clearPendingManualSnapshot,
  readPendingManualSnapshot,
  restoreManualSnapshotValues,
  type PendingManualSnapshot,
} from "@/lib/manualSensorPendingSnapshotStore";
import {
  buildManualReadingPayloads,
  validateManualEntry,
} from "@/lib/sensorReadingManualEntryRules";

const key = "verdant:sensors:pending-manual:v1:legacy-owner";
const legacyRecord = (temperature = 93.33): PendingManualSnapshot => ({
  version: 1,
  ownerId: "legacy-owner",
  airTempUnit: "F",
  payloads: buildManualReadingPayloads({
    tentId: "11111111-1111-4111-8111-111111111111",
    ts: "2026-10-28T18:00:00.000Z",
    metrics: [
      { metric: "temperature_c", value: temperature },
      { metric: "humidity_pct", value: 50 },
    ],
  }),
});

beforeEach(() => sessionStorage.clear());

describe("pre-upgrade pending manual snapshots", () => {
  // The old entry validator accepted these finite temperatures. Seed the old
  // serialized record directly: new-entry validation must not create it now.
  it.each([-40, 54.44, 93.33, 1350])(
    "keeps legacy %s °C readable and explicitly clearable",
    (c) => {
      const record = legacyRecord(c);
      const raw = JSON.stringify(record);
      sessionStorage.setItem(key, raw);

      expect(readPendingManualSnapshot("legacy-owner")).toEqual({ status: "pending", record });
      expect(sessionStorage.getItem(key)).toBe(raw);
      expect(clearPendingManualSnapshot(record)).toBe(true);
      expect(readPendingManualSnapshot("legacy-owner")).toEqual({ status: "empty" });
    },
  );

  it("restores the original 200 °F and preserves the uncertain payload identity", () => {
    const record = legacyRecord();
    sessionStorage.setItem(key, JSON.stringify(record));
    const pending = readPendingManualSnapshot("legacy-owner");
    expect(pending.status).toBe("pending");
    if (pending.status !== "pending") throw new Error("Legacy record cannot be restored");
    expect(restoreManualSnapshotValues(pending.record, "F")).toMatchObject({
      form: { airTemp: "200", airTempUnit: "F", humidityPct: "50" },
      saveUnconfirmed: true,
      pendingStandardSnapshot: { revision: 0, payloads: record.payloads },
    });
    expect(sessionStorage.getItem(key)).toBe(JSON.stringify(record));
  });

  it("recovers a temperature-only legacy record", () => {
    const record = legacyRecord();
    record.payloads = record.payloads.filter((row) => row.metric === "temperature_c");
    sessionStorage.setItem(key, JSON.stringify(record));
    expect(readPendingManualSnapshot("legacy-owner")).toEqual({ status: "pending", record });
    expect(clearPendingManualSnapshot(record)).toBe(true);
  });

  it("refuses new out-of-band claims and new entries without relaxing the 50 °C gate", () => {
    expect(claimPendingManualSnapshot(legacyRecord())).toEqual({ status: "blocked" });
    expect(sessionStorage.getItem(key)).toBeNull();
    const refused = validateManualEntry({ airTemp: "200", airTempUnit: "F" });
    expect(refused.ok).toBe(false);
    expect(refused.metrics).toEqual([]);
    expect(validateManualEntry({ airTemp: "77", airTempUnit: "F" }).metrics).toEqual([
      { metric: "temperature_c", value: 25 },
    ]);
  });

  it("does not overwrite or clear an uncertain legacy record with a corrected identity", () => {
    const original = legacyRecord();
    const corrected = legacyRecord(25);
    const raw = JSON.stringify(original);
    sessionStorage.setItem(key, raw);
    expect(claimPendingManualSnapshot(corrected)).toEqual({ status: "pending", record: original });
    expect(clearPendingManualSnapshot(corrected)).toBe(false);
    expect(sessionStorage.getItem(key)).toBe(raw);
  });

  it.each(["provenance", "humidity", "precision", "owner"])(
    "keeps malformed legacy %s blocked and untouched",
    (field) => {
      const record = legacyRecord();
      if (field === "provenance") {
        const row = record.payloads[0] as unknown as { raw_payload: unknown };
        row.raw_payload = null;
      }
      if (field === "humidity") record.payloads[1].value = 101;
      if (field === "precision") record.payloads[0].value = 93.333;
      if (field === "owner") record.ownerId = "another-owner";
      const raw = JSON.stringify(record);
      sessionStorage.setItem(key, raw);
      expect(readPendingManualSnapshot("legacy-owner")).toEqual({ status: "blocked" });
      expect(clearPendingManualSnapshot(legacyRecord())).toBe(false);
      expect(sessionStorage.getItem(key)).toBe(raw);
    },
  );

  it("keeps an in-band uncertain save pending until its exact identity is cleared", () => {
    const original = legacyRecord(30);
    expect(claimPendingManualSnapshot(original).status).toBe("claimed");
    expect(clearPendingManualSnapshot(legacyRecord(25))).toBe(false);
    expect(readPendingManualSnapshot("legacy-owner")).toEqual({
      status: "pending",
      record: original,
    });
  });
});
