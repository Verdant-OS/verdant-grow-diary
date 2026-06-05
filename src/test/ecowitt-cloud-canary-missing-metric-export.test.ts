/**
 * Slice B — missing_metric_codes on view-model + CSV/JSON export.
 *
 * Mirrors the Slice A (suspicious_flag_codes) surface exactly: closed-vocab
 * codes flow through the view-model into a |-joined CSV cell and a JSON array,
 * with a top-level deduped+sorted aggregate. No new detection.
 */
import { describe, it, expect } from "vitest";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import { buildCloudCanaryPreviewViewModel } from "@/lib/ecowittCloudCanaryViewModel";
import {
  buildCloudCanaryExport,
  serializeCloudCanaryExportToCsv,
  serializeCloudCanaryExportToJson,
  CLOUD_CANARY_EXPORT_COLUMNS,
} from "@/lib/ecowittCloudCanaryExport";
import { ECOWITT_MISSING_METRIC_CODES } from "@/constants/ecowittMissingMetricCodes";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

// Reuse the shared ID-shaped regexes from the Item 4 render test (single
// definition of "ID-shaped" across render, CSV, and JSON).
import {
  MAC_RE,
  UUID_RE,
} from "./operator-ecowitt-cloud-canary-per-fixture-table.test";
const TENT_ID_LIKE = /tent_id|plant_id|raw_payload|passkey|\bMAC\b/i;
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

const ALL_IDS = Object.keys(fixtures.payloads) as readonly string[];

