/**
 * verdant-genetics-xlsx-import-evidence — post-save evidence summary UI.
 *
 * No writes. No schema/RLS/Edge/auth/device-control/AI changes.
 * Static safety scan included.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import VerdantGeneticsXlsxPreviewPanel from "@/components/VerdantGeneticsXlsxPreviewPanel";
import type { CellGrid } from "@/lib/verdantGeneticsXlsxParser";
import type { VerdantGeneticsXlsxSaveArgs } from "@/components/VerdantGeneticsXlsxPreviewPanel";

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

async function mapAllGroups() {
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
}

describe("VerdantGeneticsXlsxPreviewPanel — evidence summary after save", () => {
  const grid = buildFixture();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("evidence panel appears after successful save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    await waitFor(() =>
      expect(screen.getByTestId("vg-xlsx-evidence-panel")).toBeInTheDocument(),
    );
  });

  it("shows accepted row count in evidence panel", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const accepted = await screen.findByTestId("vg-xlsx-evidence-accepted");
    expect(accepted.textContent).toMatch(/\d+/);
  });

  it("shows rejected row count in evidence panel", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const rejected = await screen.findByTestId("vg-xlsx-evidence-rejected");
    expect(rejected.textContent).toMatch(/\d+/);
  });

  it("shows rejection reason summary when rejections exist", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const reasons = await screen.findByTestId("vg-xlsx-evidence-rejection-reasons");
    expect(reasons).toBeInTheDocument();
  });

  it("shows mapped sensor groups", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const groups = await screen.findByTestId("vg-xlsx-evidence-mapped-groups");
    expect(groups.textContent).toContain("Flower Tent");
    expect(groups.textContent).toContain("Seedling Tent");
    expect(groups.textContent).toContain("Vegetation Soil");
  });

  it("shows mapped tent labels when provided", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const tents = await screen.findByTestId("vg-xlsx-evidence-mapped-tents");
    expect(tents.textContent).toContain("Main Flower");
    expect(tents.textContent).toContain("Seedling Room");
    expect(tents.textContent).toContain("Veg Tent");
  });

  it("shows date range imported", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const range = await screen.findByTestId("vg-xlsx-evidence-date-range");
    expect(range.textContent).toMatch(/2026-06-04/);
  });

  it("shows metrics imported", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const metrics = await screen.findByTestId("vg-xlsx-evidence-metrics");
    expect(metrics.textContent?.length).toBeGreaterThan(0);
  });

  it("shows CSV history source label", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const source = await screen.findByTestId("vg-xlsx-evidence-source-label");
    expect(source.textContent).toContain("CSV history");
  });

  it("shows Verdant Genetics XLSX source app label", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const app = await screen.findByTestId("vg-xlsx-evidence-source-app-label");
    expect(app.textContent).toContain("Verdant Genetics XLSX");
  });

  it("shows Imported as CSV history copy", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const copy = await screen.findByTestId("vg-xlsx-evidence-csv-history-copy");
    expect(copy.textContent).toContain("Imported as CSV history, not live sensor data.");
  });

  it("does not show partial rejection warning when rejected count is 0", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    await screen.findByTestId("vg-xlsx-evidence-panel");
    expect(
      screen.queryByTestId("vg-xlsx-evidence-partial-rejection-warning"),
    ).toBeNull();
  });

  it("shows partial rejection warning when rejected count > 0", async () => {
    // Grid with an unsupported metric column to force rejections.
    const badGrid: CellGrid = [
      ["", "Flower Tent", "Flower Tent"],
      ["Timestamp", "Temperature °F", "Unknown Metric"],
      ["2026-06-04T03:00:00Z", 78, "n/a"],
      ["2026-06-04T07:00:00Z", 79, "n/a"],
    ];
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={badGrid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    const select = screen.getByTestId("vg-xlsx-tent-select-Flower Tent");
    fireEvent.click(select);
    fireEvent.click(
      screen.getByTestId("vg-xlsx-tent-option-Flower Tent-tent-a"),
    );
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const warning = await screen.findByTestId(
      "vg-xlsx-evidence-partial-rejection-warning",
    );
    expect(warning.textContent).toContain("Some rows were skipped");
  });

  it("does not render raw payload internals in evidence panel", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    await screen.findByTestId("vg-xlsx-evidence-panel");
    const panel = screen.getByTestId("vg-xlsx-evidence-panel");
    expect(panel.textContent).not.toMatch(/raw_payload/);
    expect(panel.textContent).not.toMatch(/import_batch_id/);
    expect(panel.textContent).not.toMatch(/bridge_token/);
  });

  it("does not create alerts or Action Queue items", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    await screen.findByTestId("vg-xlsx-evidence-panel");
    expect(screen.queryByTestId("vg-xlsx-evidence-alert")).toBeNull();
    expect(screen.queryByTestId("vg-xlsx-evidence-action-queue")).toBeNull();
  });
});

describe("buildVerdantGeneticsXlsxImportEvidenceViewModel — pure unit", () => {
  it("produces expected fields from a complete save", () => {
    const { buildVerdantGeneticsXlsxImportEvidenceViewModel } = require(
      "@/lib/verdantGeneticsXlsxImportEvidenceViewModel",
    );

    const vm = buildVerdantGeneticsXlsxImportEvidenceViewModel({
      adapterResult: {
        rows: [
          { metric: "temperature_c", value: 25 },
          { metric: "humidity_pct", value: 55 },
        ] as any,
        acceptedRowCount: 2,
        rejectedRowCount: 1,
        rejectionReasons: { unsupported_metric: 1 },
        blocked: false,
      },
      previewVm: {
        detectedGroups: ["Flower Tent"],
        dateRange: { start: "2026-06-01T00:00:00Z", end: "2026-06-03T00:00:00Z" },
      } as any,
      tentIdBySensorGroup: { "Flower Tent": "tent-a" },
      tentOptions: [{ id: "tent-a", name: "Main Flower" }],
      importBatchId: "batch-1234567890",
    });

    expect(vm.acceptedRowCount).toBe(2);
    expect(vm.rejectedRowCount).toBe(1);
    expect(vm.hasRejections).toBe(true);
    expect(vm.mappedGroups).toEqual([
      { sensorGroup: "Flower Tent", tentLabel: "Main Flower" },
    ]);
    expect(vm.dateRangeLabel).toBe("2026-06-01 → 2026-06-03");
    expect(vm.metricsImported).toEqual(["humidity_pct", "temperature_c"]);
    expect(vm.sourceLabel).toBe("CSV history");
    expect(vm.sourceAppLabel).toBe("Verdant Genetics XLSX");
    expect(vm.importBatchIdTruncated).toBe("batch-12…");
    expect(vm.csvHistoryCopy).toBe("Imported as CSV history, not live sensor data.");
    expect(vm.partialRejectionWarning).toBe(
      "Some rows were skipped. Review rejected reasons before relying on this history.",
    );
  });

  it("hides partial rejection warning when rejected count is 0", () => {
    const { buildVerdantGeneticsXlsxImportEvidenceViewModel } = require(
      "@/lib/verdantGeneticsXlsxImportEvidenceViewModel",
    );

    const vm = buildVerdantGeneticsXlsxImportEvidenceViewModel({
      adapterResult: {
        rows: [{ metric: "temperature_c", value: 25 }] as any,
        acceptedRowCount: 1,
        rejectedRowCount: 0,
        rejectionReasons: {},
        blocked: false,
      },
      previewVm: {
        detectedGroups: ["Flower Tent"],
        dateRange: null,
      } as any,
      tentIdBySensorGroup: { "Flower Tent": "tent-a" },
      tentOptions: [{ id: "tent-a", name: "Main Flower" }],
      importBatchId: "short",
    });

    expect(vm.hasRejections).toBe(false);
    expect(vm.partialRejectionWarning).toBeNull();
    expect(vm.importBatchIdTruncated).toBe("short");
    expect(vm.dateRangeLabel).toBe("—");
  });
});
