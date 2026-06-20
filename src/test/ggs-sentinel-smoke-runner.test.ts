/**
 * Tests for the pure evaluateGgsSentinelReadiness helper.
 *
 * Covers all required result states, the freshness boundary, vendor
 * provenance, canonical source enforcement, and the safe-summary shape
 * (never includes raw_payload body).
 */
import { describe, it, expect } from "vitest";
import {
  evaluateGgsSentinelReadiness,
  GGS_SENTINEL_METRICS,
  type GgsSentinelInputRow,
  type GgsSentinelSnapshot,
} from "@/lib/ggsSentinelSmokeRunner";

const NOW = new Date("2026-06-17T18:30:00Z");
const FRESH_TS = "2026-06-17T18:29:00Z"; // 60s old
const STALE_TS = "2026-06-17T18:00:00Z"; // 30min old (> 15min threshold)

function ggsRow(
  metric: string,
  value: number,
  opts: Partial<GgsSentinelInputRow> = {},
): GgsSentinelInputRow {
  return {
    metric,
    value,
    source: "live",
    captured_at: FRESH_TS,
    raw_payload: { source_app: "spider_farmer_ggs", sensor_id: "GGS-X", payload: { redacted: true } },
    ...opts,
  };
}

const SNAP_LIVE_READY: GgsSentinelSnapshot = {
  captured_at: FRESH_TS,
  source: "live",
  soil_moisture: 42.5,
  soil_temp: 22.3,
  soil_ec: 0.85,
};

describe("evaluateGgsSentinelReadiness", () => {
  it("PASS_LIVE_SENTINEL_READY when all canonical rows + snapshot present", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        ggsRow("soil_moisture_pct", 42.5),
        ggsRow("ec", 0.85),
        ggsRow("soil_temp_c", 22.3),
      ],
      snapshot: SNAP_LIVE_READY,
      now: NOW,
    });
    expect(ev.state).toBe("PASS_LIVE_SENTINEL_READY");
    expect(ev.passed).toBe(true);
    expect(ev.safeMetrics.map((m) => m.metric).sort()).toEqual([
      "ec",
      "soil_moisture_pct",
      "soil_temp_c",
    ]);
  });

  it("BLOCKED_NO_GGS_ROWS when rows are empty", () => {
    const ev = evaluateGgsSentinelReadiness({ rows: [], snapshot: null, now: NOW });
    expect(ev.state).toBe("BLOCKED_NO_GGS_ROWS");
    expect(ev.passed).toBe(false);
  });

  it("BLOCKED_NO_SOIL_TEMP_C when only moisture + ec are present", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [ggsRow("soil_moisture_pct", 40), ggsRow("ec", 1.2)],
      snapshot: SNAP_LIVE_READY,
      now: NOW,
    });
    expect(ev.state).toBe("BLOCKED_NO_SOIL_TEMP_C");
  });

  it("BLOCKED_NO_EC when only moisture + soil_temp_c are present", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [ggsRow("soil_moisture_pct", 40), ggsRow("soil_temp_c", 21)],
      snapshot: SNAP_LIVE_READY,
      now: NOW,
    });
    expect(ev.state).toBe("BLOCKED_NO_EC");
  });

  it("BLOCKED_VENDOR_PROVENANCE_MISSING when raw_payload.source_app missing", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        ggsRow("soil_moisture_pct", 42),
        ggsRow("ec", 1),
        ggsRow("soil_temp_c", 22, { raw_payload: null }),
      ],
      snapshot: SNAP_LIVE_READY,
      now: NOW,
    });
    expect(ev.state).toBe("BLOCKED_VENDOR_PROVENANCE_MISSING");
  });

  it("BLOCKED_SOURCE_NOT_CANONICAL when source = 'ggs_live'", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        ggsRow("soil_moisture_pct", 42),
        ggsRow("ec", 1),
        ggsRow("soil_temp_c", 22, { source: "ggs_live" }),
      ],
      snapshot: SNAP_LIVE_READY,
      now: NOW,
    });
    expect(ev.state).toBe("BLOCKED_SOURCE_NOT_CANONICAL");
  });

  it("BLOCKED_SOURCE_NOT_CANONICAL when source = 'ggs_csv'", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        ggsRow("soil_moisture_pct", 42),
        ggsRow("ec", 1, { source: "ggs_csv" }),
        ggsRow("soil_temp_c", 22),
      ],
      snapshot: SNAP_LIVE_READY,
      now: NOW,
    });
    expect(ev.state).toBe("BLOCKED_SOURCE_NOT_CANONICAL");
  });

  it("BLOCKED_STALE_READING when newest row is older than 15 minutes", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        ggsRow("soil_moisture_pct", 42, { captured_at: STALE_TS }),
        ggsRow("ec", 1, { captured_at: STALE_TS }),
        ggsRow("soil_temp_c", 22, { captured_at: STALE_TS }),
      ],
      snapshot: SNAP_LIVE_READY,
      now: NOW,
    });
    expect(ev.state).toBe("BLOCKED_STALE_READING");
  });

  it("warns (not fails) when snapshot RPC is missing soil_temp", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        ggsRow("soil_moisture_pct", 42),
        ggsRow("ec", 1),
        ggsRow("soil_temp_c", 22),
      ],
      snapshot: { ...SNAP_LIVE_READY, soil_temp: null },
      now: NOW,
    });
    // Rows are fine, so terminal state stays PASS; snapshot mismatch is a warn check.
    expect(ev.state).toBe("PASS_LIVE_SENTINEL_READY");
    const snapCheck = ev.checks.find((c) => c.id === "snapshot_populated");
    expect(snapCheck?.status).toBe("warn");
  });

  it("safe summary never leaks raw_payload.payload body", () => {
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        ggsRow("soil_moisture_pct", 42),
        ggsRow("ec", 1),
        ggsRow("soil_temp_c", 22),
      ],
      snapshot: SNAP_LIVE_READY,
      now: NOW,
    });
    const json = JSON.stringify(ev);
    expect(json).not.toContain('"payload"');
    expect(json).not.toContain('"redacted"');
    for (const m of ev.safeMetrics) {
      expect((m as unknown as Record<string, unknown>).raw_payload).toBeUndefined();
    }
  });

  it("freshness threshold is configurable but defaults to 15 min", () => {
    const justOver = new Date(NOW.getTime() - 16 * 60 * 1000).toISOString();
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        ggsRow("soil_moisture_pct", 42, { captured_at: justOver }),
        ggsRow("ec", 1, { captured_at: justOver }),
        ggsRow("soil_temp_c", 22, { captured_at: justOver }),
      ],
      snapshot: SNAP_LIVE_READY,
      now: NOW,
    });
    expect(ev.state).toBe("BLOCKED_STALE_READING");
  });

  it("exports the canonical metric list", () => {
    expect(GGS_SENTINEL_METRICS).toEqual(["soil_moisture_pct", "ec", "soil_temp_c"]);
  });
});
