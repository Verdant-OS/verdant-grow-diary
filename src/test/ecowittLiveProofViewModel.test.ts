import { describe, it, expect } from "vitest";
import { buildEcowittLiveProofViewModel } from "@/lib/ecowittLiveProofViewModel";
import type { EcowittProofRow } from "@/lib/ecowittLiveProofRules";

const NOW = new Date("2026-06-19T12:00:00Z");
const NOW_MS = NOW.getTime();
const iso = (offsetMs: number) => new Date(NOW_MS + offsetMs).toISOString();
const min = (m: number) => m * 60_000;
const hr = (h: number) => h * 60 * 60_000;

function row(overrides: Partial<EcowittProofRow>): EcowittProofRow {
  return {
    id: "r",
    tent_id: "t-1",
    source: "live",
    captured_at: iso(-min(1)),
    raw_payload: { vendor: "ecowitt" },
    metric: "temp",
    value: 24,
    unit: "C",
    ...overrides,
  };
}

describe("buildEcowittLiveProofViewModel", () => {
  it("returns calm empty when tentId missing", () => {
    const vm = buildEcowittLiveProofViewModel([row({})], { tentId: null, now: NOW });
    expect(vm.acceptedCount).toBe(0);
    expect(vm.candidateStatus).toBeNull();
    expect(vm.headline).toMatch(/No EcoWitt/);
  });

  it("calm empty when no ecowitt rows in window", () => {
    const vm = buildEcowittLiveProofViewModel([row({ source: "manual", raw_payload: null })], {
      tentId: "t-1",
      now: NOW,
    });
    expect(vm.acceptedCount).toBe(0);
    expect(vm.rejectedCount).toBe(0);
    expect(vm.totalEcowittInWindow).toBe(0);
    expect(vm.detail).toMatch(/current proof window/);
  });

  it("fresh canonical live ecowitt → live_confirmed, accepted=1", () => {
    const vm = buildEcowittLiveProofViewModel([row({})], { tentId: "t-1", now: NOW });
    expect(vm.candidateStatus).toBe("live_confirmed");
    expect(vm.acceptedCount).toBe(1);
    expect(vm.tone).toBe("ok");
    expect(vm.isLegacyBridgeSource).toBe(false);
    expect(vm.headline).toMatch(/EcoWitt live ingest confirmed/);
  });

  it("shows testbench-only evidence without confirming live ingest", () => {
    const vm = buildEcowittLiveProofViewModel(
      [row({ raw_payload: { vendor: "ecowitt_windows_testbench" } })],
      { tentId: "t-1", now: NOW },
    );
    expect(vm.candidateStatus).toBe("testbench");
    expect(vm.acceptedCount).toBe(0);
    expect(vm.rejectedCount).toBe(1);
    expect(vm.tone).toBe("neutral");
    expect(vm.headline).toMatch(/testbench packet received/i);
    expect(vm.detail).toMatch(/cannot confirm a physical EcoWitt sensor/i);
  });

  it("prefers genuine live evidence when a newer testbench row exists", () => {
    const real = row({
      id: "real",
      captured_at: iso(-min(2)),
      raw_payload: {
        vendor: "ecowitt_windows_testbench",
        metadata: {
          reported_verdant_source: "live",
          raw_payload: {
            stationtype: "GW2000A_V3.2.4",
            model: "GW2000A",
            dateutc: "2026-06-19 11:58:00",
          },
        },
      },
    });
    const testbench = row({
      id: "test",
      captured_at: iso(-min(1)),
      raw_payload: {
        vendor: "ecowitt_windows_testbench",
        metadata: { confidence: "test" },
      },
    });
    const vm = buildEcowittLiveProofViewModel([testbench, real], {
      tentId: "t-1",
      now: NOW,
    });
    expect(vm.candidateStatus).toBe("live_confirmed");
    expect(vm.candidateCapturedAt).toBe(real.captured_at);
    expect(vm.acceptedCount).toBe(1);
    expect(vm.rejectedCount).toBe(1);
  });

  it("never lets testbench soil rows satisfy physical three-sample history", () => {
    const real = row({
      id: "real",
      metric: "soil_moisture_pct",
      value: 47,
      captured_at: iso(-min(1)),
      raw_payload: {
        vendor: "ecowitt_windows_testbench",
        metadata: {
          reported_verdant_source: "live",
          raw_payload: {
            stationtype: "GW2000A_V3.2.4",
            model: "GW2000A",
            dateutc: "2026-06-19 11:59:00",
          },
        },
      },
    });
    const diagnostic = (id: string, minutes: number, value: number) =>
      row({
        id,
        metric: "soil_moisture_pct",
        value,
        captured_at: iso(-min(minutes)),
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "test" },
        },
      });
    const vm = buildEcowittLiveProofViewModel(
      [diagnostic("test-1", 2, 44), real, diagnostic("test-2", 3, 41)],
      { tentId: "t-1", now: NOW },
    );
    expect(vm.candidateStatus).toBe("limited");
    expect(vm.acceptedCount).toBe(0);
    expect(vm.rejectedCount).toBe(3);
  });

  it("legacy ecowitt source surfaces legacy bridge copy", () => {
    const vm = buildEcowittLiveProofViewModel([row({ source: "ecowitt", raw_payload: null })], {
      tentId: "t-1",
      now: NOW,
    });
    expect(vm.candidateStatus).toBe("live_confirmed");
    expect(vm.isLegacyBridgeSource).toBe(true);
    expect(vm.headline).toMatch(/EcoWitt bridge source, legacy/);
    expect(vm.detail).toMatch(/EcoWitt bridge source/);
  });

  it("counts accepted vs rejected within window", () => {
    const rows: EcowittProofRow[] = [
      row({ id: "a" }), // live
      row({ id: "b", captured_at: iso(-hr(2)) }), // stale
      row({ id: "c", metric: "rh", value: 100 }), // invalid
      row({ id: "d", source: "manual" }), // not_ecowitt → ignored
      row({ id: "e", captured_at: iso(-hr(25)) }), // outside window → ignored
    ];
    const vm = buildEcowittLiveProofViewModel(rows, { tentId: "t-1", now: NOW });
    expect(vm.acceptedCount).toBe(1);
    expect(vm.rejectedCount).toBe(2);
    expect(vm.totalEcowittInWindow).toBe(3);
  });

  it("picks newest valid candidate even when input is unsorted", () => {
    const old = row({ id: "old", captured_at: iso(-min(20)) });
    const newer = row({ id: "newer", captured_at: iso(-min(2)) });
    const vm = buildEcowittLiveProofViewModel([old, newer], { tentId: "t-1", now: NOW });
    expect(vm.candidateCapturedAt).toBe(newer.captured_at);
  });

  it("scopes to the named 24h proof window", () => {
    const vm = buildEcowittLiveProofViewModel([row({ captured_at: iso(-hr(25)) })], {
      tentId: "t-1",
      now: NOW,
    });
    expect(vm.totalEcowittInWindow).toBe(0);
    expect(vm.windowLabel).toBe("last 24 hours");
  });

  it("only emits allowlisted metric labels", () => {
    const vm = buildEcowittLiveProofViewModel([row({ metric: "rh", value: 55 })], {
      tentId: "t-1",
      now: NOW,
    });
    expect(vm.candidateMetricLabels).toEqual(["Humidity"]);
  });

  it("omits unknown metric keys (no raw payload leakage)", () => {
    const vm = buildEcowittLiveProofViewModel([row({ metric: "PASSKEY_secret", value: 1 })], {
      tentId: "t-1",
      now: NOW,
    });
    expect(vm.candidateMetricLabels).toEqual([]);
  });

  it("future timestamps classify as invalid (rejected)", () => {
    const vm = buildEcowittLiveProofViewModel([row({ captured_at: iso(min(10)) })], {
      tentId: "t-1",
      now: NOW,
    });
    expect(vm.acceptedCount).toBe(0);
    expect(vm.rejectedCount).toBe(1);
  });
});
