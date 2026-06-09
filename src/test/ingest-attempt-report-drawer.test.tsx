import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import IngestAttemptReportDrawer from "@/components/IngestAttemptReportDrawer";
import { buildIngestAttemptReport } from "@/lib/ingestAttemptReportRules";

describe("IngestAttemptReportDrawer", () => {
  it("renders empty state when no report is provided", () => {
    render(
      <IngestAttemptReportDrawer
        open
        onOpenChange={() => undefined}
        report={null}
      />,
    );
    expect(
      screen.getByTestId("ingest-attempt-report-drawer-empty"),
    ).toBeInTheDocument();
  });

  it("opens with latest accepted report", () => {
    const report = buildIngestAttemptReport({
      url: "https://example/x",
      token: "vbt_abcdef1234567890",
      response: { status: 202 },
    });
    render(
      <IngestAttemptReportDrawer
        open
        onOpenChange={() => undefined}
        report={report}
      />,
    );
    expect(
      screen.getByTestId("ingest-attempt-report-panel"),
    ).toHaveAttribute("data-status", "accepted");
  });

  it("opens with rejected report and reasons", () => {
    const report = buildIngestAttemptReport({
      url: "https://example/x",
      token: "vbt_abcdef1234567890",
      response: { status: 422, body: "reading is stale" },
    });
    render(
      <IngestAttemptReportDrawer
        open
        onOpenChange={() => undefined}
        report={report}
      />,
    );
    expect(screen.getByTestId("ingest-attempt-reasons")).toHaveTextContent(
      /stale timestamp/,
    );
  });

  it("dry-run state says no network/write occurred", () => {
    const report = buildIngestAttemptReport({
      url: "https://example/x",
      token: "vbt_abcdef1234567890",
      dryRun: true,
    });
    render(
      <IngestAttemptReportDrawer
        open
        onOpenChange={() => undefined}
        report={report}
      />,
    );
    expect(
      screen.getByTestId("ingest-attempt-storage-notice"),
    ).toHaveTextContent(/Nothing was stored/i);
  });

  it("copy uses redacted payload only", () => {
    const report = buildIngestAttemptReport({
      url: "https://example/x",
      token: "vbt_abcdef1234567890",
      response: { status: 202 },
    });
    const onCopy = vi.fn();
    render(
      <IngestAttemptReportDrawer
        open
        onOpenChange={() => undefined}
        report={report}
        onCopy={onCopy}
      />,
    );
    screen.getByTestId("ingest-attempt-copy").click();
    expect(onCopy).toHaveBeenCalled();
    const arg = onCopy.mock.calls[0][0] as string;
    expect(arg).not.toContain("vbt_abcdef1234567890");
    expect(arg).toMatch(/redacted/);
  });

  it("does not import db/write helpers", async () => {
    const src = (await import("node:fs")).readFileSync(
      "src/components/IngestAttemptReportDrawer.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
  });
});
