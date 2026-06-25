import { describe, it, expect } from "vitest";
import {
  normalizeEcowittFlowerTentPayload,
  FLOWER_TENT_CHANNEL_MAP,
  FLOWER_TENT_LABEL,
  ECOWITT_PROVIDER,
} from "@/lib/ecowittFlowerTentNormalizer";

const FRESH_NOW = new Date("2026-06-16T12:00:00Z");
const FRESH_CAPTURED = FRESH_NOW.getTime() - 60_000; // 1 min old

const validPayload = {
  temp1f: 82.04,
  humidity1: 46,
  tf_ch1: 69.98,
  soilmoisture3: 80,
  soilmoisture2: 69,
  // Other tents' channels intentionally present but must not leak into Flower Tent.
  tempinf: 70, // seedling
  humidityin: 55,
  tf_ch2: 65,
  soilmoisture1: 30,
  temp2f: 75, // veg
  humidity2: 60,
  tf_ch3: 68,
  soilmoisture4: 40,
};

describe("normalizeEcowittFlowerTentPayload", () => {
  it("1. valid payload → live Flower Tent snapshot", () => {
    const snap = normalizeEcowittFlowerTentPayload(validPayload, {
      now: FRESH_NOW,
      captured_at_ms: FRESH_CAPTURED,
    });
    expect(snap.source).toBe("live");
    expect(snap.provider).toBe(ECOWITT_PROVIDER);
    expect(snap.tent_label).toBe(FLOWER_TENT_LABEL);
    expect(snap.metrics).toEqual({
      air_temp_f: 82.04,
      humidity_pct: 46,
      soil_temp_f: 69.98,
      soil_moisture_pct_primary: 80,
      soil_moisture_pct_secondary: 69,
    });
    expect(snap.channel_map).toEqual(FLOWER_TENT_CHANNEL_MAP);
    expect(snap.raw_payload_preserved).toBe(true);
    expect(snap.root_zone_confidence).toBe("ok");
    expect(snap.degraded_reasons).toEqual([]);
  });

  it("2. missing temp1f or humidity1 degrades the snapshot", () => {
    const noTemp = normalizeEcowittFlowerTentPayload(
      { ...validPayload, temp1f: undefined },
      { now: FRESH_NOW, captured_at_ms: FRESH_CAPTURED },
    );
    expect(noTemp.source).toBe("degraded");
    expect(noTemp.metrics.air_temp_f).toBeNull();
    expect(noTemp.degraded_reasons).toContain("missing:air_temp_f");

    const noHum = normalizeEcowittFlowerTentPayload(
      { ...validPayload, humidity1: undefined },
      { now: FRESH_NOW, captured_at_ms: FRESH_CAPTURED },
    );
    expect(noHum.source).toBe("degraded");
    expect(noHum.metrics.humidity_pct).toBeNull();
    expect(noHum.degraded_reasons).toContain("missing:humidity_pct");
  });

  it("3. invalid humidity outside 0–100 is rejected/degraded", () => {
    const snap = normalizeEcowittFlowerTentPayload(
      { ...validPayload, humidity1: 142 },
      { now: FRESH_NOW, captured_at_ms: FRESH_CAPTURED },
    );
    expect(snap.metrics.humidity_pct).toBeNull();
    expect(snap.source).toBe("invalid");
    expect(snap.degraded_reasons).toContain("invalid:humidity_pct");
  });

  it("4. missing soil values do not block air/RH but lower root-zone confidence", () => {
    const partial = normalizeEcowittFlowerTentPayload(
      { temp1f: 80, humidity1: 50, tf_ch1: 70 },
      { now: FRESH_NOW, captured_at_ms: FRESH_CAPTURED },
    );
    expect(partial.metrics.air_temp_f).toBe(80);
    expect(partial.metrics.humidity_pct).toBe(50);
    expect(partial.metrics.soil_moisture_pct_primary).toBeNull();
    expect(partial.metrics.soil_moisture_pct_secondary).toBeNull();
    expect(partial.root_zone_confidence).toBe("partial");
    expect(partial.source).toBe("live");

    const noSoil = normalizeEcowittFlowerTentPayload(
      { temp1f: 80, humidity1: 50 },
      { now: FRESH_NOW, captured_at_ms: FRESH_CAPTURED },
    );
    expect(noSoil.root_zone_confidence).toBe("missing");
    expect(noSoil.source).toBe("live");
  });

  it("5. raw payload is preserved verbatim", () => {
    const snap = normalizeEcowittFlowerTentPayload(validPayload, {
      now: FRESH_NOW,
      captured_at_ms: FRESH_CAPTURED,
    });
    expect(snap.raw_payload_preserved).toBe(true);
    expect(snap.raw_payload).toBe(validPayload);
    expect(snap.raw_payload).toEqual(validPayload);
  });

  it("6. Seedling/Veg channels are not used for Flower Tent metrics", () => {
    const onlyOtherTents = {
      tempinf: 70,
      humidityin: 55,
      tf_ch2: 65,
      soilmoisture1: 30,
      temp2f: 75,
      humidity2: 60,
      tf_ch3: 68,
      soilmoisture4: 40,
    };
    const snap = normalizeEcowittFlowerTentPayload(onlyOtherTents, {
      now: FRESH_NOW,
      captured_at_ms: FRESH_CAPTURED,
    });
    expect(snap.metrics).toEqual({
      air_temp_f: null,
      humidity_pct: null,
      soil_temp_f: null,
      soil_moisture_pct_primary: null,
      soil_moisture_pct_secondary: null,
    });
    expect(snap.source).not.toBe("live");
    expect(snap.degraded_reasons).toEqual(
      expect.arrayContaining(["missing:air_temp_f", "missing:humidity_pct"]),
    );
  });

  it("7. output is deterministic for the same input", () => {
    const a = normalizeEcowittFlowerTentPayload(validPayload, {
      now: FRESH_NOW,
      captured_at_ms: FRESH_CAPTURED,
    });
    const b = normalizeEcowittFlowerTentPayload(validPayload, {
      now: FRESH_NOW,
      captured_at_ms: FRESH_CAPTURED,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("stale captured_at degrades a live-looking payload", () => {
    const stale = normalizeEcowittFlowerTentPayload(validPayload, {
      now: FRESH_NOW,
      captured_at_ms: FRESH_NOW.getTime() - 60 * 60 * 1000,
    });
    expect(stale.source).toBe("degraded");
    expect(stale.degraded_reasons).toContain("stale:captured_at");
  });
});
