/**
 * verdant-genetics-xlsx-mapping-ui — DOM + static safety guards for the
 * Verdant Genetics XLSX sensor-group → tent mapping UI.
 *
 * No Supabase. No real XLSX file I/O (CellGrid is injected). No alerts,
 * Action Queue, AI, Edge Function, schema, RLS, or device-control surfaces.
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import VerdantGeneticsXlsxPreviewPanel from "@/components/VerdantGeneticsXlsxPreviewPanel";
import type { CellGrid } from "@/lib/verdantGeneticsXlsxParser";

function buildFixture(): CellGrid {
  const cols: Array<{ group: string; label: string }> = [
    { group: "", label: "Timestamp" },
    { group: "Flower Tent", label: "Temperature °F" },
    { group: "Flower Tent", label: "Humidity %" },
    { group: "Seedling Tent", label: "Temperature °F" },
    { group: "Seedling Tent", label: "Humidity %" },
    { group: "Vegetation Soil", label: "Soil Moisture %" },
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
  for (let r = 0; r < 3; r++) {
    const iso = new Date(startMs + r * 4 * 3600 * 1000).toISOString();
    grid.push([iso, 78 + r, 55 + r, 75, 60, 35 + r]);
  }
  return grid;
}

const TENT_OPTIONS = [
  { id: "tent-a", name: "Main Flower" },
  { id: "tent-b", name: "Seedling Room" },
  { id: "tent-c", name: "Veg Tent" },
];

describe("VerdantGeneticsXlsxPreviewPanel — mapping UI", () => {
  const grid = buildFixture();

  it("renders all detected sensor groups", () => {
    render(
      <VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={TENT_OPTIONS} />,
    );
    expect(
      screen.getByTestId("vg-xlsx-mapping-row-Flower Tent"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vg-xlsx-mapping-row-Seedling Tent"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vg-xlsx-mapping-row-Vegetation Soil"),
    ).toBeInTheDocument();
  });

  it("renders a tent selector for each sensor group", () => {
    render(
      <VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={TENT_OPTIONS} />,
    );
    for (const group of ["Flower Tent", "Seedling Tent", "Vegetation Soil"]) {
      expect(
        screen.getByTestId(`vg-xlsx-tent-select-${group}`),
      ).toBeInTheDocument();
    }
  });

  it("shows mapped/unmapped counts starting at zero", () => {
    render(
      <VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={TENT_OPTIONS} />,
    );
    expect(screen.getByTestId("vg-xlsx-mapped-count")).toHaveTextContent("0");
    expect(screen.getByTestId("vg-xlsx-unmapped-count")).toHaveTextContent("3");
    expect(screen.getByTestId("vg-xlsx-all-mapped")).toHaveTextContent("No");
  });

  it("shows readiness false when one or more groups are unmapped", () => {
    render(
      <VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={TENT_OPTIONS} />,
    );
    // Map only Flower Tent
    const flowerSelect = screen.getByTestId("vg-xlsx-tent-select-Flower Tent");
    fireEvent.click(flowerSelect);
    const flowerOption = screen.getByTestId(
      "vg-xlsx-tent-option-Flower Tent-tent-a",
    );
    fireEvent.click(flowerOption);

    expect(screen.getByTestId("vg-xlsx-mapped-count")).toHaveTextContent("1");
    expect(screen.getByTestId("vg-xlsx-unmapped-count")).toHaveTextContent("2");
    expect(screen.getByTestId("vg-xlsx-all-mapped")).toHaveTextContent("No");
  });

  it("shows readiness true when all groups are mapped", () => {
    render(
      <VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={TENT_OPTIONS} />,
    );

    for (const { group, tentId } of [
      { group: "Flower Tent", tentId: "tent-a" },
      { group: "Seedling Tent", tentId: "tent-b" },
      { group: "Vegetation Soil", tentId: "tent-c" },
    ]) {
      const select = screen.getByTestId(`vg-xlsx-tent-select-${group}`);
      fireEvent.click(select);
      const option = screen.getByTestId(
        `vg-xlsx-tent-option-${group}-${tentId}`,
      );
      fireEvent.click(option);
    }

    expect(screen.getByTestId("vg-xlsx-mapped-count")).toHaveTextContent("3");
    expect(screen.getByTestId("vg-xlsx-unmapped-count")).toHaveTextContent("0");
    expect(screen.getByTestId("vg-xlsx-all-mapped")).toHaveTextContent("Yes");
  });

  it("does not enable save/import even when all groups are mapped", () => {
    render(
      <VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={TENT_OPTIONS} />,
    );

    for (const { group, tentId } of [
      { group: "Flower Tent", tentId: "tent-a" },
      { group: "Seedling Tent", tentId: "tent-b" },
      { group: "Vegetation Soil", tentId: "tent-c" },
    ]) {
      const select = screen.getByTestId(`vg-xlsx-tent-select-${group}`);
      fireEvent.click(select);
      const option = screen.getByTestId(
        `vg-xlsx-tent-option-${group}-${tentId}`,
      );
      fireEvent.click(option);
    }

    const btn = screen.getByTestId("vg-xlsx-save-disabled");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByTestId("vg-xlsx-import-disabled-reason").textContent,
    ).toMatch(/not enabled yet/);
  });

  it("does not auto-map groups by name", () => {
    render(
      <VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={TENT_OPTIONS} />,
    );
    // All groups should start unmapped even though tent names loosely match.
    expect(screen.getByTestId("vg-xlsx-mapped-count")).toHaveTextContent("0");
    expect(screen.getByTestId("vg-xlsx-unmapped-count")).toHaveTextContent("3");
  });

  it("shows no-tents copy when no tent options exist", () => {
    render(<VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={[]} />);
    expect(screen.getByTestId("vg-xlsx-no-tents")).toHaveTextContent(
      /No tents available/,
    );
    // Selectors should not be rendered when there are no tents.
    expect(
      screen.queryByTestId("vg-xlsx-tent-select-Flower Tent"),
    ).not.toBeInTheDocument();
  });

  it("preserves CSV history copy", () => {
    render(
      <VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={TENT_OPTIONS} />,
    );
    expect(screen.getByTestId("vg-xlsx-canonical-source")).toHaveTextContent(
      "CSV history",
    );
    expect(screen.getByTestId("vg-xlsx-csv-history-copy")).toHaveTextContent(
      /CSV history, not live sensor data/,
    );
  });

  it("preserves suspicious flag display", () => {
    const gridWithSuspicious: CellGrid = [
      ["", "Flower Tent", "Flower Tent"],
      ["Timestamp", "Temperature °F", "Humidity %"],
      ["2026-06-04T03:00:00Z", 78, 95],
    ];
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={gridWithSuspicious}
        tentOptions={TENT_OPTIONS}
      />,
    );
    expect(screen.getByTestId("vg-xlsx-suspicious-list")).toBeInTheDocument();
    expect(
      screen.getByTestId("vg-xlsx-suspicious-high_rh_watch"),
    ).toBeInTheDocument();
  });

  it("does not render raw payload fields", () => {
    render(
      <VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={TENT_OPTIONS} />,
    );
    expect(screen.queryByText(/raw_payload/)).toBeNull();
    expect(screen.queryByText(/source_app/)).toBeNull();
    expect(screen.queryByText(/original_value/)).toBeNull();
  });

  it("shows mapping required copy", () => {
    render(
      <VerdantGeneticsXlsxPreviewPanel grid={grid} tentOptions={TENT_OPTIONS} />,
    );
    expect(
      screen.getByTestId("vg-xlsx-mapping-required-copy"),
    ).toHaveTextContent(/must be mapped to a Verdant tent/);
  });
});

describe("Verdant Genetics XLSX mapping UI — static safety scan", () => {
  const ROOT = resolve(__dirname, "../..");
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const FILES = [
    "src/components/VerdantGeneticsXlsxPreviewPanel.tsx",
    "src/lib/verdantGeneticsXlsxMappingViewModel.ts",
  ];

  for (const f of FILES) {
    it(`${f} has no Supabase / write / alerts / action queue / AI / device-control surfaces`, () => {
      const src = strip(read(f));
      expect(src).not.toMatch(
        /from\s+["']@\/integrations\/supabase\/client["']/,
      );
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
});
