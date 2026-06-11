/**
 * EnvironmentSummaryReport UI tests.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EnvironmentSummaryReport from "@/components/EnvironmentSummaryReport";
import { buildEnvironmentCheckDiaryViewModel } from "@/lib/environmentCheckViewModel";
import { buildEnvironmentSummaryReportViewModel } from "@/lib/environmentSummaryReportViewModel";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error("Supabase client must not be touched by presenter UI");
      },
    },
  ),
}));

function mkVm(id: string, source: string) {
  return buildEnvironmentCheckDiaryViewModel({
    entryId: id,
    occurredAt: "2026-06-11T12:00:00Z",
    kind: "environment",
    snapshot: { source, tempC: 24, rhPercent: 60 },
  });
}

describe("EnvironmentSummaryReport", () => {
  it("renders empty state when there are no checks", () => {
    const report = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks: [],
    });
    render(<EnvironmentSummaryReport report={report} />);
    expect(screen.getByTestId("env-report-empty")).toBeTruthy();
    expect(screen.getByTestId("environment-summary-report").getAttribute("data-total-checks")).toBe("0");
  });

  it("renders status counts and source breakdown", () => {
    const checks = [
      mkVm("a", "live"),
      mkVm("b", "manual"),
      mkVm("c", "stale"),
      mkVm("d", "bogus"),
    ];
    const report = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks,
    });
    render(<EnvironmentSummaryReport report={report} />);
    expect(screen.getByTestId("env-report-status-valid").getAttribute("data-count")).toBe(
      String(report.statusCounts.valid),
    );
    expect(screen.getByTestId("env-report-status-invalid").getAttribute("data-count")).toBe(
      String(report.statusCounts.invalid),
    );
    expect(screen.getByTestId("env-report-source-live").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("env-report-source-stale").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("env-report-source-invalid").getAttribute("data-count")).toBe("1");
  });

  it("renders DST-ambiguous count separately from valid", () => {
    const dstVm = buildEnvironmentCheckDiaryViewModel({
      entryId: "z",
      occurredAt: "2026-06-11T12:00:00Z",
      kind: "environment",
      snapshot: {
        source: "live",
        ppfdSamples: [
          { ts: "2026-03-08T09:00:00Z", ppfd: 200, source: "live" },
          { ts: "2026-03-09T00:00:00Z", ppfd: 200, source: "live" },
        ],
        tzIana: "America/Los_Angeles",
      },
    });
    const report = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      checks: [dstVm],
    });
    render(<EnvironmentSummaryReport report={report} />);
    expect(screen.getByTestId("env-report-status-dst_ambiguous").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("env-report-status-valid").getAttribute("data-count")).toBe("0");
  });

  it("does not include device-control copy", () => {
    const checks = [mkVm("a", "live"), mkVm("b", "bogus")];
    const report = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks,
    });
    const { container } = render(<EnvironmentSummaryReport report={report} />);
    const txt = container.textContent ?? "";
    expect(txt).not.toMatch(/apply fix|send command|auto[- ]adjust|execute/i);
  });
});
