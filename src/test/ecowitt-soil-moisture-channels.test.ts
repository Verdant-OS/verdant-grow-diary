/**
 * Targeted tests verifying EcoWitt soil moisture support across:
 *  - cloud-readings normalization (channels 1–16)
 *  - validation view-model alias coverage for soilmoistureN
 *
 * Pure tests — no I/O, no network.
 */
import { describe, it, expect } from "vitest";
import { normalizeEcowittCloudReadings } from "@/lib/ecowittPayloadRules";
import { buildEcowittIngestValidationViewModel } from "@/lib/ecowittIngestValidationViewModel";

const NOW = new Date("2026-06-08T12:30:00Z");
const FRESH = "2026-06-08 12:20:00";
const MAC = "AA:BB:CC:DD:EE:01";
const TENT = "11111111-1111-1111-1111-111111111111";

const mapping = {
  byMac: {
    [MAC]: {
      air: {},
      soil: {
        1: TENT,
        9: TENT,
        12: TENT,
        16: TENT,
      },
    },
  },
};

function soilReading(rows: ReturnType<typeof normalizeEcowittCloudReadings>["rows"]) {
  return rows.find((r) => "soil_moisture_pct" in r.reading);
}

describe("EcoWitt soil moisture — cloud normalization channels 1–16", () => {
  it("soilmoisture1=33 → soil_moisture_pct: 33 (live)", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC, dateutc: FRESH, soilmoisture1: 33 },
      mapping,
      { now: NOW },
    );
    const r = soilReading(res.rows);
    expect(r).toBeDefined();
    expect(r!.reading.soil_moisture_pct).toBe(33);
    expect(r!.reading.source).toBe("live");
    expect(r!.channel).toBe(1);
  });

  it("soilmoisture9 (>8) maps and preserves channel", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC, dateutc: FRESH, soilmoisture9: 42 },
      mapping,
      { now: NOW },
    );
    const r = soilReading(res.rows);
    expect(r).toBeDefined();
    expect(r!.reading.soil_moisture_pct).toBe(42);
    expect(r!.channel).toBe(9);
  });

  it("soilmoisture16 maps (top of supported range)", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC, dateutc: FRESH, soilmoisture16: 55 },
      mapping,
      { now: NOW },
    );
    const r = soilReading(res.rows);
    expect(r).toBeDefined();
    expect(r!.reading.soil_moisture_pct).toBe(55);
    expect(r!.channel).toBe(16);
  });

  it("soilmoisture12 maps", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC, dateutc: FRESH, soilmoisture12: 47 },
      mapping,
      { now: NOW },
    );
    const r = soilReading(res.rows);
    expect(r).toBeDefined();
    expect(r!.reading.soil_moisture_pct).toBe(47);
    expect(r!.channel).toBe(12);
  });

  it("soilmoisture1=-1 is invalid / not healthy", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC, dateutc: FRESH, soilmoisture1: -1 },
      mapping,
      { now: NOW },
    );
    const r = soilReading(res.rows);
    expect(r).toBeDefined();
    expect(r!.reading.source).toBe("invalid");
  });

  it("soilmoisture1=101 is invalid / not healthy", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC, dateutc: FRESH, soilmoisture1: 101 },
      mapping,
      { now: NOW },
    );
    const r = soilReading(res.rows);
    expect(r).toBeDefined();
    expect(r!.reading.source).toBe("invalid");
  });

  it("soilmoisture1=0 is preserved (value retained, never silently dropped)", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC, dateutc: FRESH, soilmoisture1: 0 },
      mapping,
      { now: NOW },
    );
    const r = soilReading(res.rows);
    expect(r).toBeDefined();
    expect(r!.reading.soil_moisture_pct).toBe(0);
    // 0 is in-range, so existing rules accept unless stuck-history is provided.
    expect(["live", "stale", "invalid"]).toContain(r!.reading.source);
  });

  it("soilmoisture1=100 is preserved (value retained, never silently dropped)", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC, dateutc: FRESH, soilmoisture1: 100 },
      mapping,
      { now: NOW },
    );
    const r = soilReading(res.rows);
    expect(r).toBeDefined();
    expect(r!.reading.soil_moisture_pct).toBe(100);
    expect(["live", "stale", "invalid"]).toContain(r!.reading.source);
  });

  it("payload without soilmoistureN emits no soil_moisture_pct reading", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC, dateutc: FRESH, tempf: 72.4 },
      mapping,
      { now: NOW },
    );
    expect(soilReading(res.rows)).toBeUndefined();
  });

  it("soil moisture is never live unless the source is actually live (stale ts)", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC, dateutc: "2026-06-08 10:00:00", soilmoisture1: 33 },
      mapping,
      { now: NOW },
    );
    const r = soilReading(res.rows);
    expect(r).toBeDefined();
    expect(r!.reading.source).toBe("stale");
  });
});

describe("EcoWitt validation view-model — soil_moisture_pct alias coverage", () => {
  function vRow(rawPayload: Record<string, unknown>) {
    return {
      metric: "soil_moisture_pct",
      value: null,
      captured_at: NOW.toISOString(),
      ts: NOW.toISOString(),
      source: "ecowitt",
      raw_payload: {
        ...rawPayload,
        metadata: { test_sender: true, transport: "webhook" },
      },
    } as unknown as Parameters<typeof buildEcowittIngestValidationViewModel>[0]["rows"][number];
  }

  it("soilmoisture1=33 → metric row Accepted", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [vRow({ soilmoisture1: 33 })],
      now: NOW,
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m).toBeDefined();
    expect(m!.status).toBe("accepted");
    expect(m!.value).toBe(33);
  });

  it("soilmoisture9 (>8) is recognized as the soil_moisture_pct alias", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [vRow({ soilmoisture9: 41 })],
      now: NOW,
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m!.present).toBe(true);
    expect(m!.status).toBe("accepted");
    expect(m!.value).toBe(41);
  });

  it("soilmoisture16 is recognized as the soil_moisture_pct alias", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [vRow({ soilmoisture16: 22 })],
      now: NOW,
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m!.present).toBe(true);
    expect(m!.value).toBe(22);
  });

  it("soilmoisture1=-1 rejects (outside 0–100)", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [vRow({ soilmoisture1: -1 })],
      now: NOW,
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m!.status).toBe("rejected");
  });

  it("soilmoisture1=101 rejects (outside 0–100)", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [vRow({ soilmoisture1: 101 })],
      now: NOW,
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m!.status).toBe("rejected");
  });

  it("missing soil moisture stays missing, never auto-accepted", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [vRow({ tempf: 72 })],
      now: NOW,
    });
    const m = vm.metricRows.find((r) => r.key === "soil_moisture_pct");
    expect(m!.present).toBe(false);
    expect(m!.status).toBe("missing");
    expect(m!.value).toBeNull();
  });
});

describe("static safety scan — soil moisture changes", () => {
  it("no new writes / functions invoke / device-control strings", async () => {
    const fs = await import("node:fs/promises");
    const files = [
      "src/lib/ecowittPayloadRules.ts",
      "src/lib/ecowittPayloadAdapter.ts",
      "src/lib/ecowittIngestValidationViewModel.ts",
    ];
    for (const f of files) {
      const src = await fs.readFile(f, "utf8");
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/grow_events/);
      expect(src).not.toMatch(
        /turn_on|turn_off|device_control|toggleDevice|setOutletState|autopilot/i,
      );
    }
  });
});
