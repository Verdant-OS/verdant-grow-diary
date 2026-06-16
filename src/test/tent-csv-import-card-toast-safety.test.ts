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

  it("the two duplicate-aware handlers pass batchResult.diagnostic to toast.success", () => {
    const diagnosticCalls = [
      ...CARD.matchAll(/toast\.success\([^)]*batchResult\.diagnostic[^)]*\)/g),
    ];
    expect(diagnosticCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("every toast.success call attaches CSV_HISTORY_IMPORT_SCOPE_LINE as the description", () => {
    const successCalls = [
      ...CARD.matchAll(/toast\.success\([^)]*\)/g),
    ].map((m) => m[0]);
    expect(successCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of successCalls) {
      expect(call).toMatch(
        /description:\s*CSV_HISTORY_IMPORT_SCOPE_LINE/,
      );
    }
  });

  it("every toast.success message carries the no-live reassurance (via diagnostic or literal)", () => {
    const successCalls = [
      ...CARD.matchAll(/toast\.success\([^)]*\)/g),
    ].map((m) => m[0]);
    for (const call of successCalls) {
      const carriesViaDiagnostic = /batchResult\.diagnostic/.test(call);
      const carriesLiteral = call.includes("No live sensor data was created.");
      expect(carriesViaDiagnostic || carriesLiteral).toBe(true);
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

import {
  preflightCsvHistoryImport,
  validateSensorReadingInsertRows,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

describe("preflight + failure copy stays distinct from success copy", () => {
  const SUCCESS_PHRASES = [
    /Imported \d+ new/,
    /Skipped \d+ duplicate/,
    /already present for this tent/,
    /\bin 1 batch\b/,
    /\bacross \d+ batches\b/,
  ];

  it("empty-row preflight copy is exact and contains no success wording", () => {
    const r = preflightCsvHistoryImport([]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("empty");
    expect(r.message).toBe(
      "Import blocked before writing rows. No importable sensor readings were found. Check the CSV mapping, units, and timestamp columns. No rows were written. No live sensor data was created.",
    );
    for (const banned of ["Imported", "new", "Skipped", "already present for this tent"]) {
      expect(r.message).not.toContain(banned);
    }
  });

  it("unsupported-field preflight copy carries blocked + field list + no-live; no success wording", () => {
    const v = validateSensorReadingInsertRows([
      { tent_id: "t", source: "csv", metric: "temperature_c", captured_at: "2026-06-01T00:00:00Z", value: 1, foo_bar: 1 } as Record<string, unknown>,
    ]);
    expect(v.ok).toBe(false);
    const msg = v.message!;
    expect(msg).toContain("Import blocked before writing rows.");
    expect(msg).toContain("Unsupported sensor_readings field(s):");
    expect(msg).toContain("foo_bar");
    expect(msg).toContain("No rows were written.");
    expect(msg).toContain("No live sensor data was created.");
    for (const re of SUCCESS_PHRASES) {
      expect(msg).not.toMatch(re);
    }
  });

  it("23505 dedupe fallback copy stays tent-scoped, names dedupe key, has no success wording", () => {
    const msg = buildBatchFailureMessage({
      batchIndex: 1,
      totalBatches: 1,
      failedBatchSize: 100,
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
    expect(msg).toContain(
      "Import stopped because matching CSV history readings already exist for this tent",
    );
    expect(msg.toLowerCase()).toContain("dedupe key");
    expect(msg).toContain("No live sensor data was created.");
    for (const re of SUCCESS_PHRASES) {
      expect(msg).not.toMatch(re);
    }
  });

  it("non-dedupe batch failure stays operator-friendly with batch info + db code + no-live, no raw payload", () => {
    const msg = buildBatchFailureMessage({
      batchIndex: 3,
      totalBatches: 10,
      failedBatchSize: 250,
      insertedRows: 500,
      vendorLabel: "Spider Farmer",
      error: {
        code: "08006",
        message: "connection terminated unexpectedly",
        details: null,
        hint: "retry the import",
      },
    });
    expect(msg).toContain("batch 3 of 10");
    expect(msg).toContain("250 Spider Farmer rows");
    expect(msg).toContain("[code: 08006]");
    expect(msg).toContain("Hint: retry the import.");
    expect(msg).toContain("No live sensor data was created.");
    expect(msg).toContain("500 readings from earlier batches");
    // Never expose raw payload or sensitive surfaces
    for (const banned of ["raw_payload", "service_role", "Bearer ", "auth.uid"]) {
      expect(msg).not.toContain(banned);
    }
    // Never reuse success wording
    for (const re of SUCCESS_PHRASES) {
      expect(msg).not.toMatch(re);
    }
  });

  it("XLSX error toast copy in TentCsvImportCard contains no forbidden live-creation phrases", () => {
    const xlsxErrorBlock = CARD.match(/toast\.error\([^)]*XLSX[^)]*\)/);
    // It's OK if not found (string may not include "XLSX"); but if present, scan it.
    if (xlsxErrorBlock) {
      const lower = xlsxErrorBlock[0].toLowerCase();
      for (const phrase of FORBIDDEN_LIVE_PHRASES) {
        expect(lower).not.toContain(phrase);
      }
    }
    // Always scan the broader card source for forbidden XLSX error wording.
    const lowerCard = CARD.toLowerCase();
    for (const phrase of FORBIDDEN_LIVE_PHRASES) {
      expect(lowerCard).not.toContain(phrase);
    }
  });
});

describe("post-import CTA — 'View imported history' navigation", () => {
  it("declares a single view-imported-history action wired to the #imported-history anchor on the selected tent", () => {
    expect(CARD).toMatch(/viewImportedHistoryAction/);
    expect(CARD).toMatch(
      /label:\s*["']View imported history["']/,
    );
    expect(CARD).toMatch(
      /navigate\(`(?:\/tents\/\$\{tentId\}|\$\{tentDetailPath\(tentId\)\})#imported-history`\)/,
    );
  });

  it("the CTA label says 'imported history' (never 'live')", () => {
    const ctaBlock = CARD.match(
      /viewImportedHistoryAction\s*=\s*\{[\s\S]*?\}\s*as\s*const;/,
    );
    expect(ctaBlock).not.toBeNull();
    const block = ctaBlock![0];
    expect(block).toContain("imported history");
    for (const banned of [
      "live data",
      "live readings",
      "synced live data",
      "created live sensor data",
      "live sensor",
    ]) {
      expect(block.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });

  it("every toast.success call attaches the view-imported-history action", () => {
    const successCalls = [
      ...CARD.matchAll(/toast\.success\([^)]*\)/g),
    ].map((m) => m[0]);
    expect(successCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of successCalls) {
      expect(call).toMatch(/action:\s*viewImportedHistoryAction/);
    }
  });

  it("no toast.error call attaches the view-imported-history action (failure / preflight stays distinct)", () => {
    const errorCalls = [
      ...CARD.matchAll(/toast\.error\([^)]*\)/g),
    ].map((m) => m[0]);
    expect(errorCalls.length).toBeGreaterThan(0);
    for (const call of errorCalls) {
      expect(call).not.toMatch(/viewImportedHistoryAction/);
      expect(call).not.toMatch(/View imported history/);
    }
  });

  it("CTA navigation target is the selected tent + supported anchor only — no invented query params", () => {
    const navCalls = [...CARD.matchAll(/navigate\(`([^`]+)`\)/g)].map((m) => m[1]);
    const ctaNav = navCalls.filter(
      (p) => p.includes("/tents/") || p.includes("tentDetailPath("),
    );
    expect(ctaNav.length).toBeGreaterThan(0);
    for (const path of ctaNav) {
      // Either inline template literal or shared route helper, both must
      // resolve to the supported `#imported-history` anchor on the tent.
      expect(path).toMatch(
        /^(\/tents\/\$\{tentId\}|\$\{tentDetailPath\(tentId\)\})#imported-history$/,
      );
      expect(path).not.toMatch(/\?/);
      expect(path).not.toContain("start=");
      expect(path).not.toContain("end=");
      expect(path).not.toContain("captured_at");
      expect(path).not.toContain("source=");
    }
  });

  it("CTA is reachable for all success branches (no-duplicate, mixed, all-duplicate) because both handlers reuse the same success-toast wiring", () => {
    // Both duplicate-aware handlers call toast.success(batchResult.diagnostic, ...)
    // exactly when batchResult.ok === true (which covers all-duplicate too,
    // since runDuplicateAwareCsvHistoryImport returns ok: true for that case).
    const diagnosticSuccesses = [
      ...CARD.matchAll(
        /toast\.success\([^)]*batchResult\.diagnostic[^)]*action:\s*viewImportedHistoryAction[^)]*\)/g,
      ),
    ];
    expect(diagnosticSuccesses.length).toBeGreaterThanOrEqual(2);
  });
});
