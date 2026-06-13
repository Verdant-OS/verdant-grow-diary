/**
 * verdant-genetics-xlsx-preview-ui — DOM + static safety guards for the
 * Verdant Genetics XLSX preview panel.
 *
 * No Supabase. No real XLSX file I/O (CellGrid is injected). No alerts,
 * Action Queue, AI, Edge Function, schema, RLS, or device-control surfaces.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import VerdantGeneticsXlsxPreviewPanel from "@/components/VerdantGeneticsXlsxPreviewPanel";
import {
  PREVIEW_PERSISTENCE_ENABLED,
} from "@/lib/sensorImportPreviewCopy";
import type { CellGrid } from "@/lib/verdantGeneticsXlsxParser";

function buildFixture(): CellGrid {
  const cols: Array<{ group: string; label: string }> = [
    { group: "", label: "Timestamp" },
    { group: "Flower Tent", label: "Temperature °F" },
    { group: "Flower Tent", label: "Humidity %" },
    { group: "Seedling Tent", label: "Temperature °F" },
    { group: "Seedling Tent", label: "Humidity %" },
    { group: "Vegetation Soil", label: "Soil Moisture %" },
    { group: "Battery", label: "Battery Voltage" }, // preserved-only
    { group: "Pressure", label: "Pressure inHg" }, // unsupported
  ];
  const headerGroup: string[] = [];
  const headerMetric: string[] = [];
  let prev = "";
  for (const c of cols) {
    headerGroup.push(c.group !== prev ? c.group : "");
    prev = c.group || prev;
    headerMetric.push(c.label);
  }
  const grid: unknown[][] = [headerGroup, headerMetric];
  const startMs = Date.parse("2026-06-04T03:00:00Z");
  for (let r = 0; r < 6; r++) {
    const iso = new Date(startMs + r * 4 * 3600 * 1000).toISOString();
    grid.push([
      iso,
      78 + (r % 4),
      r === 2 ? 95 : 55 + r, // high-rh watch on row 2
      75,
      60,
      r === 4 ? 0 : 35,
      3.6,
      29.9,
    ]);
  }
  return grid;
}

describe("VerdantGeneticsXlsxPreviewPanel", () => {
  const grid = buildFixture();

  it("renders the detected format/source app", () => {
    render(<VerdantGeneticsXlsxPreviewPanel grid={grid} />);
    expect(screen.getByTestId("vg-xlsx-format")).toHaveTextContent(
      /Verdant Genetics multi-tent XLSX export/,
    );
    expect(screen.getByTestId("vg-xlsx-source-app")).toHaveTextContent(
      "verdant_genetics_xlsx",
    );
  });

  it("labels data as CSV history, never live", () => {
    render(<VerdantGeneticsXlsxPreviewPanel grid={grid} />);
    expect(screen.getByTestId("vg-xlsx-canonical-source")).toHaveTextContent(
      "CSV history",
    );
    expect(screen.getByTestId("vg-xlsx-csv-history-copy")).toHaveTextContent(
      /CSV history, not live sensor data/,
    );
    expect(screen.queryByText(/\bLive\b/)).toBeNull();
  });

  it("shows detected sensor groups, date range, and timestamp row count", () => {
    render(<VerdantGeneticsXlsxPreviewPanel grid={grid} />);
    const groups = screen.getByTestId("vg-xlsx-detected-groups").textContent ?? "";
    expect(groups).toMatch(/Flower Tent/);
    expect(groups).toMatch(/Seedling Tent/);
    expect(groups).toMatch(/Vegetation Soil/);
    expect(screen.getByTestId("vg-xlsx-date-range").textContent).toMatch(
      /2026-06-04 → 2026-06-/,
    );
    expect(screen.getByTestId("vg-xlsx-timestamp-rows")).toHaveTextContent("6");
  });

  it("shows mapped, rejected, and suspicious counts", () => {
    render(<VerdantGeneticsXlsxPreviewPanel grid={grid} />);
    const mapped = Number(
      screen.getByTestId("vg-xlsx-mapped-metrics").textContent ?? "0",
    );
    const rejected = Number(
      screen.getByTestId("vg-xlsx-rejected-metrics").textContent ?? "0",
    );
    const suspicious = Number(
      screen.getByTestId("vg-xlsx-suspicious-count").textContent ?? "0",
    );
    expect(mapped).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThanOrEqual(2); // Battery + Pressure
    expect(suspicious).toBeGreaterThanOrEqual(2); // high-rh + soil-moisture stuck-zero
    expect(screen.getByTestId("vg-xlsx-suspicious-list")).toBeInTheDocument();
    expect(screen.getByTestId("vg-xlsx-rejected-list")).toBeInTheDocument();
  });

  it("renders the save button as disabled (preview only)", () => {
    render(<VerdantGeneticsXlsxPreviewPanel grid={grid} />);
    const btn = screen.getByTestId("vg-xlsx-save-disabled");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByTestId("vg-xlsx-import-disabled-reason").textContent,
    ).toMatch(/not enabled yet/);
  });

  it("shows unknown-format copy when grid does not match the Verdant Genetics shape", () => {
    const unknownGrid: CellGrid = [
      ["unrelated", "header"],
      ["mystery_col", "other_col"],
      ["not-a-date", "not-a-number"],
    ];
    render(<VerdantGeneticsXlsxPreviewPanel grid={unknownGrid} />);
    expect(screen.getByTestId("vg-xlsx-unknown-shape")).toHaveTextContent(
      /Unknown XLSX format/,
    );
  });
});

describe("Verdant Genetics XLSX persistence gate", () => {
  it("verdant_genetics_xlsx is not added to PREVIEW_PERSISTENCE_ENABLED", () => {
    expect(
      (PREVIEW_PERSISTENCE_ENABLED as ReadonlySet<string>).has(
        "verdant_genetics_xlsx",
      ),
    ).toBe(false);
  });

  it("Spider Farmer, Vivosun, and AC Infinity saves remain enabled", () => {
    expect(PREVIEW_PERSISTENCE_ENABLED.has("spider_farmer")).toBe(true);
    expect(PREVIEW_PERSISTENCE_ENABLED.has("vivosun")).toBe(true);
    expect(PREVIEW_PERSISTENCE_ENABLED.has("ac_infinity")).toBe(true);
  });
});

describe("Verdant Genetics XLSX preview — static safety scan", () => {
  const ROOT = resolve(__dirname, "../..");
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const FILES = [
    "src/components/VerdantGeneticsXlsxPreviewPanel.tsx",
    "src/lib/verdantGeneticsXlsxPreviewViewModel.ts",
    "src/lib/verdantGeneticsXlsxFileLoader.ts",
  ];

  for (const f of FILES) {
    it(`${f} has no Supabase / write / alerts / action queue / AI / device-control surfaces`, () => {
      const src = strip(read(f));
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
      expect(src).not.toMatch(/\.from\(["'][a-z_]+["']\)/);
      expect(src).not.toMatch(/\b(insert|update|delete|upsert|rpc)\s*\(/);
      expect(src).not.toMatch(/alerts|alert_events/);
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/openai|anthropic|ai[-_]?doctor/i);
      expect(src).not.toMatch(/service_role|bridge_token/);
      expect(src).not.toMatch(
        /\b(turn on|turn off|set fan|set light|set pump|set valve)\b/i,
      );
    });
  }

  it("preview view-model is the only surface that exposes verdant_genetics_xlsx", () => {
    const card = strip(read("src/components/TentCsvImportCard.tsx"));
    // Card must NOT add verdant_genetics_xlsx to a persistence-enabled gate.
    expect(card).not.toMatch(
      /PREVIEW_PERSISTENCE_ENABLED[\s\S]{0,200}verdant_genetics_xlsx/,
    );
    expect(card).not.toMatch(
      /verdant_genetics_xlsx[\s\S]{0,200}PREVIEW_PERSISTENCE_ENABLED/,
    );
  });
});
