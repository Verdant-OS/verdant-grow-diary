/**
 * csv-history-tenant-isolation
 *
 * Tenant/tent isolation audit + safety tests for the CSV history import
 * pipeline. These tests prove that:
 *   1. The deployed dedupe index `sensor_readings_dedupe_uidx` is scoped
 *      to BOTH `user_id` and `tent_id` so cross-tenant collisions are
 *      structurally impossible.
 *   2. Insert rows include the current `tent_id` and a canonical
 *      `source = "csv"`, never `"live"`.
 *   3. Insert rows do NOT include a client-supplied `user_id`; ownership
 *      is enforced by the table's `auth.uid()` DEFAULT + RLS.
 *   4. The client-side replay fingerprint differs across tents and
 *      across source apps, so a file imported for tent A cannot block
 *      tent B.
 *   5. The duplicate-key operator copy never blames "another tenant",
 *      and the friendlier message is only emitted because the deployed
 *      index is verified tenant-AND-tent scoped.
 *
 * Static safety: no Supabase writes, no live promotion, no automation,
 * no action_queue, no alerts, no service_role, no bridge tokens.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildRegistryCsvInsertRows } from "@/lib/registryCsvInsertRowsAdapter";
import { buildCsvInsertRows } from "@/lib/csvSensorImportRules";
import {
  buildBatchFailureMessage,
  CSV_HISTORY_DEDUPE_CONFLICT_COPY,
} from "@/lib/csv-import/sensorReadingsBatchInsert";
import {
  buildSensorHistoryImportFingerprint,
  toFingerprintRows,
} from "@/lib/sensorHistoryImportFingerprintRules";

// ---------- 1. Deployed dedupe index audit ----------

const DEDUPE_MIGRATION = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260604021425_0283accb-8dc0-4441-82ef-ed75d56d04f8.sql",
  ),
  "utf8",
);

describe("sensor_readings_dedupe_uidx — tenant/tent scope audit", () => {
  it("partial unique index is scoped to (user_id, tent_id, source, metric, captured_at)", () => {
    expect(DEDUPE_MIGRATION).toMatch(
      /CREATE\s+UNIQUE\s+INDEX[^;]+sensor_readings_dedupe_uidx[\s\S]*?\(\s*user_id\s*,\s*tent_id\s*,\s*source\s*,\s*metric\s*,\s*captured_at\s*\)/i,
    );
    // Tenant scope MUST be present — without it, two tenants importing
    // the same file/time/metric would collide.
    expect(DEDUPE_MIGRATION).toMatch(/\(\s*user_id\s*,/i);
    // Tent scope MUST be present.
    expect(DEDUPE_MIGRATION).toMatch(/,\s*tent_id\s*,/i);
    // Partial index — legacy rows with NULL captured_at are excluded.
    expect(DEDUPE_MIGRATION).toMatch(/WHERE\s+captured_at\s+IS\s+NOT\s+NULL/i);
  });
});

// ---------- 2. Insert row ownership shape ----------

const SPIDER_CSV = [
  "deviceSerialnum,Timestamp,temperature(°C),temperature(°F),humidity,vpd,co2,ppfd",
  "SF1,2026-06-01 00:00:00,22.5,72.5,55,1.2,400,800",
  "SF1,2026-06-01 00:05:00,22.7,72.86,56,1.21,410,810",
].join("\n");

describe("CSV insert rows — tenant/tent ownership shape", () => {
  it("Spider Farmer rows carry tent_id, source = 'csv', no top-level user_id/grow_id", () => {
    const r = buildRegistryCsvInsertRows({
      tentId: "tent-A",
      growId: "grow-A",
      sourceApp: "spider_farmer",
      importBatchId: "batch-1",
      csvText: SPIDER_CSV,
    });
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(row.tent_id).toBe("tent-A");
      expect(row.source).toBe("csv");
      const keys = Object.keys(row);
      expect(keys).not.toContain("user_id");
      expect(keys).not.toContain("grow_id");
      expect(keys).not.toContain("account_id");
      expect(keys).not.toContain("tenant_id");
      // Vendor lineage stays in raw_payload (provenance only — never used
      // for security isolation).
      expect(row.raw_payload.source_app).toBe("spider_farmer");
    }
  });

  it("AC Infinity legacy rows carry tent_id and a csv_import_* source", () => {
    const rows = buildCsvInsertRows({
      tentId: "tent-B",
      growId: "grow-B",
      sourceApp: "ac_infinity",
      importBatchId: "batch-2",
      rows: [
        {
          captured_at: "2026-06-01T00:00:00.000Z",
          readings: [
            {
              captured_at: "2026-06-01T00:00:00.000Z",
              metric: "humidity_pct",
              value: 55,
            },
          ],
        },
      ],
    });
    expect(rows.length).toBe(1);
    for (const row of rows) {
      expect(row.tent_id).toBe("tent-B");
      // Never promoted to live.
      expect(row.source).not.toBe("live");
      const keys = Object.keys(row);
      expect(keys).not.toContain("user_id");
      expect(keys).not.toContain("account_id");
      expect(keys).not.toContain("tenant_id");
    }
  });
});

// ---------- 3. Replay fingerprint isolation ----------

describe("replay fingerprint — per-tent and per-vendor isolation", () => {
  function fingerprintFor(tentId: string, sourceApp: "spider_farmer" | "vivosun") {
    const r = buildRegistryCsvInsertRows({
      tentId,
      sourceApp,
      importBatchId: "batch-fp",
      csvText: SPIDER_CSV,
    });
    return buildSensorHistoryImportFingerprint({
      sourceAppId: sourceApp,
      rows: toFingerprintRows(r.rows),
    });
  }

  it("same file imported into different tents produces different fingerprints", () => {
    const a = fingerprintFor("tent-A", "spider_farmer");
    const b = fingerprintFor("tent-B", "spider_farmer");
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("same tent + same rows under different source apps produce different fingerprints", () => {
    // Vivosun adapter on a Spider Farmer CSV won't map → emit nothing,
    // so we hand-build fingerprint inputs that share row content but
    // differ only by sourceAppId.
    const rows = [
      {
        tent_id: "tent-A",
        metric: "temperature_c",
        captured_at: "2026-06-01T00:00:00.000Z",
        value: 22.5,
      },
    ];
    const sf = buildSensorHistoryImportFingerprint({
      sourceAppId: "spider_farmer",
      rows,
    });
    const ac = buildSensorHistoryImportFingerprint({
      sourceAppId: "ac_infinity",
      rows,
    });
    expect(sf).not.toBe(ac);
  });

  it("same file + same tent + same vendor reproduces the same fingerprint (replay)", () => {
    const a = fingerprintFor("tent-A", "spider_farmer");
    const b = fingerprintFor("tent-A", "spider_farmer");
    expect(a).toBe(b);
  });
});

// ---------- 4. Duplicate-key copy stays tenant-safe ----------

describe("CSV history duplicate-key operator copy", () => {
  it("23505 on sensor_readings_dedupe_uidx → friendly tent-scoped copy", () => {
    const msg = buildBatchFailureMessage({
      batchIndex: 1,
      totalBatches: 42,
      failedBatchSize: 500,
      insertedRows: 0,
      vendorLabel: "Spider Farmer / THP Data",
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "sensor_readings_dedupe_uidx"',
        details: null,
        hint: null,
      },
    });
    expect(msg).toContain("Import stopped on batch 1 of 42");
    expect(msg).toContain(CSV_HISTORY_DEDUPE_CONFLICT_COPY);
    expect(msg).toContain("No live sensor data was created.");
    // Must NOT claim cross-tenant context.
    expect(msg.toLowerCase()).not.toMatch(/another tenant|another account/);
    // Must NOT claim it was already imported by *this user* in another
    // tent — the index is tent-scoped, so the message stays tent-local.
    expect(msg).toMatch(/this tent/i);
  });

  it("non-dedupe failures keep the original diagnostic shape", () => {
    const msg = buildBatchFailureMessage({
      batchIndex: 2,
      totalBatches: 3,
      failedBatchSize: 100,
      insertedRows: 500,
      vendorLabel: "Spider Farmer / THP Data",
      error: {
        code: "PGRST204",
        message: "Could not find the 'grow_id' column of 'sensor_readings'",
        details: null,
        hint: null,
      },
    });
    expect(msg).toContain("Import failed on batch 2 of 3");
    expect(msg).toContain("Database returned:");
    expect(msg).toContain("[code: PGRST204]");
    expect(msg).toContain("No live sensor data was created.");
  });
});

// ---------- 5. Static safety scan ----------

describe("CSV history import surfaces — static tenant-safety scan", () => {
  const FILES = [
    "src/lib/csv-import/sensorReadingsBatchInsert.ts",
    "src/lib/registryCsvInsertRowsAdapter.ts",
    "src/lib/csvSensorImportRules.ts",
    "src/lib/sensorHistoryImportFingerprintRules.ts",
    "src/lib/sensorHistoryImportReplayGuard.ts",
  ];
  const stripComments = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  describe.each(FILES)("%s", (rel) => {
    const code = stripComments(
      readFileSync(resolve(process.cwd(), rel), "utf8"),
    );
    it("never promotes CSV rows to source = 'live'", () => {
      expect(code).not.toMatch(/source:\s*["']live["']/);
    });
    it("never references service_role / bridge tokens / functions.invoke", () => {
      for (const needle of [
        "service_role",
        "SUPABASE_SERVICE_ROLE",
        "bridge_token",
        "BRIDGE_TOKEN",
        "functions.invoke",
      ]) {
        expect(code).not.toContain(needle);
      }
    });
    it("never imports device control / automation / action queue / alerts paths", () => {
      for (const needle of ["action_queue", "deviceControl", "automation"]) {
        // Allow nothing matching these forbidden surfaces in the
        // tenant-isolation hot path.
        expect(code).not.toContain(needle);
      }
    });
  });
});
