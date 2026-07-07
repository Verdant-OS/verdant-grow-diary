/**
 * Manual sensor snapshot UX + source-label proof.
 *
 * Verifies the trust-truth contract for MANUAL snapshots end-to-end:
 *
 *  1. Manual snapshots render as MANUAL, never LIVE.
 *  2. Stale/invalid resolver verdicts on a MANUAL source dominate — a
 *     grower never sees "Manual" as a healthy fresh label when the
 *     resolver flagged the reading stale/invalid.
 *  3. Empty snapshot renders "No snapshot", not "Invalid".
 *  4. Missing optional CO2 / PPFD does not invalidate a manual reading
 *     (they are simply absent, not stuck-at-0/stuck-at-100 telemetry).
 *  5. Obviously bad critical values (humidity 0/100, out-of-range temp)
 *     are flagged invalid by the shared quality rules.
 *  6. "Add snapshot" CTA deep-links to the Manual Sensor Reading anchor
 *     inside /sensors so growers can enter a manual reading in one tap.
 *  7. No demo/CSV/vendor label ever collapses to Manual, and MANUAL
 *     never collapses to LIVE.
 *
 * Pure module tests — no React, no Supabase, no network, no writes.
 */
import { describe, it, expect } from "vitest";

import {
  buildQuickLogSnapshotStrip,
  buildQuickLogStripFromTentState,
  MANUAL_SNAPSHOT_ENTRY_HREF,
} from "@/lib/quickLogSnapshotStripAdapter";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
  type SensorSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";
import {
  evaluateManualSensorSnapshotQuality,
  type ManualSensorSnapshotInput,
} from "@/lib/manualSensorSnapshotQualityRules";
import { classifySnapshotTrustBadge } from "@/lib/sensorSnapshotTrustBadgeRules";

const NOW = new Date("2026-06-02T12:00:00Z");
const FIVE_MIN_AGO = "2026-06-02T11:55:00Z";

function strictSnap(
  partial: Partial<StrictSensorSnapshot> = {},
): StrictSensorSnapshot {
  return {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "s1",
    tent_id: "t1",
    captured_at: FIVE_MIN_AGO,
    age_minutes: 5,
    source: "manual",
    confidence: null,
    freshness: "fresh",
    status: "fresh_non_live" as SensorSnapshotStatus,
    badge_label: "Manual • 5 min ago",
    metrics: {
      temp_f: 75.74,
      humidity_pct: 55,
      vpd_kpa: 1.12,
      soil_moisture_pct: null,
      co2_ppm: null,
    },
    metricDetails: { ...EMPTY_SENSOR_SNAPSHOT.metricDetails },
    warnings: [],
    usable: true,
    ...partial,
  };
}

function legacySnap(partial: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "manual",
    ts: FIVE_MIN_AGO,
    temp: 24.3,
    rh: 55,
    vpd: 1.12,
    ...partial,
  };
}

describe("manual sensor snapshot — trust badge proof", () => {
  it("fresh manual source resolves to Manual badge (never Live)", () => {
    const view = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: strictSnap(),
      hasTent: true,
      now: NOW,
    });
    expect(view.trustBadge.badge).toBe("manual");
    expect(view.trustBadge.badge).not.toBe("live");
    expect(view.trustBadge.label).toBe("Manual");
    expect(view.status).toBe("usable");
    expect(view.capturedAt).toBe(FIVE_MIN_AGO);
    // Captured timestamp is available to the presenter.
    expect(view.ageLabel).not.toBeNull();
  });

  it("stale manual source dominates — badge is Stale, not Manual", () => {
    const view = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: strictSnap({
        status: "stale",
        freshness: "stale",
        badge_label: "Stale • manual",
      }),
      hasTent: true,
      now: NOW,
    });
    expect(view.trustBadge.badge).toBe("stale");
    expect(view.trustBadge.badge).not.toBe("live");
    expect(view.status).toBe("stale");
  });

  it("invalid manual source dominates — badge is Invalid, not Manual", () => {
    const view = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: strictSnap({
        status: "invalid",
        freshness: "invalid",
        badge_label: "Invalid • manual",
      }),
      hasTent: true,
      now: NOW,
    });
    expect(view.trustBadge.badge).toBe("invalid");
    expect(view.status).toBe("invalid");
  });

  it("empty snapshot renders No snapshot / no_data, never Invalid", () => {
    const view = buildQuickLogStripFromTentState({
      status: "empty",
      snapshot: { ...EMPTY_SENSOR_SNAPSHOT },
      hasTent: true,
      now: NOW,
    });
    expect(view.status).toBe("no_data");
    expect(view.trustBadge.badge).toBe("none");
    expect(view.trustBadge.badge).not.toBe("invalid");
    expect(view.title).toBe("No sensor snapshot attached");
  });

  it("classifySnapshotTrustBadge — bare manual source (no resolver verdict) is Manual", () => {
    const badge = classifySnapshotTrustBadge({ source: "manual" });
    expect(badge.badge).toBe("manual");
    expect(badge.label).toBe("Manual");
  });

  it("classifySnapshotTrustBadge — bare 'live' source without resolver verdict is refused (never auto-promoted)", () => {
    const badge = classifySnapshotTrustBadge({ source: "live" });
    expect(badge.badge).not.toBe("live");
    expect(badge.badge).toBe("invalid");
  });
});

