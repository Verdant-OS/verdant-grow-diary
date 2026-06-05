/**
 * Item 3 — Redacted CSV/JSON export for Cloud Canary verdict.
 * Pure serializer tests + render-time export-control assertion.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import { buildCloudCanaryPreviewViewModel } from "@/lib/ecowittCloudCanaryViewModel";
import {
  buildCloudCanaryExport,
  serializeCloudCanaryExportToCsv,
  serializeCloudCanaryExportToJson,
  CLOUD_CANARY_EXPORT_COLUMNS,
} from "@/lib/ecowittCloudCanaryExport";
import { ECOWITT_SUSPICIOUS_FLAG_CODES } from "@/constants/ecowittSuspiciousFlags";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

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

// REUSE the shared ID-shaped regexes from the Item 4 render test so that
// render, CSV, and JSON share ONE definition of "ID-shaped".
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

function buildVmFromIds(ids: readonly string[]) {
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

describe("ecowittCloudCanaryExport — pure serializer", () => {
  it("export rows mirror view-model row counts and order", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    expect(exp.rows.map((r) => r.fixture_name)).toEqual([...ORDER]);
    for (let i = 0; i < exp.rows.length; i++) {
      const r = exp.rows[i];
      const v = vm.rows[i];
      expect(r.mapped_count).toBe(v.mapped_count);
      expect(r.fresh_class_count).toBe(v.live_count);
      expect(r.stale_count).toBe(v.stale_count);
      expect(r.invalid_count).toBe(v.invalid_count);
      expect(r.unmapped_count).toBe(v.unmapped_count);
      expect(r.row_state).toBe(v.state);
    }
  });

  it("totals are the sum of row counts", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const sum = (k: keyof (typeof exp.rows)[number]) =>
      exp.rows.reduce((a, r) => a + (r[k] as number), 0);
    expect(exp.totals.fixture_count).toBe(exp.rows.length);
    expect(exp.totals.mapped_count).toBe(sum("mapped_count"));
    expect(exp.totals.fresh_class_count).toBe(sum("fresh_class_count"));
    expect(exp.totals.stale_count).toBe(sum("stale_count"));
    expect(exp.totals.invalid_count).toBe(sum("invalid_count"));
    expect(exp.totals.unmapped_count).toBe(sum("unmapped_count"));
  });

  it("CSV contains expected counts for a known fixture (happy_multi_channel)", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);

    expect(csv.split("\n")[2]).toBe(CLOUD_CANARY_EXPORT_COLUMNS.join(","));
    const happy = exp.rows.find((r) => r.fixture_name === "happy_multi_channel")!;
    const expected = [
      "happy_multi_channel",
      happy.mapped_count,
      happy.fresh_class_count,
      happy.stale_count,
      happy.invalid_count,
      happy.unmapped_count,
      happy.row_state,
    ].join(",");
    expect(csv).toContain(expected);
    expect(csv).toMatch(/^TOTAL,/m);
  });

  it("JSON contains expected counts for the same known fixture", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const json = serializeCloudCanaryExportToJson(exp);
    const parsed = JSON.parse(json);
    const happy = parsed.rows.find(
      (r: { fixture_name: string }) => r.fixture_name === "happy_multi_channel",
    );
    expect(happy).toBeTruthy();
    const expVmRow = vm.rows.find((r) => r.fixture_name === "happy_multi_channel")!;
    expect(happy.mapped_count).toBe(expVmRow.mapped_count);
    expect(happy.fresh_class_count).toBe(expVmRow.live_count);
    expect(happy.stale_count).toBe(expVmRow.stale_count);
    expect(happy.invalid_count).toBe(expVmRow.invalid_count);
    expect(happy.unmapped_count).toBe(expVmRow.unmapped_count);
  });

  it("CSV and JSON represent identical data (parity check)", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);
    const json = JSON.parse(serializeCloudCanaryExportToJson(exp));

    // Parse CSV body rows (skip the 2 comment lines + header)
    const lines = csv.trim().split("\n");
    const dataLines = lines.slice(3, 3 + exp.rows.length);
    const csvRows = dataLines.map((l) => {
      const cols = l.split(",");
      return {
        fixture_name: cols[0],
        mapped_count: Number(cols[1]),
        fresh_class_count: Number(cols[2]),
        stale_count: Number(cols[3]),
        invalid_count: Number(cols[4]),
        unmapped_count: Number(cols[5]),
        row_state: cols[6],
        suspicious_flag_codes:
          cols[7] && cols[7].length > 0 ? cols[7].split("|") : [],
        missing_metric_codes:
          cols[8] && cols[8].length > 0 ? cols[8].split("|") : [],
      };
    });
    expect(csvRows).toEqual(json.rows);
  });

  it("JSON output is counts-only — no per-reading array or raw_payload", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const json = serializeCloudCanaryExportToJson(exp);
    expect(json).not.toMatch(/"raw_payload"/);
    expect(json).not.toMatch(/"readings"/);
    expect(json).not.toMatch(/"captured_at"/);
    expect(json).not.toMatch(/"payload"/);
    // Only the documented top-level keys
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "generated_at",
        "missing_metric_codes",
        "preview_state",
        "rows",
        "source_kind",
        "suspicious_flag_codes",
        "totals",
      ].sort(),
    );
    for (const r of parsed.rows) {
      expect(Object.keys(r).sort()).toEqual(
        [
          "fixture_name",
          "fresh_class_count",
          "invalid_count",
          "mapped_count",
          "missing_metric_codes",
          "row_state",
          "stale_count",
          "suspicious_flag_codes",
          "unmapped_count",
        ].sort(),
      );
    }
  });

  it("PROPERTY: across ALL 8 fixtures, CSV and JSON contain no MAC/UUID/tent_id-like fields", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);
    const json = serializeCloudCanaryExportToJson(exp);

    for (const blob of [csv, json]) {
      expect(MAC_RE.test(blob)).toBe(false);
      expect(UUID_RE.test(blob)).toBe(false);
      expect(TENT_ID_LIKE.test(blob)).toBe(false);
      const lower = blob.toLowerCase();
      for (const w of BANNED) {
        expect(lower).not.toContain(w);
      }
    }
  });

  it("PROPERTY: each individual fixture's CSV+JSON is id-free", () => {
    for (const id of ORDER) {
      const vm = buildVmFromIds([id]);
      const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
      const csv = serializeCloudCanaryExportToCsv(exp);
      const json = serializeCloudCanaryExportToJson(exp);
      for (const blob of [csv, json]) {
        expect(MAC_RE.test(blob), `${id} MAC in ${blob.slice(0, 80)}`).toBe(false);
        expect(UUID_RE.test(blob)).toBe(false);
        expect(TENT_ID_LIKE.test(blob)).toBe(false);
      }
    }
  });

  it("empty view-model produces an empty-state export with zero totals", () => {
    const v = runEcowittCloudCanary(
      [],
      fixtures.mapping as unknown as Parameters<typeof runEcowittCloudCanary>[1],
      { now: new Date(fixtures.now) },
    );
    const vm = buildCloudCanaryPreviewViewModel(v);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    expect(exp.preview_state).toBe("empty");
    expect(exp.rows).toEqual([]);
    expect(exp.totals.fixture_count).toBe(0);
    const csv = serializeCloudCanaryExportToCsv(exp);
    expect(csv).toContain("fixture/sample canary summary");
  });

  it("CSV header is honest and contains no banned health/source words", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp).toLowerCase();
    for (const w of BANNED) expect(csv).not.toContain(w);
    expect(csv).toContain("fixture/sample canary summary");
    expect(csv).toContain("counts only");
  });
});

describe("CloudCanaryPreviewPanel — export controls render (Item 3)", () => {
  const pageSrc = readFileSync(
    resolve(process.cwd(), "src/pages/OperatorEcowittCanary.tsx"),
    "utf8",
  );

  it("panel mounts both CSV and JSON download controls", () => {
    expect(pageSrc).toContain(
      'data-testid="download-cloud-canary-summary-csv"',
    );
    expect(pageSrc).toContain(
      'data-testid="download-cloud-canary-summary-json"',
    );
    expect(pageSrc).toContain("Download Fixture Summary CSV");
    expect(pageSrc).toContain("Download Fixture Summary JSON");
  });

  it("export controls source the export from the view-model, not raw verdict", () => {
    // Locate the panel block
    const start = pageSrc.indexOf("export function CloudCanaryPreviewPanel");
    const end = pageSrc.indexOf("function RedactionWarningBanner");
    const block = pageSrc.slice(start, end);
    expect(block).toContain("buildCloudCanaryExport(previewVm)");
    expect(block).not.toContain("buildCloudCanaryExport(verdict");
  });

  it("panel block contains none of the banned source-honesty words", async () => {
    const React = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { CloudCanaryPreviewPanel } = await import(
      "@/pages/OperatorEcowittCanary"
    );
    const html = renderToString(React.createElement(CloudCanaryPreviewPanel));
    const lower = html.toLowerCase();
    for (const w of BANNED) expect(lower).not.toContain(w);
    expect(MAC_RE.test(html)).toBe(false);
    expect(UUID_RE.test(html)).toBe(false);
    expect(html).toContain("Download Fixture Summary CSV");
    expect(html).toContain("Download Fixture Summary JSON");
  });

  it("uses the fixed Item 3 filenames (no timestamp)", () => {
    expect(pageSrc).toContain("CLOUD_CANARY_EXPORT_CSV_FILENAME");
    expect(pageSrc).toContain("CLOUD_CANARY_EXPORT_JSON_FILENAME");
    expect(pageSrc).not.toMatch(/cloud-canary-fixture-summary-\$\{Date\.now/);
  });

  it("export omits the still-deferred missing_metric_count gap field", () => {
    // missing_metric_count is NOT yet derivable from slice-1 verdict output;
    // the view-model deliberately does not expose it, so the export must not.
    // suspicious_flag_codes IS now surfaced by the view-model and IS emitted
    // by the export (covered by the Slice A tests below).
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const json = serializeCloudCanaryExportToJson(exp);
    expect(json).not.toMatch(/missing_metric_count/);
  });

  it("Slice A: CSV header includes the suspicious_flag_codes column", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);
    const header = csv.split("\n")[2].split(",");
    expect(header).toContain("suspicious_flag_codes");
    // Stable position: last column
    expect(header[header.length - 1]).toBe("suspicious_flag_codes");
  });

  it("Slice A: CSV row for invalid_humidity carries its enum code in the codes cell", () => {
    const vm = buildVmFromIds(["invalid_humidity"] as const);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);
    const dataLine = csv.split("\n")[3]; // 2 comments + header + 1 row
    const cells = dataLine.split(",");
    expect(cells[0]).toBe("invalid_humidity");
    // Last cell = codes; |-joined enum values only
    const codesCell = cells[cells.length - 1];
    const codes = codesCell.split("|");
    expect(codes).toContain("rh_out_of_range_invalid");
    for (const c of codes) {
      expect(ECOWITT_SUSPICIOUS_FLAG_CODES).toContain(c);
    }
  });

  it("Slice A: JSON row + top-level surfaces enum codes only (closed-set invariant)", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const json = JSON.parse(serializeCloudCanaryExportToJson(exp));

    expect(Array.isArray(json.suspicious_flag_codes)).toBe(true);
    for (const c of json.suspicious_flag_codes) {
      expect(ECOWITT_SUSPICIOUS_FLAG_CODES).toContain(c);
    }
    for (const r of json.rows) {
      expect(Array.isArray(r.suspicious_flag_codes)).toBe(true);
      for (const c of r.suspicious_flag_codes) {
        expect(ECOWITT_SUSPICIOUS_FLAG_CODES).toContain(c);
      }
    }
    // Aggregate == union of per-row codes, sorted + deduped
    const union = new Set<string>();
    for (const r of json.rows) for (const c of r.suspicious_flag_codes) union.add(c);
    expect(json.suspicious_flag_codes).toEqual([...union].sort());
  });

  it("Slice A: export refuses an unknown code rather than echoing free text", () => {
    const vm = buildVmFromIds(["happy_multi_channel"] as const);
    // Tamper with VM aggregate to inject a non-enum value.
    const tainted = {
      ...vm,
      suspicious_flag_codes: ["AA:BB:CC:DD:EE:01"] as never,
    };
    expect(() => buildCloudCanaryExport(tainted)).toThrow(
      /Unknown suspicious flag code/,
    );
  });

  it("uses the literal export key 'fresh_class_count' in BOTH CSV header and JSON key (NOT 'fresh_count')", () => {
    const vm = buildVmFromIds(ORDER);
    const exp = buildCloudCanaryExport(vm, { now: FIXED_NOW });
    const csv = serializeCloudCanaryExportToCsv(exp);
    const json = serializeCloudCanaryExportToJson(exp);

    // CSV header row (third line: comment, comment, header)
    const headerLine = csv.split("\n")[2];
    const headerCols = headerLine.split(",");
    expect(headerCols).toContain("fresh_class_count");
    expect(headerCols).not.toContain("fresh_count");

    // JSON: literal key present, old name absent
    expect(json).toMatch(/"fresh_class_count"\s*:/);
    expect(json).not.toMatch(/"fresh_count"\s*:/);
  });
});
