import { describe, it, expect } from "vitest";
import {
  buildEnvironmentSummaryPrintFilename,
  buildEnvironmentSummaryPrintMetadata,
  buildEnvironmentSummaryPrintTitle,
  PRINT_SAFETY_FOOTER,
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

  it("buildEnvironmentSummaryPrintMetadata includes range, generated date, safety footer", () => {
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
    expect(meta.title).toMatch(/Verdant/);
    expect(meta.safetyFooter).toBe(PRINT_SAFETY_FOOTER);
    expect(meta.safetyFooter).toMatch(/Read-only/);
  });

  it("buildEnvironmentSummaryPrintMetadata falls back when generatedAt is invalid", () => {
    const meta = buildEnvironmentSummaryPrintMetadata({
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      generatedAt: "not-a-date",
    });
    expect(meta.generatedAtLabel).toBe("unknown");
  });
});
