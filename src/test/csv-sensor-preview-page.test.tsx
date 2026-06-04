import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SensorCsvPreview from "@/pages/SensorCsvPreview";

/**
 * Static safety guard: the page and its panel must not contain any I/O,
 * write, or device-control surfaces.
 */
const PAGE_SRC = readFileSync(
  resolve(__dirname, "../pages/SensorCsvPreview.tsx"),
  "utf8",
);
const PANEL_SRC = readFileSync(
  resolve(__dirname, "../components/CsvSensorPreviewPanel.tsx"),
  "utf8",
);
const RULES_SRC = readFileSync(
  resolve(__dirname, "../lib/csvSensorPreviewRules.ts"),
  "utf8",
);

describe("SensorCsvPreview — static safety", () => {
  const FORBIDDEN = [
    /\bfetch\s*\(/,
    /functions\.invoke/,
    /from\s*\(\s*['"][^'"]+['"]\s*\)\s*\.\s*(insert|update|upsert|delete|rpc)\b/,
    /supabase/i,
    /action_queue/i,
    /alerts\b/i,
  ];
  it.each([
    ["page", PAGE_SRC],
    ["panel", PANEL_SRC],
    ["rules", RULES_SRC],
  ])("%s has no forbidden surfaces", (_name, src) => {
    for (const re of FORBIDDEN) {
      expect(src).not.toMatch(re);
    }
  });
});

describe("SensorCsvPreview — UI", () => {
  beforeEach(() => {
    // Belt-and-braces: ensure no fetch can run during this test.
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("fetch must not be called from CSV preview");
    }));
  });

  function makeFile(text: string, name = "sample.csv") {
    return new File([text], name, { type: "text/csv" });
  }

  it("renders Safe-by-Design copy and source/status labels", async () => {
    render(<SensorCsvPreview />);
    expect(screen.getByTestId("csv-preview-safety-banner")).toHaveTextContent(
      /preview only/i,
    );
    expect(screen.getByTestId("csv-preview-safety-banner")).toHaveTextContent(
      /not live data/i,
    );
    expect(screen.getByTestId("csv-preview-safety-banner")).toHaveTextContent(
      /no automation/i,
    );
  });

  it("parses a dropped CSV, shows source=csv, status, and mapping", async () => {
    render(<SensorCsvPreview />);
    const dropzone = screen.getByTestId("csv-preview-dropzone");
    const csv =
      "timestamp,temperature,humidity,Lux\n2026-06-01T10:00,24.1,55,20000\n2026-06-01T11:00,24.5,54,20500\n";
    const file = makeFile(csv);
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file], items: [], types: ["Files"] },
    });

    await waitFor(() => {
      expect(screen.getByTestId("csv-preview-source-label")).toHaveTextContent(
        /csv/i,
      );
    });
    expect(screen.getByTestId("csv-preview-status-label")).toHaveTextContent(
      /preview only — not saved/i,
    );
    expect(screen.getByTestId("csv-preview-row-count")).toHaveTextContent(
      /2 rows/,
    );

    // Lux remains unmapped
    expect(screen.getByTestId("csv-preview-unmapped-Lux")).toBeInTheDocument();
    // Lux flagged
    expect(screen.getByTestId("csv-preview-flag-lux_not_ppfd")).toBeInTheDocument();
    // Timeline preview rendered
    expect(screen.getByTestId("csv-preview-timeline")).toBeInTheDocument();
  });

  it("shows a safe error state for empty CSV", async () => {
    render(<SensorCsvPreview />);
    const dropzone = screen.getByTestId("csv-preview-dropzone");
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeFile("")], items: [], types: ["Files"] },
    });
    await waitFor(() => {
      expect(screen.getByTestId("csv-preview-error")).toBeInTheDocument();
    });
  });
});
