/**
 * Slice C-fix — Export payload determinism + UI-only run-timing.
 *
 * - buildCloudCanaryExport(sameInput) twice → byte-identical CSV and JSON
 *   (no timestamps, no wall-clock, no randomness in the file).
 * - generated_at MUST NOT appear in CSV header/rows/TOTAL or in JSON.
 * - Rendered panel surfaces the exact download filenames and a run-timing
 *   value, with no MAC/UUID and no banned source-honesty words.
 */
import { describe, it, expect } from "vitest";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import { buildCloudCanaryPreviewViewModel } from "@/lib/ecowittCloudCanaryViewModel";
import {
  buildCloudCanaryExport,
  serializeCloudCanaryExportToCsv,
  serializeCloudCanaryExportToJson,
  CLOUD_CANARY_EXPORT_CSV_FILENAME,
  CLOUD_CANARY_EXPORT_JSON_FILENAME,
} from "@/lib/ecowittCloudCanaryExport";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";
import {
  MAC_RE,
  UUID_RE,
} from "./operator-ecowitt-cloud-canary-per-fixture-table.test";

const ORDER = [
  "happy_multi_channel",
  "stale_only",
  "invalid_humidity",
  "stuck_soil_extreme",
  "unmapped_channel",
  "missing_metrics",
  "pressure_present",
  "celsius_looking_fahrenheit",
] as const;

const BANNED = [
  "confirmed",
  "certain",
  "synced",
  "connected",
  "imported",
  "guaranteed",
  "live data",
  "live feed",
];

function buildVm() {
  const list = ORDER.map((id) => ({
    id,
    payload: (fixtures.payloads as Record<string, unknown>)[id],
  }));
  const v = runEcowittCloudCanary(
    list,
    fixtures.mapping as unknown as Parameters<typeof runEcowittCloudCanary>[1],
    { now: new Date(fixtures.now) },
  );
  return buildCloudCanaryPreviewViewModel(v);
}

describe("Slice C-fix — deterministic export payload", () => {
  it("buildCloudCanaryExport(sameInput) twice → identical CSV bytes", () => {
    const vm = buildVm();
    const a = serializeCloudCanaryExportToCsv(buildCloudCanaryExport(vm));
    const b = serializeCloudCanaryExportToCsv(buildCloudCanaryExport(vm));
    expect(a).toBe(b);
  });

  it("buildCloudCanaryExport(sameInput) twice → identical JSON bytes", () => {
    const vm = buildVm();
    const a = serializeCloudCanaryExportToJson(buildCloudCanaryExport(vm));
    const b = serializeCloudCanaryExportToJson(buildCloudCanaryExport(vm));
    expect(a).toBe(b);
  });

  it("CSV payload contains no 'generated_at' anywhere (header/rows/TOTAL)", () => {
    const vm = buildVm();
    const csv = serializeCloudCanaryExportToCsv(buildCloudCanaryExport(vm));
    expect(csv).not.toContain("generated_at");
  });

  it("JSON payload contains no 'generated_at' key and the top-level object lacks it", () => {
    const vm = buildVm();
    const json = serializeCloudCanaryExportToJson(buildCloudCanaryExport(vm));
    expect(json).not.toContain("generated_at");
    const parsed = JSON.parse(json);
    expect(Object.prototype.hasOwnProperty.call(parsed, "generated_at")).toBe(
      false,
    );
  });

  it("captured_at_missing fixture still produces empty missing-metric cells (unchanged)", () => {
    const list = [
      {
        id: "captured_at_missing",
        payload: (fixtures.payloads as Record<string, unknown>)[
          "captured_at_missing"
        ],
      },
    ];
    const v = runEcowittCloudCanary(
      list,
      fixtures.mapping as unknown as Parameters<typeof runEcowittCloudCanary>[1],
      { now: new Date(fixtures.now) },
    );
    const vm = buildCloudCanaryPreviewViewModel(v);
    const exp = buildCloudCanaryExport(vm);
    const csv = serializeCloudCanaryExportToCsv(exp);
    const json = JSON.parse(serializeCloudCanaryExportToJson(exp));
    // CSV layout: 2 comment lines + header + data (data starts at index 3).
    const dataLine = csv.split("\n")[3];
    const cells = dataLine.split(",");
    expect(cells.length).toBe(9);
    expect(cells[cells.length - 2]).toBe("");
    expect(cells[cells.length - 1]).toBe("");
    expect(json.rows[0].missing_metric_codes).toEqual([]);
  });
});

describe("Slice C-fix — UI surfaces filename + run-timing (presentation-only)", () => {
  async function renderPanelHtml(): Promise<string> {
    const React = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { CloudCanaryPreviewPanel } = await import(
      "@/pages/OperatorEcowittCanary"
    );
    return renderToString(React.createElement(CloudCanaryPreviewPanel));
  }

  it("renders both download filenames in the meta block", async () => {
    const html = await renderPanelHtml();
    expect(html).toContain('data-testid="cloud-canary-export-meta"');
    expect(html).toContain(CLOUD_CANARY_EXPORT_CSV_FILENAME);
    expect(html).toContain(CLOUD_CANARY_EXPORT_JSON_FILENAME);
    expect(html).toContain('data-testid="cloud-canary-export-filename-csv"');
    expect(html).toContain('data-testid="cloud-canary-export-filename-json"');
  });

  it("renders a run-timing value in the meta block", async () => {
    const html = await renderPanelHtml();
    expect(html).toContain('data-testid="cloud-canary-export-run-timing"');
    const m = html.match(
      /data-testid="cloud-canary-export-run-timing"[^>]*>([^<]+)</,
    );
    expect(m).toBeTruthy();
    expect((m![1] || "").trim().length).toBeGreaterThan(0);
  });

  it("meta region has no MAC/UUID and no banned words", async () => {
    const html = await renderPanelHtml();
    const startIdx = html.indexOf('data-testid="cloud-canary-export-meta"');
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = html.indexOf("</div>", startIdx + 1);
    const region = html.slice(startIdx, endIdx + 6);
    expect(MAC_RE.test(region)).toBe(false);
    expect(UUID_RE.test(region)).toBe(false);
    const lower = region.toLowerCase();
    for (const w of BANNED) expect(lower).not.toContain(w);
  });
});
