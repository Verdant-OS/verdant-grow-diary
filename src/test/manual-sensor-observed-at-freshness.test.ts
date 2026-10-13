import { describe, expect, it } from "vitest";
import { buildSensorSnapshot } from "@/lib/latestSensorSnapshotRules";
import { evaluateManualSensorSnapshotQuality } from "@/lib/manualSensorSnapshotQualityRules";
import { isStale, isSnapshotStale, snapshotFromReadings } from "@/lib/sensorSnapshot";
import { isCurrentStateStale } from "@/lib/sensorTruthCanon";

const NOW = new Date("2026-10-10T16:00:00.000Z");
const NOW_MS = NOW.getTime();
const THREE_DAYS_AGO = new Date(NOW_MS - 3 * 24 * 60 * 60 * 1000).toISOString();
const TEN_MINUTES_AGO = new Date(NOW_MS - 10 * 60 * 1000).toISOString();
const SAVED_NOW = NOW.toISOString();

describe("backdated manual readings stay stale", () => {
  it("uses captured_at, not the save time, for latest-snapshot freshness", () => {
    const snapshot = buildSensorSnapshot(
      [
        {
          id: "just-saved-old",
          tent_id: "tent-1",
          metric: "humidity_pct",
          value: 55,
          source: "manual",
          captured_at: THREE_DAYS_AGO,
          ts: SAVED_NOW,
          created_at: SAVED_NOW,
        },
        {
          id: "just-saved-old-temp",
          tent_id: "tent-1",
          metric: "temperature_c",
          value: 24,
          source: "manual",
          captured_at: THREE_DAYS_AGO,
          ts: SAVED_NOW,
          created_at: SAVED_NOW,
        },
      ],
      { now: NOW, tentId: "tent-1" },
    );

    expect(snapshot.captured_at).toBe(THREE_DAYS_AGO);
    expect(snapshot.status).toBe("stale");
    expect(snapshot.freshness).toBe("stale");
    expect(snapshot.badge_label.startsWith("Stale")).toBe(true);
    expect(snapshot.badge_label.includes("Live")).toBe(false);
    expect(snapshot.source).toBe("manual");
  });

  it("prefers a newer observation over a just-saved older one", () => {
    const snapshot = buildSensorSnapshot(
      [
        {
          id: "older-observation",
          metric: "humidity_pct",
          value: 40,
          source: "manual",
          captured_at: THREE_DAYS_AGO,
          ts: SAVED_NOW,
          created_at: SAVED_NOW,
        },
        {
          id: "newer-observation",
          metric: "humidity_pct",
          value: 55,
          source: "manual",
          captured_at: TEN_MINUTES_AGO,
          ts: new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "newer-temp",
          metric: "temperature_c",
          value: 24,
          source: "manual",
          captured_at: TEN_MINUTES_AGO,
          created_at: new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      { now: NOW },
    );

    expect(snapshot.captured_at).toBe(TEN_MINUTES_AGO);
    expect(snapshot.metrics.humidity_pct).toBe(55);
    expect(snapshot.status).toBe("fresh_non_live");
    expect(snapshot.badge_label.startsWith("Live")).toBe(false);
  });

  it("never labels a recent manual reading live", () => {
    const snapshot = buildSensorSnapshot(
      [
        {
          id: "recent-rh",
          metric: "humidity_pct",
          value: 55,
          source: "manual",
          captured_at: TEN_MINUTES_AGO,
          ts: TEN_MINUTES_AGO,
          created_at: SAVED_NOW,
        },
        {
          id: "recent-temp",
          metric: "temperature_c",
          value: 24,
          source: "manual",
          captured_at: TEN_MINUTES_AGO,
          ts: TEN_MINUTES_AGO,
          created_at: SAVED_NOW,
        },
      ],
      { now: NOW },
    );

    expect(snapshot.status).toBe("fresh_non_live");
    expect(snapshot.badge_label.includes("Live")).toBe(false);
  });

  it("marks the manual current-state and quality badge from the observed time", () => {
    expect(isCurrentStateStale(THREE_DAYS_AGO, { now: NOW_MS, source: "manual" })).toBe(true);
    expect(isCurrentStateStale(SAVED_NOW, { now: NOW_MS, source: "manual" })).toBe(false);

    const quality = evaluateManualSensorSnapshotQuality(
      {
        source: "manual",
        captured_at: THREE_DAYS_AGO,
        temperature_c: 24,
        humidity_pct: 55,
      },
      { nowMs: NOW_MS },
    );
    expect(quality.quality).toBe("needs_review");
    expect(quality.summary).toBe("Needs review");
    expect(quality.summary).not.toBe("Usable current reading");
    expect(quality.canSupportAiDoctorCurrentContext).toBe(false);

    const future = evaluateManualSensorSnapshotQuality(
      {
        source: "manual",
        captured_at: new Date(NOW_MS + 60_000).toISOString(),
        temperature_c: 24,
        humidity_pct: 55,
      },
      { nowMs: NOW_MS },
    );
    expect(future.quality).toBe("needs_review");
    expect(future.canSupportAiDoctorCurrentContext).toBe(false);
    expect(future.reasons.join(" ")).toMatch(/future/i);
  });

  it("folds snapshot.ts from captured_at so a just-saved backdated row is stale", () => {
    const snap = snapshotFromReadings([
      {
        metric: "humidity_pct",
        value: 55,
        source: "manual",
        captured_at: THREE_DAYS_AGO,
        ts: SAVED_NOW,
      },
    ]);
    expect(snap).not.toBeNull();
    expect(snap?.ts).toBe(THREE_DAYS_AGO);
    expect(snap?.source).toBe("manual");
    expect(isStale(snap!.ts, NOW_MS)).toBe(true);
    expect(isSnapshotStale({ ts: snap!.ts, source: snap!.source }, NOW_MS)).toBe(true);
    expect(snap?.source).not.toBe("live");
  });
});
