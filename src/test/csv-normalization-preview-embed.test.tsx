/**
 * CSV normalization preview embed — integration regressions.
 *
 * Validates that CsvPreviewReviewGate embeds the read-only sensor
 * normalization preview using canonical CSV labels, never enables writes,
 * and never leaks the full raw payload.
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CsvPreviewReviewGate } from "@/components/CsvPreviewReviewGate";
import {
  parseDelimitedSensorPreview,
  type CsvPreviewParseResult,
} from "@/lib/csvSensorPreviewRules";

const FIXED_NOW = new Date("2026-06-04T12:00:00.000Z");
const TENT_UUID = "11111111-2222-4333-8444-555555555555";
const PLANT_UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const CSV_CLEAN = [
  "timestamp,temperature,humidity",
  "2026-06-04T11:00:00Z,22.5,55",
  "2026-06-04T11:05:00Z,22.7,56",
].join("\n");

function parse(text: string): CsvPreviewParseResult {
  return parseDelimitedSensorPreview(text, { fileName: "fixture.csv", delimiter: "," });
}

function fillTent(uuid: string) {
  fireEvent.change(screen.getByTestId("csv-gate-tent-id"), { target: { value: uuid } });
}
function fillPlant(uuid: string) {
  fireEvent.change(screen.getByTestId("csv-gate-plant-id"), { target: { value: uuid } });
}

describe("CSV normalization preview embed", () => {
  it("renders CSV normalization preview heading and disclaimer when accepted rows exist", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    expect(screen.getByTestId("csv-normalization-preview-section")).toBeInTheDocument();
    expect(screen.getAllByText("CSV normalization preview").length).toBeGreaterThan(0);
    expect(
      screen.getByTestId("csv-normalization-preview-section-disclaimer"),
    ).toHaveTextContent(/Preview only — no sensor readings will be saved\./);
  });

  it("advertises data-writes-enabled=false on the section and inner panel", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    expect(
      screen.getByTestId("csv-normalization-preview-section").getAttribute("data-writes-enabled"),
    ).toBe("false");
    expect(
      screen.getByTestId("sensor-normalization-preview-panel").getAttribute("data-writes-enabled"),
    ).toBe("false");
  });

  it("uses source=csv, identity=csv_import, transport=csv badges", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    const badges = screen.getAllByTestId("sensor-normalization-preview-badge").map((n) => n.textContent);
    expect(badges).toEqual(expect.arrayContaining([
      expect.stringContaining("Source: csv"),
      expect.stringContaining("Identity: csv_import"),
      expect.stringContaining("Transport: csv"),
    ]));
  });

  it("shows normalized metrics for a valid accepted row", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    const metrics = screen.getAllByTestId("sensor-normalization-preview-metric-row").map((r) => r.textContent || "");
    expect(metrics.some((t) => t.includes("temperature_c"))).toBe(true);
    expect(metrics.some((t) => t.includes("humidity_pct"))).toBe(true);
  });

  it("shows long-form row summary when tent UUID is provided (linked_verified)", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    fillTent(TENT_UUID);
    fillPlant(PLANT_UUID);
    expect(
      screen.getByTestId("sensor-normalization-preview-tent-status").getAttribute("data-tent-status"),
    ).toBe("linked_verified");
    expect(
      Number(screen.getByTestId("sensor-normalization-preview-row-count").textContent),
    ).toBeGreaterThan(0);
  });

  it("shows missing-tent empty state when no tent id is provided", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    expect(
      screen.getByTestId("sensor-normalization-preview-tent-status").getAttribute("data-tent-status"),
    ).toBe("missing");
    expect(
      screen.getByTestId("sensor-normalization-preview-empty-state").textContent,
    ).toMatch(/valid tent context is missing/);
  });

  it("shows CSV normalization empty state when no accepted rows exist", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={null}
        hasHardBlockedRows={false}
        hasAcceptedRows={false}
        now={FIXED_NOW}
      />,
    );
    expect(screen.getByTestId("csv-normalization-preview-empty")).toHaveTextContent(
      "No accepted CSV rows are available for normalization preview.",
    );
    expect(screen.queryByTestId("sensor-normalization-preview-panel")).toBeNull();
  });

  it("does not render full raw payload contents (only raw field count)", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    const note = screen.getByTestId("sensor-normalization-preview-raw-note").textContent || "";
    expect(note).toMatch(/Raw fields:/);
    expect(note).not.toMatch(/22\.5/);
  });

  it("keeps the disabled import CTA disabled (writes remain off)", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    const btn = screen.getByTestId("csv-gate-save-button");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("data-writes-enabled")).toBe("false");
  });
});

describe("CsvPreviewReviewGate — static safety for embed", () => {
  it("does not import write helpers or invoke edge functions", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/CsvPreviewReviewGate.tsx"),
      "utf8",
    );
    const forbidden = [
      /insertSensorReading/,
      /useInsertSensorReading\(/,
      /\.insert\(/,
      /\.upsert\(/,
      /\.update\(/,
      /\.delete\(/,
      /\.upload\(/,
      /supabase\.from\(\s*["']sensor_readings["']\s*\)/,
      /functions\.invoke/,
      /from\(\s*["']action_queue["']\s*\)/,
      /from\(\s*["']alerts["']\s*\)/,
      /service_role/i,
      /bridge[_-]?token/i,
    ];
    for (const p of forbidden) {
      expect(p.test(src), `unexpected match: ${p}`).toBe(false);
    }
  });
});
