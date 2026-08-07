/**
 * Environment alert persistence — LIVE-window staleness bar.
 *
 * Doctrine (decided after the Sensor Truth Canon re-land made freshness
 * source-aware, live 15m / manual 24h):
 *
 *   Display freshness  → source-aware. A MANUAL reading may still read as
 *                        "current" for 24h on read-only surfaces.
 *   Alert PERSISTENCE  → LIVE window for every source. Writing an alert row
 *                        asserts "this environment problem is happening now",
 *                        which a hours-old manual reading cannot support.
 *
 * These tests exist so the tighter persistence bar cannot silently drift
 * back to the source-aware window: passing `snapshot.source` through to
 * isStale inside isSnapshotPersistable would make every case below fail.
 *
 * Pure. No I/O, no Supabase, no clock reads (now is always injected).
 */
import { describe, it, expect } from "vitest";
import {
  isSnapshotPersistable,
  selectPersistableAlerts,
} from "@/lib/environmentAlertPersistence";
import {
  LIVE_CURRENT_STATE_STALE_MS,
  MANUAL_CURRENT_STATE_STALE_MS,
} from "@/lib/sensorTruthCanon";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { EnvironmentAlert } from "@/lib/environmentAlerts";

const NOW_MS = Date.parse("2026-07-11T12:00:00.000Z");

function snapshotAgedMs(ageMs: number, source: string): SensorSnapshot {
  return {
    ts: new Date(NOW_MS - ageMs).toISOString(),
    source,
    temperature_c: 24.5,
    humidity_pct: 78,
  } as unknown as SensorSnapshot;
}

/** A real (non-synthetic) derived alert, eligible on its own merits. */
const REAL_ALERT = {
  id: "humidity:high",
  title: "Humidity above default range",
} as unknown as EnvironmentAlert;

describe("persistence uses the LIVE window regardless of source", () => {
  it("a fresh live snapshot is persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: snapshotAgedMs(60_000, "live"),
        quality: "good",
        now: NOW_MS,
      }),
    ).toBe(true);
  });

  it("a fresh manual snapshot (inside the live window) is persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: snapshotAgedMs(60_000, "manual"),
        quality: "good",
        now: NOW_MS,
      }),
    ).toBe(true);
  });

  it("a MANUAL snapshot past the live window is NOT persistable, even though display freshness would still call it current", () => {
    const age = 90 * 60_000; // 90 minutes
    // Precondition: this age is deliberately in the gap between the two
    // windows — stale for live, still "current" for manual display.
    expect(age).toBeGreaterThan(LIVE_CURRENT_STATE_STALE_MS);
    expect(age).toBeLessThan(MANUAL_CURRENT_STATE_STALE_MS);

    expect(
      isSnapshotPersistable({
        snapshot: snapshotAgedMs(age, "manual"),
        quality: "good",
        now: NOW_MS,
      }),
    ).toBe(false);
  });

  it("a live snapshot past the live window is NOT persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: snapshotAgedMs(90 * 60_000, "live"),
        quality: "good",
        now: NOW_MS,
      }),
    ).toBe(false);
  });

  it("the boundary is exclusive-safe: just inside persists, just outside does not", () => {
    const justInside = LIVE_CURRENT_STATE_STALE_MS - 1_000;
    const justOutside = LIVE_CURRENT_STATE_STALE_MS + 60_000;
    for (const source of ["live", "manual"]) {
      expect(
        isSnapshotPersistable({
          snapshot: snapshotAgedMs(justInside, source),
          quality: "good",
          now: NOW_MS,
        }),
        `${source} just inside the live window must persist`,
      ).toBe(true);
      expect(
        isSnapshotPersistable({
          snapshot: snapshotAgedMs(justOutside, source),
          quality: "good",
          now: NOW_MS,
        }),
        `${source} just outside the live window must not persist`,
      ).toBe(false);
    }
  });

  it("selectPersistableAlerts drops every alert when the manual snapshot is past the live window", () => {
    expect(
      selectPersistableAlerts([REAL_ALERT], {
        snapshot: snapshotAgedMs(90 * 60_000, "manual"),
        quality: "good",
        now: NOW_MS,
      }),
    ).toEqual([]);
  });

  it("selectPersistableAlerts keeps the real alert when the manual snapshot is inside the live window", () => {
    expect(
      selectPersistableAlerts([REAL_ALERT], {
        snapshot: snapshotAgedMs(60_000, "manual"),
        quality: "good",
        now: NOW_MS,
      }),
    ).toEqual([REAL_ALERT]);
  });
});

describe("pre-existing persistence gates still hold under the tighter window", () => {
  it("demo data is never persistable even when perfectly fresh", () => {
    expect(
      isSnapshotPersistable({
        snapshot: snapshotAgedMs(1_000, "manual"),
        quality: "good",
        isDemoData: true,
        now: NOW_MS,
      }),
    ).toBe(false);
  });

  it("non-live/non-manual sources are never persistable", () => {
    for (const source of ["sim", "diary", "csv", "demo", "unavailable"]) {
      expect(
        isSnapshotPersistable({
          snapshot: snapshotAgedMs(1_000, source),
          quality: "good",
          now: NOW_MS,
        }),
        `${source} must never persist`,
      ).toBe(false);
    }
  });

  it("unavailable quality is never persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: snapshotAgedMs(1_000, "live"),
        quality: "unavailable",
        now: NOW_MS,
      }),
    ).toBe(false);
  });

  it("a missing snapshot is never persistable", () => {
    expect(
      isSnapshotPersistable({ snapshot: null, quality: "good", now: NOW_MS }),
    ).toBe(false);
  });

  it("is deterministic for the same injected now", () => {
    const ctx = {
      snapshot: snapshotAgedMs(90 * 60_000, "manual"),
      quality: "good" as const,
      now: NOW_MS,
    };
    expect(isSnapshotPersistable(ctx)).toBe(isSnapshotPersistable(ctx));
  });
});
