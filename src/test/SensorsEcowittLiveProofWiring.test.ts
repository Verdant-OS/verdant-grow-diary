/**
 * Wiring + static safety tests for mounting EcowittLiveProofPanel on the
 * Sensors operator diagnostics surface. Verified without rendering the
 * full Sensors page (which pulls a large hook graph). The behavior of the
 * panel itself is covered by EcowittLiveProofPanel.test.tsx.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/pages/Sensors.tsx"),
  "utf8",
);

describe("Sensors operator diagnostics — EcoWitt Live Proof wiring", () => {
  it("imports the EcowittLiveProofPanel", () => {
    expect(SOURCE).toMatch(
      /import\s+\{\s*EcowittLiveProofPanel\s*\}\s+from\s+["']@\/components\/EcowittLiveProofPanel["']/,
    );
  });

  it("mounts the panel inside the operator diagnostics section", () => {
    // Operator section is gated by `operator=1` URL param.
    const operatorSectionIdx = SOURCE.indexOf(
      'data-testid="sensors-operator-diagnostics"',
    );
    const panelIdx = SOURCE.indexOf("<EcowittLiveProofPanel");
    expect(operatorSectionIdx).toBeGreaterThan(-1);
    expect(panelIdx).toBeGreaterThan(operatorSectionIdx);
  });

  it("passes currently loaded sensor rows (no new query)", () => {
    // The wiring uses `trendReadings` (already loaded via useSensorReadings)
    // — it must not introduce a new Supabase call from this file.
    expect(SOURCE).toMatch(/rows=\{[\s\S]*?trendReadings[\s\S]*?\}/);
  });

  it("renders the 'currently loaded sensor rows' read-only label", () => {
    expect(SOURCE).toContain(
      "Read-only EcoWitt proof from currently loaded sensor rows.",
    );
  });

  it("mounts the EcoWitt ingest audit proof panel inside operator diagnostics", () => {
    const operatorSectionIdx = SOURCE.indexOf(
      'data-testid="sensors-operator-diagnostics"',
    );
    const auditPanelIdx = SOURCE.indexOf("<EcowittIngestAuditProofPanel");
    expect(operatorSectionIdx).toBeGreaterThan(-1);
    expect(auditPanelIdx).toBeGreaterThan(operatorSectionIdx);
  });

  it("no longer renders the legacy audit-unavailable disclaimer", () => {
    expect(SOURCE).not.toContain(
      "Accepted/rejected ingest audit counts are not shown in this view.",
    );
  });


  it("renders proof-unavailable copy when no tent rows are loaded", () => {
    expect(SOURCE).toContain(
      "Proof unavailable from currently loaded rows for this tent.",
    );
  });

  it("does not add a new Supabase write or invoke from this wiring", () => {
    // Sensors.tsx may use other read-only queries already; the wiring slice
    // must not add new write surfaces.
    expect(SOURCE).not.toMatch(/\.insert\(/);
    expect(SOURCE).not.toMatch(/\.update\(/);
    expect(SOURCE).not.toMatch(/\.delete\(/);
    expect(SOURCE).not.toMatch(/\.upsert\(/);
    expect(SOURCE).not.toMatch(/functions\.invoke\(/);
    expect(SOURCE).not.toMatch(/service_role/);
  });

  it("does not query sensor_ingest_audit_log from this page", () => {
    expect(SOURCE).not.toMatch(/sensor_ingest_audit_log/);
  });

  it("does not render raw_payload values or known secret tokens", () => {
    expect(SOURCE).not.toMatch(/raw_payload\s*\./);
    expect(SOURCE).not.toMatch(/PASSKEY/);
    expect(SOURCE).not.toMatch(/Bearer\s/);
  });
});
