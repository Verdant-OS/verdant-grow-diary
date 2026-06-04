import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SensorCsvPreview from "@/pages/SensorCsvPreview";

/**
 * Static safety guard: page, panel, and rules must not contain any I/O,
 * write, AI, alert, action-queue, or device-control surfaces.
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
  const FORBIDDEN: RegExp[] = [
    /\bfetch\s*\(/,
    /functions\.invoke/,
    /\.\s*(insert|update|upsert|delete|rpc)\s*\(/,
    /@\/integrations\/supabase/,
    /\bsupabase\s*\./,
    /from\s*\(\s*['"]alerts['"]/,
    /from\s*\(\s*['"]action_queue['"]/,
    /\bXMLHttpRequest\b/,
    /\bnavigator\.sendBeacon\b/,
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
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("fetch must not be called from CSV preview");
    }));
  });

  function makeFile(text: string, name = "sample.csv", type = "text/csv") {
    return new File([text], name, { type });
  }

  function dropFile(file: File) {
    const dropzone = screen.getByTestId("csv-preview-dropzone");
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file], items: [], types: ["Files"] },
    });
  }

  it("renders Safe-by-Design copy and source/status labels", () => {
    render(<SensorCsvPreview />);
    const banner = screen.getByTestId("csv-preview-safety-banner");
    expect(banner).toHaveTextContent(/preview only/i);
    expect(banner).toHaveTextContent(/not live data/i);
    expect(banner).toHaveTextContent(/no automation/i);
  });

  it("parses a dropped CSV, shows source=csv, status, and mapping", async () => {
    render(<SensorCsvPreview />);
    const csv =
      "timestamp,temperature,humidity,Lux\n2026-06-01T10:00,24.1,55,20000\n2026-06-01T11:00,24.5,54,20500\n";
    dropFile(makeFile(csv));

    await waitFor(() => {
      expect(screen.getByTestId("csv-preview-source-label")).toHaveTextContent(/csv/i);
    });
    expect(screen.getByTestId("csv-preview-status-label")).toHaveTextContent(
      /preview only — not saved/i,
    );
    expect(screen.getByTestId("csv-preview-delimiter-label")).toHaveTextContent(/csv preview/i);
    expect(screen.getByTestId("csv-preview-row-count")).toHaveTextContent(/2 rows/);
    expect(screen.getByTestId("csv-preview-unmapped-Lux")).toBeInTheDocument();
    expect(screen.getByTestId("csv-preview-flag-lux_not_ppfd")).toBeInTheDocument();
    expect(screen.getByTestId("csv-preview-timeline")).toBeInTheDocument();
  });

  it("parses a dropped TSV and labels source=tsv", async () => {
    render(<SensorCsvPreview />);
    const tsv =
      "timestamp\ttemperature\thumidity\n2026-06-01T10:00\t24.1\t55\n2026-06-01T11:00\t24.5\t54\n";
    dropFile(makeFile(tsv, "sample.tsv", "text/tab-separated-values"));

    await waitFor(() => {
      expect(screen.getByTestId("csv-preview-source-label")).toHaveTextContent(/tsv/i);
    });
    expect(screen.getByTestId("csv-preview-delimiter-label")).toHaveTextContent(/tsv preview/i);
    expect(screen.getByTestId("csv-preview-status-label")).toHaveTextContent(
      /preview only — not saved/i,
    );
    // Source label must never become "Live".
    expect(screen.getByTestId("csv-preview-source-label")).not.toHaveTextContent(/live/i);
  });

  it("shows a safe error state for empty CSV", async () => {
    render(<SensorCsvPreview />);
    dropFile(makeFile(""));
    await waitFor(() => {
      expect(screen.getByTestId("csv-preview-error")).toBeInTheDocument();
    });
  });

  it("download report triggers a local Blob/object URL (no network)", async () => {
    render(<SensorCsvPreview />);
    const csv =
      "timestamp,temperature\n2026-06-01T10:00,24.1\n2026-06-01T11:00,24.5\n";
    dropFile(makeFile(csv));

    await waitFor(() => {
      expect(screen.getByTestId("csv-preview-download-report")).toBeInTheDocument();
    });

    // jsdom does not implement URL.createObjectURL/revokeObjectURL by default.
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

    fireEvent.click(screen.getByTestId("csv-preview-download-report"));

    expect(createSpy).toHaveBeenCalledTimes(1);
    const blob = createSpy.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("renders mapping override controls per header", async () => {
    render(<SensorCsvPreview />);
    const csv = "timestamp,temperature\n2026-06-01T10:00,24.1\n";
    dropFile(makeFile(csv));

    await waitFor(() => {
      expect(
        screen.getByTestId("csv-preview-override-trigger-timestamp"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("csv-preview-override-trigger-temperature"),
    ).toBeInTheDocument();
  });

  it("renders timeline controls (window + sampling)", async () => {
    render(<SensorCsvPreview />);
    const csv = "timestamp,temperature\n2026-06-01T10:00,24.1\n";
    dropFile(makeFile(csv));
    await waitFor(() => {
      expect(screen.getByTestId("csv-preview-timeline-controls")).toBeInTheDocument();
    });
    expect(screen.getByTestId("csv-preview-window-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("csv-preview-sampling-trigger")).toBeInTheDocument();
  });
});
