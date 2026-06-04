/**
 * Verifies docs/csv-preview-partner-demo.md exists and contains required
 * sections, safety guarantees, and honest sample-data labeling.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/csv-preview-partner-demo.md");

describe("CSV/TSV Preview partner demo documentation", () => {
  it("docs/csv-preview-partner-demo.md exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const content = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

  it("includes the route /sensors/csv-preview", () => {
    expect(content).toContain("/sensors/csv-preview");
  });

  it("includes 90-second demo script", () => {
    expect(content).toMatch(/90[-\s]?Second Demo Script/i);
  });

  it("includes 5-minute walkthrough script", () => {
    expect(content).toMatch(/5[-\s]?Minute Walkthrough Script/i);
  });

  it("includes QA checklist", () => {
    expect(content).toMatch(/QA Checklist/i);
  });

  it("QA checklist covers source label, status label, and no save button", () => {
    expect(content).toMatch(/source label shows/i);
    expect(content).toMatch(/csv|tsv/i);
    expect(content).toMatch(/Preview only.*not saved/i);
    expect(content).toMatch(/no save\/import button/i);
  });

  it("includes partner framing bullets", () => {
    expect(content).toContain("Give us your export");
    expect(content).toContain("No API access required");
    expect(content).toContain("No write-back");
  });

  it("includes follow-up email template", () => {
    expect(content).toMatch(/Follow[-\s]?Up Email Template/i);
    expect(content).toContain("Sample export file");
    expect(content).toContain("Header definitions");
    expect(content).toContain("Units");
    expect(content).toContain("Timestamp format");
  });

  it("documents sample files", () => {
    expect(content).toContain("fixtures/sample-sensor-export-ecowitt.csv");
    expect(content).toContain("fixtures/sample-sensor-export-home-assistant.tsv");
  });

  it("includes safety guarantees section", () => {
    expect(content).toMatch(/Safety Guarantees/i);
    expect(content).toMatch(/No code changes/i);
    expect(content).toMatch(/No schema changes/i);
    expect(content).toMatch(/No writes/i);
    expect(content).toMatch(/No device control/i);
    expect(content).toMatch(/Honest source labels/i);
  });

  it("labels sample data as demo/sample explicitly", () => {
    expect(content).toMatch(/demo\/sample data/i);
    expect(content).toMatch(/No real user data/i);
  });
});
