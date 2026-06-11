import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EnvironmentSummaryPrintCoverPage from "@/components/EnvironmentSummaryPrintCoverPage";
import { buildEnvironmentCheckDiaryViewModel } from "@/lib/environmentCheckViewModel";
import { buildEnvironmentSummaryReportViewModel } from "@/lib/environmentSummaryReportViewModel";

function staleVm(id: string) {
  return buildEnvironmentCheckDiaryViewModel({
    entryId: id,
    occurredAt: "2026-06-11T12:00:00Z",
    kind: "environment",
    snapshot: { source: "stale", tempC: 24, rhPercent: 60 },
  });
}

function buildReport() {
  return buildEnvironmentSummaryReportViewModel({
    startDate: "2026-06-01",
    endDate: "2026-06-07",
    checks: [staleVm("a"), staleVm("b")],
  });
}

describe("EnvironmentSummaryPrintCoverPage", () => {
  it("renders title, fallback grower/greenhouse, range, generated, top issues, safety", () => {
    render(
      <EnvironmentSummaryPrintCoverPage
        dateRangeLabel="2026-06-01 — 2026-06-07"
        generatedAtLabel="2026-06-08T12:00:00.000Z"
        report={buildReport()}
      />,
    );
    expect(screen.getByText("Environment Summary Report")).toBeTruthy();
    expect(
      screen.getByTestId("env-report-print-cover-page-grower").textContent,
    ).toBe("Grower not specified");
    expect(
      screen.getByTestId("env-report-print-cover-page-greenhouse").textContent,
    ).toBe("Greenhouse not specified");
    expect(
      screen.getByTestId("env-report-print-cover-page-range").textContent,
    ).toBe("2026-06-01 — 2026-06-07");
    expect(
      screen.getByTestId("env-report-print-cover-page-generated").textContent,
    ).toBe("2026-06-08T12:00:00.000Z");
    const topIssues = screen.getByTestId(
      "env-report-print-cover-page-top-issues",
    );
    expect(topIssues.textContent).toMatch(/source/i);
    const safety = screen.getByTestId(
      "env-report-print-cover-page-safety",
    );
    expect(safety.textContent ?? "").toMatch(/Read-only/);
    expect(safety.textContent ?? "").toMatch(/no device control/i);
  });

  it("uses provided grower and greenhouse names when present", () => {
    render(
      <EnvironmentSummaryPrintCoverPage
        growerName="  Ada  "
        greenhouseName="Tent A"
        dateRangeLabel="2026-06-01 — 2026-06-07"
        generatedAtLabel="2026-06-08T12:00:00.000Z"
        report={buildReport()}
      />,
    );
    expect(
      screen.getByTestId("env-report-print-cover-page-grower").textContent,
    ).toBe("Ada");
    expect(
      screen.getByTestId("env-report-print-cover-page-greenhouse").textContent,
    ).toBe("Tent A");
  });

  it("shows selected issue label in drilldown mode", () => {
    render(
      <EnvironmentSummaryPrintCoverPage
        dateRangeLabel="2026-06-01 — 2026-06-07"
        generatedAtLabel="2026-06-08T12:00:00.000Z"
        report={buildReport()}
        mode="drilldown"
        selectedIssueLabel="Source review required"
      />,
    );
    expect(
      screen.getByTestId("env-report-print-cover-page-issue").textContent,
    ).toBe("Source review required");
  });
});
