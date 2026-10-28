/**
 * #2268: a stored VPD from hours earlier must not be shown beside a newer
 * same-capture temperature/RH reading on the Tonight tent card. Kept apart
 * from the locked tonight-tent-home-calculated-vpd-truth suite; the helpers
 * below mirror that suite's fixtures.
 */
import { describe, it, expect } from "vitest";
import {
  buildTonightTentMetrics,
  type TonightMetricView,
  type TonightSensorRow,
} from "@/lib/tonightTentHomeViewModel";
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import { calculateVpdKpa } from "@/lib/greenhouseClimateRules";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function row(metric: string, value: number, source: string, minutes: number): TonightSensorRow {
  const at = minutesAgo(minutes);
  return {
    id: `${metric}-${value}-${source}-${minutes}`,
    tent_id: "tent-a",
    metric,
    value,
    source,
    quality: "ok",
    ts: at,
    captured_at: at,
    raw_payload: null,
  } as TonightSensorRow;
}

function vpdOf(rows: TonightSensorRow[]): TonightMetricView {
  return buildTonightTentMetrics({
    rows,
    rowsRead: { status: "success" },
    snapshot: { status: "idle", snapshot: null },
    now: NOW,
  }).find((m) => m.key === "vpd")!;
}

describe("Tonight tent calculated VPD — newer temperature/RH than stored VPD (#2268)", () => {
  const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();
  function rowAt(metric: string, value: number, source: string, at: string): TonightSensorRow {
    return {
      ...row(metric, value, source, 0),
      id: `${metric}-${value}-${at}`,
      ts: at,
      captured_at: at,
    };
  }
  const fToC = (f: number) => ((f - 32) * 5) / 9;
  const storedVpd = rowAt("vpd_kpa", 0.9, "manual", minutesAgo(180));

  it("newer temp/RH without VPD overrides an older stored VPD with the calculated value", () => {
    const at = secondsAgo(3);
    const vpd = vpdOf([
      storedVpd,
      rowAt("temperature_c", fToC(80), "manual", at),
      rowAt("humidity_pct", 50, "manual", at),
    ]);
    expect(vpd).toMatchObject({
      state: "value",
      source: "manual",
      value: calculateVpdKpa({ tempC: fToC(80), rhPercent: 50 }),
      capturedAt: at,
      calculated: true,
    });
    expect(vpd.value).toBeCloseTo(1.75, 1);
    expect(vpd.value).not.toBe(0.9);
  });

  it("85°F/45% newer reading yields ≈2.26 kPa", () => {
    const at = secondsAgo(3);
    const vpd = vpdOf([
      storedVpd,
      rowAt("temperature_c", fToC(85), "manual", at),
      rowAt("humidity_pct", 45, "manual", at),
    ]);
    expect(vpd.calculated).toBe(true);
    expect(vpd.value).toBeCloseTo(2.26, 1);
  });

  it("stored VPD newer than or equal to temp/RH is still shown as stored", () => {
    const same = minutesAgo(3);
    const equal = vpdOf([
      rowAt("vpd_kpa", 0.9, "manual", same),
      rowAt("temperature_c", fToC(80), "manual", same),
      rowAt("humidity_pct", 50, "manual", same),
    ]);
    expect(equal).toMatchObject({ value: 0.9, calculated: false });

    const newer = vpdOf([
      rowAt("vpd_kpa", 0.9, "manual", minutesAgo(1)),
      rowAt("temperature_c", fToC(80), "manual", minutesAgo(3)),
      rowAt("humidity_pct", 50, "manual", minutesAgo(3)),
    ]);
    expect(newer).toMatchObject({ value: 0.9, calculated: false });
  });

  it("keeps the stored VPD when the newer temperature and RH are not one capture", () => {
    const vpd = vpdOf([
      storedVpd,
      rowAt("temperature_c", fToC(80), "manual", minutesAgo(1)),
      rowAt("humidity_pct", 50, "manual", minutesAgo(2)),
    ]);
    expect(vpd).toMatchObject({ value: 0.9, calculated: false });
  });

  it("never uses an older same-capture pair beside newer unpaired displayed inputs", () => {
    // History: stored VPD 3h ago; a paired 70°F/60% capture 1h ago; then newer
    // temperature and RH at different times. The card shows the newest temp/RH,
    // so a VPD calculated from the older pair must not replace the stored one.
    const pairAt = minutesAgo(60);
    const vpd = vpdOf([
      storedVpd,
      rowAt("temperature_c", fToC(70), "manual", pairAt),
      rowAt("humidity_pct", 60, "manual", pairAt),
      rowAt("temperature_c", fToC(80), "manual", minutesAgo(2)),
      rowAt("humidity_pct", 50, "manual", minutesAgo(1)),
    ]);
    expect(vpd.value).not.toBe(calculateVpdKpa({ tempC: fToC(70), rhPercent: 60 }));
    expect(vpd).toMatchObject({ value: 0.9, calculated: false });
  });

  it("overrides with a live pair that aged past the live window (shown as stale)", () => {
    const at = new Date(NOW.getTime() - LIVE_CURRENT_STATE_STALE_MS - 5 * 60_000).toISOString();
    const vpd = vpdOf([
      storedVpd,
      rowAt("temperature_c", fToC(80), "live", at),
      rowAt("humidity_pct", 50, "live", at),
    ]);
    expect(vpd).toMatchObject({
      source: "stale",
      value: calculateVpdKpa({ tempC: fToC(80), rhPercent: 50 }),
      calculated: true,
    });
  });

  it("does not combine a newer mixed-source pair; the stored VPD stays", () => {
    const at = secondsAgo(3);
    const vpd = vpdOf([
      storedVpd,
      rowAt("temperature_c", fToC(80), "live", at),
      rowAt("humidity_pct", 50, "manual", at),
    ]);
    expect(vpd).toMatchObject({ value: 0.9, calculated: false });
  });

  it("a newer pinned RH reading never reuses the old stored VPD as healthy", () => {
    const at = secondsAgo(3);
    const vpd = vpdOf([
      storedVpd,
      rowAt("temperature_c", fToC(80), "manual", at),
      rowAt("humidity_pct", 100, "manual", at),
    ]);
    expect(vpd.state).toBe("invalid");
    expect(vpd.value).toBeNull();
  });
});
