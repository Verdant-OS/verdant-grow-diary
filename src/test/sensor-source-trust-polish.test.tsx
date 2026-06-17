/**
 * sensor-source-trust-polish — UI presence tests for:
 *   - ImportedSensorHistoryPanel read-only CSV banner
 *   - TimelineCsvContextPanel read-only CSV banner
 *   - Sensors page "Sensor sources" explainer
 *
 * Static safety: scans key panel files and the rules helper for any
 * reintroduction of spreadsheet/XLSX import CTAs or forbidden secret
 * strings, write paths, AI calls, alerts, Action Queue writes, automation,
 * or device control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";

function read(p: string) {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("ImportedSensorHistoryPanel read-only banner", () => {
  it("renders the read-only CSV banner", () => {
    render(
      <MemoryRouter>
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[
            {
              tent_id: "tent-A",
              source: "csv",
              metric: "temperature_c",
              captured_at: "2026-06-01T00:00:00Z",
              ts: "2026-06-01T00:00:00Z",
              value: 22.5,
            },
          ]}
        />
      </MemoryRouter>,
    );
    const banner = screen.getByTestId("imported-history-readonly-banner");
    expect(banner).toHaveTextContent(/Read-only CSV history/i);
    expect(banner).toHaveTextContent(/historical context/i);
    expect(banner).toHaveTextContent(/not live sensor data/i);
  });
});

describe("TimelineCsvContextPanel read-only banner copy", () => {
  it("source contains the read-only CSV banner test id and copy", () => {
    const src = read("src/components/TimelineCsvContextPanel.tsx");
    expect(src).toContain('data-testid="timeline-csv-context-readonly-banner"');
    expect(src).toMatch(/CSV context is read-only/);
    expect(src).toMatch(/explicitly labeled csv/);
  });
});

describe("Sensors page sensor sources explainer", () => {
  it("source contains the sensor sources explainer copy", () => {
    const src = read("src/pages/Sensors.tsx");
    expect(src).toContain('data-testid="sensors-source-explainer"');
    expect(src).toMatch(/Sensor sources/);
    expect(src).toMatch(/live ingest/);
    expect(src).toMatch(/manual/);
    expect(src).toMatch(/csv/);
    expect(src).toMatch(/demo/);
    expect(src).toMatch(/Stale or invalid/);
  });
});

describe("Static safety: no reintroduced spreadsheet/import surfaces", () => {
  const files = [
    "src/components/ImportedSensorHistoryPanel.tsx",
    "src/components/TimelineCsvContextPanel.tsx",
    "src/components/TimelineSensorSourceBadge.tsx",
    "src/lib/timelineSensorSourceBadgeRules.ts",
    "src/pages/Sensors.tsx",
  ];
  const forbiddenPhrases = [
    "XLSX import",
    "Excel import",
    "Upload spreadsheet",
    "Import readings from XLSX",
    "Genetics XLSX",
  ];
  const forbiddenWrite = [
    ".insert(",
    ".update(",
    ".delete(",
    ".rpc(",
    "service_role",
    "PASSKEY",
    "Authorization:",
    "vbt_",
    "raw_payload:",
  ];
  for (const f of files) {
    it(`${f} contains no forbidden import CTAs or write paths`, () => {
      const src = read(f);
      for (const p of forbiddenPhrases) expect(src).not.toContain(p);
      for (const p of forbiddenWrite) expect(src).not.toContain(p);
      // No AI calls, alerts, Action Queue writes, automation, device control.
      expect(src).not.toMatch(/ai-doctor-review|ai-coach|invokeFunction|invoke\("ai/);
      expect(src).not.toMatch(/alerts.*\.insert|action_queue.*\.insert/);
      expect(src).not.toMatch(/device[_-]?control|sendDeviceCommand/i);
    });
  }
});
