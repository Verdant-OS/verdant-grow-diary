import { describe, it, expect } from "vitest";
import { buildEnvironmentCheckDiaryViewModel } from "@/lib/environmentCheckViewModel";
import { buildEnvironmentSummaryReportViewModel } from "@/lib/environmentSummaryReportViewModel";
import {
  PDF_SAFETY_FOOTER,
  buildEnvironmentSummaryPdfFilename,
  buildEnvironmentSummaryPdfPayload,
} from "@/lib/environmentSummaryPdfRules";

function mk(id: string, source: string) {
  return buildEnvironmentCheckDiaryViewModel({
    entryId: id,
    occurredAt: "2026-06-11T12:00:00Z",
    kind: "environment",
    snapshot: { source, tempC: 24, rhPercent: 60 },
  });
}

describe("buildEnvironmentSummaryPdfFilename", () => {
  it("is deterministic", () => {
    expect(buildEnvironmentSummaryPdfFilename("2026-06-01", "2026-06-07")).toBe(
      "verdant-environment-summary-2026-06-01-to-2026-06-07.pdf",
    );
    expect(buildEnvironmentSummaryPdfFilename("2026-06-01", "2026-06-07")).toBe(
      buildEnvironmentSummaryPdfFilename("2026-06-01", "2026-06-07"),
    );
  });
  it("falls back to 'unknown' for bad input", () => {
    expect(buildEnvironmentSummaryPdfFilename("bad", "2026-06-07")).toBe(
      "verdant-environment-summary-unknown-to-2026-06-07.pdf",
    );
  });
});

describe("buildEnvironmentSummaryPdfPayload", () => {
  it("includes date range, safety footer, and sections", () => {
    const report = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      checks: [mk("a", "live"), mk("b", "stale")],
    });
    const payload = buildEnvironmentSummaryPdfPayload({
      report,
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      now: new Date("2026-06-08T00:00:00Z"),
    });
    expect(payload.dateRangeLabel).toBe("2026-06-01 — 2026-06-07");
    expect(payload.safetyFooter).toBe(PDF_SAFETY_FOOTER);
    expect(payload.filename).toBe(
      "verdant-environment-summary-2026-06-01-to-2026-06-07.pdf",
    );
    expect(payload.title).toMatch(/Verdant/);
    expect(payload.generatedAtLabel).toBe("2026-06-08T00:00:00.000Z");
    expect(payload.sections.find((s) => s.heading === "Status counts")).toBeTruthy();
    expect(payload.sections.find((s) => s.heading === "Source counts")).toBeTruthy();
  });

  it("includes selected drilldown section when issue is selected", () => {
    const report = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      checks: [mk("a", "stale"), mk("b", "stale")],
    });
    const selected = report.topIssues[0];
    const payload = buildEnvironmentSummaryPdfPayload({
      report,
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      selectedIssueId: selected.ruleId,
    });
    expect(payload.selectedIssue?.ruleId).toBe(selected.ruleId);
    expect(
      payload.sections.some((s) => s.heading.startsWith("Selected issue:")),
    ).toBe(true);
  });
});