function buildVm(ids: readonly string[]) {
  const list = ids.map((id) => ({
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

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");

describe("Slice B — view-model surfaces missing_metric_codes", () => {
  it("missing_humidity_only fixture surfaces air_humidity_absent on row + top-level", () => {
    const vm = buildVm(["missing_humidity_only"]);
    const row = vm.rows[0];
    expect(row.missing_metric_codes).toContain("air_humidity_absent");
    expect(vm.missing_metric_codes).toContain("air_humidity_absent");
  });

  it("every code on every row + top-level is from the closed vocabulary", () => {
    const vm = buildVm(ALL_IDS);
    const valid = new Set<string>(ECOWITT_MISSING_METRIC_CODES);
    for (const r of vm.rows) {
      for (const c of r.missing_metric_codes) {
        expect(valid.has(c)).toBe(true);
      }
    }
    for (const c of vm.missing_metric_codes) {
      expect(valid.has(c)).toBe(true);
    }
  });

  it("captured_at_missing fixture produces ZERO missing-metric codes (timestamp is a separate signal)", () => {
    const vm = buildVm(["captured_at_missing"]);
    expect(vm.rows[0].missing_metric_codes).toEqual([]);
  });

  it("view-model output is ID-free for missing-metric surface (no MAC/UUID/tent_id)", () => {
    const vm = buildVm(ALL_IDS);
    const blob = JSON.stringify(vm);
    expect(MAC_RE.test(blob)).toBe(false);
    expect(UUID_RE.test(blob)).toBe(false);
    expect(TENT_ID_LIKE.test(blob)).toBe(false);
  });
});

describe("Slice B — CSV/JSON emit missing_metric_codes", () => {
  it("CSV header appends missing_metric_codes as the last column", () => {
    const vm = buildVm(ALL_IDS);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);
    const header = csv.split("\n")[2].split(",");
    expect(header[header.length - 1]).toBe("missing_metric_codes");
    expect(CLOUD_CANARY_EXPORT_COLUMNS[CLOUD_CANARY_EXPORT_COLUMNS.length - 1]).toBe(
      "missing_metric_codes",
    );
  });

  it("CSV row for missing_humidity_only carries air_humidity_absent in the last cell", () => {
    const vm = buildVm(["missing_humidity_only"]);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);
    const dataLine = csv.split("\n")[3];
    const cells = dataLine.split(",");
    const missingCell = cells[cells.length - 1];
    expect(missingCell.split("|")).toContain("air_humidity_absent");
  });

  it("JSON row + top-level surface missing_metric_codes; aggregate == union of rows", () => {
    const vm = buildVm(ALL_IDS);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const json = JSON.parse(serializeCloudCanaryExportToJson(exp));
    expect(Array.isArray(json.missing_metric_codes)).toBe(true);
    for (const r of json.rows) {
      expect(Array.isArray(r.missing_metric_codes)).toBe(true);
      for (const c of r.missing_metric_codes) {
        expect(ECOWITT_MISSING_METRIC_CODES).toContain(c);
      }
    }
    const union = new Set<string>();
    for (const r of json.rows) for (const c of r.missing_metric_codes) union.add(c);
    expect(json.missing_metric_codes).toEqual([...union].sort());
  });

  it("CSV and JSON represent identical missing_metric_codes per row (parity)", () => {
    const vm = buildVm(ALL_IDS);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);
    const json = JSON.parse(serializeCloudCanaryExportToJson(exp));
    const lines = csv.trim().split("\n");
    const dataLines = lines.slice(3, 3 + exp.rows.length);
    dataLines.forEach((l, i) => {
      const cols = l.split(",");
      const missingCell = cols[cols.length - 1];
      const parsed =
        missingCell && missingCell.length > 0 ? missingCell.split("|") : [];
      expect(parsed).toEqual(json.rows[i].missing_metric_codes);
    });
  });

  it("CSV TOTAL row carries the missing-metric aggregate cell", () => {
    const vm = buildVm(ALL_IDS);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);
    const totalLine = csv.split("\n").find((l) => l.startsWith("TOTAL,"))!;
    const cells = totalLine.split(",");
    const aggCell = cells[cells.length - 1];
    const codes = aggCell && aggCell.length > 0 ? aggCell.split("|") : [];
    expect(codes).toEqual(exp.missing_metric_codes);
  });

  it("captured_at_missing fixture -> empty missing-metric codes in BOTH CSV and JSON (independent of invalid/timestamp signals)", () => {
    const vm = buildVm(["captured_at_missing"]);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });

    // JSON: row + top-level empty
    const json = JSON.parse(serializeCloudCanaryExportToJson(exp));
    expect(json.rows[0].missing_metric_codes).toEqual([]);
    expect(json.missing_metric_codes).toEqual([]);

    // CSV: last cell empty on data line
    const csv = serializeCloudCanaryExportToCsv(exp);
    const dataLine = csv.split("\n")[3];
    const cells = dataLine.split(",");
    expect(cells[cells.length - 1]).toBe("");
  });

  it("PROPERTY: all 12 fixtures — CSV + JSON contain no MAC/UUID/tent_id-shaped fields and no banned words", () => {
    const vm = buildVm(ALL_IDS);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);
    const json = serializeCloudCanaryExportToJson(exp);
    for (const blob of [csv, json]) {
      expect(MAC_RE.test(blob)).toBe(false);
      expect(UUID_RE.test(blob)).toBe(false);
      expect(TENT_ID_LIKE.test(blob)).toBe(false);
      const lower = blob.toLowerCase();
      for (const w of BANNED) expect(lower).not.toContain(w);
    }
  });

  it("export rejects an unknown missing-metric code rather than echoing free text", () => {
    const vm = buildVm(["happy_multi_channel"]);
    const tainted = {
      ...vm,
      missing_metric_codes: ["totally_made_up_code"] as never,
    };
    expect(() => buildCloudCanaryExport(tainted)).toThrow(
      /Unknown missing metric code/,
    );
  });
});

describe("Slice B — preview render surfaces missing-metric codes safely", () => {
  it("renderToString of CloudCanaryPreviewPanel emits no MAC/UUID and no banned words", async () => {
    const React = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { CloudCanaryPreviewPanel } = await import(
      "@/pages/OperatorEcowittCanary"
    );
    const html = renderToString(React.createElement(CloudCanaryPreviewPanel));
    expect(MAC_RE.test(html)).toBe(false);
    expect(UUID_RE.test(html)).toBe(false);
    const lower = html.toLowerCase();
    for (const w of BANNED) expect(lower).not.toContain(w);
    // Column header rendered
    expect(html).toContain("Missing-metric codes");
  });
});
