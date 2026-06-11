/**
 * snapshot-from-diary-quick-log-companion-parity
 *
 * Regression: Quick Log v1 companion diary rows store
 *   details.sensor_snapshot = { source, captured_at, metrics: { ... } }
 * using canonical clean metric keys (temperature, humidity, vpd, …) AND
 * legacy keys on older rows (temperature_c, humidity_pct, …).
 *
 * Before this fix, `snapshotFromDiary` only knew the legacy flat
 * `{ temp, rh, vpd, … }` shape, so canonical Quick Log writes rendered
 * "Unknown" in the Latest Environment card while showing fine in the
 * Quick Log timeline (which uses `normalizeQuickLogSnapshotMetrics`).
 *
 * This test proves the same diary JSON resolves consistently for:
 *   1. the Quick Log normalizer
 *   2. snapshotFromDiary (Latest Environment card path)
 *   3. extractQuickLogCompanionView (Quick Log timeline path)
 *
 * Pure: no I/O, no React, no Supabase.
 */
import { describe, it, expect } from "vitest";
import { snapshotFromDiary } from "@/lib/sensorSnapshot";
import { normalizeQuickLogSnapshotMetrics } from "@/lib/quick-log/quickLogSnapshotMetricNormalizer";
import { extractQuickLogCompanionView } from "@/lib/quick-log/quickLogDiaryCompanionRules";

const CAPTURED_AT = "2026-06-11T12:00:00.000Z";

function companionDetails(metrics: Record<string, unknown>) {
  return {
    linked_grow_event_id: "ev-1",
    sensor_snapshot: {
      source: "manual",
      captured_at: CAPTURED_AT,
      metrics,
    },
  };
}

describe("snapshotFromDiary — Quick Log v1 companion parity", () => {
  it("resolves canonical clean metric keys (no longer Unknown)", () => {
    const metrics = {
      temperature: 24.2,
      humidity: 55,
      vpd: 1.1,
      co2: 820,
      soil_moisture: 32,
      soil_temp: 21.5,
      soil_ec: 1.4,
      ppfd: 640,
    };
    const snap = snapshotFromDiary(CAPTURED_AT, {
      source: "manual",
      captured_at: CAPTURED_AT,
      metrics,
    });
    expect(snap).not.toBeNull();
    expect(snap!.ts).toBe(CAPTURED_AT);
    // Source label preserved as "diary" (no relabeling to live/manual).
    expect(snap!.source).toBe("diary");
    expect(snap!.temp).toBe(24.2);
    expect(snap!.rh).toBe(55);
    expect(snap!.vpd).toBe(1.1);
    expect(snap!.co2).toBe(820);
    expect(snap!.soil).toBe(32);
    expect(snap!.soil_temp).toBe(21.5);
    expect(snap!.soil_ec).toBe(1.4);
    expect(snap!.ppfd).toBe(640);
  });

  it("resolves legacy metric keys (temperature_c, humidity_pct, …)", () => {
    const snap = snapshotFromDiary(CAPTURED_AT, {
      source: "manual",
      captured_at: CAPTURED_AT,
      metrics: {
        temperature_c: 23,
        humidity_pct: 50,
        vpd_kpa: 0.95,
        co2_ppm: 700,
        soil_moisture_pct: 28,
        soil_temp_c: 20,
        ec: 1.2,
      },
    });
    expect(snap).not.toBeNull();
    expect(snap!.temp).toBe(23);
    expect(snap!.rh).toBe(50);
    expect(snap!.vpd).toBe(0.95);
    expect(snap!.co2).toBe(700);
    expect(snap!.soil).toBe(28);
    expect(snap!.soil_temp).toBe(20);
    expect(snap!.soil_ec).toBe(1.2);
  });

  it("drops non-finite metric values (never fakes)", () => {
    const snap = snapshotFromDiary(CAPTURED_AT, {
      source: "csv",
      captured_at: CAPTURED_AT,
      metrics: {
        temperature: NaN,
        humidity: null,
        vpd: "1.1", // numeric strings are drift — dropped by normalizer
      },
    });
    expect(snap).not.toBeNull();
    expect(snap!.temp).toBeNull();
    expect(snap!.rh).toBeNull();
    expect(snap!.vpd).toBeNull();
  });

  it("legacy flat shape (no `metrics`) still works for back-compat", () => {
    const snap = snapshotFromDiary(CAPTURED_AT, {
      ts: CAPTURED_AT,
      temp: 22,
      rh: 48,
      vpd: "0.9", // legacy flat coercion path keeps numeric-string support
    });
    expect(snap).not.toBeNull();
    expect(snap!.temp).toBe(22);
    expect(snap!.rh).toBe(48);
    expect(snap!.vpd).toBe(0.9);
    expect(snap!.source).toBe("diary");
  });

  it("falls back to entryAt when captured_at/ts are missing", () => {
    const snap = snapshotFromDiary(CAPTURED_AT, {
      metrics: { temperature: 24, humidity: 55 },
    });
    expect(snap).not.toBeNull();
    expect(snap!.ts).toBe(CAPTURED_AT);
    expect(snap!.temp).toBe(24);
  });

  it("the same companion JSON yields the same canonical metric values across all v1 consumers", () => {
    const metrics = {
      temperature_c: 23.5,
      humidity_pct: 52,
      vpd: 1.0, // clean key — must beat legacy on conflict
      vpd_kpa: 9.9,
      ppfd: 540,
      leaf_temp: 22.1, // unknown clean-shaped passthrough
    };
    const details = companionDetails(metrics);

    // 1) Quick Log normalizer (timeline / AI Doctor source of truth).
    const canonical = normalizeQuickLogSnapshotMetrics(metrics);
    expect(canonical).toEqual({
      temperature: 23.5,
      humidity: 52,
      vpd: 1.0,
      ppfd: 540,
      leaf_temp: 22.1,
    });

    // 2) Quick Log companion view (timeline read path).
    const view = extractQuickLogCompanionView({ id: "d-1", details });
    expect(view?.sensorSnapshot?.metrics).toEqual(canonical);

    // 3) snapshotFromDiary (Latest Environment / Dashboard read path).
    const snap = snapshotFromDiary(CAPTURED_AT, details.sensor_snapshot);
    expect(snap).not.toBeNull();
    expect(snap!.temp).toBe(canonical.temperature);
    expect(snap!.rh).toBe(canonical.humidity);
    expect(snap!.vpd).toBe(canonical.vpd);
    expect(snap!.ppfd).toBe(canonical.ppfd);
  });
});
