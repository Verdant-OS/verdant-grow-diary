/**
 * tent-csv-import-card-failure-toast-copy
 *
 * Locks the import-failure toast wording for the CSV/XLSX history paths so
 * a real database failure always:
 *   - starts with "Import failed."
 *   - includes "No live sensor data was created."
 * and the duplicate-only / mixed success copy never uses the "Save failed"
 * scare wording.
 *
 * Static scan of the card source. No Supabase, no live data, no AI.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CARD = readFileSync(
  resolve(__dirname, "../components/TentCsvImportCard.tsx"),
  "utf8",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const CODE = stripComments(CARD);

describe("TentCsvImportCard — import-failed toast wording", () => {
  it("every batch-result failure toast starts with 'Import failed.' and reassures no live sensor data was created", () => {
    // Collect every toast.error("…", { description: batchResult.diagnostic })
    const calls = [
      ...CODE.matchAll(
        /toast\.error\(\s*(["'`])([^"'`]+)\1\s*,\s*\{\s*description:\s*batchResult\.diagnostic\s*,?\s*\}\s*\)/g,
      ),
    ];
    expect(calls.length).toBeGreaterThanOrEqual(3); // legacy CSV, registry CSV, XLSX
    for (const call of calls) {
      const message = call[2];
      expect(message).toMatch(/^Import failed\./);
      expect(message).toMatch(/No live sensor data was created\./);
    }
  });

  it("no batch-result failure toast uses 'Save failed' or 'Couldn't import' anymore", () => {
    const failBlocks = [
      ...CODE.matchAll(
        /if\s*\(\s*!batchResult\.ok\s*\)\s*\{[\s\S]*?toast\.error\([^)]*\)/g,
      ),
    ];
    expect(failBlocks.length).toBeGreaterThanOrEqual(3);
    for (const block of failBlocks) {
      expect(block[0]).not.toMatch(/Save failed/i);
      expect(block[0]).not.toMatch(/Couldn't import/i);
      expect(block[0]).toMatch(/Import failed\./);
      expect(block[0]).toMatch(/No live sensor data was created/);
    }
  });

  it("XLSX save path passes inserted/duplicate counts to the audit builder", () => {
    // Asserts the audit ledger gets the duplicate-aware split, not just attempted.
    expect(CODE).toMatch(
      /buildVerdantGeneticsXlsxAuditInput\(\{[\s\S]*?insertedRowCount:\s*batchResult\.insertedRows[\s\S]*?duplicateRowCount:\s*batchResult\.duplicateRows/,
    );
    expect(CODE).toMatch(
      /buildRegistryCsvAuditInput\(\{[\s\S]*?insertedRowCount:\s*batchResult\.insertedRows[\s\S]*?duplicateRowCount:\s*batchResult\.duplicateRows/,
    );
  });

  it("XLSX preview panel is wired with onViewImportedHistory CTA", () => {
    expect(CODE).toMatch(
      /VerdantGeneticsXlsxPreviewPanel[\s\S]*?onViewImportedHistory=\{viewImportedHistoryAction\.onClick\}/,
    );
  });
});
