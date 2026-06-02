/**
 * CSV preview UI — render checks for validation hints.
 *
 * Verifies the page renders invalid-timestamp rows instead of hiding them,
 * shows canonical field names in hints, and surfaces duplicate canonical
 * mapping warnings above the preview table.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import RepresentativeCsvPreview from "@/pages/RepresentativeCsvPreview";

function fileFromText(text: string, name = "sample.csv"): File {
  return new File([text], name, { type: "text/csv" });
}

async function uploadCsv(text: string) {
  render(<RepresentativeCsvPreview />);
  const fileInput = screen.getByLabelText(
    /Choose representative CSV sample file/i,
  ) as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [fileFromText(text)] } });
  // Let async file.text() resolve.
  await screen.findByText(/Loaded: sample\.csv/i);
}

describe("RepresentativeCsvPreview — validation hint rendering", () => {
  it("renders an invalid-timestamp row instead of hiding it", async () => {
    const csv = [
      "Timestamp,Air_Temp_C,Humidity_%",
      "bad-date,24,55",
    ].join("\n");
    await uploadCsv(csv);
    // The row is still rendered (row #1 cell present), and the blocked
    // notice is shown.
    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(
      screen.getByText(/Blocked from canonical preview/i),
    ).toBeInTheDocument();
  });

  it("shows canonical field names in hint copy", async () => {
    const csv = [
      "Timestamp,Air_Temp_C,Humidity_%",
      "2026-05-01T10:00:00Z,24,100",
    ].join("\n");
    await uploadCsv(csv);
    expect(
      await screen.findByText(/humidity — header "Humidity_%" value "100"/i),
    ).toBeInTheDocument();
  });

  it("renders duplicate canonical mapping warning above the table", async () => {
    const csv = [
      "Timestamp,Temp",
      "2026-05-01T10:00:00Z,24",
    ].join("\n");
    await uploadCsv(csv);
    // Map both Air Temp and Substrate Temp to "Temp" via the mapping UI.
    const subTempSelect = screen.getByLabelText(
      /Map Substrate temperature/i,
    ) as HTMLSelectElement;
    const airTempSelect = screen.getByLabelText(
      /Map Air temperature/i,
    ) as HTMLSelectElement;
    fireEvent.change(airTempSelect, { target: { value: "Temp" } });
    fireEvent.change(subTempSelect, { target: { value: "Temp" } });
    expect(
      await screen.findByText(/Duplicate canonical mapping/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/multiple canonical fields: air_temp, substrate_temp/i),
    ).toBeInTheDocument();
  });
});
