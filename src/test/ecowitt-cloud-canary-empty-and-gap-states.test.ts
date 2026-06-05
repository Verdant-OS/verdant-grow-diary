/**
 * Item 2 — Empty state + zero-mapped warning for Cloud Canary preview.
 * View-model owns state discrimination; component is presenter-only.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  runEcowittCloudCanary,
  type EcowittCloudCanaryVerdict,
} from "@/lib/ecowittCloudCanaryVerdict";
import { buildCloudCanaryPreviewViewModel } from "@/lib/ecowittCloudCanaryViewModel";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

const MAC_RE = /[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}/;
const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const BANNED = [
  "confirmed",
  "certain",
  "synced",
  "connected",
  "imported",
  "guaranteed",
  "live data",
  "live feed",
  "all clear",
  "healthy",
];

const mapping = fixtures.mapping as unknown as Parameters<
  typeof runEcowittCloudCanary
>[1];
const opts = { now: new Date(fixtures.now) };

function fx(ids: string[]) {
  return ids.map((id) => ({
    id,
    payload: (fixtures.payloads as Record<string, unknown>)[id],
  }));
}

describe("Cloud Canary view-model — empty vs zero-mapped gap states", () => {
  it("empty input -> 'empty' state, is_empty=true, no rows", () => {
    const v = runEcowittCloudCanary([], mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    expect(vm.state).toBe("empty");
    expect(vm.is_empty).toBe(true);
    expect(vm.rows).toEqual([]);
  });

  it("empty state is NOT mistaken for a zero-mapped gap", () => {
    const v = runEcowittCloudCanary([], mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    expect(vm.rows.some((r) => r.state === "zero_mapped_gap")).toBe(false);
    expect(vm.state).not.toBe("populated");
  });

  it("fixture with mapped_count==0 and unmapped_count>0 -> 'zero_mapped_gap'", () => {
    // 'unmapped_channel' uses temp7f/humidity7 which have no mapping
    const v = runEcowittCloudCanary(fx(["unmapped_channel"]), mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    expect(vm.is_empty).toBe(false);
    expect(vm.state).toBe("populated");
    expect(vm.rows).toHaveLength(1);
    const row = vm.rows[0];
    expect(row.mapped_count).toBe(0);
    expect(row.unmapped_count).toBeGreaterThan(0);
    expect(row.state).toBe("zero_mapped_gap");
  });

  it("normal fixture -> 'normal' (neither empty nor gap)", () => {
    const v = runEcowittCloudCanary(fx(["happy_multi_channel"]), mapping, opts);
    const vm = buildCloudCanaryPreviewViewModel(v);
    expect(vm.state).toBe("populated");
    expect(vm.is_empty).toBe(false);
    expect(vm.rows[0].mapped_count).toBeGreaterThan(0);
    expect(vm.rows[0].state).toBe("normal");
  });

  it("mixed set: each row state decided independently; preview not empty", () => {
    const v = runEcowittCloudCanary(
      fx(["happy_multi_channel", "unmapped_channel", "pressure_present"]),
      mapping,
      opts,
    );
    const vm = buildCloudCanaryPreviewViewModel(v);
    expect(vm.is_empty).toBe(false);
    expect(vm.state).toBe("populated");
    const byName = Object.fromEntries(
      vm.rows.map((r) => [r.fixture_name, r.state]),
    );
    expect(byName.happy_multi_channel).toBe("normal");
    expect(byName.unmapped_channel).toBe("zero_mapped_gap");
    expect(byName.pressure_present).toBe("normal");
  });

  it("row state is deterministic across rebuilds", () => {
    const v = runEcowittCloudCanary(
      fx(["happy_multi_channel", "unmapped_channel"]),
      mapping,
      opts,
    );
    const a = buildCloudCanaryPreviewViewModel(v);
    const b = buildCloudCanaryPreviewViewModel(v);
    expect(a.rows.map((r) => r.state)).toEqual(b.rows.map((r) => r.state));
  });
});

describe("Cloud Canary panel — render states (Item 2)", () => {
  const pageSrc = readFileSync(
    resolve(process.cwd(), "src/pages/OperatorEcowittCanary.tsx"),
    "utf8",
  );

  it("panel source contains an empty-state branch with neutral copy", () => {
    expect(pageSrc).toContain('data-testid="cloud-canary-empty-state"');
    expect(pageSrc).toMatch(/Nothing to preview/);
    expect(pageSrc).toMatch(/No fixtures are available/);
  });

  it("panel source contains a zero-mapped warning with caution copy pointing at mapping config", () => {
    expect(pageSrc).toContain(
      'data-testid="cloud-canary-zero-mapped-warning"',
    );
    expect(pageSrc).toMatch(/Mapping gap/);
    expect(pageSrc).toMatch(
      /Readings present but none mapped to a tent — check mapping config\./,
    );
  });

  it("panel source switches on previewVm.state from the view-model", () => {
    expect(pageSrc).toMatch(/previewVm\.state\s*===\s*"empty"/);
    expect(pageSrc).toContain('data-row-state={row.state}');
  });

  it("rendered panel (gap state present, real fixtures) contains caution copy, no banned/health words, no MAC/UUID", async () => {
    const React = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { CloudCanaryPreviewPanel } = await import(
      "@/pages/OperatorEcowittCanary"
    );
    const html = renderToString(React.createElement(CloudCanaryPreviewPanel));

    // Real fixtures include 'unmapped_channel' which triggers a gap row
    expect(html).toContain("Mapping gap");
    expect(html).toContain(
      "Readings present but none mapped to a tent — check mapping config.",
    );
    expect(html).toContain('data-row-state="zero_mapped_gap"');

    const lower = html.toLowerCase();
    for (const w of BANNED) {
      expect(lower).not.toContain(w);
    }

    expect(MAC_RE.test(html)).toBe(false);
    expect(UUID_RE.test(html)).toBe(false);
  });

  it("rendered empty-state branch (synthetic empty verdict via view-model) is neutral and gap-free", () => {
    const v: EcowittCloudCanaryVerdict = {
      summaries: [],
      totals: { mapped: 0, unmapped: 0, invalid: 0, stale: 0, live: 0 },
      suspicious_flag_codes: [],
      any_missing_metric: false,
      any_ec_metric_invented: false,
    };
    const vm = buildCloudCanaryPreviewViewModel(v);
    expect(vm.state).toBe("empty");
    // No row carries a gap state in the empty case
    expect(vm.rows.some((r) => r.state === "zero_mapped_gap")).toBe(false);
  });
});
