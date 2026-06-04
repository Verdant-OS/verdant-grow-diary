/**
 * environment-csv-import-mounting.test — verifies the CSV Drop launcher is
 * mounted on Sensors / Timeline surfaces and that it only inserts via the
 * Confirm CTA (never on open/cancel).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import EnvironmentCsvImportLauncher from "@/components/EnvironmentCsvImportLauncher";

const insertSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (rows: unknown) => {
        insertSpy(rows);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u-1" }, session: null, loading: false, signOut: vi.fn() }),
}));

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("EnvironmentCsvImportLauncher — mounting", () => {
  it("renders calm message when no grow/tent selected (test 1, 6)", () => {
    render(
      withQuery(
        <EnvironmentCsvImportLauncher growId={null} tentId={null} testIdPrefix="x" />,
      ),
    );
    expect(screen.getByTestId("x-needs-context").textContent).toMatch(
      /Select a grow and tent before importing CSV data\./,
    );
  });

  it("renders the card CTA with copy when context is ready (tests 1, 2)", () => {
    render(
      withQuery(
        <EnvironmentCsvImportLauncher
          growId="g1"
          tentId="t1"
          testIdPrefix="sensors-csv-launcher"
        />,
      ),
    );
    expect(screen.getByTestId("sensors-csv-launcher-card")).toBeTruthy();
    expect(screen.getAllByText(/Import historical data/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Data is read-only and source-tagged as CSV/i)).toBeTruthy();
  });

  it("clicking the CTA opens the CSV modal (tests 3, 5)", () => {
    render(
      withQuery(
        <EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />,
      ),
    );
    fireEvent.click(screen.getByTestId("x-button"));
    expect(screen.getByTestId("csv-import-modal")).toBeTruthy();
  });

  it("opening modal does not insert (tests 8, 9)", () => {
    insertSpy.mockClear();
    render(
      withQuery(
        <EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />,
      ),
    );
    fireEvent.click(screen.getByTestId("x-button"));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("compact variant renders the Import CSV button (test 4)", () => {
    render(
      withQuery(
        <EnvironmentCsvImportLauncher
          growId="g1"
          tentId="t1"
          variant="compact"
          testIdPrefix="timeline-csv-launcher"
        />,
      ),
    );
    expect(screen.getByTestId("timeline-csv-launcher-button").textContent).toMatch(/Import CSV/);
  });

  it("Confirm CTA is the only insert path; payload uses source = csv (tests 10, 11, 12)", async () => {
    insertSpy.mockClear();
    render(
      withQuery(
        <EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />,
      ),
    );
    fireEvent.click(screen.getByTestId("x-button"));
    // upload a simple valid CSV with explicit Celsius header
    const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
    const file = new File(
      ["Timestamp,Temperature (C),RH (%)\n2026-06-01T10:00:00Z,25,50\n"],
      "e.csv",
      { type: "text/csv" },
    );
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryByTestId("csv-import-preview")).toBeTruthy());
    expect(insertSpy).not.toHaveBeenCalled(); // parsing/preview never inserts
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    const rows = (insertSpy.mock.calls[0]?.[0] ?? []) as Array<{
      source: string;
      raw_payload: { source_tag: string };
    }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.source === "csv")).toBe(true);
    expect(rows.every((r) => r.raw_payload.source_tag === "csv")).toBe(true);
  });

  it("Cancel does not insert (test 8)", async () => {
    insertSpy.mockClear();
    render(
      withQuery(
        <EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />,
      ),
    );
    fireEvent.click(screen.getByTestId("x-button"));
    const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
    const file = new File(
      ["Timestamp,Temperature (C),RH (%)\n2026-06-01T10:00:00Z,25,50\n"],
      "e.csv",
      { type: "text/csv" },
    );
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryByTestId("csv-import-preview")).toBeTruthy());
    fireEvent.click(screen.getByTestId("csv-import-cancel"));
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("EnvironmentCsvImportLauncher — static safety scan (tests 28-35)", () => {
  it("launcher source has no forbidden runtime strings", () => {
    const raw = readFileSync(
      resolve(__dirname, "../components/EnvironmentCsvImportLauncher.tsx"),
      "utf8",
    );
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/action_queue/i);
    expect(src).not.toMatch(/from\(['"]alerts['"]\)/i);
    expect(src).not.toMatch(/automation/i);
    expect(src).not.toMatch(/device.?control/i);
    expect(src).not.toMatch(/bridge.?token/i);
    expect(src).not.toMatch(new RegExp("switch" + "bot", "i"));
    expect(src.toLowerCase()).not.toMatch(/"live"|'live'|live vpd/);
  });
});
