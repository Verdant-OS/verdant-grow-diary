/**
 * Thread 2 — Surface suspicious-flag codes on the cloud-canary view-model.
 *
 * View-model + render assertions. Closed enum vocabulary only; ID-free.
 * Reuses the shared MAC_RE/UUID_RE from the Item 4 render test.
 */
import { describe, it, expect } from "vitest";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import {
  buildCloudCanaryPreviewViewModel,
  ECOWITT_SUSPICIOUS_FLAG_CODES,
  type EcowittSuspiciousFlagCode,
} from "@/lib/ecowittCloudCanaryViewModel";
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
  "healthy",
  "all clear",
];

const mapping = fixtures.mapping as unknown as Parameters<
  typeof runEcowittCloudCanary
>[1];
const opts = { now: new Date(fixtures.now) };

function fx(ids: readonly string[]) {
  return ids.map((id) => ({
    id,
    payload: (fixtures.payloads as Record<string, unknown>)[id],
  }));
}

const ENUM_SET = new Set<string>(ECOWITT_SUSPICIOUS_FLAG_CODES);

describe("cloud-canary view-model — suspicious_flag_codes surfacing", () => {
  it("invalid_humidity fixture surfaces rh_out_of_range_invalid on its row", () => {
    const v = runEcowittCloudCanary(fx(["invalid_humidity"]), mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    expect(vm.rows).toHaveLength(1);
    expect(vm.rows[0].suspicious_flag_codes).toContain("rh_out_of_range_invalid");
  });

  it("celsius_looking_fahrenheit fixture surfaces celsius_looking_fahrenheit", () => {
    const v = runEcowittCloudCanary(
      fx(["celsius_looking_fahrenheit"]),
      mapping,
      opts,
    );
    const vm = buildCloudCanaryPreviewViewModel(v);
    expect(vm.rows[0].suspicious_flag_codes).toContain(
      "celsius_looking_fahrenheit",
    );
  });

  it("stuck_soil_extreme fixture surfaces soil_moisture_stuck_extreme", () => {
    const v = runEcowittCloudCanary(fx(["stuck_soil_extreme"]), mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    expect(vm.rows[0].suspicious_flag_codes).toContain(
      "soil_moisture_stuck_extreme",
    );
  });

  it("happy_multi_channel fixture surfaces no suspicious codes", () => {
    const v = runEcowittCloudCanary(fx(["happy_multi_channel"]), mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    expect(vm.rows[0].suspicious_flag_codes).toEqual([]);
  });

  it("top-level suspicious_flag_codes aggregates all rows, deduped + sorted", () => {
    const v = runEcowittCloudCanary(fx(ORDER), mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    const fromRows = new Set<EcowittSuspiciousFlagCode>();
    for (const r of vm.rows) for (const c of r.suspicious_flag_codes) fromRows.add(c);
    expect(vm.suspicious_flag_codes).toEqual([...fromRows].sort());
    // Sorted
    expect(vm.suspicious_flag_codes).toEqual(
      [...vm.suspicious_flag_codes].sort(),
    );
  });

  it("ALL surfaced codes (row + top level) belong to the closed enum vocabulary", () => {
    const v = runEcowittCloudCanary(fx(ORDER), mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    for (const c of vm.suspicious_flag_codes) {
      expect(ENUM_SET.has(c)).toBe(true);
    }
    for (const r of vm.rows) {
      for (const c of r.suspicious_flag_codes) {
        expect(ENUM_SET.has(c)).toBe(true);
      }
    }
  });

  it("throws on an unknown verdict code rather than passing free text through", () => {
    const v = runEcowittCloudCanary(fx(["happy_multi_channel"]), mapping, opts);
    // Synthesize an unknown code on the verdict — VM must refuse, not echo.
    const tainted = {
      ...v,
      summaries: v.summaries.map((s) => ({
        ...s,
        suspicious_flag_codes: ["AA:BB:CC:DD:EE:01" as unknown as string],
      })),
      suspicious_flag_codes: ["AA:BB:CC:DD:EE:01"],
    };
    expect(() => buildCloudCanaryPreviewViewModel(tainted)).toThrow(
      /Unknown suspicious flag code/,
    );
  });

  it("view-model is ID-free: no MAC/UUID/tent_id on any row or top level", () => {
    const v = runEcowittCloudCanary(fx(ORDER), mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    const blob = JSON.stringify(vm);
    expect(MAC_RE.test(blob)).toBe(false);
    expect(UUID_RE.test(blob)).toBe(false);
    expect(blob).not.toMatch(/tent_id|plant_id|raw_payload|passkey/i);
  });

  it("deterministic across rebuilds — row codes + top-level codes stable", () => {
    const v = runEcowittCloudCanary(fx(ORDER), mapping, opts);
    const a = buildCloudCanaryPreviewViewModel(v);
    const b = buildCloudCanaryPreviewViewModel(v);
    expect(a.suspicious_flag_codes).toEqual(b.suspicious_flag_codes);
    expect(a.rows.map((r) => r.suspicious_flag_codes)).toEqual(
      b.rows.map((r) => r.suspicious_flag_codes),
    );
  });

  it("does NOT surface a missing_metric_count field (gap deferred to a separate slice)", () => {
    const v = runEcowittCloudCanary(fx(ORDER), mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    const blob = JSON.stringify(vm);
    expect(blob).not.toMatch(/missing_metric_count/);
    for (const r of vm.rows) {
      expect(Object.keys(r)).not.toContain("missing_metric_count");
    }
  });
});

describe("CloudCanaryPreviewPanel — renders suspicious_flag_codes (Thread 2)", () => {
  it("renders the new Suspicious codes column with enum codes and no banned/health words, no MAC/UUID", async () => {
    const React = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { CloudCanaryPreviewPanel } = await import(
      "@/pages/OperatorEcowittCanary"
    );
    const html = renderToString(React.createElement(CloudCanaryPreviewPanel));

    // Column header + per-row column marker exist.
    expect(html).toContain("Suspicious codes");
    expect(html).toContain('data-col="suspicious-codes"');

    // At least one known code chip is rendered (real fixtures include
    // invalid_humidity, stuck_soil_extreme, celsius_looking_fahrenheit).
    expect(html).toContain('data-suspicious-code="rh_out_of_range_invalid"');
    expect(html).toContain('data-suspicious-code="celsius_looking_fahrenheit"');

    // ID-free render.
    expect(MAC_RE.test(html)).toBe(false);
    expect(UUID_RE.test(html)).toBe(false);

    // No banned / health-implying words anywhere in rendered HTML.
    const lower = html.toLowerCase();
    for (const w of BANNED) expect(lower).not.toContain(w);
  });
});
