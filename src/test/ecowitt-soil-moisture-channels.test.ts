/**
 * Targeted tests verifying EcoWitt soil moisture support across:
 *  - payload-rules channel detection (channels 1–16)
 *  - payload-adapter channel detection
 *  - validation view-model alias coverage for soilmoistureN
 *
 * Pure tests — no I/O, no network.
 */
import { describe, it, expect } from "vitest";
import { extractEcowittReadings } from "@/lib/ecowittPayloadRules";
import { adaptEcowittPayload } from "@/lib/ecowittPayloadAdapter";
import { buildEcowittIngestValidationViewModel } from "@/lib/ecowittIngestValidationViewModel";

const MAC = "AA:BB:CC:DD:EE:FF";
const NOW = "2026-06-08T12:00:00.000Z";

function payload(extra: Record<string, unknown>) {
  return {
    PASSKEY: "x",
    stationtype: "GW1100A_V2.3.0",
    dateutc: "2026-06-08 12:00:00",
    freq: "868M",
    model: "GW1100A",
    mac: MAC,
    ...extra,
  };
}

const tentMap = {
  perMac: {
    [MAC.toLowerCase()]: {
      air: {},
      soil: {
        1: "tent-1",
        9: "tent-1",
        16: "tent-1",
      },
    },
  },
};

describe("EcoWitt soil moisture — payload-rules channel coverage 1–16", () => {
  it("maps soilmoisture1=33 → soil_moisture_pct: 33 (accepted)", () => {
    const out = extractEcowittReadings(
      payload({ soilmoisture1: "33" }),
      "ecowitt",
      { now: NOW, ...tentMap },
    );
    const r = out.readings.find((x) => x.metric === "soil_moisture_pct");
    expect(r).toBeDefined();
    expect(r!.value).toBe(33);
    expect(r!.raw_payload?.channel).toBe(1);
    expect(r!.raw_payload?.raw_key).toBe("soilmoisture1");
    expect(r!.source).toBe("live");
  });

  it("maps soilmoisture9 (>8) → soil_moisture_pct, channel preserved", () => {
    const out = extractEcowittReadings(
      payload({ soilmoisture9: "42" }),
      "ecowitt",
      { now: NOW, ...tentMap },
    );
    const r = out.readings.find((x) => x.metric === "soil_moisture_pct");
    expect(r).toBeDefined();
    expect(r!.value).toBe(42);
    expect(r!.raw_payload?.channel).toBe(9);
    expect(r!.raw_payload?.raw_key).toBe("soilmoisture9");
  });

  it("maps soilmoisture16 → soil_moisture_pct (top of supported range)", () => {
    const out = extractEcowittReadings(
      payload({ soilmoisture16: "55" }),
      "ecowitt",
      { now: NOW, ...tentMap },
    );
    const r = out.readings.find((x) => x.metric === "soil_moisture_pct");
    expect(r).toBeDefined();
    expect(r!.value).toBe(55);
    expect(r!.raw_payload?.channel).toBe(16);
  });

  it("soilmoisture1=-1 is invalid / not healthy", () => {
    const out = extractEcowittReadings(
      payload({ soilmoisture1: "-1" }),
      "ecowitt",
      { now: NOW, ...tentMap },
    );
    const r = out.readings.find((x) => x.metric === "soil_moisture_pct");
    expect(r).toBeDefined();
    expect(r!.source).toBe("invalid");
  });

  it("soilmoisture1=101 is invalid / not healthy", () => {
    const out = extractEcowittReadings(
      payload({ soilmoisture1: "101" }),
      "ecowitt",
      { now: NOW, ...tentMap },
    );
    const r = out.readings.find((x) => x.metric === "soil_moisture_pct");
    expect(r).toBeDefined();
    expect(r!.source).toBe("invalid");
  });

  it("soilmoisture1=0 is preserved but flagged invalid (stuck-extreme rule)", () => {
    const out = extractEcowittReadings(
      payload({ soilmoisture1: "0" }),
      "ecowitt",
      { now: NOW, ...tentMap },
    );
    const r = out.readings.find((x) => x.metric === "soil_moisture_pct");
    expect(r).toBeDefined();
    expect(r!.value).toBe(0);
    // stuck-at-extreme is forced to invalid by existing payload rules.
    expect(r!.source).toBe("invalid");
  });

  it("soilmoisture1=100 is preserved but flagged invalid (stuck-extreme rule)", () => {
    const out = extractEcowittReadings(
      payload({ soilmoisture1: "100" }),
      "ecowitt",
      { now: NOW, ...tentMap },
    );
    const r = out.readings.find((x) => x.metric === "soil_moisture_pct");
    expect(r).toBeDefined();
    expect(r!.value).toBe(100);
    expect(r!.source).toBe("invalid");
  });

  it("payload without any soilmoistureN emits no soil_moisture_pct reading", () => {
    const out = extractEcowittReadings(
      payload({ tempf: "72.4" }),
      "ecowitt",
      { now: NOW, ...tentMap },
    );
    const r = out.readings.find((x) => x.metric === "soil_moisture_pct");
    expect(r).toBeUndefined();
  });
});

