/**
 * sensor-history-import-replay-guard.test
 *
 * Validates the deterministic fingerprint + local replay guard used to
 * prevent duplicate sensor history imports.
 *
 * Static safety:
 *  - No Supabase imports / writes.
 *  - No alerts / Action Queue / AI / device-control imports.
 *  - No schema/RLS/Edge changes.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildSensorHistoryImportFingerprint,
  toFingerprintRows,
} from "@/lib/sensorHistoryImportFingerprintRules";
import {
  SENSOR_HISTORY_IMPORT_REPLAY_STORAGE_KEY,
  SENSOR_HISTORY_IMPORT_DUPLICATE_COPY,
  clearSensorHistoryImportReplayEntries,
  hasSensorHistoryImportFingerprint,
  readSensorHistoryImportReplayEntries,
  recordSensorHistoryImportFingerprint,
} from "@/lib/sensorHistoryImportReplayGuard";
import { buildRegistryCsvInsertRows } from "@/lib/registryCsvInsertRowsAdapter";
import { buildVerdantGeneticsXlsxInsertRows } from "@/lib/verdantGeneticsXlsxInsertRowsAdapter";
import type { VerdantGeneticsParseResult } from "@/lib/verdantGeneticsXlsxParser";

function makeMemoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  } as Storage;
}

const SPIDER_FARMER_CSV = [
  "deviceSerialnum,sensorId,roomId,captureTime,temperature(°F),humidity(%),vpd(kPa)",
  "SF-1,sensorA,room1,2025-01-01 00:00:00,75,55,1.1",
  "SF-1,sensorA,room1,2025-01-01 01:00:00,76,54,1.2",
].join("\n");

const VIVOSUN_CSV = [
  "Time,Temperature(°F),Humidity(%),VPD(kPa)",
  "2025-01-01 00:00:00,72,60,1.0",
  "2025-01-01 01:00:00,73,59,1.05",
].join("\n");

const XLSX_PREVIEW: VerdantGeneticsParseResult = {
  rows: [
    {
      sensor_group: "Tent A",
      captured_at: "2025-01-01T00:00:00.000Z",
      metric: "temperature_c",
      value: 24,
      raw_payload: {
        original_metric_label: "Temperature",
        original_value: 24,
        original_unit: "°C",
      },
    },
    {
      sensor_group: "Tent A",
      captured_at: "2025-01-01T00:00:00.000Z",
      metric: "humidity_pct",
      value: 55,
      raw_payload: {
        original_metric_label: "Humidity",
        original_value: 55,
        original_unit: "%",
      },
    },
  ],
  detectedGroups: ["Tent A"],
  dateRange: { start: "2025-01-01", end: "2025-01-01" },
  suspicious: [],
} as unknown as VerdantGeneticsParseResult;

describe("buildSensorHistoryImportFingerprint", () => {
  it("produces a stable fingerprint for the same Spider Farmer CSV rows", () => {
    const r1 = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      sourceApp: "spider_farmer",
      importBatchId: "batch-A",
      csvText: SPIDER_FARMER_CSV,
    });
    const r2 = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      sourceApp: "spider_farmer",
      importBatchId: "batch-B-different-id",
      csvText: SPIDER_FARMER_CSV,
    });
    const fp1 = buildSensorHistoryImportFingerprint({
      sourceAppId: "spider_farmer",
      rows: toFingerprintRows(r1.rows),
    });
    const fp2 = buildSensorHistoryImportFingerprint({
      sourceAppId: "spider_farmer",
      rows: toFingerprintRows(r2.rows),
    });
    expect(fp1).toMatch(/^[0-9a-f]{16}$/);
    expect(fp1).toEqual(fp2);
  });

  it("produces a stable fingerprint for the same Vivosun CSV rows", () => {
    const r1 = buildRegistryCsvInsertRows({
      tentId: "tent-2",
      sourceApp: "vivosun",
      importBatchId: "X",
      csvText: VIVOSUN_CSV,
    });
    const r2 = buildRegistryCsvInsertRows({
      tentId: "tent-2",
      sourceApp: "vivosun",
      importBatchId: "Y",
      csvText: VIVOSUN_CSV,
    });
    expect(
      buildSensorHistoryImportFingerprint({
        sourceAppId: "vivosun",
        rows: toFingerprintRows(r1.rows),
      }),
    ).toEqual(
      buildSensorHistoryImportFingerprint({
        sourceAppId: "vivosun",
        rows: toFingerprintRows(r2.rows),
      }),
    );
  });

  it("produces a stable fingerprint for the same Verdant Genetics XLSX rows", () => {
    const a = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: { "Tent A": "tent-x" },
      importBatchId: "batch-1",
      preview: XLSX_PREVIEW,
    });
    const b = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: { "Tent A": "tent-x" },
      importBatchId: "batch-2",
      preview: XLSX_PREVIEW,
    });
    expect(
      buildSensorHistoryImportFingerprint({
        sourceAppId: "verdant_genetics_xlsx",
        rows: toFingerprintRows(a.rows),
      }),
    ).toEqual(
      buildSensorHistoryImportFingerprint({
        sourceAppId: "verdant_genetics_xlsx",
        rows: toFingerprintRows(b.rows),
      }),
    );
  });

  it("changes fingerprint when tent mapping changes", () => {
    const a = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      sourceApp: "spider_farmer",
      importBatchId: "i",
      csvText: SPIDER_FARMER_CSV,
    });
    const b = buildRegistryCsvInsertRows({
      tentId: "tent-2",
      sourceApp: "spider_farmer",
      importBatchId: "i",
      csvText: SPIDER_FARMER_CSV,
    });
    expect(
      buildSensorHistoryImportFingerprint({
        sourceAppId: "spider_farmer",
        rows: toFingerprintRows(a.rows),
      }),
    ).not.toEqual(
      buildSensorHistoryImportFingerprint({
        sourceAppId: "spider_farmer",
        rows: toFingerprintRows(b.rows),
      }),
    );
  });

  it("changes fingerprint when a metric value changes", () => {
    const baseRows = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      sourceApp: "spider_farmer",
      importBatchId: "i",
      csvText: SPIDER_FARMER_CSV,
    }).rows;
    const fp = buildSensorHistoryImportFingerprint({
      sourceAppId: "spider_farmer",
      rows: toFingerprintRows(baseRows),
    });
    const mutated = toFingerprintRows(baseRows);
    mutated[0] = { ...mutated[0], value: mutated[0].value + 1 };
    const fp2 = buildSensorHistoryImportFingerprint({
      sourceAppId: "spider_farmer",
      rows: mutated,
    });
    expect(fp).not.toEqual(fp2);
  });

  it("changes fingerprint when source app changes", () => {
    const r = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      sourceApp: "spider_farmer",
      importBatchId: "i",
      csvText: SPIDER_FARMER_CSV,
    });
    const rows = toFingerprintRows(r.rows);
    expect(
      buildSensorHistoryImportFingerprint({ sourceAppId: "spider_farmer", rows }),
    ).not.toEqual(
      buildSensorHistoryImportFingerprint({ sourceAppId: "vivosun", rows }),
    );
  });

  it("fingerprint output is an opaque hex hash with no raw payload fields", () => {
    const r = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      sourceApp: "spider_farmer",
      importBatchId: "secret-batch-id-xyz",
      csvText: SPIDER_FARMER_CSV,
    });
    const fp = buildSensorHistoryImportFingerprint({
      sourceAppId: "spider_farmer",
      rows: toFingerprintRows(r.rows),
    });
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(fp).not.toContain("SF-1");
    expect(fp).not.toContain("secret-batch-id");
    expect(fp).not.toContain("sensorA");
    expect(fp).not.toContain("room1");
  });
});

describe("sensorHistoryImportReplayGuard", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeMemoryStorage();
  });

  it("allows the first import (no prior fingerprint)", () => {
    expect(hasSensorHistoryImportFingerprint("abc123", { storage })).toBe(false);
  });

  it("records a fingerprint after successful import", () => {
    recordSensorHistoryImportFingerprint("abc123", { storage });
    expect(hasSensorHistoryImportFingerprint("abc123", { storage })).toBe(true);
  });

  it("blocks a second identical import", () => {
    recordSensorHistoryImportFingerprint("dup-fp", { storage });
    expect(hasSensorHistoryImportFingerprint("dup-fp", { storage })).toBe(true);
  });

  it("does not record on empty/invalid fingerprint", () => {
    recordSensorHistoryImportFingerprint("", { storage });
    expect(readSensorHistoryImportReplayEntries({ storage })).toHaveLength(0);
  });

  it("clear empties the ledger", () => {
    recordSensorHistoryImportFingerprint("x", { storage });
    clearSensorHistoryImportReplayEntries({ storage });
    expect(readSensorHistoryImportReplayEntries({ storage })).toHaveLength(0);
  });

  it("survives corrupt storage by resetting safely", () => {
    storage.setItem(SENSOR_HISTORY_IMPORT_REPLAY_STORAGE_KEY, "{not json");
    expect(readSensorHistoryImportReplayEntries({ storage })).toEqual([]);
  });

  it("exposes user-facing duplicate copy", () => {
    expect(SENSOR_HISTORY_IMPORT_DUPLICATE_COPY).toMatch(/already saved/i);
  });
});

describe("static safety: replay guard module is local-only", () => {
  const here = resolve(__dirname, "../lib/sensorHistoryImportReplayGuard.ts");
  const fp = resolve(__dirname, "../lib/sensorHistoryImportFingerprintRules.ts");
  const sources = [readFileSync(here, "utf8"), readFileSync(fp, "utf8")];
  it.each([
    ["supabase import", /from\s+["']@\/integrations\/supabase/],
    ["fetch", /\bfetch\s*\(/],
    ["action_queue", /action_queue/],
    ["alerts table", /from\s+["']\.\.\/.*alerts/i],
    ["service_role", /service_role/i],
    ["raw_payload write", /raw_payload\s*:/],
  ])("does not contain %s", (_label, re) => {
    for (const src of sources) {
      expect(src).not.toMatch(re);
    }
  });
});
