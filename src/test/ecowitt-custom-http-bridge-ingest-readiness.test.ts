/**
 * EcoWitt custom-HTTP bridge contracts that belong in the TypeScript suite.
 *
 * Listener normalization and source resolution are tested by the Python
 * testbench suite; this file only checks the resolved FIELD_MAP contract and
 * Snapshot V0 presentation boundary.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEcowittTentSnapshotV0ViewModel } from "@/lib/ecowittTentSnapshotV0ViewModel";
import { ECOWITT_CUSTOM_HTTP_FIELD_MAP } from "@/lib/ecowittCustomHttpBridgeIngestRules";

describe("ecowitt custom-HTTP FIELD_MAP contract", () => {
  it("matches the listener's configured channels", () => {
    expect(ECOWITT_CUSTOM_HTTP_FIELD_MAP).toEqual({
      temp_f: ["temp1f", "tempf", "tempinf"],
      humidity_percent: ["humidity1", "humidity", "humidityin"],
      soil_moisture_pct: ["soilmoisture1", "soilmoisture2"],
      co2_ppm: ["co2", "co2in", "co2_ppm"],
    });
  });

  it("does not attribute other tent or probe channels", () => {
    const mapped = Object.values(ECOWITT_CUSTOM_HTTP_FIELD_MAP).flat();
    expect(mapped).not.toContain("temp2f");
    expect(mapped).not.toContain("humidity2");
    expect(mapped).not.toContain("soilmoisture3");
    expect(mapped).not.toContain("soilmoisture16");
  });
});

describe("custom-HTTP ingest still feeds Snapshot V0 as T / RH / soil only", () => {
  const TENT = "11111111-1111-4111-8111-111111111111";
  const NOW = new Date("2026-06-17T05:45:30Z");
  const CAPTURED = "2026-06-17T05:40:30.000Z";

  it("keeps extra channels raw-only while rendering configured metrics", () => {
    const rows = [
      ["temp_f", 77, { temp1f: "77", temp2f: "74" }],
      ["humidity_percent", 55, { humidity1: "55", humidity2: "50" }],
      ["soil_moisture_pct", 41, { soilmoisture1: "41", soilmoisture3: "33" }],
      ["co2_ppm", 800, { co2in: "800" }],
    ].map(([metric, value, raw_payload]) => ({
      tent_id: TENT,
      source: "demo" as const,
      captured_at: CAPTURED,
      metric: metric as "temp_f" | "humidity_percent" | "soil_moisture_pct" | "co2_ppm",
      value: value as number,
      raw_payload,
    }));

    const vm = buildEcowittTentSnapshotV0ViewModel(rows, { tentId: TENT, now: NOW });
    expect(vm.metrics.map((m) => m.key)).toEqual(["temp", "rh", "soil"]);
    expect(vm.metrics).toHaveLength(3);
    expect(vm.metrics.find((m) => m.key === "temp")?.value).toBeCloseTo(25, 5);
    expect(vm.metrics.find((m) => m.key === "rh")?.value).toBe(55);
    expect(vm.metrics.find((m) => m.key === "soil")?.value).toBe(41);
    expect(vm.metrics.some((m) => String(m.key).includes("co2"))).toBe(false);
  });

  it("keeps Snapshot V0 / card free of extra-channel UI", () => {
    const card = readFileSync("src/components/EcowittTentSnapshotV0Card.tsx", "utf-8");
    const viewModel = readFileSync("src/lib/ecowittTentSnapshotV0ViewModel.ts", "utf-8");
    for (const body of [card, viewModel]) {
      expect(body).not.toMatch(/nightDrift/);
      expect(body).not.toMatch(/inSpecNow/);
    }
    expect(card).not.toMatch(/co2/i);
    expect(card).not.toMatch(/leafwetness/i);
    expect(card).toMatch(/Air temp, air RH, soil moisture/);
  });
});
