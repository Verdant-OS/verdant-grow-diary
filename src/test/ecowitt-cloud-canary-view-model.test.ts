/**
 * View-model tests for the Cloud Canary preview (Item 4).
 * - rows carry counts and NO id-like field
 * - row order is deterministic (matches fixture declaration order)
 * - no MAC/UUID string leaks into view-model output
 */
import { describe, it, expect } from "vitest";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import {
  buildCloudCanaryPreviewViewModel,
  type CloudCanaryPreviewRow,
} from "@/lib/ecowittCloudCanaryViewModel";
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

const MAC_RE = /[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}/;
const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

const BANNED_KEYS = new Set([
  "tent_id",
  "plant_id",
  "device_id",
  "mac",
  "MAC",
  "passkey",
  "PASSKEY",
  "raw_payload",
  "id",
  "fixture_id",
]);

function fixtureList(ids: readonly string[]) {
  return ids.map((id) => ({
    id,
    payload: (fixtures.payloads as Record<string, unknown>)[id],
  }));
}

const verdict = runEcowittCloudCanary(
  fixtureList(ORDER),
  fixtures.mapping as unknown as Parameters<typeof runEcowittCloudCanary>[1],
  { now: new Date(fixtures.now) },
);

describe("buildCloudCanaryPreviewViewModel", () => {
  const vm = buildCloudCanaryPreviewViewModel(verdict);

  it("emits one row per fixture summary", () => {
    expect(vm.rows.length).toBe(verdict.summaries.length);
    expect(vm.rows.length).toBe(ORDER.length);
  });

  it("preserves fixture declaration order deterministically", () => {
    expect(vm.rows.map((r) => r.fixture_name)).toEqual([...ORDER]);
    // Re-run to confirm determinism
    const vm2 = buildCloudCanaryPreviewViewModel(verdict);
    expect(vm2.rows.map((r) => r.fixture_name)).toEqual(
      vm.rows.map((r) => r.fixture_name),
    );
  });

  it("carries the five count fields plus fixture_name and state, nothing else", () => {
    const expectedKeys: Array<keyof CloudCanaryPreviewRow> = [
      "fixture_name",
      "live_count",
      "stale_count",
      "invalid_count",
      "mapped_count",
      "unmapped_count",
      "state",
      "suspicious_flag_codes",
      "missing_metric_codes",
    ];
    for (const row of vm.rows) {
      const keys = Object.keys(row).sort();
      expect(keys).toEqual([...expectedKeys].sort());
    }
  });

  it("never carries id-like fields on any row", () => {
    for (const row of vm.rows) {
      for (const key of Object.keys(row)) {
        expect(BANNED_KEYS.has(key)).toBe(false);
      }
    }
  });

  it("contains no MAC or UUID string anywhere in the serialized view-model", () => {
    const blob = JSON.stringify(vm);
    expect(MAC_RE.test(blob)).toBe(false);
    expect(UUID_RE.test(blob)).toBe(false);
  });

  it("mapped_count equals live + stale + invalid for every row (partition honesty)", () => {
    for (const row of vm.rows) {
      expect(row.live_count + row.stale_count + row.invalid_count).toBe(
        row.mapped_count,
      );
    }
  });

  it("unmapped_count is reported as a separate column (not folded into mapped)", () => {
    for (let i = 0; i < vm.rows.length; i++) {
      const row = vm.rows[i];
      const src = verdict.summaries[i];
      expect(row.unmapped_count).toBe(src.unmapped_count);
      // unmapped MUST NOT be summed into mapped_count
      expect(row.mapped_count).toBe(src.mapped_count);
    }
  });

  it("zeros render as numeric 0 (not omitted)", () => {
    for (const row of vm.rows) {
      expect(typeof row.live_count).toBe("number");
      expect(typeof row.stale_count).toBe("number");
      expect(typeof row.invalid_count).toBe("number");
      expect(typeof row.unmapped_count).toBe("number");
    }
  });
});
