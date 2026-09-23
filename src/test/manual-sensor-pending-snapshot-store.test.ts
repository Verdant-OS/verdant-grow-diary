import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildManualReadingPayloads } from "@/lib/sensorReadingManualEntryRules";
import {
  claimPendingManualSnapshot,
  clearPendingManualSnapshot,
  readPendingManualSnapshot,
  restoreManualSnapshotValues,
  type PendingManualSnapshot,
} from "@/lib/manualSensorPendingSnapshotStore";

type CorruptRow = Record<string, unknown> & {
  raw_payload?: { manual_provenance: Record<string, unknown>; [key: string]: unknown };
};
type CorruptRecord = Record<string, unknown> & { payloads: CorruptRow[] };

const key = "verdant:sensors:pending-manual:v1:owner-a";
const record = (): PendingManualSnapshot => ({
  version: 1,
  ownerId: "owner-a",
  payloads: buildManualReadingPayloads({
    tentId: "11111111-1111-4111-8111-111111111111",
    ts: "2026-09-17T12:00:00.000Z",
    metrics: [
      { metric: "temperature_c", value: 25 },
      { metric: "humidity_pct", value: 60 },
    ],
    deviceNote: "Handheld meter",
  }),
});
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("owner-scoped uncertain manual snapshot storage", () => {
  it("claims before dispatch, retains exact timestamp/provenance, and restores explicit Celsius", () => {
    const original = record();
    expect(readPendingManualSnapshot(original.ownerId)).toEqual({ status: "empty" });
    expect(claimPendingManualSnapshot(original)).toEqual({ status: "claimed", record: original });
    expect(readPendingManualSnapshot(original.ownerId)).toEqual({
      status: "pending",
      record: original,
    });
    const restored = restoreManualSnapshotValues(original);
    expect(restored).toMatchObject({
      form: { airTemp: "25", airTempUnit: "C", humidityPct: "60" },
      tempUnitOverride: "C",
      devicePreset: "custom",
      deviceCustom: "Handheld meter",
      saveUnconfirmed: true,
      pendingStandardSnapshot: { revision: 0, payloads: original.payloads },
    });
    expect(claimPendingManualSnapshot(original).status).toBe("claimed");
  });
  it("never overwrites or clears a different unconfirmed snapshot", () => {
    const first = record();
    const next = record();
    next.payloads.forEach((row) => {
      row.ts = row.captured_at = "2026-09-17T12:05:00.000Z";
    });
    claimPendingManualSnapshot(first);
    expect(claimPendingManualSnapshot(next)).toEqual({ status: "pending", record: first });
    expect(clearPendingManualSnapshot(next)).toBe(false);
    expect(readPendingManualSnapshot(first.ownerId)).toEqual({ status: "pending", record: first });
    expect(clearPendingManualSnapshot(first)).toBe(true);
    expect(readPendingManualSnapshot(first.ownerId)).toEqual({ status: "empty" });
  });
  it("keeps another owner's record inaccessible and untouched", () => {
    claimPendingManualSnapshot(record());
    expect(readPendingManualSnapshot("owner-b")).toEqual({ status: "empty" });
    expect(readPendingManualSnapshot("")).toEqual({ status: "blocked" });
    expect(clearPendingManualSnapshot({ ...record(), ownerId: "owner-b" })).toBe(false);
    expect(readPendingManualSnapshot("owner-a").status).toBe("pending");
  });
  it.each([
    [
      "wrong owner",
      (r: CorruptRecord) => {
        r.ownerId = "owner-b";
      },
    ],
    [
      "unknown version",
      (r: CorruptRecord) => {
        r.version = 2;
      },
    ],
    [
      "extra record metadata",
      (r: CorruptRecord) => {
        r.extra = true;
      },
    ],
    [
      "empty metrics",
      (r: CorruptRecord) => {
        r.payloads = [];
      },
    ],
    [
      "duplicate metric",
      (r: CorruptRecord) => {
        r.payloads.push(r.payloads[0]);
      },
    ],
    [
      "unknown metric",
      (r: CorruptRecord) => {
        r.payloads[0].metric = "unknown";
      },
    ],
    [
      "invalid value",
      (r: CorruptRecord) => {
        r.payloads[1].value = 101;
      },
    ],
    [
      "nonfinite value",
      (r: CorruptRecord) => {
        r.payloads[1].value = Infinity;
      },
    ],
    [
      "client owner",
      (r: CorruptRecord) => {
        r.payloads[0].user_id = "owner-a";
      },
    ],
    [
      "alternate source",
      (r: CorruptRecord) => {
        r.payloads[0].source = "pi_bridge";
      },
    ],
    [
      "untrusted quality",
      (r: CorruptRecord) => {
        r.payloads[0].quality = "verified";
      },
    ],
    [
      "mixed tent",
      (r: CorruptRecord) => {
        r.payloads[0].tent_id = "22222222-2222-4222-8222-222222222222";
      },
    ],
    [
      "invalid tent",
      (r: CorruptRecord) => {
        r.payloads.forEach((row: CorruptRow) => {
          row.tent_id = "bad";
        });
      },
    ],
    [
      "mixed capture time",
      (r: CorruptRecord) => {
        r.payloads[0].captured_at = "2026-09-17T12:05:00.000Z";
      },
    ],
    [
      "mismatched ts",
      (r: CorruptRecord) => {
        r.payloads[0].ts = "2026-09-17T12:05:00.000Z";
      },
    ],
    [
      "invalid timestamp",
      (r: CorruptRecord) => {
        r.payloads.forEach((row: CorruptRow) => {
          row.ts = row.captured_at = "invalid";
        });
      },
    ],
    [
      "missing provenance",
      (r: CorruptRecord) => {
        delete r.payloads[0].raw_payload;
      },
    ],
    [
      "invented confidence",
      (r: CorruptRecord) => {
        r.payloads[0].raw_payload!.manual_provenance.confidence = 1;
      },
    ],
    [
      "extra provenance",
      (r: CorruptRecord) => {
        r.payloads[0].raw_payload!.token = "not-a-real-token";
      },
    ],
    [
      "mixed device",
      (r: CorruptRecord) => {
        r.payloads[0].device_id = "manual:Other meter";
      },
    ],
    [
      "live device",
      (r: CorruptRecord) => {
        r.payloads.forEach((row: CorruptRow) => {
          row.device_id = "live:bridge";
        });
      },
    ],
  ])("blocks %s without changing storage", (_name, mutate) => {
    const corrupted = record() as unknown as CorruptRecord;
    mutate(corrupted);
    const raw = JSON.stringify(corrupted);
    sessionStorage.setItem(key, raw);
    expect(readPendingManualSnapshot("owner-a")).toEqual({ status: "blocked" });
    expect(claimPendingManualSnapshot(record())).toEqual({ status: "blocked" });
    expect(clearPendingManualSnapshot(record())).toBe(false);
    expect(sessionStorage.getItem(key)).toBe(raw);
  });
  it("blocks malformed JSON", () => {
    sessionStorage.setItem(key, "{");
    expect(readPendingManualSnapshot("owner-a")).toEqual({ status: "blocked" });
  });
  it("blocks an unreadable store", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readPendingManualSnapshot("owner-a")).toEqual({ status: "blocked" });
    expect(claimPendingManualSnapshot(record())).toEqual({ status: "blocked" });
  });
  it("blocks an unwritable store", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(claimPendingManualSnapshot(record())).toEqual({ status: "blocked" });
  });
  it("blocks a store that silently fails to retain a record", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(claimPendingManualSnapshot(record())).toEqual({ status: "blocked" });
  });
  it("retains confirmation identity when removal fails", () => {
    const original = record();
    claimPendingManualSnapshot(original);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(clearPendingManualSnapshot(original)).toBe(false);
    expect(readPendingManualSnapshot("owner-a")).toEqual({ status: "pending", record: original });
  });
});
