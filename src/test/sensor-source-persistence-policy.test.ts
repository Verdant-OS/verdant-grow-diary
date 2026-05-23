import { describe, it, expect } from "vitest";
import {
  snapshotFromReadings,
  SOURCE_LABEL,
  type SensorReadingLike,
} from "@/lib/sensorSnapshot";
import { isSnapshotPersistable } from "@/lib/environmentAlertPersistence";

const NOW = new Date("2026-05-23T12:00:00Z").getTime();
const TS = "2026-05-23T11:55:00Z";

const row = (
  metric: string,
  value: number,
  source: string,
): SensorReadingLike => ({ ts: TS, metric, value, source });

describe("snapshotFromReadings — source mapping", () => {
  it("maps manual rows to manual", () => {
    const s = snapshotFromReadings([row("temperature_c", 22, "manual")]);
    expect(s?.source).toBe("manual");
  });
  it("maps pi_bridge rows to live (persistable)", () => {
    const s = snapshotFromReadings([row("temperature_c", 22, "pi_bridge")]);
    expect(s?.source).toBe("live");
  });
  it("maps sim rows to sim (not live)", () => {
    const s = snapshotFromReadings([row("temperature_c", 22, "sim")]);
    expect(s?.source).toBe("sim");
    expect(s?.source).not.toBe("live");
  });
  it("mixed manual+sim → manual (operator-attested wins)", () => {
    const s = snapshotFromReadings([
      row("temperature_c", 22, "sim"),
      row("humidity_pct", 50, "manual"),
    ]);
    expect(s?.source).toBe("manual");
  });
});

describe("SOURCE_LABEL", () => {
  it("includes a label for sim", () => {
    expect(SOURCE_LABEL.sim).toBeTruthy();
  });
});

describe("isSnapshotPersistable — source allowlist", () => {
  const base = {
    ts: new Date(NOW - 60_000).toISOString(),
    temp: 22,
    rh: 50,
    vpd: 1.0,
    co2: 800,
    soil: 40,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
  };
  it("manual fresh → persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: { ...base, source: "manual" },
        quality: "ok",
        now: NOW,
      }),
    ).toBe(true);
  });
  it("live (pi_bridge mapped) fresh → persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: { ...base, source: "live" },
        quality: "ok",
        now: NOW,
      }),
    ).toBe(true);
  });
  it("sim fresh → NOT persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: { ...base, source: "sim" },
        quality: "ok",
        now: NOW,
      }),
    ).toBe(false);
  });
  it("diary fresh → NOT persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: { ...base, source: "diary" },
        quality: "ok",
        now: NOW,
      }),
    ).toBe(false);
  });
  it("unavailable → NOT persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: { ...base, source: "unavailable" },
        quality: "ok",
        now: NOW,
      }),
    ).toBe(false);
  });
  it("stale manual → NOT persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: {
          ...base,
          source: "manual",
          ts: new Date(NOW - 60 * 60 * 1000).toISOString(),
        },
        quality: "ok",
        now: NOW,
      }),
    ).toBe(false);
  });
  it("stale live → NOT persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: {
          ...base,
          source: "live",
          ts: new Date(NOW - 60 * 60 * 1000).toISOString(),
        },
        quality: "ok",
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe("end-to-end: sim sensor readings never persist alerts", () => {
  it("snapshotFromReadings(sim) → isSnapshotPersistable=false", () => {
    const s = snapshotFromReadings([
      row("temperature_c", 35, "sim"),
      row("humidity_pct", 90, "sim"),
    ]);
    expect(s?.source).toBe("sim");
    expect(
      isSnapshotPersistable({ snapshot: s, quality: "ok", now: NOW }),
    ).toBe(false);
  });
});
