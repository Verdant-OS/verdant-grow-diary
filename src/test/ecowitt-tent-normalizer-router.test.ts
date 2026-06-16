import { describe, it, expect } from "vitest";
import {
  normalizeEcowittTentPayload,
  SUPPORTED_TENT_KEYS,
} from "@/lib/ecowittTentNormalizerRouter";

const NOW = new Date("2026-06-16T12:00:00Z");
const CAPTURED = NOW.getTime() - 60_000;

const payload = {
  temp1f: 82, humidity1: 46, tf_ch1: 70, soilmoisture3: 80, soilmoisture2: 69,
  temp2f: 74, humidity2: 58,
  temp3f: 78, humidity3: 52, soilmoisture1: 41,
};

describe("normalizeEcowittTentPayload (router)", () => {
  it("supports flower/seedling/vegetation", () => {
    expect(SUPPORTED_TENT_KEYS).toEqual(["flower", "seedling", "vegetation"]);
  });

  it("flower → Flower Tent metrics only", () => {
    const s = normalizeEcowittTentPayload(payload, "flower", { now: NOW, captured_at_ms: CAPTURED });
    expect(s.tent_label).toBe("Flower Tent");
    expect(s.metrics.air_temp_f).toBe(82);
    expect(s.metrics.humidity_pct).toBe(46);
    expect(s.source).toBe("live");
    expect(s.root_zone_confidence).toBe("complete");
  });

  it("seedling → Seedling Tent metrics only", () => {
    const s = normalizeEcowittTentPayload(payload, "seedling", { now: NOW, captured_at_ms: CAPTURED });
    expect(s.tent_label).toBe("Seedling Tent");
    expect(s.metrics.air_temp_f).toBe(74);
    expect(s.metrics.humidity_pct).toBe(58);
    expect(s.metrics.soil_moisture_pct_primary).toBeNull();
  });

  it("vegetation → Vegetation Tent metrics only", () => {
    const s = normalizeEcowittTentPayload(payload, "vegetation", { now: NOW, captured_at_ms: CAPTURED });
    expect(s.tent_label).toBe("Vegetation Tent");
    expect(s.metrics.air_temp_f).toBe(78);
    expect(s.metrics.humidity_pct).toBe(52);
    expect(s.metrics.soil_moisture_pct_primary).toBe(41);
  });

  it("unknown tent key → invalid snapshot, no throw", () => {
    const s = normalizeEcowittTentPayload(payload, "lung_room", { now: NOW, captured_at_ms: CAPTURED });
    expect(s.source).toBe("invalid");
    expect(s.invalid_reasons.some((r) => r.startsWith("unknown_tent_key:"))).toBe(true);
    expect(s.metrics.air_temp_f).toBeNull();
  });

  it("deterministic for identical input", () => {
    const a = normalizeEcowittTentPayload(payload, "flower", { now: NOW, captured_at_ms: CAPTURED });
    const b = normalizeEcowittTentPayload(payload, "flower", { now: NOW, captured_at_ms: CAPTURED });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
