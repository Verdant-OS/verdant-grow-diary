/**
 * sensors-csv-import-regression — hardened regression coverage for the
 * CSV sensor import surface on the Sensor Data page.
 *
 * Scope (test-only):
 *  1. Label/copy: CSV launcher reads as imported/historical CSV — never live.
 *  2. Raw/private fields: launcher render never leaks raw_payload, secrets,
 *     tokens, bridge credentials, passkeys, API keys, or MAC addresses.
 *  3. Mixed-row CSV validation: invalid rows are skipped/flagged via the
 *     existing modal preview, valid rows still preview, no crash.
 *  4. Sensors page source-level smoke: CSV anchor + launcher still mounted
 *     alongside the manual-reading + bridge-health panels and not relabeled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  useAuth: () => ({
    user: { id: "u-1" },
    session: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const SENSORS_SRC = readFileSync(
  resolve(__dirname, "../pages/Sensors.tsx"),
  "utf8",
);
const LAUNCHER_SRC = readFileSync(
  resolve(__dirname, "../components/EnvironmentCsvImportLauncher.tsx"),
  "utf8",
);

// -----------------------------------------------------------------------
// 1. CSV label/copy regression
// -----------------------------------------------------------------------

describe("CSV import — label/copy regression", () => {
  beforeEach(() => insertSpy.mockClear());

  it("launcher card copy reads as imported CSV context, never live", () => {
    render(
      withQuery(
        <EnvironmentCsvImportLauncher
          growId="g1"
          tentId="t1"
          testIdPrefix="sensors-csv-import"
        />,
      ),
    );
    const card = screen.getByTestId("sensors-csv-import-card");
    const text = (card.textContent ?? "").toLowerCase();

    expect(text).toMatch(/csv/);
    expect(text).toMatch(/historical|read-only|source-tagged|import/);

    // Must never imply live / real-time / current hardware status.
    expect(text).not.toMatch(/\blive\b/);
    expect(text).not.toMatch(/real[\s-]?time/);
    expect(text).not.toMatch(/live telemetry/);
    expect(text).not.toMatch(/active telemetry/);
    expect(text).not.toMatch(/currently connected/);
    expect(text).not.toMatch(/connected device/);
  });

  it("CTA button label does not claim live/current sensor activity", () => {
    render(
      withQuery(
        <EnvironmentCsvImportLauncher
          growId="g1"
          tentId="t1"
          testIdPrefix="sensors-csv-import"
        />,
      ),
    );
    const btn = screen.getByTestId("sensors-csv-import-button");
    const label = (btn.textContent ?? "").toLowerCase();
    expect(label).not.toMatch(/\blive\b/);
    expect(label).not.toMatch(/real[\s-]?time/);
  });
});

// -----------------------------------------------------------------------
// 2. Raw/private field regression
// -----------------------------------------------------------------------

describe("CSV import — raw/private field regression", () => {
  it("launcher render never leaks raw_payload / secrets / private identifiers", () => {
    const { container } = render(
      withQuery(
        <EnvironmentCsvImportLauncher
          growId="g1"
          tentId="t1"
          testIdPrefix="sensors-csv-import"
        />,
      ),
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/raw_payload/i);
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/api[_-]?key/i);
    expect(text).not.toMatch(/bridge[_-]?token/i);
    expect(text).not.toMatch(/passkey/i);
    expect(text).not.toMatch(/bearer\s+[A-Za-z0-9._-]{8,}/);
    // MAC address (colon-separated hex bytes)
    expect(text).not.toMatch(/[0-9a-f]{2}(:[0-9a-f]{2}){5}/i);
    // Long opaque JWT-like / token-like sequences
    expect(text).not.toMatch(/[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  });

  it("launcher source has no token/secret/private-id wording", () => {
    const stripped = LAUNCHER_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(
      /\/\/.*$/gm,
      "",
    );
    expect(stripped).not.toMatch(/service_role/i);
    expect(stripped).not.toMatch(/api[_-]?key/i);
    expect(stripped).not.toMatch(/bridge[_-]?token/i);
    expect(stripped).not.toMatch(/passkey/i);
  });
});

// -----------------------------------------------------------------------
// 3. Mixed valid/invalid CSV row validation regression
// -----------------------------------------------------------------------

describe("CSV import — mixed valid/invalid row validation", () => {
  beforeEach(() => insertSpy.mockClear());

  it("previews valid rows, flags invalid rows as skipped, never inserts on preview", async () => {
    render(
      withQuery(
        <EnvironmentCsvImportLauncher
          growId="g1"
          tentId="t1"
          testIdPrefix="sensors-csv-import"
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("sensors-csv-import-button"));

    const input = screen.getByTestId(
      "csv-import-file-input",
    ) as HTMLInputElement;

    // Two valid rows + three invalid rows:
    //   - missing timestamp
    //   - non-numeric temperature
    //   - empty row
    const csv = [
      "Timestamp,Temperature (C),RH (%)",
      "2026-06-01T10:00:00Z,25,50",
      "2026-06-01T10:05:00Z,24.5,52",
      ",24,50", // missing timestamp
      "2026-06-01T10:10:00Z,not-a-number,55", // non-numeric temp
      ",,", // empty
    ].join("\n");

    const file = new File([csv], "mixed.csv", { type: "text/csv" });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() =>
      expect(screen.queryByTestId("csv-import-preview")).toBeTruthy(),
    );

    const valid = Number(
      screen.getByTestId("csv-import-valid-count").textContent ?? "0",
    );
    const skipped = Number(
      screen.getByTestId("csv-import-skipped-count").textContent ?? "0",
    );

    expect(valid).toBeGreaterThan(0);
    expect(skipped).toBeGreaterThan(0);

    // Preview must never insert.
    expect(insertSpy).not.toHaveBeenCalled();

    // Preview must not relabel CSV as live or claim hardware connection.
    const previewText = (
      screen.getByTestId("csv-import-preview").textContent ?? ""
    ).toLowerCase();
    expect(previewText).not.toMatch(/\blive\b/);
    expect(previewText).not.toMatch(/real[\s-]?time/);
  });

  it("an all-invalid CSV does not crash the component and inserts nothing", async () => {
    render(
      withQuery(
        <EnvironmentCsvImportLauncher
          growId="g1"
          tentId="t1"
          testIdPrefix="sensors-csv-import"
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("sensors-csv-import-button"));

    const input = screen.getByTestId(
      "csv-import-file-input",
    ) as HTMLInputElement;
    const csv = [
      "Timestamp,Temperature (C),RH (%)",
      ",,",
      ",not-a-number,",
    ].join("\n");
    const file = new File([csv], "bad.csv", { type: "text/csv" });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    // Either preview shows 0 valid rows, or an error phase renders.
    // In both cases the modal stays mounted and no insert occurs.
    await waitFor(() => {
      const preview = screen.queryByTestId("csv-import-preview");
      const error = screen.queryByTestId("csv-import-error");
      expect(preview || error).toBeTruthy();
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// 4. Sensors page source-level smoke (complements existing anchor test)
// -----------------------------------------------------------------------

describe("Sensor Data page — CSV import smoke (source-level)", () => {
  it("keeps the CSV import anchor + launcher mounted alongside other panels", () => {
    expect(SENSORS_SRC).toMatch(/id="csv-import"/);
    expect(SENSORS_SRC).toMatch(/data-testid="sensors-csv-import-anchor"/);
    expect(SENSORS_SRC).toMatch(/<EnvironmentCsvImportLauncher/);
    expect(SENSORS_SRC).toMatch(
      /from\s+["']@\/components\/EnvironmentCsvImportLauncher["']/,
    );
    // Surrounding panels still present.
    expect(SENSORS_SRC).toMatch(/data-testid="sensors-manual-reading-anchor"/);
    expect(SENSORS_SRC).toMatch(/<SensorBridgeHealthCard/);
  });

  it("Sensors page source never relabels CSV as live and avoids unsafe wiring", () => {
    const stripped = SENSORS_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(
      /\/\/.*$/gm,
      "",
    );
    expect(stripped).not.toMatch(/csv[^a-z]+live/i);
    expect(stripped).not.toMatch(/live\s+csv/i);
    expect(stripped).not.toMatch(/raw_payload/);
    expect(stripped).not.toMatch(/service_role/i);
    expect(stripped).not.toMatch(/action_queue/i);
    expect(stripped).not.toMatch(/from\(['"]alerts['"]\)/i);
    expect(stripped).not.toMatch(
      /execute_device|setpoint_write|irrigation_control|light_control|fan_control/i,
    );
  });
});
