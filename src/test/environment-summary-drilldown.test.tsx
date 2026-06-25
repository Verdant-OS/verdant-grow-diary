import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EnvironmentIssueDrilldown from "@/components/EnvironmentIssueDrilldown";
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

function invalidVm(id: string) {
  return buildEnvironmentCheckDiaryViewModel({
    entryId: id,
    occurredAt: "2026-06-11T12:00:00Z",
    kind: "environment",
    snapshot: { source: "bogus", tempC: 24, rhPercent: 60 },
  });
}

function dstVm(id: string) {
  return buildEnvironmentCheckDiaryViewModel({
    entryId: id,
    occurredAt: "2026-03-08T12:00:00Z",
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
}

describe("EnvironmentIssueDrilldown", () => {
  it("highlights selected issue label and lists related entries", () => {
    const checks = [staleVm("e1"), staleVm("e2")];
    const report = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks,
    });
    const issue = report.topIssues.find((i) => i.ruleId === "source.review")!;
    expect(issue.relatedEntryIds.sort()).toEqual(["e1", "e2"]);
    render(<EnvironmentIssueDrilldown issue={issue} relatedChecks={checks} />);
    expect(screen.getByTestId("env-issue-drilldown-selected").textContent).toMatch(
      /Selected:/,
    );
    expect(screen.getByTestId("env-issue-drilldown-row-e1")).toBeTruthy();
    expect(screen.getByTestId("env-issue-drilldown-row-e2")).toBeTruthy();
  });

  it("renders DST review-first copy, not a success", () => {
    const c = dstVm("e1");
    const report = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      checks: [c],
    });
    const issue = report.topIssues.find((i) => i.ruleId === "light.dli")!;
    render(<EnvironmentIssueDrilldown issue={issue} relatedChecks={[c]} />);
    expect(screen.getByTestId("env-issue-drilldown-warning-e1").textContent).toMatch(
      /DST-ambiguous window — review before acting/,
    );
  });

  it("renders invalid copy that says not to use data for decisions", () => {
    const c = invalidVm("e1");
    const report = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks: [c],
    });
    const issue = report.topIssues.find((i) => i.ruleId === "source.invalid")!;
    render(<EnvironmentIssueDrilldown issue={issue} relatedChecks={[c]} />);
    expect(screen.getByTestId("env-issue-drilldown-warning-e1").textContent).toMatch(
      /do not use for decisions/,
    );
  });

  it("renders empty drilldown state without crashing", () => {
    const checks = [staleVm("e1")];
    const report = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks,
    });
    const issue = report.topIssues[0];
    render(<EnvironmentIssueDrilldown issue={issue} relatedChecks={[]} />);
    expect(screen.getByTestId("env-issue-drilldown-empty")).toBeTruthy();
  });
});
