import { describe, it, expect } from "vitest";
import {
  buildEnvironmentSummaryDrilldownPrintFilename,
  buildEnvironmentSummaryDrilldownPrintTitle,
  buildEnvironmentSummaryPrintFilename,
  buildEnvironmentSummaryPrintMetadata,
  buildEnvironmentSummaryPrintTitle,
  PRINT_SAFETY_FOOTER,
  sanitizePrintFilenamePart,
} from "@/lib/environmentSummaryPrintRules";

describe("environmentSummaryPrintRules", () => {
  it("buildEnvironmentSummaryPrintFilename is deterministic", () => {
    const a = buildEnvironmentSummaryPrintFilename("2026-06-01", "2026-06-07");
    expect(a).toBe("verdant-environment-summary-2026-06-01-to-2026-06-07.pdf");
    expect(a).toBe(buildEnvironmentSummaryPrintFilename("2026-06-01", "2026-06-07"));
  });

  it("buildEnvironmentSummaryPrintFilename guards bad input", () => {
    expect(buildEnvironmentSummaryPrintFilename("", "2026-06-07")).toBe(
      "verdant-environment-summary-unknown-to-2026-06-07.pdf",
    );
    expect(
      buildEnvironmentSummaryPrintFilename(null as any, undefined as any),
    ).toBe("verdant-environment-summary-unknown-to-unknown.pdf");
  });

  it("buildEnvironmentSummaryPrintTitle includes range", () => {
    expect(buildEnvironmentSummaryPrintTitle("2026-06-01", "2026-06-07")).toBe(
      "Verdant — Environment Summary — 2026-06-01 to 2026-06-07",
    );
  });

  it("buildEnvironmentSummaryPrintMetadata returns deterministic metadata", () => {
    const meta = buildEnvironmentSummaryPrintMetadata({
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      generatedAt: new Date("2026-06-08T12:00:00Z"),
    });
    expect(meta.dateRangeLabel).toBe("2026-06-01 — 2026-06-07");
    expect(meta.generatedAtLabel).toBe("2026-06-08T12:00:00.000Z");
    expect(meta.filename).toBe(
      "verdant-environment-summary-2026-06-01-to-2026-06-07.pdf",
    );
    expect(meta.safetyFooter).toBe(PRINT_SAFETY_FOOTER);
  });

  it("buildEnvironmentSummaryPrintMetadata handles invalid generatedAt", () => {
    const meta = buildEnvironmentSummaryPrintMetadata({
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      generatedAt: "not-a-date",
    });
    expect(meta.generatedAtLabel).toBe("unknown");
  });

  it("sanitizePrintFilenamePart strips unsafe characters and lowercases", () => {
    expect(sanitizePrintFilenamePart("Source.Review")).toBe("source.review");
    expect(sanitizePrintFilenamePart("/Bad NAME//\\?<>:|*")).toBe("bad-name");
    expect(sanitizePrintFilenamePart("  multi   spaces  ")).toBe("multi-spaces");
    expect(sanitizePrintFilenamePart("")).toBe("");
    expect(sanitizePrintFilenamePart(null)).toBe("");
    expect(sanitizePrintFilenamePart(123 as any)).toBe("");
  });

  it("buildEnvironmentSummaryDrilldownPrintFilename is deterministic", () => {
    const a = buildEnvironmentSummaryDrilldownPrintFilename(
      "2026-06-01",
      "2026-06-07",
      "source.review",
    );
    expect(a).toBe(
      "verdant-environment-drilldown-2026-06-01-to-2026-06-07-source.review.pdf",
    );
    expect(a).toBe(
      buildEnvironmentSummaryDrilldownPrintFilename(
        "2026-06-01",
        "2026-06-07",
        "source.review",
      ),
    );
  });

  it("drilldown filename falls back when ruleId is missing or unsafe-only", () => {
    expect(
      buildEnvironmentSummaryDrilldownPrintFilename(
        "2026-06-01",
        "2026-06-07",
        undefined,
      ),
    ).toBe(
      "verdant-environment-drilldown-2026-06-01-to-2026-06-07-selected-issue.pdf",
    );
    expect(
      buildEnvironmentSummaryDrilldownPrintFilename(
        "2026-06-01",
        "2026-06-07",
        "////",
      ),
    ).toBe(
      "verdant-environment-drilldown-2026-06-01-to-2026-06-07-selected-issue.pdf",
    );
  });

  it("buildEnvironmentSummaryDrilldownPrintTitle includes label and range", () => {
    expect(
      buildEnvironmentSummaryDrilldownPrintTitle(
        "2026-06-01",
        "2026-06-07",
        "Source review required",
      ),
    ).toBe(
      "Verdant — Environment Drilldown — Source review required — 2026-06-01 to 2026-06-07",
    );
    expect(
      buildEnvironmentSummaryDrilldownPrintTitle(
        "2026-06-01",
        "2026-06-07",
        "",
      ),
    ).toBe(
      "Verdant — Environment Drilldown — Selected issue — 2026-06-01 to 2026-06-07",
    );
  });
});
