/**
 * verdant-genetics-xlsx-save-ui — wires the XLSX preview panel to a
 * Supabase-backed save handler. The handler is the only place that talks
 * to sensor_readings; the panel itself remains free of supabase imports.
 *
 * No alerts. No Action Queue. No diary_entries. No grow_events.
 * No AI/model. No device control. No schema/RLS/Edge/auth changes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

describe("VerdantGeneticsXlsxPreviewPanel — save flow", () => {
  const grid = buildFixture();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("save button is disabled when one or more sensor groups are unmapped", () => {
    const onSave = vi.fn();
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    const btn = screen.getByTestId("vg-xlsx-save");
    expect(btn).toBeDisabled();
    expect(
      screen.getByTestId("vg-xlsx-save-needs-mapping"),
    ).toBeInTheDocument();
  });

  it("save button enables when all groups mapped and adapter emits rows", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    const btn = screen.getByTestId("vg-xlsx-save");
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toMatch(/Save XLSX history \(\d+ rows\)/);
  });

  it("clicking save calls onSave with adapter result whose rows have source=csv and source_app=verdant_genetics_xlsx", async () => {
    let captured: VerdantGeneticsXlsxSaveArgs | null = null;
    const onSave = vi.fn(async (args: VerdantGeneticsXlsxSaveArgs) => {
      captured = args;
    });
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(captured).not.toBeNull();
    const args = captured!;
    expect(args.adapterResult.blocked).toBe(false);
    expect(args.adapterResult.rows.length).toBeGreaterThan(0);
    for (const row of args.adapterResult.rows) {
      expect(row.source).toBe("csv");
      expect(row.raw_payload.source_app).toBe("verdant_genetics_xlsx");
      expect(["tent-a", "tent-b", "tent-c"]).toContain(row.tent_id);
      expect(row.quality).toBe("ok");
      expect(typeof row.value).toBe("number");
    }
    // Tent mapping is preserved row-for-row.
    expect(args.tentIdBySensorGroup).toEqual({
      "Flower Tent": "tent-a",
      "Seedling Tent": "tent-b",
      "Vegetation Soil": "tent-c",
    });
    expect(typeof args.importBatchId).toBe("string");
    expect(args.importBatchId.length).toBeGreaterThan(4);
  });

  it("shows success copy with accepted row count after save resolves", async () => {
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
    const success = await screen.findByTestId("vg-xlsx-save-success");
    expect(success.textContent).toMatch(
      /Imported XLSX sensor history as CSV history\. \d+ rows imported\./,
    );
  });

  it("shows error copy when onSave rejects", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("network down"));
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    fireEvent.click(screen.getByTestId("vg-xlsx-save"));
    const err = await screen.findByTestId("vg-xlsx-save-error");
    expect(err.textContent).toMatch(/network down/);
  });

  it("save button stays disabled with blocked copy when no readable rows exist", () => {
    const emptyGrid: CellGrid = [
      ["", "Flower Tent"],
      ["Timestamp", "Temperature °F"],
      ["2026-06-04T03:00:00Z", "n/a"],
      ["2026-06-04T07:00:00Z", "n/a"],
    ];
    const onSave = vi.fn();
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={emptyGrid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    // Map the single group (parser detects "Flower Tent").
    const select = screen.queryByTestId("vg-xlsx-tent-select-Flower Tent");
    if (select) {
      fireEvent.click(select);
      fireEvent.click(
        screen.getByTestId("vg-xlsx-tent-option-Flower Tent-tent-a"),
      );
    }
    const btn = screen.getByTestId("vg-xlsx-save");
    expect(btn).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });


  it("save stays disabled when there are no tents", () => {
    const onSave = vi.fn();
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={[]}
        onSave={onSave}
      />,
    );
    expect(screen.getByTestId("vg-xlsx-save")).toBeDisabled();
    expect(screen.getByTestId("vg-xlsx-no-tents")).toBeInTheDocument();
  });

  it("does not render raw payload internals", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxPreviewPanel
        grid={grid}
        tentOptions={TENT_OPTIONS}
        onSave={onSave}
      />,
    );
    await mapAllGroups();
    expect(screen.queryByText(/raw_payload/)).toBeNull();
    expect(screen.queryByText(/import_batch_id/)).toBeNull();
    expect(screen.queryByText(/bridge_token/)).toBeNull();
  });
});

describe("Verdant Genetics XLSX save — static safety scan", () => {
  const ROOT = resolve(__dirname, "../..");
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("TentCsvImportCard XLSX save path writes only to sensor_readings", () => {
    const card = strip(read("src/components/TentCsvImportCard.tsx"));
    // Only sensor_readings is touched.
    const fromCalls = card.match(/\.from\(["']([a-z_]+)["']\)/g) ?? [];
    for (const m of fromCalls) {
      expect(m).toMatch(/sensor_readings/);
    }
    // No writes to forbidden tables anywhere in the card.
    for (const banned of [
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "diary_entries",
      "grow_events",
      "ai_doctor_sessions",
      "ai_credit_spends",
      "bridge_tokens",
      "pi_ingest_idempotency_keys",
    ]) {
      expect(card.includes(banned)).toBe(false);
    }
    // No AI/model surfaces and no device-control verbs.
    expect(card).not.toMatch(/openai|anthropic|ai[-_]?doctor/i);
    expect(card).not.toMatch(/service_role/);
    expect(card).not.toMatch(
      /\b(turn on|turn off|set fan|set light|set pump|set valve)\b/i,
    );
  });

  it("XLSX preview panel still does not import supabase or write to tables", () => {
    const src = strip(
      read("src/components/VerdantGeneticsXlsxPreviewPanel.tsx"),
    );
    expect(src).not.toMatch(
      /from\s+["']@\/integrations\/supabase\/client["']/,
    );
    expect(src).not.toMatch(/\.from\(["'][a-z_]+["']\)/);
    // Lowercase `insert(` / `update(` / `delete(` / `upsert(` / `rpc(` only.
    expect(src).not.toMatch(/\b(insert|update|delete|upsert|rpc)\s*\(/);
    expect(src).not.toMatch(/alerts|alert_events/);
    expect(src).not.toMatch(/action_queue/);
  });
});
