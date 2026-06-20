import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IngestAttemptReportPanel from "@/components/IngestAttemptReportPanel";
import { buildIngestAttemptReport } from "@/lib/ingestAttemptReportRules";

const URL = "https://example.supabase.co/functions/v1/sensor-ingest-webhook";
const TOKEN = "vbt_abcdef1234567890";

describe("IngestAttemptReportPanel", () => {
  it("renders accepted state", () => {
    const report = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      tentId: "t-1",
      response: { status: 202, body: "ok" },
      metricKeys: ["temp_f", "humidity_pct"],
    });
    render(<IngestAttemptReportPanel report={report} />);
    expect(screen.getByTestId("ingest-attempt-report-panel")).toHaveAttribute(
      "data-status",
      "accepted",
    );
    expect(screen.getByText(/Accepted by Verdant ingest/i)).toBeInTheDocument();
    expect(screen.getByTestId("ingest-attempt-metrics")).toHaveTextContent("temp_f");
  });

  it("renders rejected state with reasons", () => {
    const report = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      response: { status: 422, body: "reading is stale" },
    });
    render(<IngestAttemptReportPanel report={report} />);
    expect(screen.getByTestId("ingest-attempt-reasons")).toHaveTextContent("stale timestamp");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders dry-run state with no-store copy", () => {
    const report = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      dryRun: true,
    });
    render(<IngestAttemptReportPanel report={report} />);
    expect(screen.getByTestId("ingest-attempt-storage-notice")).toHaveTextContent(
      /Nothing was stored/i,
    );
    expect(screen.queryByTestId("ingest-attempt-http")).toBeNull();
  });

  it("renders unknown response safely", () => {
    const report = buildIngestAttemptReport({ url: URL, token: TOKEN });
    render(<IngestAttemptReportPanel report={report} />);
    expect(screen.getByTestId("ingest-attempt-report-panel")).toHaveAttribute(
      "data-status",
      "unknown_response",
    );
  });

  it("redacts the bridge token", () => {
    const report = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      response: { status: 202 },
    });
    render(<IngestAttemptReportPanel report={report} />);
    expect(screen.getByTestId("ingest-attempt-auth").textContent).not.toContain(TOKEN);
    expect(screen.getByTestId("ingest-attempt-auth").textContent).toMatch(/redacted/);
  });

  it("copy button emits redacted JSON only", () => {
    const report = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      response: { status: 202 },
    });
    const onCopy = vi.fn();
    render(<IngestAttemptReportPanel report={report} onCopy={onCopy} />);
    fireEvent.click(screen.getByTestId("ingest-attempt-copy"));
    expect(onCopy).toHaveBeenCalledOnce();
    const arg = onCopy.mock.calls[0][0] as string;
    expect(arg).not.toContain(TOKEN);
    expect(arg).toMatch(/redacted/);
  });

  it("does not import db/write helpers", async () => {
    const src = (
      await import("node:fs")
    ).readFileSync("src/components/IngestAttemptReportPanel.tsx", "utf8");
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
    expect(src).not.toMatch(/action_queue/i);
    expect(src).not.toMatch(/service[_-]?role/i);
  });
});
