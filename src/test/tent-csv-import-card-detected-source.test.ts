/**
 * tent-csv-import-card-detected-source — static safety + presenter scan
 * proving the legacy AC Infinity / TrolMaster source-app dropdown has
 * been removed from the primary CSV import surface in favour of
 * auto-detected "Detected source: …" copy.
 *
 * No DOM rendering. No DB I/O. No network. The scan walks the comment-
 * stripped source of TentCsvImportCard and the pure preview-copy module.
 *
 * Companion tests:
 *   - tent-csv-import-card-registry-wiring.test.ts (registry adapter wiring)
 *   - sensor-import-preview-copy.test.ts (detection + canonical-history copy)
 *   - sensor-history-import-replay-guard.test.ts (duplicate guard preserved)
 *   - sensor-history-import-audit-wiring.test.ts (audit ledger preserved)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANONICAL_SOURCE_COPY,
  UNKNOWN_SOURCE_COPY,
} from "@/lib/sensorImportPreviewCopy";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const CARD = stripComments(read("src/components/TentCsvImportCard.tsx"));

describe("legacy source-app dropdown removed from primary CSV import UI", () => {
  it("does not render the csv-source-app Select trigger or testid", () => {
    expect(CARD).not.toMatch(/data-testid=["']csv-source-app["']/);
    expect(CARD).not.toMatch(/<SelectTrigger\b/);
    expect(CARD).not.toMatch(/<SelectContent\b/);
    expect(CARD).not.toMatch(/<SelectItem\b/);
  });

  it("does not import the Select shadcn primitives", () => {
    expect(CARD).not.toMatch(
      /from\s+["']@\/components\/ui\/select["']/,
    );
  });

  it("does not surface a 'Source App' picker label or TrolMaster option", () => {
    expect(CARD).not.toMatch(/>\s*Source App\s*</);
    expect(CARD).not.toMatch(/TrolMaster/);
    expect(CARD).not.toMatch(/Coming soon/i);
  });
});

describe("auto-detected 'Detected source: …' copy is wired", () => {
  it("renders a detected-source presenter line for CSV imports", () => {
    expect(CARD).toMatch(/csv-source-preview-detected/);
    expect(CARD).toMatch(/Detected source:/);
  });

  it("includes friendly display labels for the supported vendors", () => {
    expect(CARD).toMatch(/ac_infinity:\s*["']AC Infinity["']/);
    expect(CARD).toMatch(/spider_farmer:\s*["']Spider Farmer["']/);
    expect(CARD).toMatch(/vivosun:\s*["']Vivosun["']/);
  });

  it("renders a Verdant Genetics XLSX detected-source line", () => {
    expect(CARD).toMatch(/csv-xlsx-detected-source/);
    expect(CARD).toMatch(/Detected source: Verdant Genetics XLSX/);
    expect(CARD).toMatch(/Imported as CSV history, not live sensor data/);
  });

  it("falls back to the unknown-source review copy for unknown files", () => {
    expect(CARD).toMatch(/unknown_source_app/);
    expect(CARD).toMatch(
      /Unknown source\. Review mapping before importing\./,
    );
    expect(UNKNOWN_SOURCE_COPY).toMatch(/Unknown CSV source/);
  });

  it("keeps the canonical CSV-history copy from the preview module", () => {
    expect(CANONICAL_SOURCE_COPY).toMatch(/CSV history/);
    expect(CANONICAL_SOURCE_COPY).toMatch(/not live readings/);
  });

});

describe("safety: no schema/RLS/Edge/auth/alerts/AI/device-control surfaces", () => {
  it("never imports device-control or AI provider modules", () => {
    expect(CARD).not.toMatch(/openai|anthropic|ai[-_]?doctor/i);
    expect(CARD).not.toMatch(/device[-_]?control/i);
  });

  it("never writes to alerts / action queue / diary / AI tables", () => {
    for (const t of [
      "diary_entries",
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "ai_doctor_sessions",
    ]) {
      expect(CARD).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
    }
  });

  it("never renders raw_payload or bridge/service-role tokens in UI", () => {
    expect(CARD).not.toMatch(/raw_payload/);
    expect(CARD).not.toMatch(/service_role/i);
    expect(CARD).not.toMatch(/bridge_token/i);
  });

  it("never labels imported rows as live in the persistence payload", () => {
    expect(CARD).not.toMatch(/source:\s*["']live["']/);
  });
});
