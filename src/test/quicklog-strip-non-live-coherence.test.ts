/**
 * Quick Log strip — non-live pill / badge / advisory coherence.
 *
 * Leftover #1163 / #1003: `fresh_non_live` and `stale` prove freshness/age,
 * not trust. Pill status, trust badge, and view-model advisory must agree
 * after `normalizeSensorSource` (called, never edited). `fresh_live` stays
 * untouched.
 *
 * Pure adapter + advisory wiring tests. No I/O, no React, no Supabase.
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogStripFromTentState,
  DEMO_USABLE_DESCRIPTION,
  DEMO_USABLE_TITLE,
} from "@/lib/quickLogSnapshotStripAdapter";
import { adaptQuickLogSensorContextInput } from "@/lib/quickLogSensorSnapshotViewModelAdapter";
import { buildQuickLogSensorSnapshotViewModel } from "@/lib/quickLogSensorSnapshotViewModel";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
  type SensorSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";

const NOW = new Date("2026-06-02T12:00:00Z");
const FRESH = "2026-06-02T11:55:00Z";
/** Older than the 15-minute environment stale window — advisory agrees with strip. */
const OLD = "2026-06-02T11:00:00Z";

function snap(partial: Partial<StrictSensorSnapshot> = {}): StrictSensorSnapshot {
  return {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "s1",
    tent_id: "t1",
    captured_at: FRESH,
    age_minutes: 5,
    source: "live",
    confidence: null,
    freshness: "fresh",
    status: "fresh_live" as SensorSnapshotStatus,
    badge_label: "Live",
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

/** Advisory helper matching QuickLogSensorSnapshotStrip wiring. */
function advisoryFor(snapshot: StrictSensorSnapshot, attached = true) {
  const vm = buildQuickLogSensorSnapshotViewModel(
    adaptQuickLogSensorContextInput({
      state: { status: "ready", snapshot },
      tentId: "t1",
      attached,
    }),
    { now: NOW },
  );
  const copy = vm.display && vm.display.freshness === "fresh" ? null : (vm.warning ?? vm.emptyCopy);
  const kind = vm.display ? vm.display.freshness : vm.emptyCopy ? "missing" : null;
  return { copy, kind, vm };
}

describe("quicklog strip non-live coherence — stale + unknown → Invalid trio", () => {
  for (const source of ["ecowitt", "ecowitt_mqtt", "mqtt", "webhook", "wat", null]) {
    it(`stale + ${String(source)} → Invalid pill/badge, non-attachable`, () => {
      const s = snap({
        source: source as string | null,
        status: "stale",
        freshness: "stale",
        captured_at: OLD,
        age_minutes: 60,
      });
      const v = buildQuickLogStripFromTentState({
        status: "ready",
        snapshot: s,
        hasTent: true,
        now: NOW,
        temperatureUnit: "celsius",
      });
      expect(v.status).toBe("invalid");
      expect(v.trustBadge.badge).toBe("invalid");
      expect(v.trustBadge.attachable).toBe(false);
      expect(v.classification.isHealthyEvidence).toBe(false);
      const adv = advisoryFor(s);
      expect(adv.kind).toBe("invalid");
      expect(adv.copy).toMatch(/invalid|unknown/i);
    });
  }
});

describe("quicklog strip non-live coherence — stale + trusted → Stale trio", () => {
  for (const source of ["live", "manual", "csv", "stale", "pi_bridge"]) {
    it(`stale + ${source} → Stale pill/badge`, () => {
      const s = snap({
        source,
        status: "stale",
        freshness: "stale",
        captured_at: OLD,
        age_minutes: 60,
      });
      const v = buildQuickLogStripFromTentState({
        status: "ready",
        snapshot: s,
        hasTent: true,
        now: NOW,
        temperatureUnit: "celsius",
      });
      expect(v.status).toBe("stale");
      expect(v.trustBadge.badge).toBe("stale");
      expect(v.trustBadge.attachable).toBe(false);
      const adv = advisoryFor(s);
      expect(adv.kind).toBe("stale");
      expect(adv.copy).toMatch(/stale/i);
    });
  }
});

describe("quicklog strip non-live coherence — fresh row source stale", () => {
  it("fresh_non_live + source stale → Stale never Usable", () => {
    const s = snap({ source: "stale", status: "fresh_non_live", freshness: "fresh" });
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: s,
      hasTent: true,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(v.status).toBe("stale");
    expect(v.status).not.toBe("usable");
    expect(v.trustBadge.badge).toBe("stale");
  });
});

describe("quicklog strip non-live coherence — demo aliases", () => {
  for (const source of ["demo", "sim", "mock", "sample", "fixture"]) {
    it(`${source} fresh_non_live → usable + DEMO_USABLE copy, Demo badge`, () => {
      const s = snap({ source, status: "fresh_non_live", freshness: "fresh" });
      const v = buildQuickLogStripFromTentState({
        status: "ready",
        snapshot: s,
        hasTent: true,
        now: NOW,
        temperatureUnit: "celsius",
      });
      expect(v.status).toBe("usable");
      expect(v.title).toBe(DEMO_USABLE_TITLE);
      expect(v.description).toBe(DEMO_USABLE_DESCRIPTION);
      expect(v.trustBadge.badge).toBe("demo");
      expect(v.trustBadge.badge).not.toBe("stale");
      expect(v.trustBadge.attachable).toBe(false);
      expect(v.classification.isHealthyEvidence).toBe(false);
      const adv = advisoryFor(s);
      expect(adv.kind).toBe("demo");
      expect(adv.copy).toMatch(/demo|never treated as live/i);
    });
  }

  it("detached sim keeps Sensor snapshot available — no current-sensor-context claim", () => {
    const s = snap({ source: "sim", status: "fresh_non_live" });
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: s,
      hasTent: true,
      attached: false,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(v.title).toBe("Sensor snapshot available");
    expect(v.description).not.toMatch(/current sensor context/i);
    expect(v.title).not.toBe(DEMO_USABLE_TITLE);
  });
});

describe("quicklog strip non-live coherence — reviewed live aliases", () => {
  for (const source of ["pi_bridge", "sensor", "realtime"]) {
    it(`${source} fresh_non_live → usable + live badge, attachable false`, () => {
      const s = snap({ source, status: "fresh_non_live", freshness: "fresh" });
      const v = buildQuickLogStripFromTentState({
        status: "ready",
        snapshot: s,
        hasTent: true,
        now: NOW,
        temperatureUnit: "celsius",
      });
      expect(v.status).toBe("usable");
      expect(v.trustBadge.badge).toBe("live");
      // Live badge OK for coherence; attachable stays false — only real
      // fresh_live may grant attachable true (GDP / Blue Dream #1168).
      expect(v.trustBadge.attachable).toBe(false);
      expect(v.trustBadge.helper).not.toMatch(/too old/i);
      const adv = advisoryFor(s);
      expect(adv.kind).toBe("fresh");
      expect(adv.copy).toBeNull();
    });
  }
});

describe("quicklog strip non-live coherence — transport labels fail closed", () => {
  for (const source of ["ecowitt", "mqtt", "home_assistant", "bridge", "webhook", "ggs"]) {
    it(`${source} fresh_non_live → invalid, non-attachable`, () => {
      const s = snap({ source, status: "fresh_non_live" });
      const v = buildQuickLogStripFromTentState({
        status: "ready",
        snapshot: s,
        hasTent: true,
        now: NOW,
        temperatureUnit: "celsius",
      });
      expect(v.status).toBe("invalid");
      expect(v.trustBadge.badge).toBe("invalid");
      expect(v.trustBadge.attachable).toBe(false);
    });
  }
});

describe("quicklog strip non-live coherence — manual / csv aliases", () => {
  for (const source of ["manual", "user", "entry", "log", "diary", "manual_snapshot"]) {
    it(`${source} → manual badge`, () => {
      const v = buildQuickLogStripFromTentState({
        status: "ready",
        snapshot: snap({ source, status: "fresh_non_live" }),
        hasTent: true,
        now: NOW,
        temperatureUnit: "celsius",
      });
      expect(v.trustBadge.badge).toBe("manual");
      expect(v.trustBadge.attachable).toBe(true);
    });
  }

  for (const source of ["csv", "import", "imported"]) {
    it(`${source} → csv badge`, () => {
      const v = buildQuickLogStripFromTentState({
        status: "ready",
        snapshot: snap({ source, status: "fresh_non_live" }),
        hasTent: true,
        now: NOW,
        temperatureUnit: "celsius",
      });
      expect(v.trustBadge.badge).toBe("csv");
      expect(v.trustBadge.attachable).toBe(true);
    });
  }

  it("canonical manual stays attachable without claiming live telemetry", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "manual", status: "fresh_non_live" }),
      hasTent: true,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(v.trustBadge.attachable).toBe(true);
    expect(v.description).toMatch(/manual.*not live telemetry/i);
    expect(v.description).not.toMatch(/current sensor context/i);
  });

  it("canonical csv stays attachable as history without claiming current conditions", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "csv", status: "fresh_non_live" }),
      hasTent: true,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(v.trustBadge.attachable).toBe(true);
    expect(v.description).toMatch(/csv|imported history/i);
    expect(v.description).toMatch(/not current conditions/i);
    expect(v.description).not.toMatch(/will include current sensor context/i);
  });
});

