import { describe, it, expect } from "vitest";
import {
  normalizeEcowittVegetationTentPayload,
  VEGETATION_TENT_CHANNEL_MAP,
  VEGETATION_TENT_LABEL,
} from "@/lib/ecowittVegetationTentNormalizer";

const NOW = new Date("2026-06-16T12:00:00Z");
const CAPTURED = NOW.getTime() - 60_000;

const allTentsPayload = {
  temp1f: 82, humidity1: 46, tf_ch1: 70, soilmoisture3: 80, soilmoisture2: 69,
  temp2f: 74.5, humidity2: 58,
  temp3f: 78, humidity3: 52, soilmoisture1: 41,
  tempinf: 72, humidityin: 50,
};

describe("normalizeEcowittVegetationTentPayload", () => {
  it("maps temp3f/humidity3/soilmoisture1 → Vegetation live snapshot", () => {
    const s = normalizeEcowittVegetationTentPayload(allTentsPayload, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.tent_label).toBe(VEGETATION_TENT_LABEL);
    expect(s.provider).toBe("ecowitt");
    expect(s.source).toBe("live");
    expect(s.metrics.air_temp_f).toBe(78);
    expect(s.metrics.humidity_pct).toBe(52);
    expect(s.metrics.soil_moisture_pct_primary).toBe(41);
    expect(s.metrics.soil_temp_f).toBeNull();
    expect(s.metrics.soil_moisture_pct_secondary).toBeNull();
    expect(s.channel_map).toEqual(VEGETATION_TENT_CHANNEL_MAP);
    expect(s.root_zone_confidence).toBe("partial");
  });

  it("missing temp3f or humidity3 degrades", () => {
    const s = normalizeEcowittVegetationTentPayload({ humidity3: 50, soilmoisture1: 30 }, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.source).toBe("degraded");
    expect(s.degraded_reasons).toContain("missing:air_temp_f");
  });

  it("humidity outside 0–100 → invalid", () => {
    const s = normalizeEcowittVegetationTentPayload({ temp3f: 70, humidity3: 250 }, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.source).toBe("invalid");
    expect(s.invalid_reasons).toContain("invalid:humidity_pct");
  });

  it("invalid soil moisture lowers root-zone confidence and marks invalid reason", () => {
    const s = normalizeEcowittVegetationTentPayload({ temp3f: 70, humidity3: 50, soilmoisture1: 250 }, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.metrics.soil_moisture_pct_primary).toBeNull();
    expect(s.root_zone_confidence).toBe("missing");
    expect(s.invalid_reasons).toContain("invalid:soil_moisture_pct_primary");
  });

  it("missing soil → root_zone_confidence missing, but air/RH still live", () => {
    const s = normalizeEcowittVegetationTentPayload({ temp3f: 70, humidity3: 50 }, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.source).toBe("live");
    expect(s.root_zone_confidence).toBe("missing");
  });

  it("stale captured_at degrades", () => {
    const s = normalizeEcowittVegetationTentPayload({ temp3f: 70, humidity3: 50 }, { now: NOW, captured_at_ms: NOW.getTime() - 3600_000 });
    expect(s.source).toBe("degraded");
    expect(s.degraded_reasons).toContain("stale:captured_at");
  });

  it("raw payload preserved", () => {
    const s = normalizeEcowittVegetationTentPayload(allTentsPayload, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.raw_payload_preserved).toBe(true);
    expect(s.raw_payload).toBe(allTentsPayload);
  });

  it("Flower/Seedling channels do not leak into Vegetation metrics", () => {
    const only = { temp1f: 82, humidity1: 46, temp2f: 74, humidity2: 58, tf_ch1: 70, soilmoisture3: 80, soilmoisture2: 69 };
    const s = normalizeEcowittVegetationTentPayload(only, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.metrics.air_temp_f).toBeNull();
    expect(s.metrics.humidity_pct).toBeNull();
    expect(s.metrics.soil_moisture_pct_primary).toBeNull();
    expect(s.source).not.toBe("live");
  });

  it("deterministic", () => {
    const a = normalizeEcowittVegetationTentPayload(allTentsPayload, { now: NOW, captured_at_ms: CAPTURED });
    const b = normalizeEcowittVegetationTentPayload(allTentsPayload, { now: NOW, captured_at_ms: CAPTURED });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
