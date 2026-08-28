/**
 * EcoWitt tent Snapshot V0 — tent-scope isolation on the V0 view-model only.
 *
 * Tests-only (Testy / Forum Tangie). Does not duplicate legacy
 * `selectEcowittCandidates` proofs in:
 *   - ecowitt-latest-snapshot-filtering.test.tsx
 *     ("filters by tent_id and never bleeds another tent's newer reading in")
 *   - ecowitt-persisted-latest-snapshot-ui.test.tsx
 *     ("ignores newer rows from a different tent")
 *
 * Product under test: `buildEcowittTentSnapshotV0ViewModel` filters
 * `options.tentId`. V0 has no plantId option — plant_id on a foreign tent
 * must still be dropped by the tent filter.
 */
import { describe, expect, it } from "vitest";
import { buildEcowittTentSnapshotV0ViewModel } from "@/lib/ecowittTentSnapshotV0ViewModel";

const NOW = new Date("2026-08-20T18:00:00.000Z");
const FRESH_AT = "2026-08-20T17:50:00.000Z";
const NEWER_AT = "2026-08-20T17:55:00.000Z";
const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const PLANT = "33333333-3333-4333-8333-333333333333";

function row(
  overrides: Partial<{
    tent_id: string | null;
    plant_id: string | null;
    metric: string;
    value: number;
    captured_at: string;
  }> = {},
) {
  const capturedAt = overrides.captured_at ?? FRESH_AT;
  return {
    tent_id: overrides.tent_id === undefined ? TENT_A : overrides.tent_id,
    plant_id: overrides.plant_id === undefined ? null : overrides.plant_id,
    source: "live" as const,
    captured_at: capturedAt,
    metric: overrides.metric ?? "temperature_c",
    value: overrides.value ?? 24,
    raw_payload: { vendor: "ecowitt", dateutc: capturedAt },
  };
}

describe("buildEcowittTentSnapshotV0ViewModel — tent isolation", () => {
  it("newer tent B row never appears on tent A", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({
          tent_id: TENT_A,
          metric: "temperature_c",
          value: 24,
          captured_at: FRESH_AT,
        }),
        row({
          tent_id: TENT_B,
          metric: "temperature_c",
          value: 99,
          captured_at: NEWER_AT,
        }),
      ],
      { tentId: TENT_A, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.value).toBe(24);
    expect(temp?.capturedAt).toBe(FRESH_AT);
    expect(temp?.value).not.toBe(99);
  });

  it("null tent_id rows never bleed into a scoped tent", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({
          tent_id: null,
          metric: "humidity_pct",
          value: 88,
          captured_at: NEWER_AT,
        }),
        row({
          tent_id: TENT_A,
          metric: "humidity_pct",
          value: 55,
          captured_at: FRESH_AT,
        }),
      ],
      { tentId: TENT_A, now: NOW },
    );
    const rh = vm.metrics.find((m) => m.key === "rh");
    expect(rh?.value).toBe(55);
    expect(rh?.value).not.toBe(88);
  });

  it("same plant_id on tent B never leaks into tent A (V0 tent filter only)", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({
          tent_id: TENT_A,
          plant_id: PLANT,
          metric: "soil_moisture_pct",
          value: 40,
          captured_at: FRESH_AT,
        }),
        row({
          tent_id: TENT_B,
          plant_id: PLANT,
          metric: "soil_moisture_pct",
          value: 91,
          captured_at: NEWER_AT,
        }),
      ],
      { tentId: TENT_A, now: NOW },
    );
    const soil = vm.metrics.find((m) => m.key === "soil");
    expect(soil?.value).toBe(40);
    expect(soil?.value).not.toBe(91);
  });
});
