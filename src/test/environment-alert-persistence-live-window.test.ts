/**
 * Alert persistence holds every source to the LIVE window.
 *
 * Doctrine:
 *   DISPLAY freshness  → source-aware (Sensor Truth Canon: live 15m,
 *                        manual/diary 24h). Rendering a day-old manual
 *                        reading as "current" is honest.
 *   Alert PERSISTENCE  → the LIVE window for EVERY source. Writing a
 *                        `public.alerts` row is a stronger claim than
 *                        rendering a value: the row asserts this problem is
 *                        happening NOW.
 *
 * Why the tighter bar is load-bearing, not stylistic:
 *   - `alerts.first_seen_at` is `NOT NULL DEFAULT now()` and `saveAlert`
 *     does not send it, so a row minted from a day-old reading is stamped
 *     as if the problem started this instant.
 *   - `listAlerts` orders by `first_seen_at DESC`, so that row sorts to the
 *     top as the newest alert.
 *   - Persistence dedupes only against rows with `status: "open"`, so
 *     acknowledging or dismissing lets the same alert be re-created for as
 *     long as the reading stays inside the window.
 *
 * These tests exist so the tighter bar cannot silently drift back: forwarding
 * `snapshot.source` into `isStale` inside `isSnapshotPersistable` makes the
 * gap cases below fail.
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

const NOW = new Date("2026-05-23T12:00:00Z").getTime();

function agedSnapshot(ageMs: number, source: string): SensorSnapshot {
  return {
    ts: new Date(NOW - ageMs).toISOString(),
    source,
    temp: 24.5,
    rh: 78,
    vpd: 0.9,
    soil_ec: null,
    ppfd: null,
  } as unknown as SensorSnapshot;
}

/** A real (non-synthetic) derived alert, eligible on its own merits. */
const REAL_ALERT = {
  id: "humidity:high",
  severity: "watch",
  metric: "rh",
  title: "Humidity above default range",
  reason: "78% is above the default range.",
  source: "sensor_snapshot",
  createdAt: new Date(NOW).toISOString(),
} as unknown as EnvironmentAlert;

describe("alert persistence uses the LIVE window regardless of source", () => {
  it("the two canon windows really do differ, or these tests prove nothing", () => {
    expect(MANUAL_CURRENT_STATE_STALE_MS).toBeGreaterThan(LIVE_CURRENT_STATE_STALE_MS);
  });

  it("a fresh live snapshot is persistable", () => {
    expect(
      isSnapshotPersistable({ snapshot: agedSnapshot(60_000, "live"), quality: "good", now: NOW }),
    ).toBe(true);
  });

  it("a fresh manual snapshot (inside the live window) is persistable", () => {
    expect(
      isSnapshotPersistable({ snapshot: agedSnapshot(60_000, "manual"), quality: "good", now: NOW }),
    ).toBe(true);
  });

  it("a live snapshot past the live window is NOT persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: agedSnapshot(LIVE_CURRENT_STATE_STALE_MS + 60_000, "live"),
        quality: "good",
        now: NOW,
      }),
    ).toBe(false);
  });

  // THE GAP CASE. This is the whole point of the file: a manual reading that
  // display surfaces still call "current" must not be able to write an alert.
  it("a manual snapshot past the live window but inside the 24h manual window is NOT persistable", () => {
    const gapAge = LIVE_CURRENT_STATE_STALE_MS + 60_000;
    expect(gapAge).toBeLessThan(MANUAL_CURRENT_STATE_STALE_MS);
    expect(
      isSnapshotPersistable({
        snapshot: agedSnapshot(gapAge, "manual"),
        quality: "good",
        now: NOW,
      }),
    ).toBe(false);
  });

  it("the gap holds at the far end of the manual window too", () => {
    expect(
      isSnapshotPersistable({
        snapshot: agedSnapshot(MANUAL_CURRENT_STATE_STALE_MS - 60_000, "manual"),
        quality: "good",
        now: NOW,
      }),
    ).toBe(false);
  });

  it("selectPersistableAlerts drops everything for a gap-case manual snapshot", () => {
    expect(
      selectPersistableAlerts([REAL_ALERT], {
        snapshot: agedSnapshot(LIVE_CURRENT_STATE_STALE_MS + 60_000, "manual"),
        quality: "good",
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("selectPersistableAlerts keeps a real alert for a fresh manual snapshot", () => {
    expect(
      selectPersistableAlerts([REAL_ALERT], {
        snapshot: agedSnapshot(60_000, "manual"),
        quality: "good",
        now: NOW,
      }),
    ).toEqual([REAL_ALERT]);
  });

  it("diary snapshots stay non-persistable even inside the live window", () => {
    expect(
      isSnapshotPersistable({ snapshot: agedSnapshot(60_000, "diary"), quality: "good", now: NOW }),
    ).toBe(false);
  });

  it("demo data stays non-persistable even when fresh and live", () => {
    expect(
      isSnapshotPersistable({
        snapshot: agedSnapshot(60_000, "live"),
        quality: "good",
        isDemoData: true,
        now: NOW,
      }),
    ).toBe(false);
  });
});
