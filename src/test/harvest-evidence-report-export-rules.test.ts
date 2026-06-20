/**
 * Pure tests for the Harvest Evidence Report export helpers.
 *
 * No DOM, no fetch, no Supabase. Confirms deterministic title/filename,
 * safe scope label (never includes ids), and metadata composition.
 */
import { describe, it, expect } from "vitest";

import {
  buildHarvestEvidenceReportExportFilename,
  buildHarvestEvidenceReportExportMetadata,
  buildHarvestEvidenceReportExportTitle,
  buildHarvestEvidenceReportGeneratedAtLabel,
  buildHarvestEvidenceReportScopeLabel,
  HARVEST_EVIDENCE_REPORT_EXPORT_FOOTER,
} from "@/lib/harvestEvidenceReportExportRules";
import {
  buildHarvestEvidenceReport,
  type HarvestEvidenceReportPlantInput,
} from "@/lib/harvestEvidenceReportViewModel";

const NOW = new Date("2026-06-18T12:34:56.789Z");

describe("harvestEvidenceReportExportRules", () => {
  it("builds an ISO-date filename", () => {
    expect(buildHarvestEvidenceReportExportFilename(NOW)).toBe(
      "verdant-harvest-evidence-report-2026-06-18.pdf",
    );
  });

  it("builds a deterministic title", () => {
    expect(buildHarvestEvidenceReportExportTitle(NOW)).toBe(
      "Verdant — Harvest Evidence Report — 2026-06-18",
    );
  });

  it("builds a UTC ISO generated-at label without milliseconds", () => {
    expect(buildHarvestEvidenceReportGeneratedAtLabel(NOW)).toBe(
      "2026-06-18T12:34:56Z",
    );
  });

  it("falls back to a generic scope label for empty report", () => {
    expect(buildHarvestEvidenceReportScopeLabel(null)).toBe(
      "All plants in current view",
    );
    expect(
      buildHarvestEvidenceReportScopeLabel(
        buildHarvestEvidenceReport([]),
      ),
    ).toBe("All plants in current view");
  });

  it("uses plant names only (no ids) in scope label", () => {
    const inputs: HarvestEvidenceReportPlantInput[] = [
      { plantId: "secret-plant-id-1", plantName: "Sour Diesel", rows: [] },
      { plantId: "secret-plant-id-2", plantName: "Northern Lights", rows: [] },
    ];
    const report = buildHarvestEvidenceReport(inputs);
    const label = buildHarvestEvidenceReportScopeLabel(report);
    expect(label).not.toMatch(/secret-plant-id/);
    expect(label).toMatch(/Sour Diesel/);
    expect(label).toMatch(/Northern Lights/);
  });

  it("collapses long scope lists", () => {
    const inputs: HarvestEvidenceReportPlantInput[] = Array.from(
      { length: 7 },
      (_, i) => ({ plantId: `p${i}`, plantName: `Plant ${i}`, rows: [] }),
    );
    const report = buildHarvestEvidenceReport(inputs);
    const label = buildHarvestEvidenceReportScopeLabel(report);
    expect(label).toMatch(/\+\d+ more$/);
  });

  it("metadata bundles all required fields including footer", () => {
    const meta = buildHarvestEvidenceReportExportMetadata(
      buildHarvestEvidenceReport([
        { plantId: "p1", plantName: "Sour Diesel", rows: [] },
      ]),
      NOW,
    );
    expect(meta.title).toBe("Verdant — Harvest Evidence Report — 2026-06-18");
    expect(meta.filename).toBe(
      "verdant-harvest-evidence-report-2026-06-18.pdf",
    );
    expect(meta.scopeLabel).toBe("Sour Diesel");
    expect(meta.generatedAtLabel).toBe("2026-06-18T12:34:56Z");
    expect(meta.footer).toBe(HARVEST_EVIDENCE_REPORT_EXPORT_FOOTER);
  });
});
