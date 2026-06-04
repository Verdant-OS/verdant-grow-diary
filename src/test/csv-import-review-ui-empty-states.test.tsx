import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CsvPreviewReviewGate } from "@/components/CsvPreviewReviewGate";
import {
  parseDelimitedSensorPreview,
  type CsvPreviewParseResult,
} from "@/lib/csvSensorPreviewRules";

function parse(text: string, fileName = "ecowitt.csv"): CsvPreviewParseResult {
  return parseDelimitedSensorPreview(text, { fileName, delimiter: "," });
}

const FIXED_NOW = new Date("2026-06-04T12:00:00.000Z");

const CSV_CLEAN = [
  "timestamp,temperature",
  "2026-06-01T10:00:00Z,22.5",
  "2026-06-01T10:05:00Z,22.6",
].join("\n");

const CSV_ALL_BAD = [
  "timestamp,temperature",
  "not-a-date,22.5",
  "still-bad,22.6",
].join("\n");

describe("CSV Import Review UI v2 — empty-state polish", () => {
  it("diary attach: shows preview-mode empty copy when no existing entries", () => {
    render(
      <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
    );
    const copy = screen.getByTestId("csv-gate-attach-existing-disabled-copy");
    expect(copy).toHaveTextContent(/Existing diary entry attach is not available in preview mode/);
    expect(copy).toHaveTextContent(/single diary summary draft that would be created later/);
    expect(copy).toHaveTextContent(/No diary entry is created from this screen/);
    expect(screen.getByTestId("csv-gate-save-button")).toBeDisabled();
  });

  it("sensor sample: shows empty copy when zero accepted drafts exist", () => {
    // All rows blocked → 0 accepted drafts but plan still renders
    render(
      <CsvPreviewReviewGate previewResult={parse(CSV_ALL_BAD)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
    );
    const empty = screen.getByTestId("csv-gate-sensor-sample-empty");
    expect(empty).toHaveTextContent(/No accepted sensor write drafts to preview/);
    expect(empty).toHaveTextContent(/Fix mappings or blocked rows first/);
    expect(empty).toHaveTextContent(/Nothing has been saved/);
    // Toggle button disabled when nothing to expand
    expect(screen.getByTestId("csv-gate-toggle-sensor-sample")).toBeDisabled();
    expect(screen.getByTestId("csv-gate-save-button")).toBeDisabled();
  });

  it("blocked rows: shows calm empty copy when none are blocked", () => {
    render(
      <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
    );
    const empty = screen.getByTestId("csv-import-plan-blocked-empty");
    expect(empty).toHaveTextContent(/No blocked rows detected/);
    expect(empty).toHaveTextContent(/Verdant still requires review before any future import/);
    expect(screen.getByTestId("csv-gate-save-button")).toBeDisabled();
  });
});
