/**
 * AI Doctor Imported History Disclosure Panel tests.
 *
 * Deterministic. No network. No Supabase. No model calls.
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";

import { compilePlantContextFromRows } from "@/lib/aiDoctorContextCompiler";
import { AiDoctorImportedHistoryDisclosurePanel } from "@/components/AiDoctorImportedHistoryDisclosurePanel";

const NOW = new Date("2026-06-13T12:00:00.000Z");
const captured = (h: number) =>
  new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();

function buildImportedContext() {
  return compilePlantContextFromRows({
    plant: { id: "p1", grow_id: "g1", tent_id: "t1", name: "P", stage: "veg" },
    growEvents: [],
    sensorReadings: [
      {
        metric: "temperature_c",
        value: 24.5,
        unit: "C",
        captured_at: captured(48),
        source: "csv",
        raw_payload: {
          source_app: "verdant_genetics_xlsx",
          csv_import: true,
          raw_row: { A: "secret-cell" },
          device_serial: "VG-SERIAL-XYZ",
          bridge_token: "tok_secret_abc",
          source_file_name: "verdant-export.xlsx",
          import_batch_id: "batch-internal-001",
          internal_id: "int_999",
          suspicious: true,
        },
      },
      {
        metric: "humidity_pct",
        value: 58,
        unit: "%",
        captured_at: captured(36),
        source: "csv",
        raw_payload: {
          source_app: "spider_farmer",
          csv_import: true,
          raw_row: { col: "private" },
          device_serial: "SF-SERIAL-123",
          bridge_token: "tok_secret_def",
        },
      },
    ],
    now: NOW,
  });
}

describe("AiDoctorImportedHistoryDisclosurePanel", () => {
  afterEachCleanup();

  it("renders the disclosure when imported_sensor_history exists", () => {
    const ctx = buildImportedContext();
    render(<AiDoctorImportedHistoryDisclosurePanel context={ctx} />);
    const panel = screen.getByTestId("ai-doctor-imported-history-disclosure");
    expect(panel).toBeTruthy();
  });

  it("shows the panel title 'Imported sensor history used'", () => {
    render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    expect(screen.getByText("Imported sensor history used")).toBeTruthy();
  });

  it("states the data is not live telemetry", () => {
    render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    expect(
      screen.getByText(
        "AI Doctor used imported CSV/XLSX history as historical context. This is not live telemetry.",
      ),
    ).toBeTruthy();
  });

  it("displays 'CSV history' as the source label", () => {
    render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    expect(
      screen.getByTestId("ai-doctor-imported-history-source-label").textContent,
    ).toBe("CSV history");
  });

  it("displays both vendor labels", () => {
    render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    const vendors = screen.getByTestId("ai-doctor-imported-history-vendors")
      .textContent ?? "";
    expect(vendors).toContain("Verdant Genetics XLSX");
    expect(vendors).toContain("Spider Farmer");
  });

  it("displays the date range", () => {
    render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    const range = screen.getByTestId("ai-doctor-imported-history-date-range")
      .textContent ?? "";
    expect(range).toContain("→");
    expect(range.length).toBeGreaterThan(5);
  });

  it("displays total readings", () => {
    render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    expect(
      screen.getByTestId("ai-doctor-imported-history-total-readings").textContent,
    ).toBe("2");
  });

  it("displays metric summaries", () => {
    render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    const metrics = screen.getByTestId("ai-doctor-imported-history-metrics")
      .textContent ?? "";
    expect(metrics).toContain("temperature_c");
    expect(metrics).toContain("humidity_pct");
    expect(metrics).toContain("min=");
    expect(metrics).toContain("avg=");
  });

  it("shows suspicious flag count when greater than 0", () => {
    render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    expect(
      screen.getByTestId("ai-doctor-imported-history-suspicious-flags")
        .textContent,
    ).toBe("1");
  });

  it("hides suspicious flag count when 0", () => {
    const ctx = compilePlantContextFromRows({
      plant: { id: "p1", grow_id: "g1", tent_id: "t1" },
      growEvents: [],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 24,
          captured_at: captured(24),
          source: "csv",
          raw_payload: { source_app: "vivosun", csv_import: true },
        },
      ],
      now: NOW,
    });
    render(<AiDoctorImportedHistoryDisclosurePanel context={ctx} />);
    expect(
      screen.queryByTestId("ai-doctor-imported-history-suspicious-flags"),
    ).toBeNull();
  });

  it("renders missing-live warning when missingLiveSensorReadings is true", () => {
    render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    expect(
      screen.getByTestId("ai-doctor-imported-history-missing-live-warning")
        .textContent,
    ).toBe("Current/live sensor readings were missing or unavailable.");
  });

  it("does not render missing-live warning when live readings exist", () => {
    const ctx = buildImportedContext();
    const ctxWithLive = { ...ctx, missingLiveSensorReadings: false };
    render(<AiDoctorImportedHistoryDisclosurePanel context={ctxWithLive} />);
    expect(
      screen.queryByTestId("ai-doctor-imported-history-missing-live-warning"),
    ).toBeNull();
  });

  it("renders nothing when no imported_sensor_history exists", () => {
    const ctx = compilePlantContextFromRows({
      plant: { id: "p1" },
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    const { container } = render(
      <AiDoctorImportedHistoryDisclosurePanel context={ctx} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("never renders raw_payload internals or private identifiers", () => {
    const { container } = render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    const html = container.innerHTML;
    const forbidden = [
      "raw_payload",
      "raw_row",
      "device_serial",
      "VG-SERIAL-XYZ",
      "SF-SERIAL-123",
      "bridge_token",
      "tok_secret_abc",
      "tok_secret_def",
      "source_file_name",
      "verdant-export.xlsx",
      "spider-farmer.csv",
      "import_batch_id",
      "batch-internal-001",
      "internal_id",
      "int_999",
      "secret-cell",
    ];
    for (const term of forbidden) {
      expect(html.includes(term), `must not render "${term}"`).toBe(false);
    }
  });

  it("introduces no alert or Action Queue UI", () => {
    const { container } = render(
      <AiDoctorImportedHistoryDisclosurePanel context={buildImportedContext()} />,
    );
    expect(container.querySelector("button")).toBeNull();
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toContain("action queue");
    expect(html).not.toContain("create alert");
    expect(html).not.toContain("approve");
  });

  it("static guard: source files contain no Supabase writes, schema, RLS, Edge, auth, or device-control imports", () => {
    const files = [
      "src/lib/aiDoctorImportedHistoryDisclosureViewModel.ts",
      "src/components/AiDoctorImportedHistoryDisclosurePanel.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/\.from\(["'](alerts|action_queue)["']\)/);
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/fetch\(/);
      expect(src).not.toMatch(/service_role|supabase\/functions|device[_-]?control/i);
      expect(src).not.toMatch(/\bmigration\b|\brls\b/i);
    }
  });
});

function afterEachCleanup() {
  // Avoid importing afterEach name collision; rely on testing-library cleanup
  // between renders.
  if (typeof afterEach === "function") {
    afterEach(() => cleanup());
  }
}