describe("quicklog strip non-live coherence — provider identity from RAW label", () => {
  it("pi_bridge → Pi Bridge on strip and trustBadge, attachable false", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "pi_bridge", status: "fresh_non_live" }),
      hasTent: true,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(v.providerLabel).toBe("Pi Bridge");
    expect(v.trustBadge.providerLabel).toBe("Pi Bridge");
    expect(v.trustBadge.badge).toBe("live");
    expect(v.trustBadge.attachable).toBe(false);
  });
});

describe("quicklog strip non-live coherence — fresh_live untouched", () => {
  it("fresh_live → usable, Sensor context ready, live attachable, healthy, silent advisory", () => {
    const s = snap({ source: "live", status: "fresh_live", freshness: "fresh" });
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: s,
      hasTent: true,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(v.status).toBe("usable");
    expect(v.title).toBe("Sensor context ready");
    expect(v.description).toMatch(/current sensor context/i);
    expect(v.trustBadge.badge).toBe("live");
    expect(v.trustBadge.attachable).toBe(true);
    expect(v.classification.isHealthyEvidence).toBe(true);
    const adv = advisoryFor(s);
    expect(adv.kind).toBe("fresh");
    expect(adv.copy).toBeNull();
  });
});

describe("quicklog strip non-live coherence — unknown fresh stays invalid", () => {
  it("unknown fresh_non_live → invalid", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "wat", status: "fresh_non_live" }),
      hasTent: true,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(v.status).toBe("invalid");
    expect(v.trustBadge.badge).toBe("invalid");
  });
});

describe("quicklog strip non-live coherence — deterministic + whitespace/casing", () => {
  it("same inputs deep-equal", () => {
    const args = {
      status: "ready" as const,
      snapshot: snap({ source: "manual", status: "fresh_non_live" as SensorSnapshotStatus }),
      hasTent: true,
      now: NOW,
      temperatureUnit: "celsius" as const,
    };
    expect(buildQuickLogStripFromTentState(args)).toEqual(buildQuickLogStripFromTentState(args));
  });

  it("whitespace/casing PI_BRIDGE → live badge attachable false; blank → invalid", () => {
    const liveAlias = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "  PI_BRIDGE  ", status: "fresh_non_live" }),
      hasTent: true,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(liveAlias.status).toBe("usable");
    expect(liveAlias.trustBadge.badge).toBe("live");
    expect(liveAlias.trustBadge.attachable).toBe(false);

    const blank = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "   ", status: "fresh_non_live" }),
      hasTent: true,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(blank.status).toBe("invalid");
    expect(blank.trustBadge.badge).toBe("invalid");
  });
});
