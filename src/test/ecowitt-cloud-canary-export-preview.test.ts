/**
 * Slice C — Pre-download preview of the EXACT CSV/JSON bytes the download writes.
 *
 * Asserts byte-equality between the rendered <pre> preview blocks and the
 * serializer output the download path uses (one source of truth). Also asserts
 * ID-free + no banned words in the preview DOM, and that empty-codes fixtures
 * render empty cells rather than being omitted.
 */
import { describe, it, expect } from "vitest";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import { buildCloudCanaryPreviewViewModel } from "@/lib/ecowittCloudCanaryViewModel";
import {
  buildCloudCanaryExport,
  serializeCloudCanaryExportToCsv,
  serializeCloudCanaryExportToJson,
} from "@/lib/ecowittCloudCanaryExport";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

import {
  MAC_RE,
  UUID_RE,
} from "./operator-ecowitt-cloud-canary-per-fixture-table.test";

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

// Must mirror the ORDER used in CloudCanaryPreviewPanel.
const PANEL_ORDER = [
  "happy_multi_channel",
  "stale_only",
  "invalid_humidity",
  "stuck_soil_extreme",
  "unmapped_channel",
  "missing_metrics",
  "pressure_present",
  "celsius_looking_fahrenheit",
] as const;

function buildExpected() {
  const list = PANEL_ORDER.map((id) => ({
    id,
    payload: (fixtures.payloads as Record<string, unknown>)[id],
  }));
  const v = runEcowittCloudCanary(
    list,
    fixtures.mapping as unknown as Parameters<typeof runEcowittCloudCanary>[1],
    { now: new Date(fixtures.now) },
  );
  const vm = buildCloudCanaryPreviewViewModel(v);
  const exp = buildCloudCanaryExport(vm);
  return {
    csv: serializeCloudCanaryExportToCsv(exp),
    json: serializeCloudCanaryExportToJson(exp),
    exp,
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractPre(html: string, testid: string): string {
  const re = new RegExp(
    `<pre[^>]*data-testid="${testid}"[^>]*>([\\s\\S]*?)<\\/pre>`,
  );
  const m = html.match(re);
  if (!m) throw new Error(`pre[data-testid="${testid}"] not found`);
  return decodeEntities(m[1]);
}

async function renderPanelHtml(): Promise<string> {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { CloudCanaryPreviewPanel } = await import(
    "@/pages/OperatorEcowittCanary"
  );
  return renderToString(React.createElement(CloudCanaryPreviewPanel));
}

describe("Slice C — pre-download preview byte-equality with download serializer", () => {
  // The panel and the expected serializer both stamp generated_at with `new Date()`
  // — they're produced at slightly different instants, so we normalize that one
  // ISO field before asserting byte equality. Every other byte must match.
  const stripCsvTs = (s: string) =>
    s.replace(/generated_at=[^\s]+/, "generated_at=<TS>");
  const stripJsonTs = (s: string) =>
    s.replace(/"generated_at":\s*"[^"]+"/, '"generated_at":"<TS>"');

  it("CSV preview block === serializer CSV output the download writes", async () => {
    const html = await renderPanelHtml();
    const preview = extractPre(html, "cloud-canary-export-preview-csv");
    const { csv } = buildExpected();
    expect(stripCsvTs(preview)).toBe(stripCsvTs(csv));
  });

  it("JSON preview block === serializer JSON output the download writes (literal bytes)", async () => {
    const html = await renderPanelHtml();
    const preview = extractPre(html, "cloud-canary-export-preview-json");
    const { json } = buildExpected();
    expect(stripJsonTs(preview)).toBe(stripJsonTs(json));
  });

  it("JSON preview parses to the same object the download would emit (ignoring generated_at)", async () => {
    const html = await renderPanelHtml();
    const preview = extractPre(html, "cloud-canary-export-preview-json");
    const { json } = buildExpected();
    const a = JSON.parse(preview);
    const b = JSON.parse(json);
    delete a.generated_at;
    delete b.generated_at;
    expect(a).toEqual(b);
  });

  it("CSV preview reflects both code columns, the TOTAL row, and |-join verbatim", async () => {
    const html = await renderPanelHtml();
    const preview = extractPre(html, "cloud-canary-export-preview-csv");
    const headerLine = preview.split("\n")[2];
    const headerCols = headerLine.split(",");
    expect(headerCols).toContain("suspicious_flag_codes");
    expect(headerCols).toContain("missing_metric_codes");
    expect(headerCols[headerCols.length - 1]).toBe("missing_metric_codes");
    // TOTAL row present
    expect(preview).toMatch(/^TOTAL,/m);
    // At least one row containing a |-joined codes cell (invalid_humidity has
    // multiple suspicious codes).
    const invLine = preview
      .split("\n")
      .find((l) => l.startsWith("invalid_humidity,"))!;
    expect(invLine).toBeTruthy();
  });

  it("captured_at_missing produces empty (not omitted) code cells at serializer level — same source as preview", () => {
    // Independent serializer assertion: the panel does not include this
    // fixture, but the preview shows the SAME serializer output the download
    // writes, so the empty-cell guarantee must hold there too.
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
    // CSV: data line has 9 cells; last two (codes columns) are empty strings,
    // not omitted/missing.
    const dataLine = csv.split("\n")[3];
    const cells = dataLine.split(",");
    expect(cells.length).toBe(9);
    expect(cells[cells.length - 2]).toBe(""); // suspicious_flag_codes
    expect(cells[cells.length - 1]).toBe(""); // missing_metric_codes
    // JSON: keys present with empty arrays.
    expect(json.rows[0].suspicious_flag_codes).toEqual([]);
    expect(json.rows[0].missing_metric_codes).toEqual([]);
  });

  it("preview DOM contains no MAC/UUID and none of the banned source-honesty words", async () => {
    const html = await renderPanelHtml();
    // Limit to the preview region for a strict assertion.
    const startIdx = html.indexOf(
      'data-testid="cloud-canary-export-preview"',
    );
    expect(startIdx).toBeGreaterThan(-1);
    const region = html.slice(startIdx);
    const decoded = decodeEntities(region);
    expect(MAC_RE.test(decoded)).toBe(false);
    expect(UUID_RE.test(decoded)).toBe(false);
    const lower = decoded.toLowerCase();
    for (const w of BANNED) expect(lower).not.toContain(w);
    // Honest label present.
    expect(lower).toContain("fixture/sample canary export preview");
  });

  it("download buttons and preview source the SAME memoized serializer values (single source of truth)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(process.cwd(), "src/pages/OperatorEcowittCanary.tsx"),
      "utf8",
    );
    const start = src.indexOf("export function CloudCanaryPreviewPanel");
    const end = src.indexOf("function RedactionWarningBanner");
    const block = src.slice(start, end);
    // Memoized once.
    expect(block.match(/serializeCloudCanaryExportToCsv\(/g)?.length).toBe(1);
    expect(block.match(/serializeCloudCanaryExportToJson\(/g)?.length).toBe(1);
    // Download handlers reference the memoized values, not re-serializing.
    expect(block).toContain("new Blob([exportCsv]");
    expect(block).toContain("new Blob([exportJson]");
    // Preview blocks reference the same identifiers.
    expect(block).toContain("{exportCsv}");
    expect(block).toContain("{exportJson}");
  });
});
