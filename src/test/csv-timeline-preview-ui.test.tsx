/**
 * RepresentativeCsvPreview — timeline preview rendering.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import RepresentativeCsvPreview from "@/pages/RepresentativeCsvPreview";

function fileFromText(text: string, name = "sample.csv"): File {
  const f = new File([text], name, { type: "text/csv" });
  if (typeof (f as unknown as { text?: () => Promise<string> }).text !== "function") {
    Object.defineProperty(f, "text", { value: () => Promise.resolve(text) });
  }
  return f;
}

async function uploadCsv(text: string) {
  render(<RepresentativeCsvPreview />);
  const fileInput = screen.getByLabelText(
    /Choose representative CSV sample file/i,
  ) as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [fileFromText(text)] } });
  await screen.findByText(/Loaded: sample\.csv/i);
}

const HEADER =
  "Timestamp,Sensor,Room,Zone,Air_Temp_C,Substrate_Temp_C,Humidity_%,VPD_kPa,CO2_ppm,PPFD_umol,Substrate_VWC_%,Substrate_EC_mS/cm";

describe("RepresentativeCsvPreview — timeline preview", () => {
  it("renders the preview-only label and timeline cards for valid rows", async () => {
    const csv = [
      HEADER,
      "2026-01-01T10:00:00Z,probe-1,Room A,Zone 1,22.5,21.0,55,1.1,900,650,40,2.5",
      "2026-01-01T11:00:00Z,probe-1,Room A,Zone 1,23.0,21.2,56,1.2,920,660,41,2.6",
    ].join("\n");
    await uploadCsv(csv);
    const section = await screen.findByRole("region", { name: /timeline preview/i });
    expect(
      within(section).getByText(/Preview only — nothing is saved\./i),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/csv \/ representative sample \/ not live/i),
    ).toBeInTheDocument();
    expect(within(section).getByText("2026-01-01T10:00:00.000Z")).toBeInTheDocument();
    expect(within(section).getByText("2026-01-01T11:00:00.000Z")).toBeInTheDocument();
  });

  it("renders a 'Rows needing review' summary for invalid rows", async () => {
    const csv = [
      HEADER,
      "2026-01-01T10:00:00Z,probe-1,Room A,Zone 1,22.5,21.0,55,1.1,900,650,40,2.5",
      ",probe-1,Room A,Zone 1,22.5,21.0,55,1.1,900,650,40,2.5",
    ].join("\n");
    await uploadCsv(csv);
    const review = await screen.findByLabelText(/rows needing review/i);
    expect(within(review).getByText(/Rows needing review \(1\)/i)).toBeInTheDocument();
  });

  it("shows the empty state when no rows are timeline-ready", async () => {
    const csv = [
      HEADER,
      ",probe-1,Room A,Zone 1,22.5,21.0,55,1.1,900,650,40,2.5",
      "2026,probe-1,Room A,Zone 1,22.5,21.0,55,1.1,900,650,40,2.5",
    ].join("\n");
    await uploadCsv(csv);
    const section = await screen.findByRole("region", { name: /timeline preview/i });
    expect(
      within(section).getByText(
        /No timeline-ready rows yet\. Review required mappings and units\./i,
      ),
    ).toBeInTheDocument();
  });
});
