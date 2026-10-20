import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import TonightTentHomeCard from "@/components/TonightTentHomeCard";
import {
  buildTonightLastLog,
  buildTonightTentMetrics,
  TONIGHT_TENT_HOME_COPY,
  type TonightMetricView,
  type TonightSensorRow,
  type TonightSnapshotInput,
} from "@/lib/tonightTentHomeViewModel";
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import { calculateVpdKpa } from "@/lib/greenhouseClimateRules";

// #2123 review follow-ups: a derived VPD must never be labeled live when its
// inputs are mixed-source, pinned RH must not produce a number, and the card
// must say the value was calculated.

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

describe("Tonight tent calculated VPD — mixed-source provenance", () => {
  it("does not label VPD live from an older live temperature and newer manual RH", () => {
    const vpd = vpdOf([row("temperature_c", 24, "live", 5), row("humidity_pct", 55, "manual", 1)]);
    expect(vpd.source).not.toBe("live");
    expect(vpd.state).toBe("unavailable");
    expect(vpd.value).toBeNull();
  });

  it("does not label VPD manual or live from an older manual temperature and newer live RH", () => {
    const vpd = vpdOf([row("temperature_c", 24, "manual", 5), row("humidity_pct", 55, "live", 1)]);
    expect(vpd.source).toBeNull();
    expect(vpd.state).toBe("unavailable");
  });

  it("does not label a same-time live temperature and manual RH pair live", () => {
    const vpd = vpdOf([row("temperature_c", 24, "live", 3), row("humidity_pct", 55, "manual", 3)]);
    expect(vpd.source).not.toBe("live");
    expect(vpd.value).toBeNull();
    expect(vpd.state).toBe("unavailable");
  });

  it("skips a newer mixed-source same-time pair for an older compatible pair", () => {
    const vpd = vpdOf([
      row("temperature_c", 24, "live", 3),
      row("humidity_pct", 55, "manual", 3),
      row("temperature_c", 22, "manual", 20),
      row("humidity_pct", 60, "manual", 20),
    ]);
    expect(vpd).toMatchObject({
      state: "value",
      source: "manual",
      value: calculateVpdKpa({ tempC: 22, rhPercent: 60 }),
      capturedAt: minutesAgo(20),
      calculated: true,
    });
  });

  it("labels a live pair stale when one input aged past the live window", () => {
    const staleMinutes = LIVE_CURRENT_STATE_STALE_MS / 60_000 + 5;
    const vpd = vpdOf([
      row("temperature_c", 24, "live", staleMinutes),
      row("humidity_pct", 55, "live", 1),
    ]);
    expect(vpd).toMatchObject({
      state: "value",
      source: "stale",
      value: calculateVpdKpa({ tempC: 24, rhPercent: 55 }),
      calculated: true,
    });
  });
});

describe("Tonight tent calculated VPD — aggregate snapshot provenance", () => {
  // Per-tent rows failed; only the diary-inclusive snapshot answered. A readings
  // snapshot labels every metric with one aggregate source, so same-time live
  // temperature + manual RH arrives as source "manual" for both.
  const at = minutesAgo(2);
  function vpdFromSnapshot(
    extra: Partial<NonNullable<TonightSnapshotInput["snapshot"]>>,
  ): TonightMetricView {
    return buildTonightTentMetrics({
      rows: [],
      rowsRead: { status: "error" },
      snapshot: {
        status: "ok",
        snapshot: { source: "manual", ts: at, temp: 24, rh: 55, vpd: null, ...extra },
      },
      now: NOW,
    }).find((m) => m.key === "vpd")!;
  }

  it("does not derive a 'Manual reading' VPD from a snapshot whose rows mixed live and manual", () => {
    const vpd = vpdFromSnapshot({
      metric_refs: {
        temp: { id: "r-temp", captured_at: at, source: "live" },
        rh: { id: "r-rh", captured_at: at, source: "manual" },
      },
    });
    expect(vpd).toMatchObject({
      state: "unavailable",
      value: null,
      source: null,
      sourceLabel: null,
      calculated: false,
    });
  });

  it("does not derive VPD from an aggregate snapshot with no per-metric provenance", () => {
    expect(vpdFromSnapshot({})).toMatchObject({
      state: "unavailable",
      value: null,
      calculated: false,
    });
  });

  it("derives VPD when per-metric refs prove both inputs share the snapshot source", () => {
    const vpd = vpdFromSnapshot({
      metric_refs: {
        temp: { id: "r-temp", captured_at: at, source: "manual" },
        rh: { id: "r-rh", captured_at: at, source: "manual" },
      },
    });
    expect(vpd).toMatchObject({
      state: "value",
      source: "manual",
      value: calculateVpdKpa({ tempC: 24, rhPercent: 55 }),
      calculated: true,
    });
  });

  it("derives VPD from a single diary record", () => {
    expect(vpdFromSnapshot({ source: "diary" })).toMatchObject({
      state: "value",
      source: "manual",
      calculated: true,
    });
  });
});

