/**
 * CSV Preview Report + Flag Explanation polish — UI + PDF + warning copy tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import SensorCsvPreview from "@/pages/SensorCsvPreview";
import {
  buildCsvPreviewReportPdfBytes,
} from "@/lib/csvSensorPreviewPdf";
import {
  buildCsvPreview,
  parseDelimitedSensorPreview,
} from "@/lib/csvSensorPreviewRules";
import {
  CSV_PREVIEW_WARNING_COPY,
  FUTURE_DIARY_CONVERSION_COPY,
} from "@/lib/csvSensorPreviewWarningCopy";

const FIXED_NOW = "2026-06-04T12:00:00.000Z";
const ECOWITT_CSV = readFileSync(
  resolve(__dirname, "../../fixtures/sample-sensor-export-ecowitt.csv"),
  "utf8",
);
const HA_TSV = readFileSync(
  resolve(__dirname, "../../fixtures/sample-sensor-export-home-assistant.tsv"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Warning copy
// ---------------------------------------------------------------------------

describe("CSV preview warning copy", () => {
  const codes = [
    "humidity_stuck",
    "ph_out_of_range",
    "ec_unit_ambiguous",
    "lux_not_ppfd",
    "temp_unit_ambiguous",
    "vwc_stuck",
  ] as const;

  it.each(codes)("%s has title/whyItMatters/suggestedFix/severity", (code) => {
    const c = CSV_PREVIEW_WARNING_COPY[code];
    expect(c.title.length).toBeGreaterThan(3);
    expect(c.whyItMatters.length).toBeGreaterThan(10);
    expect(c.suggestedFix.length).toBeGreaterThan(10);
    expect(["warn", "error"]).toContain(c.severity);
  });

  it("humidity_stuck suggested fix mentions placement/battery/connection/mapping", () => {
    expect(CSV_PREVIEW_WARNING_COPY.humidity_stuck.suggestedFix).toMatch(
      /placement|battery|connection|mapping/i,
    );
  });
  it("ph_out_of_range suggested fix mentions units/calibration", () => {
    expect(CSV_PREVIEW_WARNING_COPY.ph_out_of_range.suggestedFix).toMatch(
      /units?|calibration/i,
    );
  });
  it("ec_unit_ambiguous suggested fix mentions mS/cm", () => {
    expect(CSV_PREVIEW_WARNING_COPY.ec_unit_ambiguous.suggestedFix).toMatch(/mS\/cm/i);
  });
  it("lux_not_ppfd suggested fix mentions PPFD/PAR", () => {
    expect(CSV_PREVIEW_WARNING_COPY.lux_not_ppfd.suggestedFix).toMatch(/ppfd|par/i);
  });
  it("temp_unit_ambiguous suggested fix mentions Fahrenheit/Celsius", () => {
    expect(CSV_PREVIEW_WARNING_COPY.temp_unit_ambiguous.suggestedFix).toMatch(
      /fahrenheit|celsius/i,
    );
  });
});

// ---------------------------------------------------------------------------
// PDF builder — bytes + content
// ---------------------------------------------------------------------------

function pdfText(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

describe("buildCsvPreviewReportPdfBytes", () => {
  it("produces a valid PDF header and EOF marker", () => {
    const preview = buildCsvPreview(ECOWITT_CSV, "ecowitt.csv");
    const bytes = buildCsvPreviewReportPdfBytes(preview, { generatedAt: FIXED_NOW });
    const txt = pdfText(bytes);
    expect(txt.startsWith("%PDF-1.")).toBe(true);
    expect(txt).toContain("%%EOF");
  });

  it("includes filename, source_type, generated_at, report_version, status", () => {
    const preview = buildCsvPreview(ECOWITT_CSV, "ecowitt.csv");
    const txt = pdfText(buildCsvPreviewReportPdfBytes(preview, { generatedAt: FIXED_NOW }));
    expect(txt).toContain("ecowitt.csv");
    expect(txt).toContain("source_type: csv");
    expect(txt).toContain(FIXED_NOW);
    expect(txt).toContain("csv_preview_v1");
    expect(txt).toContain("Preview only");
  });

  it("source_type is tsv for tab-delimited input", () => {
    const preview = parseDelimitedSensorPreview(HA_TSV, { fileName: "ha.tsv" });
    const txt = pdfText(buildCsvPreviewReportPdfBytes(preview, { generatedAt: FIXED_NOW }));
    expect(txt).toContain("source_type: tsv");
  });

  it("includes warnings with suggested fixes and Safe-by-Design copy", () => {
    const preview = buildCsvPreview(ECOWITT_CSV, "ecowitt.csv");
    const txt = pdfText(buildCsvPreviewReportPdfBytes(preview, { generatedAt: FIXED_NOW }));
    expect(txt).toMatch(/Humidity reading looks stuck/);
    expect(txt).toMatch(/Suggested fix/);
    expect(txt).toMatch(/Safe-by-Design/);
    expect(txt).toMatch(/No automation/);
    expect(txt).toMatch(/No device control/);
    expect(txt).toMatch(/No alerts/);
    expect(txt).toMatch(/No Action Queue/);
  });

  it("does not include raw full sensor rows, secrets, tokens, user IDs, or internal IDs", () => {
    const preview = buildCsvPreview(ECOWITT_CSV, "ecowitt.csv");
    const txt = pdfText(buildCsvPreviewReportPdfBytes(preview, { generatedAt: FIXED_NOW }));
    // Raw rows would include sensor row timestamps from the fixture.
    expect(txt).not.toContain("2026-06-01T08:00:00Z");
    expect(txt).not.toContain("SUSPICIOUS_humidity_stuck_at_100");
    expect(txt).not.toMatch(/\buser_id\b/i);
    expect(txt).not.toMatch(/\bauthorization\b/i);
    expect(txt).not.toMatch(/\bbearer\b/i);
    expect(txt).not.toMatch(/\bsecret\b/i);
    expect(txt).not.toMatch(/\bservice_role\b/i);
    expect(txt).not.toMatch(/\binternal_id\b/i);
    expect(txt).not.toMatch(/\bbridge[_-]?token\b/i);
  });
});

// ---------------------------------------------------------------------------
// Page UI — buttons + flag rendering + disabled diary CTA
// ---------------------------------------------------------------------------

function makeFile(text: string, name = "ecowitt.csv", type = "text/csv") {
  return new File([text], name, { type });
}

function dropFile(file: File) {
  const dropzone = screen.getByTestId("csv-preview-dropzone");
  fireEvent.drop(dropzone, {
    dataTransfer: { files: [file], items: [], types: ["Files"] },
  });
}

function stubBlobUrl() {
  (URL as unknown as { createObjectURL?: (b: Blob) => string }).createObjectURL =
    (() => "blob:mock") as (b: Blob) => string;
  (URL as unknown as { revokeObjectURL?: (s: string) => void }).revokeObjectURL =
    (() => {}) as (s: string) => void;
  const createSpy = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:mock");
  const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  return { createSpy, revokeSpy, clickSpy };
}

describe("SensorCsvPreview — three download buttons + warnings + diary CTA", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("fetch must not be called from CSV preview");
    }));
  });

  it("renders the three download buttons after dropping a CSV", async () => {
    render(<SensorCsvPreview />);
    dropFile(makeFile(ECOWITT_CSV));
    await waitFor(() => {
      expect(screen.getByTestId("csv-preview-download-report")).toBeInTheDocument();
    });
    expect(screen.getByTestId("csv-preview-download-csv-summary")).toBeInTheDocument();
    expect(screen.getByTestId("csv-preview-download-pdf")).toBeInTheDocument();
  });

  it("JSON download triggers a local Blob and no network", async () => {
    render(<SensorCsvPreview />);
    dropFile(makeFile(ECOWITT_CSV));
    await waitFor(() =>
      expect(screen.getByTestId("csv-preview-download-report")).toBeInTheDocument(),
    );
    const { createSpy, clickSpy, revokeSpy } = stubBlobUrl();
    fireEvent.click(screen.getByTestId("csv-preview-download-report"));
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect((createSpy.mock.calls[0][0] as Blob).type).toBe("application/json");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    createSpy.mockRestore();
    clickSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it("CSV Summary download produces a text/csv Blob", async () => {
    render(<SensorCsvPreview />);
    dropFile(makeFile(ECOWITT_CSV));
    await waitFor(() =>
      expect(screen.getByTestId("csv-preview-download-csv-summary")).toBeInTheDocument(),
    );
    const { createSpy, clickSpy, revokeSpy } = stubBlobUrl();
    fireEvent.click(screen.getByTestId("csv-preview-download-csv-summary"));
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect((createSpy.mock.calls[0][0] as Blob).type).toBe("text/csv");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    createSpy.mockRestore();
    clickSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it("PDF download produces an application/pdf Blob", async () => {
    render(<SensorCsvPreview />);
    dropFile(makeFile(ECOWITT_CSV));
    await waitFor(() =>
      expect(screen.getByTestId("csv-preview-download-pdf")).toBeInTheDocument(),
    );
    const { createSpy, clickSpy, revokeSpy } = stubBlobUrl();
    fireEvent.click(screen.getByTestId("csv-preview-download-pdf"));
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect((createSpy.mock.calls[0][0] as Blob).type).toBe("application/pdf");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    createSpy.mockRestore();
    clickSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it("renders flag explanations with Why-it-matters and Suggested-fix copy", async () => {
    render(<SensorCsvPreview />);
    dropFile(makeFile(ECOWITT_CSV));
    await waitFor(() =>
      expect(screen.getByTestId("csv-preview-flag-humidity_stuck")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("csv-preview-flag-why-humidity_stuck")).toHaveTextContent(
      /Why it matters/i,
    );
    expect(screen.getByTestId("csv-preview-flag-fix-humidity_stuck")).toHaveTextContent(
      /Suggested fix/i,
    );
    expect(screen.getByTestId("csv-preview-flag-severity-humidity_stuck")).toHaveTextContent(
      /error/i,
    );
  });

  it("renders ph_out_of_range, ec_unit_ambiguous, and lux_not_ppfd warnings for HA TSV", async () => {
    render(<SensorCsvPreview />);
    dropFile(makeFile(HA_TSV, "ha.tsv", "text/tab-separated-values"));
    await waitFor(() =>
      expect(screen.getByTestId("csv-preview-flag-ph_out_of_range")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("csv-preview-flag-fix-ph_out_of_range")).toHaveTextContent(
      /units?|calibration/i,
    );
    expect(screen.getByTestId("csv-preview-flag-fix-ec_unit_ambiguous")).toHaveTextContent(
      /mS\/cm/i,
    );
    expect(screen.getByTestId("csv-preview-flag-fix-lux_not_ppfd")).toHaveTextContent(
      /ppfd|par/i,
    );
  });

  it("renders the disabled diary-conversion CTA (no writes)", async () => {
    render(<SensorCsvPreview />);
    dropFile(makeFile(ECOWITT_CSV));
    await waitFor(() =>
      expect(screen.getByTestId("csv-preview-diary-cta")).toBeInTheDocument(),
    );
    const btn = screen.getByTestId("csv-preview-diary-cta") as HTMLButtonElement;
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-disabled", "true");
    const wrapper = screen.getByTestId("csv-preview-diary-cta-wrapper");
    expect(wrapper).toHaveTextContent(FUTURE_DIARY_CONVERSION_COPY);
    // Clicking a disabled button must not do anything observable.
    fireEvent.click(btn);
  });
});

// ---------------------------------------------------------------------------
// Static safety — new/edited files
// ---------------------------------------------------------------------------

describe("CSV preview polish — static safety", () => {
  const root = resolve(__dirname, "../..");
  const files = [
    "src/components/CsvSensorPreviewPanel.tsx",
    "src/lib/csvSensorPreviewPdf.ts",
    "src/lib/csvSensorPreviewWarningCopy.ts",
  ];
  const FORBIDDEN: RegExp[] = [
    /\bfetch\s*\(/,
    /functions\.invoke/,
    /\.\s*(insert|update|upsert|delete|rpc)\s*\(/,
    /@\/integrations\/supabase/,
    /\bsupabase\s*\./,
    /from\s*\(\s*['"]alerts['"]/,
    /from\s*\(\s*['"]action_queue['"]/,
    /\baction_queue\b/,
    /\bXMLHttpRequest\b/,
    /\bnavigator\.sendBeacon\b/,
    /ai_doctor/i,
  ];
  it.each(files)("%s has no forbidden surfaces", (path) => {
    const src = readFileSync(resolve(root, path), "utf8");
    for (const re of FORBIDDEN) {
      expect(src, `${path} matched ${re}`).not.toMatch(re);
    }
  });
});
