/**
 * Tests for the freshness guidance fields surfaced by the GGS Sentinel
 * smoke runner. Pure / deterministic. No I/O.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateGgsSentinelReadiness,
  formatGgsAgeLabel,
  formatGgsWindowLabel,
  GGS_METRIC_FRIENDLY_NAME,
  type GgsSentinelInputRow,
  type GgsSentinelSnapshot,
} from "@/lib/ggsSentinelSmokeRunner";
import { SPIDER_FARMER_GGS_STALE_MS } from "@/lib/spiderFarmerGgsMappingRules";

const NOW = new Date("2026-06-17T18:30:00Z");

function row(
  metric: string,
  value: number,
  capturedAt: string,
  opts: Partial<GgsSentinelInputRow> = {},
): GgsSentinelInputRow {
  return {
    metric,
    value,
    source: "live",
    captured_at: capturedAt,
    raw_payload: { source_app: "spider_farmer_ggs", sensor_id: "GGS-1" },
    ...opts,
  };
}

const SNAP: GgsSentinelSnapshot = {
  captured_at: "2026-06-17T18:29:00Z",
  source: "live",
  soil_moisture: 40,
  soil_temp: 22,
  soil_ec: 0.9,
};

function offset(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function allRowsAt(ageMs: number): GgsSentinelInputRow[] {
  const ts = offset(ageMs);
  return [
    row("soil_moisture_pct", 40, ts),
    row("ec", 1, ts),
    row("soil_temp_c", 22, ts),
  ];
}

describe("GGS Sentinel freshness guidance", () => {
  it("formats age labels in seconds, minutes, precise boundary seconds, and hours", () => {
    expect(formatGgsAgeLabel(0)).toBe("0m ago");
    expect(formatGgsAgeLabel(45_000)).toBe("45s ago");
    expect(formatGgsAgeLabel(4 * 60_000)).toBe("4m ago");
    expect(formatGgsAgeLabel(15 * 60_000 + 1_000)).toBe("15m 1s ago");
    expect(formatGgsAgeLabel(90 * 60_000)).toBe("1h 30m ago");
    expect(formatGgsAgeLabel(2 * 3600_000)).toBe("2h ago");
  });

  it("freshness window label is 15 min", () => {
    expect(formatGgsWindowLabel(SPIDER_FARMER_GGS_STALE_MS)).toBe("15 min");
  });

  it("fresh row shows fresh + valid copy", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        row("soil_moisture_pct", 40, offset(4 * 60_000)),
        row("ec", 1, offset(4 * 60_000)),
        row("soil_temp_c", 22, offset(4 * 60_000)),
      ],
      snapshot: SNAP,
      now: NOW,
    });
    const temp = ev.metricFreshness.find((f) => f.metric === "soil_temp_c")!;
    expect(temp.freshnessStatus).toBe("fresh");
    expect(temp.fresh).toBe(true);
    expect(temp.stale).toBe(false);
    expect(temp.missing).toBe(false);
    expect(temp.freshnessWindowLabel).toBe("15 min");
    expect(temp.nextActionLabel).toContain("Fresh");
    expect(temp.nextActionLabel).toContain("Valid for live Sentinel");
  });

  it("exactly 0m old shows exact fresh guidance copy", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: allRowsAt(0),
      snapshot: SNAP,
      now: NOW,
    });
    const m = ev.metricFreshness.find((f) => f.metric === "soil_moisture_pct")!;
    expect(m.freshnessStatus).toBe("fresh");
    expect(m.ageLabel).toBe("0m ago");
    expect(m.nextActionLabel).toBe(
      "Fresh — captured 0m ago. Valid for live Sentinel.",
    );
  });

  it("exactly 15m old remains aging and shows exact threshold guidance copy", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: allRowsAt(15 * 60_000),
      snapshot: SNAP,
      now: NOW,
    });
    const m = ev.metricFreshness.find((f) => f.metric === "ec")!;
    expect(ev.state).toBe("PASS_LIVE_SENTINEL_READY");
    expect(m.freshnessStatus).toBe("aging");
    expect(m.fresh).toBe(true);
    expect(m.stale).toBe(false);
    expect(m.ageLabel).toBe("15m ago");
    expect(m.nextActionLabel).toBe(
      "Fresh but aging — captured 15m ago. Recheck soon; stale at 15 min.",
    );
  });

  it("just over 15m old is stale and shows exact expired-row guidance copy", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: allRowsAt(15 * 60_000 + 1_000),
      snapshot: SNAP,
      now: NOW,
    });
    const m = ev.metricFreshness.find((f) => f.metric === "soil_temp_c")!;
    expect(ev.state).toBe("BLOCKED_STALE_READING");
    expect(m.freshnessStatus).toBe("stale");
    expect(m.fresh).toBe(false);
    expect(m.stale).toBe(true);
    expect(m.ageLabel).toBe("15m 1s ago");
    expect(m.nextActionLabel).toBe(
      "Stale — captured 15m 1s ago. Ingest a new real GGS reading to clear live Sentinel.",
    );
  });

  it("near-stale row (within final 25% of window) shows fresh but aging", () => {
    // 13min old → > 75% of 15min window
    const ts = offset(13 * 60_000);
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        row("soil_moisture_pct", 40, ts),
        row("ec", 1, ts),
        row("soil_temp_c", 22, ts),
      ],
      snapshot: SNAP,
      now: NOW,
    });
    const m = ev.metricFreshness.find((f) => f.metric === "ec")!;
    expect(m.freshnessStatus).toBe("aging");
    expect(m.fresh).toBe(true);
    expect(m.nextActionLabel).toContain("Fresh but aging");
    expect(m.nextActionLabel).toContain("stale at 15 min");
  });

  it("stale row shows stale + ingest-new-reading guidance", () => {
    const ts = offset(24 * 60_000);
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        row("soil_moisture_pct", 40, ts),
        row("ec", 1, ts),
        row("soil_temp_c", 22, ts),
      ],
      snapshot: SNAP,
      now: NOW,
    });
    expect(ev.state).toBe("BLOCKED_STALE_READING");
    const m = ev.metricFreshness.find((f) => f.metric === "soil_temp_c")!;
    expect(m.freshnessStatus).toBe("stale");
    expect(m.stale).toBe(true);
    expect(m.nextActionLabel).toContain("Stale");
    expect(m.nextActionLabel).toContain("Ingest a new real GGS reading");
  });

  it("missing metric shows missing + no-row guidance", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        row("soil_moisture_pct", 40, offset(60_000)),
        row("ec", 1, offset(60_000)),
      ],
      snapshot: SNAP,
      now: NOW,
    });
    const m = ev.metricFreshness.find((f) => f.metric === "soil_temp_c")!;
    expect(m.freshnessStatus).toBe("missing");
    expect(m.missing).toBe(true);
    expect(m.capturedAt).toBeNull();
    expect(m.ageMs).toBeNull();
    expect(m.nextActionLabel).toBe(
      `Missing — no recent GGS ${GGS_METRIC_FRIENDLY_NAME.soil_temp_c} row found.`,
    );
  });

  it("emits a freshness entry for every required metric, even when no rows", () => {
    const ev = evaluateGgsSentinelReadiness({ rows: [], snapshot: null, now: NOW });
    expect(ev.metricFreshness.map((f) => f.metric).sort()).toEqual([
      "ec",
      "soil_moisture_pct",
      "soil_temp_c",
    ]);
    for (const f of ev.metricFreshness) {
      expect(f.missing).toBe(true);
      expect(f.nextActionLabel).toContain("no recent GGS");
    }
  });

  it("freshness guidance does not change terminal state priority", () => {
    // aging row alone should still PASS (not stale)
    const ts = offset(13 * 60_000);
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        row("soil_moisture_pct", 40, ts),
        row("ec", 1, ts),
        row("soil_temp_c", 22, ts),
      ],
      snapshot: SNAP,
      now: NOW,
    });
    expect(ev.state).toBe("PASS_LIVE_SENTINEL_READY");
  });

  it("freshness guidance never leaks raw_payload body", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        row("soil_moisture_pct", 40, offset(60_000), {
          raw_payload: { source_app: "spider_farmer_ggs", payload: { secret: "x" } },
        }),
        row("ec", 1, offset(60_000)),
        row("soil_temp_c", 22, offset(60_000)),
      ],
      snapshot: SNAP,
      now: NOW,
    });
    const json = JSON.stringify(ev.metricFreshness);
    expect(json).not.toContain("payload");
    expect(json).not.toContain("secret");
  });
});
