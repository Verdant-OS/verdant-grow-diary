import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CsvPreviewReviewGate } from "@/components/CsvPreviewReviewGate";
import {
  parseDelimitedSensorPreview,
  type CsvPreviewParseResult,
} from "@/lib/csvSensorPreviewRules";

function parse(text: string, fileName = "ecowitt.csv"): CsvPreviewParseResult {
  return parseDelimitedSensorPreview(text, { fileName, delimiter: "," });
}

const FIXED_NOW = new Date("2026-06-04T12:00:00.000Z");

const CSV_CLEAN_MANY = [
  "timestamp,temperature",
  ...Array.from({ length: 15 }, (_, i) =>
    `2026-06-01T10:${String(i).padStart(2, "0")}:00Z,${22 + i * 0.1}`,
  ),
].join("\n");

const CSV_BAD = [
  "timestamp,temperature",
  "not-a-date,22.5",
  "also-bad,22.6",
  "still-bad,22.7",
  "broken,22.8",
  "2010-01-01T00:00:00Z,22.9",
].join("\n");

describe("CSV Import Review UI v2", () => {
  describe("diary draft target controls", () => {
    it("renders diary date picker and exact draft fields", () => {
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN_MANY)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      expect(screen.getByTestId("csv-gate-diary-date")).toBeInTheDocument();
      expect(screen.getByTestId("csv-import-plan-diary-draft-fields")).toBeInTheDocument();
      expect(screen.getByTestId("diary-field-grow_id")).toBeInTheDocument();
      expect(screen.getByTestId("diary-field-tent_id")).toBeInTheDocument();
      expect(screen.getByTestId("diary-field-occurred_at")).toBeInTheDocument();
      expect(screen.getByTestId("diary-field-source")).toHaveTextContent("csv");
      expect(screen.getByTestId("diary-field-status")).toHaveTextContent(/review-only/);
    });

    it("changing diary date updates the diary draft occurred_at in-memory only", () => {
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN_MANY)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      const before = screen.getByTestId("diary-field-occurred_at").textContent;
      fireEvent.change(screen.getByTestId("csv-gate-diary-date"), { target: { value: "2026-07-15T09:30" } });
      const after = screen.getByTestId("diary-field-occurred_at").textContent;
      expect(after).not.toBe(before);
      expect(after).toMatch(/2026-07-15T09:30/);
    });

    it("existing-entry attach mode is disabled when no existing entries are provided", () => {
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN_MANY)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      const radio = screen.getByTestId("csv-gate-attach-existing") as HTMLInputElement;
      expect(radio.disabled).toBe(true);
      expect(screen.getByTestId("csv-gate-attach-existing-disabled-copy")).toHaveTextContent(
        /Existing diary entry attach is not available in preview mode/,
      );
    });

    it("does not call fetch when diary date / attach mode change", () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
        throw new Error("fetch should not be called");
      }) as never);
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN_MANY)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      fireEvent.change(screen.getByTestId("csv-gate-diary-date"), { target: { value: "2026-07-15T09:30" } });
      fireEvent.click(screen.getByTestId("csv-gate-attach-new"));
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe("sensor write draft preview (expandable)", () => {
    it("collapsed by default with grouped count copy", () => {
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN_MANY)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      expect(screen.getByTestId("csv-gate-sensor-sample-collapsed")).toBeInTheDocument();
      expect(screen.queryByTestId("csv-gate-sensor-sample-list")).not.toBeInTheDocument();
    });

    it("expand toggle reveals a capped sample (≤10 rows) with safe fields", () => {
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN_MANY)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      fireEvent.click(screen.getByTestId("csv-gate-toggle-sensor-sample"));
      const list = screen.getByTestId("csv-gate-sensor-sample-list");
      expect(Number(list.getAttribute("data-sample-count"))).toBeLessThanOrEqual(10);
      const first = screen.getByTestId("csv-gate-sensor-sample-item-0");
      expect(first.textContent).toMatch(/temperature/);
      expect(first.textContent).toMatch(/src=csv/);
      expect(first.textContent).toMatch(/quality=ok/);
      // Raw payload not dumped
      expect(first.textContent).not.toMatch(/raw_payload/);
      // "Sample only" notice
      expect(screen.getByText(/Sample only\. Nothing has been saved\./)).toBeInTheDocument();
    });

    it("Save CTA remains disabled after expanding sample", () => {
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN_MANY)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      fireEvent.click(screen.getByTestId("csv-gate-toggle-sensor-sample"));
      expect(screen.getByTestId("csv-gate-save-button")).toBeDisabled();
    });
  });

  describe("blocked-row details by reason group", () => {
    it("renders groups with count, fix, and capped samples (≤3 per group)", () => {
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_BAD)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      const group = screen.getByTestId("csv-import-plan-blocked-group-unparseable_captured_at");
      expect(group).toBeInTheDocument();
      expect(within(group).getByTestId("csv-import-plan-blocked-count-unparseable_captured_at")).toHaveTextContent("4");
      expect(within(group).getByTestId("csv-import-plan-blocked-fix-unparseable_captured_at")).toHaveTextContent(/ISO-8601/);
      const samples = within(group).getByTestId("csv-import-plan-blocked-samples-unparseable_captured_at");
      expect(Number(samples.getAttribute("data-sample-count"))).toBeLessThanOrEqual(3);
    });

    it("renders explanations for old-date group", () => {
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_BAD)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      const g = screen.getByTestId("csv-import-plan-blocked-group-captured_at_before_2020");
      expect(g.textContent).toMatch(/before 2020|too old/i);
    });
  });

  describe("download import plan", () => {
    beforeEach(() => {
      (globalThis as unknown as { URL: typeof URL }).URL.createObjectURL = vi.fn(() => "blob:fake");
      (globalThis as unknown as { URL: typeof URL }).URL.revokeObjectURL = vi.fn();
    });
    afterEach(() => vi.restoreAllMocks());

    it("renders the Download Import Plan button", () => {
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN_MANY)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      expect(screen.getByTestId("csv-gate-download-plan")).toBeInTheDocument();
    });

    it("clicking Download triggers a local Blob/object URL (no network)", () => {
      const createObjectURL = (globalThis as unknown as { URL: typeof URL }).URL.createObjectURL as ReturnType<typeof vi.fn>;
      render(
        <CsvPreviewReviewGate previewResult={parse(CSV_CLEAN_MANY)} hasHardBlockedRows={false} hasAcceptedRows now={FIXED_NOW} />,
      );
      fireEvent.click(screen.getByTestId("csv-gate-download-plan"));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const arg = createObjectURL.mock.calls[0][0];
      expect(arg).toBeInstanceOf(Blob);
      expect((arg as Blob).type).toBe("application/json");
    });
  });
});
