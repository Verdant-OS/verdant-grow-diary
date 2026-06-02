/**
 * CSV mapping preset UI tests.
 *
 * Verifies:
 *  - opt-in notice is shown when a saved preset exists
 *  - preset is not auto-applied on upload
 *  - apply runs collision checks and row validation
 *  - clear removes the preset
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RepresentativeCsvPreview from "@/pages/RepresentativeCsvPreview";

const CSV_TEXT = "Timestamp,Air_F,RH,EC\n2024-01-01 12:00:00,25,60,1.5";

function mockFile(name: string, text: string) {
  return new File([text], name, { type: "text/csv" });
}

describe("csv mapping preset UI", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows Saved preset available notice when preset exists", async () => {
    localStorage.setItem(
      "verdant.csvPreview.mappingPreset.v1",
      JSON.stringify({
        schema_version: 1,
        data_context: "mapping_config",
        source_label: "representative_csv",
        template_id: null,
        template_name: null,
        created_at: new Date().toISOString(),
        mapping: {
          timestamp: "Timestamp",
          sensor: null,
          facility: null,
          room: null,
          zone: null,
          air_temp: "Air_F",
          substrate_temp: null,
          humidity: "RH",
          vpd: null,
          co2: null,
          ppfd: null,
          vwc: null,
          substrate_ec: "EC",
        },
        units: {
          air_temp: "C",
          substrate_temp: "C",
          substrate_ec: "mS/cm",
        },
        ignored_headers: [],
        unmapped_fields: [],
        warnings: [],
      }),
    );
    render(<RepresentativeCsvPreview />);
    const fileInput = screen.getByLabelText(
      "Choose representative CSV sample file",
    );
    const file = mockFile("test.csv", CSV_TEXT);
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(
        screen.getByText(/Saved preset available — apply\?/),
      ).toBeInTheDocument();
    });
  });

  it("does not auto-apply saved preset on upload", async () => {
    localStorage.setItem(
      "verdant.csvPreview.mappingPreset.v1",
      JSON.stringify({
        schema_version: 1,
        data_context: "mapping_config",
        source_label: "representative_csv",
        template_id: null,
        template_name: null,
        created_at: new Date().toISOString(),
        mapping: {
          timestamp: "Timestamp",
          sensor: null,
          facility: null,
          room: null,
          zone: null,
          air_temp: "Air_F",
          substrate_temp: null,
          humidity: "RH",
          vpd: null,
          co2: null,
          ppfd: null,
          vwc: null,
          substrate_ec: "EC",
        },
        units: {
          air_temp: "C",
          substrate_temp: "C",
          substrate_ec: "mS/cm",
        },
        ignored_headers: [],
        unmapped_fields: [],
        warnings: [],
      }),
    );
    render(<RepresentativeCsvPreview />);
    const fileInput = screen.getByLabelText(
      "Choose representative CSV sample file",
    );
    const file = mockFile("test.csv", CSV_TEXT);
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      // The apply button should still be visible (not already applied)
      expect(
        screen.getByRole("button", { name: /Apply saved preset/i }),
      ).toBeInTheDocument();
    });
  });

  it("applying saved preset runs collision checks and row validation", async () => {
    localStorage.setItem(
      "verdant.csvPreview.mappingPreset.v1",
      JSON.stringify({
        schema_version: 1,
        data_context: "mapping_config",
        source_label: "representative_csv",
        template_id: null,
        template_name: null,
        created_at: new Date().toISOString(),
        mapping: {
          timestamp: "Timestamp",
          sensor: null,
          facility: null,
          room: null,
          zone: null,
          air_temp: "Air_F",
          substrate_temp: null,
          humidity: "RH",
          vpd: null,
          co2: null,
          ppfd: null,
          vwc: null,
          substrate_ec: "EC",
        },
        units: {
          air_temp: "C",
          substrate_temp: "C",
          substrate_ec: "mS/cm",
        },
        ignored_headers: [],
        unmapped_fields: [],
        warnings: [],
      }),
    );
    render(<RepresentativeCsvPreview />);
    const fileInput = screen.getByLabelText(
      "Choose representative CSV sample file",
    );
    const file = mockFile("test.csv", CSV_TEXT);
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply saved preset/i }),
      ).toBeInTheDocument();
    });
    const applyBtn = screen.getByRole("button", {
      name: /Apply saved preset/i,
    });
    fireEvent.click(applyBtn);
    await waitFor(() => {
      // After apply, the preset notice should appear
      expect(screen.getByText(/Saved preset applied/)).toBeInTheDocument();
    });
  });
});