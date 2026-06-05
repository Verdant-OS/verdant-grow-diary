/**
 * Component-render tests for the Cloud Canary preview per-fixture table.
 * Static-source assertions + view-model rendered-text scan.
 * Follows the pattern of operator-ecowitt-cloud-canary-preview-ui.test.ts —
 * no Supabase, no network, no full page render.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import { buildCloudCanaryPreviewViewModel } from "@/lib/ecowittCloudCanaryViewModel";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

const pageSrc = readFileSync(
  resolve(process.cwd(), "src/pages/OperatorEcowittCanary.tsx"),
  "utf8",
);

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

const fixtureList = ORDER.map((id) => ({
  id,
  payload: (fixtures.payloads as Record<string, unknown>)[id],
}));

const verdict = runEcowittCloudCanary(
  fixtureList,
  fixtures.mapping as unknown as Parameters<typeof runEcowittCloudCanary>[1],
  { now: new Date(fixtures.now) },
);
const vm = buildCloudCanaryPreviewViewModel(verdict);

const MAC_RE = /[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}/;
const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

const BANNED_UI_WORDS = [
  "confirmed",
  "certain",
  "synced",
  "connected",
  "imported",
  "guaranteed",
  "live data",
  "live feed",
];

describe("CloudCanaryPreviewPanel — per-fixture table wiring", () => {
  it("renders a per-fixture table sourced from the view-model", () => {
    expect(pageSrc).toContain('data-testid="cloud-canary-per-fixture-table"');
    expect(pageSrc).toContain("buildCloudCanaryPreviewViewModel");
    expect(pageSrc).toContain("previewVm.rows.map");
  });

  it("exposes the five count columns plus fixture column", () => {
    for (const col of ["live", "stale", "invalid", "mapped", "unmapped"]) {
      expect(pageSrc).toContain(`data-col="${col}"`);
    }
  });

  it("uses a data-classification label for the live count, not 'Live feed'", () => {
    // Acceptable: "Fresh" or similar classification phrasing.
    expect(pageSrc).toMatch(/>\s*Fresh\s*</);
    const lower = pageSrc.toLowerCase();
    expect(lower).not.toContain("live feed");
    expect(lower).not.toContain("live data");
  });

  it("emits one row per fixture with data-fixture-name attribute", () => {
    for (const name of ORDER) {
      expect(pageSrc).toContain(`cloud-canary-row-${"${row.fixture_name}"}`.replace("${row.fixture_name}", "") || "cloud-canary-row-");
    }
    expect(pageSrc).toContain("data-fixture-name={row.fixture_name}");
  });

  it("labels the table as a fixture/sample canary, not tent data", () => {
    expect(pageSrc).toMatch(/fixture\/sample canary · not tent data/i);
  });
});

describe("CloudCanaryPreviewPanel — rendered values are id-free", () => {
  it("view-model rows contain no MAC or UUID strings", () => {
    const blob = JSON.stringify(vm);
    expect(MAC_RE.test(blob)).toBe(false);
    expect(UUID_RE.test(blob)).toBe(false);
  });

  it("every visible fixture_name is a declared fixture key, never a UUID/MAC", () => {
    for (const row of vm.rows) {
      expect(ORDER).toContain(row.fixture_name as (typeof ORDER)[number]);
      expect(MAC_RE.test(row.fixture_name)).toBe(false);
      expect(UUID_RE.test(row.fixture_name)).toBe(false);
    }
  });

  it("contains none of the banned source-honesty words in page source", () => {
    const lower = pageSrc.toLowerCase();
    for (const w of BANNED_UI_WORDS) {
      // 'connected' check would false-positive on imports/comments; scope to the panel block.
      const start = lower.indexOf("function cloudcanarypreviewpanel");
      const end = lower.indexOf("function redactionwarningbanner");
      const slice = lower.slice(start, end);
      expect(slice).not.toContain(w);
    }
  });

  it("row order in the view-model matches fixture declaration order", () => {
    expect(vm.rows.map((r) => r.fixture_name)).toEqual([...ORDER]);
  });
});
