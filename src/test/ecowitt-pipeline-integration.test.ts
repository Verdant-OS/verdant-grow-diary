import { describe, it, expect } from "vitest";
import { buildEcowittLatestSnapshot } from "@/lib/ecowittLatestSnapshotFilter";
import { ECOWITT_DERIVED_VPD_LABEL } from "@/lib/ecowittReadingViewModel";

const NOW = new Date("2026-06-04T12:30:00Z");
const FRESH_AT = "2026-06-04T12:20:00Z";
const STALE_AT = "2026-06-04T08:00:00Z";
const TENT = "11111111-1111-1111-1111-111111111111";

describe("EcoWitt pipeline integration: payload → snapshot view-model", () => {
  it("normalizes a fresh EcoWitt payload end-to-end and renders Ecowitt/live", () => {
    const vm = buildEcowittLatestSnapshot(
      [
        {
          tent_id: TENT,
          source: "ecowitt",
          captured_at: FRESH_AT,
          raw_payload: {
            vendor: "ecowitt",
            temp1f: 77,
            humidity1: 55,
            soilmoisture1: 40,
            co2: 850,
            dateutc: FRESH_AT,
            passkey: "should-not-leak",
          },
        },
      ],
      { tentId: TENT },
      { now: NOW },
    );
    expect(vm.hasReading).toBe(true);
    expect(vm.sourceLabel?.label).toBe("Ecowitt");
    expect(vm.invalid).toBe(false);
    expect(vm.derivedVpdKpa).not.toBeNull();
    expect(ECOWITT_DERIVED_VPD_LABEL).toBe("Derived VPD");
  });

  it("manual EcoWitt reading renders Manual, never Live", () => {
    const vm = buildEcowittLatestSnapshot(
      [
        {
          tent_id: TENT,
          source: "manual",
          captured_at: FRESH_AT,
          raw_payload: { vendor: "ecowitt", temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
        },
      ],
      { tentId: TENT },
      { now: NOW },
    );
    expect(vm.sourceLabel?.label).toBe("Manual");
    expect(vm.sourceLabel?.label).not.toBe("Live");
  });

  it("stale EcoWitt reading renders Stale, never Live", () => {
    const vm = buildEcowittLatestSnapshot(
      [
        {
          tent_id: TENT,
          source: "ecowitt",
          captured_at: STALE_AT,
          raw_payload: { vendor: "ecowitt", temp1f: 77, humidity1: 55, dateutc: STALE_AT },
        },
      ],
      { tentId: TENT },
      { now: NOW },
    );
    expect(vm.sourceLabel?.label).toBe("Stale");
  });

  it("invalid EcoWitt reading (RH > 100) renders Invalid with calm copy", () => {
    const vm = buildEcowittLatestSnapshot(
      [
        {
          tent_id: TENT,
          source: "ecowitt",
          captured_at: FRESH_AT,
          raw_payload: { vendor: "ecowitt", temp1f: 77, humidity1: 200, dateutc: FRESH_AT },
        },
      ],
      { tentId: TENT },
      { now: NOW },
    );
    expect(vm.invalid).toBe(true);
    expect(vm.source).toBe("invalid");
    expect(vm.sourceLabel?.label).toBe("Invalid");
    expect(vm.derivedVpdKpa).toBeNull();
    expect(vm.unavailableReason).toBeTruthy();
    expect(vm.unavailableReason?.toLowerCase()).not.toContain("healthy");
  });

  it("never produces 'VPD Live' or 'Live VPD' in any presenter field", () => {
    const vm = buildEcowittLatestSnapshot(
      [
        {
          tent_id: TENT,
          source: "ecowitt",
          captured_at: FRESH_AT,
          raw_payload: { vendor: "ecowitt", temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
        },
      ],
      { tentId: TENT },
      { now: NOW },
    );
    const dump = JSON.stringify({
      label: vm.sourceLabel?.label,
      empty: vm.emptyStateMessage,
      reason: vm.unavailableReason,
      derivedVpdLabel: ECOWITT_DERIVED_VPD_LABEL,
    }).toLowerCase();
    expect(dump).not.toContain("vpd live");
    expect(dump).not.toContain("live vpd");
  });

  it("preserves raw payload and never echoes suppressed credential values", () => {
    const payload = {
      vendor: "ecowitt",
      temp1f: 77,
      humidity1: 55,
      dateutc: FRESH_AT,
      passkey: "SECRET-KEY",
    };
    const vm = buildEcowittLatestSnapshot(
      [{ tent_id: TENT, source: "ecowitt", captured_at: FRESH_AT, raw_payload: payload }],
      { tentId: TENT },
      { now: NOW },
    );
    // Raw payload is preserved verbatim on the snapshot (server-side ingest
    // strips credentials before persisting; this test only proves the view
    // model never surfaces credential text in user-facing fields).
    const userFacing = JSON.stringify({
      metrics: vm.metrics,
      label: vm.sourceLabel?.label,
      reason: vm.unavailableReason,
    });
    expect(userFacing).not.toContain("SECRET-KEY");
    expect(userFacing).not.toContain("passkey");
    expect(vm.snapshot?.rawPayload).toBe(payload);
  });
});