describe("manual sensor snapshot — quality rules for optional / bad values", () => {
  const base: ManualSensorSnapshotInput = {
    source: "manual",
    captured_at: FIVE_MIN_AGO,
    temperature_c: 24.3,
    humidity_pct: 55,
    vpd_kpa: 1.12,
  };

  it("missing CO2 / PPFD does not invalidate a manual snapshot", () => {
    // Neither CO2 nor PPFD appear on ManualSensorSnapshotInput at all —
    // absence is not counted as invalid telemetry.
    const q = evaluateManualSensorSnapshotQuality(base, {
      nowMs: NOW.getTime(),
    });
    expect(q.quality).toBe("usable");
    expect(q.sourceLabel).toBe("manual");
    expect(q.invalidFields).not.toContain("co2_ppm");
    expect(q.invalidFields).not.toContain("ppfd");
  });

  it("humidity stuck at 100 is flagged invalid, never healthy", () => {
    const q = evaluateManualSensorSnapshotQuality(
      { ...base, humidity_pct: 100 },
      { nowMs: NOW.getTime() },
    );
    expect(q.invalidFields).toContain("humidity_pct");
    expect(q.quality).not.toBe("usable");
  });

  it("humidity stuck at 0 is flagged invalid", () => {
    const q = evaluateManualSensorSnapshotQuality(
      { ...base, humidity_pct: 0 },
      { nowMs: NOW.getTime() },
    );
    expect(q.invalidFields).toContain("humidity_pct");
  });

  it("out-of-range VPD is flagged invalid", () => {
    const q = evaluateManualSensorSnapshotQuality(
      { ...base, vpd_kpa: 12 },
      { nowMs: NOW.getTime() },
    );
    expect(q.invalidFields).toContain("vpd_kpa");
  });

  it("valid temperature + humidity + entered VPD stays usable and labeled manual", () => {
    const q = evaluateManualSensorSnapshotQuality(base, {
      nowMs: NOW.getTime(),
    });
    expect(q.quality).toBe("usable");
    expect(q.sourceLabel).toBe("manual");
  });
});

describe("manual sensor snapshot — Quick Log CTA deep link", () => {
  it("exports the canonical Manual Sensor Reading deep link", () => {
    expect(MANUAL_SNAPSHOT_ENTRY_HREF).toBe("/sensors#manual-reading");
  });

  it("no_data via legacy adapter → Add snapshot deep-links to the Manual Sensor Reading anchor", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: null,
      hasTent: true,
      loading: true,
      now: NOW,
    });
    expect(v.status).toBe("no_data");
    expect(v.action.kind).toBe("add");
    if (v.action.kind === "add") {
      expect(v.action.href).toBe("/sensors#manual-reading");
      expect(v.action.label).toBe("Add snapshot");
    }
  });

  it("no_data via strict adapter → Add snapshot deep-links to the Manual Sensor Reading anchor", () => {
    const v = buildQuickLogStripFromTentState({
      status: "empty",
      snapshot: { ...EMPTY_SENSOR_SNAPSHOT },
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("no_data");
    expect(v.action.kind).toBe("add");
    if (v.action.kind === "add") {
      expect(v.action.href).toBe("/sensors#manual-reading");
    }
  });

  it("usable manual snapshot exposes the Edit manual readings action (deep link to manual entry)", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: strictSnap(),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("usable");
    expect(v.action.kind).toBe("edit");
    if (v.action.kind === "edit") {
      expect(v.action.href).toBe("/sensors#manual-reading");
      expect(v.action.label).toBe("Edit manual readings");
    }
  });
});

describe("manual sensor snapshot — negative safety: no fake live promotion", () => {
  it("legacy adapter: manual snapshot never labels the strip Live", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: legacySnap(),
      hasTent: true,
      now: NOW,
    });
    expect(v.trustBadge.badge).not.toBe("live");
  });

  it("demo/sim source never resolves to Manual", () => {
    const badge = classifySnapshotTrustBadge({ source: "sim" });
    expect(badge.badge).not.toBe("manual");
    expect(badge.badge).toBe("demo");
  });

  it("csv source never resolves to Manual", () => {
    const badge = classifySnapshotTrustBadge({ source: "csv" });
    expect(badge.badge).not.toBe("manual");
    expect(badge.badge).toBe("csv");
  });
});
