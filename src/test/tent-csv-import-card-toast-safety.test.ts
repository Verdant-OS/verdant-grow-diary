/**
 * tent-csv-import-card-toast-safety
 *
 * Locks the toast wiring in TentCsvImportCard so it always renders the
 * hardened duplicate-aware result copy and never displays forbidden
 * live-creation wording.
 *
 * Approach: static scan of the comment-stripped card source + behavior
 * tests against the pure copy helpers the card calls into. No DB I/O,
 * no Supabase client, no sonner DOM mounting — consistent with the
 * other tent-csv-import-card-*.test.ts files in this directory.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CSV_HISTORY_DEDUPE_CONFLICT_COPY,
  CSV_HISTORY_EMPTY_ROWS_COPY,
  CSV_HISTORY_IMPORT_SCOPE_LINE,
  CSV_HISTORY_NO_ROWS_SAFE_FALLBACK_COPY,
  buildBatchFailureMessage,
  buildDuplicateAwareSuccessMessage,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

const CARD_PATH = "src/components/TentCsvImportCard.tsx";
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const CARD_RAW = readFileSync(resolve(process.cwd(), CARD_PATH), "utf8");
const CARD = stripComments(CARD_RAW);

const FORBIDDEN_LIVE_PHRASES = [
  "live readings imported",
  "live sensor readings imported",
  "synced live data",
  "created live sensor data",
] as const;

describe("TentCsvImportCard toast wiring — uses hardened helper output", () => {
  it("imports the hardened duplicate-aware helper + scope line constant", () => {
    expect(CARD).toMatch(/runDuplicateAwareCsvHistoryImport/);
    expect(CARD).toMatch(/CSV_HISTORY_IMPORT_SCOPE_LINE/);
  });

  it("every toast.success call passes batchResult.diagnostic as the headline", () => {
    const successCalls = [
      ...CARD.matchAll(/toast\.success\(([^)]*)\)/g),
    ].map((m) => m[1]);
    expect(successCalls.length).toBeGreaterThanOrEqual(2);
    for (const args of successCalls) {
      expect(args).toMatch(/batchResult\.diagnostic/);
    }
  });

  it("every toast.success call attaches CSV_HISTORY_IMPORT_SCOPE_LINE as the description", () => {
    const successCalls = [
      ...CARD.matchAll(/toast\.success\([^)]*\)/g),
    ].map((m) => m[0]);
    for (const call of successCalls) {
      expect(call).toMatch(
        /description:\s*CSV_HISTORY_IMPORT_SCOPE_LINE/,
      );
    }
  });

  it("failure toasts never reuse success wording", () => {
    const errorCalls = [
      ...CARD.matchAll(/toast\.error\([^)]*\)/g),
    ].map((m) => m[0]);
    for (const call of errorCalls) {
      expect(call).not.toMatch(/Imported \d+ new/);
      expect(call).not.toMatch(/CSV_HISTORY_IMPORT_SCOPE_LINE/);
    }
  });
});

describe("TentCsvImportCard — static safety scan", () => {
  it("never labels imported rows as live", () => {
    expect(CARD).not.toMatch(/source:\s*["']live["']/);
  });

  it("never contains forbidden live-creation phrases (any casing)", () => {
    const lower = CARD.toLowerCase();
    for (const phrase of FORBIDDEN_LIVE_PHRASES) {
      expect(lower).not.toContain(phrase);
    }
  });

  it("never imports device control / automation / queue / alerts / AI hot paths", () => {
    for (const banned of [
      "deviceControl",
      "device_control",
      "automation",
      "action_queue",
      "ai_doctor",
      "functions.invoke",
    ]) {
      expect(CARD).not.toContain(banned);
    }
    expect(CARD).not.toMatch(/from\(["']alerts["']\)/);
  });

  it("never references service_role / bridge tokens", () => {
    for (const banned of [
      "service_role",
      "SUPABASE_SERVICE_ROLE",
      "bridge_token",
      "BRIDGE_TOKEN",
    ]) {
      expect(CARD).not.toContain(banned);
    }
  });

  it("never SELECTs raw_payload from sensor_readings", () => {
    expect(CARD).not.toMatch(/\.select\([^)]*raw_payload[^)]*\)/);
  });
});

describe("Toast result copy — helper output rendered into the toast", () => {
  it("no-duplicate / new rows inserted → 'Imported N new ... for this tent ...' + no-live", () => {
    const msg = buildDuplicateAwareSuccessMessage({
      vendorLabel: "Spider Farmer / THP Data",
      inserted: 250,
      duplicates: 0,
      totalBatches: 5,
    });
    expect(msg).toContain(
      "Imported 250 new Spider Farmer / THP Data CSV history readings for this tent across 5 batches.",
    );
    expect(msg).toContain("No live sensor data was created.");
    for (const p of FORBIDDEN_LIVE_PHRASES) {
      expect(msg.toLowerCase()).not.toContain(p);
    }
  });

  it("mixed new + duplicates → both counts in toast + no-live reassurance", () => {
    const msg = buildDuplicateAwareSuccessMessage({
      vendorLabel: "AC Infinity",
      inserted: 7,
      duplicates: 3,
      totalBatches: 1,
    });
    expect(msg).toContain("Imported 7 new AC Infinity CSV history readings for this tent.");
    expect(msg).toContain("Skipped 3 duplicate readings already present for this tent.");
    expect(msg).toContain("No live sensor data was created.");
  });

  it("all duplicates → 'No new CSV history readings were imported' + no-live", () => {
    const msg = buildDuplicateAwareSuccessMessage({
      vendorLabel: "Vivosun",
      inserted: 0,
      duplicates: 42,
      totalBatches: 0,
    });
    expect(msg).toMatch(/^No new CSV history readings were imported\./);
    expect(msg).toContain("42 readings already exist for this tent.");
    expect(msg).toContain("No live sensor data was created.");
    expect(msg).not.toMatch(/Imported 0 new/);
  });

  it("scope-line description names tent / csv source / dedupe-key shape", () => {
    expect(CSV_HISTORY_IMPORT_SCOPE_LINE).toContain("selected tent");
    expect(CSV_HISTORY_IMPORT_SCOPE_LINE).toContain("source: csv");
    expect(CSV_HISTORY_IMPORT_SCOPE_LINE).toContain(
      "tent + source + metric + captured timestamp",
    );
  });

  it("empty-row preflight copy remains exact and distinct from all-duplicate copy", () => {
    expect(CSV_HISTORY_EMPTY_ROWS_COPY).toBe(
      "Import blocked before writing rows. No importable sensor readings were found. Check the CSV mapping, units, and timestamp columns. No rows were written. No live sensor data was created.",
    );
    expect(CSV_HISTORY_EMPTY_ROWS_COPY).not.toContain("already exist for this tent");
  });

  it("23505 failure toast stays distinct from success wording and keeps no-live reassurance", () => {
    const fail = buildBatchFailureMessage({
      batchIndex: 2,
      totalBatches: 4,
      failedBatchSize: 500,
      insertedRows: 500,
      vendorLabel: "Spider Farmer / THP Data",
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "sensor_readings_dedupe_uidx"',
        details: null,
        hint: null,
      },
    });
    expect(fail).toContain(CSV_HISTORY_DEDUPE_CONFLICT_COPY);
    expect(fail).not.toMatch(/Imported \d+ new/);
    expect(fail).toContain("No live sensor data was created.");
    for (const p of FORBIDDEN_LIVE_PHRASES) {
      expect(fail.toLowerCase()).not.toContain(p);
    }
  });

  it("safe 0/0 fallback never says 'Imported 0 new' and includes no-live reassurance", () => {
    expect(CSV_HISTORY_NO_ROWS_SAFE_FALLBACK_COPY).not.toMatch(/Imported 0 new/);
    expect(CSV_HISTORY_NO_ROWS_SAFE_FALLBACK_COPY).toContain(
      "No live sensor data was created.",
    );
  });
});