describe("EcoWitt soil moisture — payload-adapter channel coverage 1–16", () => {
  it("adapts soilmoisture12 → soil_moisture_pct reading", () => {
    const result = adaptEcowittPayload({
      payload: payload({ soilmoisture12: "47" }),
      sourceLabel: "ecowitt",
      receivedAt: NOW,
    });
    const r = result.readings.find(
      (x: { metric: string }) => x.metric === "soil_moisture_pct",
    );
    expect(r).toBeDefined();
    expect(r!.value).toBe(47);
  });

  it("still adapts legacy soilmoisture1 → soil_moisture_pct reading", () => {
    const result = adaptEcowittPayload({
      payload: payload({ soilmoisture1: "33" }),
      sourceLabel: "ecowitt",
      receivedAt: NOW,
    });
    const r = result.readings.find(
      (x: { metric: string }) => x.metric === "soil_moisture_pct",
    );
    expect(r).toBeDefined();
    expect(r!.value).toBe(33);
  });
});

describe("EcoWitt validation view-model — soil_moisture_pct alias coverage", () => {
  function row(rawPayload: Record<string, unknown>) {
    return {
      metric: "soil_moisture_pct",
      value: null,
      captured_at: NOW,
      ts: NOW,
      source: "ecowitt",
      raw_payload: {
        ...rawPayload,
        metadata: { test_sender: true, transport: "webhook" },
      },
    };
  }

  it("soilmoisture1=33 in raw payload → metric row Accepted", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [row({ soilmoisture1: 33 })],
      now: new Date(NOW),
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m).toBeDefined();
    expect(m!.status).toBe("accepted");
    expect(m!.value).toBe(33);
  });

  it("soilmoisture9 (channel >8) is recognized as the soil_moisture_pct alias", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [row({ soilmoisture9: 41 })],
      now: new Date(NOW),
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m!.present).toBe(true);
    expect(m!.status).toBe("accepted");
    expect(m!.value).toBe(41);
  });

  it("soilmoisture16 is recognized as the soil_moisture_pct alias", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [row({ soilmoisture16: 22 })],
      now: new Date(NOW),
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m!.present).toBe(true);
    expect(m!.value).toBe(22);
  });

  it("soilmoisture1=-1 rejects (outside 0–100)", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [row({ soilmoisture1: -1 })],
      now: new Date(NOW),
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m!.status).toBe("rejected");
  });

  it("soilmoisture1=101 rejects (outside 0–100)", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [row({ soilmoisture1: 101 })],
      now: new Date(NOW),
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m!.status).toBe("rejected");
  });

  it("missing soil moisture stays missing, never auto-accepted", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [row({ tempf: 72 })],
      now: new Date(NOW),
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m!.present).toBe(false);
    expect(m!.status).toBe("missing");
    expect(m!.value).toBeNull();
  });
});
