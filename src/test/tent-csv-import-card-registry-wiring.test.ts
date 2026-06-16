/**
 * tent-csv-import-card-registry-wiring — static safety + wiring scan for the
 * registry-adapter save path added for Spider Farmer / Vivosun.
 *
 * No DOM rendering. No DB I/O. No network. The scan walks the comment-
 * stripped source of TentCsvImportCard to prove:
 *   - the registry adapter is imported and routed via the new handler
 *   - the legacy `buildCsvInsertRows` AC Infinity path is preserved
 *   - Spider Farmer + Vivosun gate is open in PREVIEW_PERSISTENCE_ENABLED
 *   - the card never writes diary_entries / alerts / action_queue / AI
 *   - the canonical CSV source is "csv" (deployed-trigger allow-list)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PREVIEW_PERSISTENCE_ENABLED } from "@/lib/sensorImportPreviewCopy";
import { ADAPTER_CANONICAL_SOURCE } from "@/lib/registryCsvInsertRowsAdapter";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const CARD_RAW = read("src/components/TentCsvImportCard.tsx");
const CARD = stripComments(CARD_RAW);

describe("registry adapter wiring in TentCsvImportCard", () => {
  it("imports the registry adapter", () => {
    expect(CARD).toMatch(/buildRegistryCsvInsertRows/);
    expect(CARD).toMatch(/from\s+["']@\/lib\/registryCsvInsertRowsAdapter["']/);
  });

  it("imports the persistence gate", () => {
    expect(CARD).toMatch(/PREVIEW_PERSISTENCE_ENABLED/);
  });

  it("routes Spider Farmer and Vivosun through the new handler", () => {
    expect(CARD).toMatch(/handleRegistryImport/);
    expect(CARD).toMatch(/spider_farmer/);
    expect(CARD).toMatch(/vivosun/);
  });

  it("preserves the legacy AC Infinity import path", () => {
    expect(CARD).toMatch(/buildCsvInsertRows\s*\(/);
    expect(CARD).toMatch(/normalizeAcInfinityRows/);
  });

  it("only writes to sensor_readings", () => {
    const tables = [...CARD.matchAll(/\.from\(["']([a-z_]+)["']\)/g)].map(
      (m) => m[1],
    );
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) expect(t).toBe("sensor_readings");
  });

  it("never writes to diary / alerts / action queue / AI surfaces", () => {
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
    expect(CARD).not.toMatch(/openai|anthropic|ai[-_]?doctor/i);
  });

  it("never labels imported rows as live", () => {
    expect(CARD).not.toMatch(/source:\s*["']live["']/);
  });

  it("uses CSV-history language in the registry save button", () => {
    expect(CARD).toMatch(/CSV history/);
  });

  it("renders the mapping-help drawer with imported / not-imported metric lists", () => {
    expect(CARD).toMatch(/csv-mapping-help-trigger/);
    expect(CARD).toMatch(/Imported in this release:/);
    expect(CARD).toMatch(/Detected but not imported in this release:/);
    expect(CARD).toMatch(/Which columns will import\?/);
  });

  it("drawer preflight copy references sensor_readings table and blocking", () => {
    expect(CARD).toMatch(/sensor_readings table/);
    expect(CARD).toMatch(/blocked before any rows are written/);
  });

  it("drawer does not expose raw payload or enable convert buttons", () => {
    expect(CARD).not.toMatch(/raw_payload/);
    expect(CARD).not.toMatch(/convert/i);
  });
});

describe("persistence gate after enablement", () => {
  it("includes spider_farmer and vivosun", () => {
    expect(PREVIEW_PERSISTENCE_ENABLED.has("spider_farmer")).toBe(true);
    expect(PREVIEW_PERSISTENCE_ENABLED.has("vivosun")).toBe(true);
  });

  it("keeps ac_infinity enabled and unknown blocked", () => {
    expect(PREVIEW_PERSISTENCE_ENABLED.has("ac_infinity")).toBe(true);
    expect(PREVIEW_PERSISTENCE_ENABLED.has("unknown_source_app")).toBe(false);
  });

  it("registry adapter still emits the deployed-accepted canonical source", () => {
    expect(ADAPTER_CANONICAL_SOURCE).toBe("csv");
  });
});
