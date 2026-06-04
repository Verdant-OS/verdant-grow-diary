import { describe, expect, it } from "vitest";
import {
  buildCsvImportBatchId,
  buildCsvImportDeviceId,
  buildCsvImportRowIdempotencyKey,
} from "@/lib/csvImportIdempotency";

const base = {
  tentId: "tent-1",
  deviceId: buildCsvImportDeviceId("export.csv"),
  metric: "temperature",
  capturedAtIso: "2026-06-01T10:00:00.000Z",
  value: 22.5,
};

describe("csvImportIdempotency — determinism", () => {
  it("same row → same key", () => {
    expect(buildCsvImportRowIdempotencyKey(base)).toBe(
      buildCsvImportRowIdempotencyKey(base),
    );
  });

  it("changed value → different key", () => {
    expect(buildCsvImportRowIdempotencyKey({ ...base, value: 22.51 })).not.toBe(
      buildCsvImportRowIdempotencyKey(base),
    );
  });

  it("rounding to 4dp collapses sub-precision differences", () => {
    expect(
      buildCsvImportRowIdempotencyKey({ ...base, value: 22.50001 }),
    ).toBe(buildCsvImportRowIdempotencyKey(base));
  });

  it("changed timestamp → different key", () => {
    expect(
      buildCsvImportRowIdempotencyKey({ ...base, capturedAtIso: "2026-06-01T10:00:01.000Z" }),
    ).not.toBe(buildCsvImportRowIdempotencyKey(base));
  });

  it("changed metric → different key", () => {
    expect(
      buildCsvImportRowIdempotencyKey({ ...base, metric: "humidity" }),
    ).not.toBe(buildCsvImportRowIdempotencyKey(base));
  });

  it("changed tent → different key", () => {
    expect(
      buildCsvImportRowIdempotencyKey({ ...base, tentId: "tent-2" }),
    ).not.toBe(buildCsvImportRowIdempotencyKey(base));
  });

  it("device_id is hashed; raw filename never appears", () => {
    const dev = buildCsvImportDeviceId("ecowitt-2026-06-01-secret.csv");
    expect(dev).toMatch(/^csv:[0-9a-f]{16}$/);
    expect(dev).not.toContain("ecowitt");
    expect(dev).not.toContain("secret");
    const key = buildCsvImportRowIdempotencyKey({ ...base, deviceId: dev });
    expect(key).not.toContain("ecowitt");
    expect(key).not.toContain("secret");
  });
});

describe("csvImportIdempotency — batch id + duplicate guarantee", () => {
  it("batch id is stable for same inputs and changes when any vary", () => {
    const a = buildCsvImportBatchId({
      filename: "f.csv",
      tentId: "tent-1",
      importedAtIso: "2026-06-04T12:00:00.000Z",
    });
    const b = buildCsvImportBatchId({
      filename: "f.csv",
      tentId: "tent-1",
      importedAtIso: "2026-06-04T12:00:00.000Z",
    });
    const c = buildCsvImportBatchId({
      filename: "f.csv",
      tentId: "tent-2",
      importedAtIso: "2026-06-04T12:00:00.000Z",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("re-import with all keys existing → 100% skipped (sim)", () => {
    const rows = [base, { ...base, capturedAtIso: "2026-06-01T10:05:00.000Z", value: 22.7 }];
    const existing = new Set(rows.map(buildCsvImportRowIdempotencyKey));
    const accepted = rows.filter((r) => !existing.has(buildCsvImportRowIdempotencyKey(r)));
    expect(accepted).toEqual([]);
  });
});
