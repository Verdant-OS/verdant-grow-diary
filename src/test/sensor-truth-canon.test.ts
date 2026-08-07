/**
 * Sensor Truth Canon — source-aware current-state windows (#592).
 *
 * Pins docs/data-labeling-spec.md:
 *   live → 15 minutes, manual → 24 hours.
 */
import { describe, expect, it } from "vitest";
import {
  CURRENT_STATE_FRESHNESS_WINDOW_LABEL,
  classifyCurrentStateSource,
  describeCurrentStateStaleWindow,
  isCurrentStateStale,
  LIVE_CURRENT_STATE_STALE_MS,
  LIVE_CURRENT_STATE_STALE_MINUTES,
  MANUAL_CURRENT_STATE_STALE_HOURS,
  MANUAL_CURRENT_STATE_STALE_MS,
  resolveCurrentStateStaleWindowMs,
} from "@/lib/sensorTruthCanon";
import {
  MANUAL_SNAPSHOT_CURRENT_STALE_HOURS,
  SENSOR_FRESH_WINDOW_MINUTES,
  SENSOR_SNAPSHOT_STALE_THRESHOLD_MS,
  SENSOR_SOURCE_STALE_MINUTES,
} from "@/constants/sensorTiming";
import { isStale, isSnapshotStale, STALE_THRESHOLD_MS } from "@/lib/sensorSnapshot";
import { resolveStaleWindowMs } from "@/lib/sensorSnapshotStatusContract";

const NOW = Date.parse("2026-08-03T12:00:00.000Z");

describe("sensorTruthCanon windows", () => {
  it("aligns timing constants with the live 15 / manual 24 canon", () => {
    expect(SENSOR_FRESH_WINDOW_MINUTES).toBe(15);
    expect(SENSOR_SNAPSHOT_STALE_THRESHOLD_MS).toBe(15 * 60 * 1000);
    expect(SENSOR_SOURCE_STALE_MINUTES).toBe(15);
    expect(MANUAL_SNAPSHOT_CURRENT_STALE_HOURS).toBe(24);
    expect(LIVE_CURRENT_STATE_STALE_MS).toBe(15 * 60 * 1000);
    expect(MANUAL_CURRENT_STATE_STALE_MS).toBe(24 * 60 * 60 * 1000);
    expect(LIVE_CURRENT_STATE_STALE_MINUTES).toBe(15);
    expect(MANUAL_CURRENT_STATE_STALE_HOURS).toBe(24);
    expect(STALE_THRESHOLD_MS).toBe(LIVE_CURRENT_STATE_STALE_MS);
    expect(CURRENT_STATE_FRESHNESS_WINDOW_LABEL).toMatch(/15-minute live/);
    expect(CURRENT_STATE_FRESHNESS_WINDOW_LABEL).toMatch(/24-hour manual/);
  });

  it("classifies source kinds without upgrading unknown to live", () => {
    expect(classifyCurrentStateSource("live")).toBe("live");
    expect(classifyCurrentStateSource("pi_bridge")).toBe("live");
    expect(classifyCurrentStateSource("manual")).toBe("manual");
    expect(classifyCurrentStateSource("diary")).toBe("diary");
    expect(classifyCurrentStateSource("csv")).toBe("csv");
    expect(classifyCurrentStateSource("ecowitt_raw_vendor")).toBe("unknown");
    expect(classifyCurrentStateSource(null)).toBe("unknown");
  });

  it("resolves live 15m and manual 24h windows", () => {
    expect(resolveCurrentStateStaleWindowMs("live")).toBe(LIVE_CURRENT_STATE_STALE_MS);
    expect(resolveCurrentStateStaleWindowMs("manual")).toBe(MANUAL_CURRENT_STATE_STALE_MS);
    expect(resolveCurrentStateStaleWindowMs("diary")).toBe(MANUAL_CURRENT_STATE_STALE_MS);
    // Strict default for untrusted / missing provenance.
    expect(resolveCurrentStateStaleWindowMs("csv")).toBe(LIVE_CURRENT_STATE_STALE_MS);
    expect(resolveCurrentStateStaleWindowMs(null)).toBe(LIVE_CURRENT_STATE_STALE_MS);
  });

  it("marks live fresh at 14m and stale just past 15m", () => {
    const fresh = new Date(NOW - 14 * 60_000).toISOString();
    const stale = new Date(NOW - 15 * 60_000 - 1).toISOString();
    expect(isCurrentStateStale(fresh, { now: NOW, source: "live" })).toBe(false);
    expect(isCurrentStateStale(stale, { now: NOW, source: "live" })).toBe(true);
    expect(isStale(fresh, NOW, STALE_THRESHOLD_MS, "live")).toBe(false);
    expect(isStale(stale, NOW, STALE_THRESHOLD_MS, "live")).toBe(true);
  });

  it("keeps manual current for 23h and stale past 24h", () => {
    const fresh = new Date(NOW - 23 * 60 * 60_000).toISOString();
    const stale = new Date(NOW - 24 * 60 * 60_000 - 1).toISOString();
    expect(isCurrentStateStale(fresh, { now: NOW, source: "manual" })).toBe(false);
    expect(isCurrentStateStale(stale, { now: NOW, source: "manual" })).toBe(true);
    expect(isSnapshotStale({ ts: fresh, source: "manual" }, NOW)).toBe(false);
    expect(isSnapshotStale({ ts: stale, source: "manual" }, NOW)).toBe(true);
    // 2h-old manual must not be labeled stale under the live window accident.
    const twoHours = new Date(NOW - 2 * 60 * 60_000).toISOString();
    expect(isCurrentStateStale(twoHours, { now: NOW, source: "manual" })).toBe(false);
    expect(isCurrentStateStale(twoHours, { now: NOW, source: "live" })).toBe(true);
  });

  it("describes windows honestly", () => {
    expect(describeCurrentStateStaleWindow("live")).toMatch(/15 minutes/);
    expect(describeCurrentStateStaleWindow("manual")).toMatch(/24 hours/);
  });

  it("status contract resolveStaleWindowMs follows the canon for named sources", () => {
    expect(resolveStaleWindowMs("live")).toBe(LIVE_CURRENT_STATE_STALE_MS);
    expect(resolveStaleWindowMs("manual")).toBe(MANUAL_CURRENT_STATE_STALE_MS);
  });
});
