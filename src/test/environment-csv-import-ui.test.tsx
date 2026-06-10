import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";

function makeFile(text: string, name = "export.csv"): File {
  return new File([text], name, { type: "text/csv" });
}

async function uploadCsv(text: string, name?: string) {
  const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [makeFile(text, name)] });
  fireEvent.change(input);
  await waitFor(() => {
    expect(
      screen.queryByTestId("csv-import-preview") ||
        screen.queryByTestId("csv-import-unit-confirm") ||
        screen.queryByTestId("csv-import-error"),
    ).toBeTruthy();
  });
}

describe("EnvironmentCsvImportModal UI", () => {
  it("entry screen renders (test 19)", () => {
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={async () => ({ insertedCount: 0, error: null })}
      />,
    );
    expect(screen.getByTestId("csv-import-entry")).toBeTruthy();
    expect(screen.getByText(/Import historical data/i)).toBeTruthy();
    expect(screen.getByText(/Spider Farmer, AC Infinity, or other environment CSV/i)).toBeTruthy();
    expect(screen.getByText(/Data is read-only and source-tagged/i)).toBeTruthy();
  });

  it("unit confirm renders only when ambiguous (test 21)", async () => {
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={async () => ({ insertedCount: 0, error: null })}
      />,
    );
    await uploadCsv(
      "Timestamp,Temperature,RH\n2026-06-01T10:00:00Z,25,50\n",
    );
    expect(screen.getByTestId("csv-import-unit-confirm")).toBeTruthy();
    fireEvent.click(screen.getByTestId("csv-import-unit-c"));
    expect(screen.getByTestId("csv-import-preview")).toBeTruthy();
  });

  it("coverage preview shows stats (test 22)", async () => {
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={async () => ({ insertedCount: 0, error: null })}
      />,
    );
    await uploadCsv("Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n");
    expect(screen.getByTestId("csv-import-valid-count").textContent).toBe("1");
    expect(screen.getByTestId("csv-import-days")).toBeTruthy();
  });

  it("Spider Farmer preview shows CO2 and PPFD when present", async () => {
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={async () => ({ insertedCount: 0, error: null })}
      />,
    );
    await uploadCsv(
      "deviceSerialnum,temperature(°C),humidity,vpd,temperature(°F),co2,Timestamp,ppfd\n" +
        "80F1B2B452B8,25.7,52.4,1.57,78.3,775,2026-05-31 19:00:00,925\n",
    );
    const preview = screen.getByTestId("csv-import-row-preview");
    expect(preview.textContent).toContain("25.7°C");
    expect(preview.textContent).toContain("52%");
    expect(preview.textContent).toContain("1.57 kPa VPD");
    expect(preview.textContent).toContain("775 ppm CO₂");
    expect(preview.textContent).toContain("925 PPFD");
  });

  it("partial success banner renders when rows skipped (test 23)", async () => {
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={async () => ({ insertedCount: 0, error: null })}
      />,
    );
    await uploadCsv(
      "Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\nbad,25,50\n",
    );
    expect(screen.getByTestId("csv-import-partial-banner")).toBeTruthy();
  });

  it("confirm is the only insert path; cancel does not insert (tests 24, 25)", async () => {
    const onConfirm = vi.fn(async () => ({ insertedCount: 1, error: null }));
    const { unmount } = render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    );
    await uploadCsv("Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n");
    fireEvent.click(screen.getByTestId("csv-import-cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
    unmount();

    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    );
    await uploadCsv("Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n");
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("wrong file type renders error copy", async () => {
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={async () => ({ insertedCount: 0, error: null })}
      />,
    );
    await uploadCsv("hi", "notes.txt");
    expect(screen.getByTestId("csv-import-error").textContent).toMatch(
      /not a CSV/i,
    );
  });
});

describe("EnvironmentCsvImportModal — source safety scan (test 32, 40-44)", () => {
  it("source code contains no restricted keys or write paths outside confirm", () => {
    const raw = readFileSync(
      resolve(__dirname, "../components/EnvironmentCsvImportModal.tsx"),
      "utf8",
    );
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/action_queue/i);
    expect(src).not.toMatch(/\balerts\b/i);
    expect(src).not.toMatch(new RegExp("switch" + "bot", "i"));
    expect(src).not.toMatch(/device.?control/i);
    expect(src).not.toMatch(/\bautomation\b/i);
    expect(src).not.toMatch(/\bscheduler\b/i);
  });
});
