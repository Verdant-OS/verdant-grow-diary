import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CsvPreviewReviewGate } from "@/components/CsvPreviewReviewGate";
import {
  parseDelimitedSensorPreview,
  type CsvPreviewParseResult,
} from "@/lib/csvSensorPreviewRules";

function parse(text: string, fileName = "ecowitt.csv"): CsvPreviewParseResult {
  return parseDelimitedSensorPreview(text, { fileName, delimiter: "," });
}

const CSV_CLEAN = [
  "timestamp,temperature,humidity",
  "2026-06-01T10:00:00Z,22.5,55",
  "2026-06-01T10:05:00Z,22.6,56",
  "2026-06-01T10:10:00Z,22.7,57",
].join("\n");

describe("CSV Import Review UI (plan summary)", () => {
  it("renders accepted/blocked/duplicates/ignored counts and write-draft count", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows={true}
      />,
    );
    expect(screen.getByTestId("csv-import-plan-summary")).toBeInTheDocument();
    expect(screen.getByTestId("csv-import-plan-accepted")).toHaveTextContent(/Accepted: \d+/);
    expect(screen.getByTestId("csv-import-plan-blocked")).toHaveTextContent(/Blocked: \d+/);
    expect(screen.getByTestId("csv-import-plan-duplicates")).toHaveTextContent(
      /Duplicates skipped: \d+/,
    );
    expect(screen.getByTestId("csv-import-plan-ignored")).toHaveTextContent(/Ignored columns: \d+/);
    expect(screen.getByTestId("csv-import-plan-write-drafts")).toHaveTextContent(
      /Sensor write drafts: \d+/,
    );
  });

  it("renders metric breakdown and date range from real preview parsing", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows={true}
      />,
    );
    expect(screen.getByTestId("csv-import-plan-metric-temperature")).toBeInTheDocument();
    expect(screen.getByTestId("csv-import-plan-metric-humidity")).toBeInTheDocument();
    expect(screen.getByTestId("csv-import-plan-date-range").textContent).toMatch(
      /2026-06-01T10:00:00\.000Z/,
    );
  });

  it("renders exactly one diary summary draft preview", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows={true}
      />,
    );
    const cards = screen.getAllByTestId("csv-import-plan-diary-summary-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toMatch(/Imported \d+ sensor reading/);
  });

  it("renders blocked-reason chips when rows are blocked", () => {
    const bad = [
      "timestamp,temperature",
      "not-a-date,22.5",
      "2010-01-01T00:00:00Z,22.6",
    ].join("\n");
    render(
      <CsvPreviewReviewGate
        previewResult={parse(bad)}
        hasHardBlockedRows={false}
        hasAcceptedRows={true}
      />,
    );
    expect(screen.getByTestId("csv-import-plan-blocked-reasons")).toBeInTheDocument();
    expect(
      screen.getByTestId("csv-import-plan-block-unparseable_captured_at"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("csv-import-plan-block-captured_at_before_2020"),
    ).toBeInTheDocument();
  });

  it("CTA remains disabled even with full clean input + confirmation", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows={true}
      />,
    );
    fireEvent.change(screen.getByTestId("csv-gate-grow-id"), { target: { value: "g1" } });
    fireEvent.change(screen.getByTestId("csv-gate-tent-id"), { target: { value: "t1" } });
    fireEvent.click(screen.getByTestId("csv-gate-confirm"));
    const btn = screen.getByTestId("csv-gate-save-button");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("data-writes-enabled")).toBe("false");
  });
});