describe("Tonight tent calculated VPD — pinned RH", () => {
  for (const pinned of [0, 100]) {
    it(`treats RH stuck at ${pinned}% as unusable and shows no VPD number`, () => {
      const vpd = vpdOf([
        row("temperature_c", 24, "manual", 2),
        row("humidity_pct", pinned, "manual", 2),
      ]);
      expect(vpd.state).toBe("invalid");
      expect(vpd.value).toBeNull();
    });
  }
});

describe("Tonight tent calculated VPD — derivation label", () => {
  it("marks a derived VPD as calculated and stored readings as not calculated", () => {
    const metrics = buildTonightTentMetrics({
      rows: [row("temperature_c", 24, "manual", 2), row("humidity_pct", 55, "manual", 2)],
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: NOW,
    });
    expect(metrics.map((m) => [m.key, m.calculated])).toEqual([
      ["temp", false],
      ["rh", false],
      ["vpd", true],
    ]);
    const stored = vpdOf([
      row("temperature_c", 24, "manual", 2),
      row("humidity_pct", 55, "manual", 2),
      row("vpd_kpa", 0.9, "manual", 2),
    ]);
    expect(stored).toMatchObject({ value: 0.9, calculated: false });
  });

  function renderWith(rows: TonightSensorRow[]) {
    const metrics = buildTonightTentMetrics({
      rows,
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: NOW,
    });
    render(
      <MemoryRouter>
        <TonightTentHomeCard
          selection={{
            kind: "tent",
            basis: "only",
            tent: { id: "tent-a", name: "Veg Tent", growId: "g1" },
          }}
          metrics={metrics}
          lastLog={buildTonightLastLog({ applies: true, status: "ok", latestAt: null, now: NOW })}
          logHref="/daily-check?growId=g1"
        />
      </MemoryRouter>,
    );
  }

  it("the card says a derived VPD was calculated", () => {
    renderWith([row("temperature_c", 24, "live", 2), row("humidity_pct", 55, "live", 2)]);
    const vpd = screen.getByTestId("tonight-tent-home-metric-vpd");
    expect(vpd).toHaveTextContent(TONIGHT_TENT_HOME_COPY.calculatedVpd);
    expect(screen.getByTestId("tonight-tent-home-metric-vpd-calculated")).toBeInTheDocument();
  });

  it("the card does not call a stored VPD calculated", () => {
    renderWith([row("vpd_kpa", 1.1, "live", 2)]);
    expect(screen.getByTestId("tonight-tent-home-metric-vpd")).not.toHaveTextContent(
      TONIGHT_TENT_HOME_COPY.calculatedVpd,
    );
    expect(screen.queryByTestId("tonight-tent-home-metric-vpd-calculated")).toBeNull();
  });
});

// #2268: a stored VPD from hours earlier must not be shown beside a newer
// same-capture temperature/RH reading. Stored VPD keeps winning when it is as
// new as or newer than the pair, or when the newer inputs are not one capture.
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
