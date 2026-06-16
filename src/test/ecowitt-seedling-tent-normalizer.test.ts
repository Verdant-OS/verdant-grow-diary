import { describe, it, expect } from "vitest";
import {
  normalizeEcowittSeedlingTentPayload,
  SEEDLING_TENT_CHANNEL_MAP,
  SEEDLING_TENT_LABEL,
} from "@/lib/ecowittSeedlingTentNormalizer";

const NOW = new Date("2026-06-16T12:00:00Z");
const CAPTURED = NOW.getTime() - 60_000;

const allTentsPayload = {
  // Flower
  temp1f: 82, humidity1: 46, tf_ch1: 70, soilmoisture3: 80, soilmoisture2: 69,
  // Seedling
  temp2f: 74.5, humidity2: 58,
  // Vegetation
  temp3f: 78, humidity3: 52, soilmoisture1: 41,
  // Lung Room — must NOT leak
  tempinf: 72, humidityin: 50,
};

describe("normalizeEcowittSeedlingTentPayload", () => {
  it("maps temp2f/humidity2 to Seedling Tent live snapshot", () => {
    const s = normalizeEcowittSeedlingTentPayload(allTentsPayload, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.tent_label).toBe(SEEDLING_TENT_LABEL);
    expect(s.provider).toBe("ecowitt");
    expect(s.source).toBe("live");
    expect(s.metrics.air_temp_f).toBe(74.5);
    expect(s.metrics.humidity_pct).toBe(58);
    expect(s.metrics.soil_temp_f).toBeNull();
    expect(s.metrics.soil_moisture_pct_primary).toBeNull();
    expect(s.metrics.soil_moisture_pct_secondary).toBeNull();
    expect(s.channel_map).toEqual(SEEDLING_TENT_CHANNEL_MAP);
    expect(s.root_zone_confidence).toBe("missing");
  });

  it("missing temp2f or humidity2 degrades", () => {
    const noT = normalizeEcowittSeedlingTentPayload({ humidity2: 50 }, { now: NOW, captured_at_ms: CAPTURED });
    expect(noT.source).toBe("degraded");
    expect(noT.degraded_reasons).toContain("missing:air_temp_f");
    const noH = normalizeEcowittSeedlingTentPayload({ temp2f: 70 }, { now: NOW, captured_at_ms: CAPTURED });
    expect(noH.source).toBe("degraded");
    expect(noH.degraded_reasons).toContain("missing:humidity_pct");
  });

  it("humidity outside 0–100 → invalid", () => {
    const s = normalizeEcowittSeedlingTentPayload({ temp2f: 70, humidity2: 150 }, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.source).toBe("invalid");
    expect(s.invalid_reasons).toContain("invalid:humidity_pct");
    expect(s.metrics.humidity_pct).toBeNull();
  });

  it("stale captured_at degrades", () => {
    const s = normalizeEcowittSeedlingTentPayload({ temp2f: 70, humidity2: 50 }, { now: NOW, captured_at_ms: NOW.getTime() - 3600_000 });
    expect(s.source).toBe("degraded");
    expect(s.degraded_reasons).toContain("stale:captured_at");
  });

  it("raw payload is preserved", () => {
    const s = normalizeEcowittSeedlingTentPayload(allTentsPayload, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.raw_payload_preserved).toBe(true);
    expect(s.raw_payload).toBe(allTentsPayload);
  });

  it("Flower/Vegetation channels do not leak into Seedling metrics", () => {
    const only = { temp1f: 82, humidity1: 46, temp3f: 78, humidity3: 52, soilmoisture1: 41 };
    const s = normalizeEcowittSeedlingTentPayload(only, { now: NOW, captured_at_ms: CAPTURED });
    expect(s.metrics.air_temp_f).toBeNull();
    expect(s.metrics.humidity_pct).toBeNull();
    expect(s.source).not.toBe("live");
  });

  it("deterministic", () => {
    const a = normalizeEcowittSeedlingTentPayload(allTentsPayload, { now: NOW, captured_at_ms: CAPTURED });
    const b = normalizeEcowittSeedlingTentPayload(allTentsPayload, { now: NOW, captured_at_ms: CAPTURED });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
