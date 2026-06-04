import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import CsvPreviewHelpPanel from "@/components/CsvPreviewHelpPanel";
import CsvPreviewRecordingGuide, {
  RECORDING_CLOSE_LINE,
} from "@/components/CsvPreviewRecordingGuide";
import PartnerCsvPreviewLanding from "@/pages/PartnerCsvPreviewLanding";

describe("CsvPreviewHelpPanel", () => {
  it("renders preview-only / no-save / no-automation / no-device-control copy", () => {
    render(<CsvPreviewHelpPanel />);
    const bullets = screen.getByTestId("csv-preview-help-safety-bullets");
    expect(bullets).toHaveTextContent(/preview only/i);
    expect(bullets).toHaveTextContent(/nothing is saved/i);
    expect(bullets).toHaveTextContent(/not live data/i);
    expect(bullets).toHaveTextContent(/no automation/i);
    expect(bullets).toHaveTextContent(/no device control/i);
    expect(bullets).toHaveTextContent(/no alerts or action queue/i);
  });

  it("explains at least 5 flag types when expanded", () => {
    render(<CsvPreviewHelpPanel />);
    fireEvent.click(screen.getByTestId("csv-preview-help-toggle"));
    const flags = screen.getByTestId("csv-preview-help-flags");
    expect(flags).toHaveTextContent(/humidity stuck/i);
    expect(flags).toHaveTextContent(/ph out of range/i);
    expect(flags).toHaveTextContent(/ec unit/i);
    expect(flags).toHaveTextContent(/lux is not ppfd/i);
    expect(flags).toHaveTextContent(/temperature unit/i);
    expect(flags).toHaveTextContent(/date\/time parse/i);
    expect(flags).toHaveTextContent(/unmapped fields/i);
  });
});

describe("CsvPreviewRecordingGuide", () => {
  it("opens and closes", () => {
    render(<CsvPreviewRecordingGuide />);
    expect(screen.queryByTestId("csv-preview-recording-content")).toBeNull();
    fireEvent.click(screen.getByTestId("csv-preview-recording-toggle"));
    expect(screen.getByTestId("csv-preview-recording-content")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("csv-preview-recording-toggle"));
    expect(screen.queryByTestId("csv-preview-recording-content")).toBeNull();
  });

  it("contains the 90-second demo close line", () => {
    render(<CsvPreviewRecordingGuide />);
    fireEvent.click(screen.getByTestId("csv-preview-recording-toggle"));
    expect(
      screen.getByTestId("csv-preview-recording-close-line"),
    ).toHaveTextContent(RECORDING_CLOSE_LINE);
    expect(RECORDING_CLOSE_LINE).toMatch(/no api access/i);
    expect(RECORDING_CLOSE_LINE).toMatch(/no write-back/i);
    expect(RECORDING_CLOSE_LINE).toMatch(/no device control/i);
  });
});

describe("PartnerCsvPreviewLanding", () => {
  function renderPage() {
    render(
      <MemoryRouter>
        <PartnerCsvPreviewLanding />
      </MemoryRouter>,
    );
  }

  it("renders safety guarantees", () => {
    renderPage();
    const safety = screen.getByTestId("partner-csv-preview-safety");
    expect(safety).toHaveTextContent(/no api access required/i);
    expect(safety).toHaveTextContent(/no write-back/i);
    expect(safety).toHaveTextContent(/no device control/i);
    expect(safety).toHaveTextContent(/no automation/i);
    expect(safety).toHaveTextContent(/no database save/i);
    expect(safety).toHaveTextContent(/not live data/i);
  });

  it("links to /sensors/csv-preview", () => {
    renderPage();
    const cta = screen.getByTestId("partner-csv-preview-cta");
    expect(cta).toHaveAttribute("href", "/sensors/csv-preview");
  });

  it("does not contain save/import/sync/write-back claims about the preview", () => {
    renderPage();
    const main = screen.getByTestId("partner-csv-preview-landing");
    const text = main.textContent ?? "";
    expect(text).not.toMatch(/\bsave your data\b/i);
    expect(text).not.toMatch(/\bimport into verdant\b/i);
    expect(text).not.toMatch(/\bsync\b/i);
    // The phrase "write-back" only appears prefixed with "No ".
    const writeBackOccurrences = text.match(/write-back/gi) ?? [];
    const negatedWriteBack = text.match(/no write-back/gi) ?? [];
    expect(writeBackOccurrences.length).toBe(negatedWriteBack.length);
  });
});

describe("CSV preview demo enablement — static safety", () => {
  const root = resolve(__dirname, "../..");
  const files = [
    "src/components/CsvPreviewHelpPanel.tsx",
    "src/components/CsvPreviewRecordingGuide.tsx",
    "src/pages/PartnerCsvPreviewLanding.tsx",
    "src/pages/SensorCsvPreview.tsx",
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
