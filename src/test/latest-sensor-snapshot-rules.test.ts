import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  EMPTY_SENSOR_SNAPSHOT,
  REQUIRED_SNAPSHOT_METRICS,
  SENSOR_FRESH_WINDOW_MINUTES,
  SENSOR_FUTURE_SKEW_LIMIT_MINUTES,
  buildSensorSnapshot,
  buildSensorSnapshotDetails,
  classifyFreshness,
  evaluateMetric,
} from "@/lib/latestSensorSnapshotRules";

const NOW = new Date("2026-06-08T12:00:00.000Z");
const ISO_FRESH = "2026-06-08T11:55:00.000Z"; // 5 min ago
const ISO_STALE = "2026-06-08T11:00:00.000Z"; // 60 min ago
const ISO_FUTURE_OK = "2026-06-08T12:03:00.000Z"; // +3 min (within skew)
const ISO_FUTURE_BAD = "2026-06-08T12:30:00.000Z"; // +30 min (beyond skew)

describe("classifyFreshness", () => {
  it("returns invalid for missing captured_at", () => {
    expect(classifyFreshness(null, NOW).freshness).toBe("invalid");
    expect(classifyFreshness(undefined, NOW).freshness).toBe("invalid");
    expect(classifyFreshness("", NOW).freshness).toBe("invalid");
  });
  it("returns invalid for unparseable captured_at", () => {
    expect(classifyFreshness("not-a-date", NOW).freshness).toBe("invalid");
  });
  it("returns invalid for >5 min future skew", () => {
    expect(classifyFreshness(ISO_FUTURE_BAD, NOW).freshness).toBe("invalid");
  });
  it("returns fresh for ≤15 min", () => {
    expect(classifyFreshness(ISO_FRESH, NOW).freshness).toBe("fresh");
    expect(classifyFreshness(ISO_FUTURE_OK, NOW).freshness).toBe("fresh");
  });
  it("returns stale beyond 15 min", () => {
    expect(classifyFreshness(ISO_STALE, NOW).freshness).toBe("stale");
  });
  it("exposes the documented constants", () => {
    expect(SENSOR_FRESH_WINDOW_MINUTES).toBe(15);
    expect(SENSOR_FUTURE_SKEW_LIMIT_MINUTES).toBe(5);
  });
});

describe("evaluateMetric", () => {
  it("temp_f valid 32–120 / warn outside 55–95", () => {
    expect(evaluateMetric("temp_f", 75).valid).toBe(true);
    expect(evaluateMetric("temp_f", 75).warn).toBe(false);
    expect(evaluateMetric("temp_f", 50).warn).toBe(true);
    expect(evaluateMetric("temp_f", 200).valid).toBe(false);
  });
  it("humidity_pct warns at 0 and 100", () => {
    expect(evaluateMetric("humidity_pct", 0).warn).toBe(true);
    expect(evaluateMetric("humidity_pct", 100).warn).toBe(true);
    expect(evaluateMetric("humidity_pct", 55).warn).toBe(false);
    expect(evaluateMetric("humidity_pct", 150).valid).toBe(false);
  });
  it("vpd_kpa warns at ≤0 or >3", () => {
    expect(evaluateMetric("vpd_kpa", 1.1).warn).toBe(false);
    expect(evaluateMetric("vpd_kpa", 0).warn).toBe(true);
    expect(evaluateMetric("vpd_kpa", 3.5).warn).toBe(true);
    expect(evaluateMetric("vpd_kpa", 9).valid).toBe(false);
  });
  it("soil_moisture_pct warns at 0 and 100", () => {
    expect(evaluateMetric("soil_moisture_pct", 0).warn).toBe(true);
    expect(evaluateMetric("soil_moisture_pct", 100).warn).toBe(true);
    expect(evaluateMetric("soil_moisture_pct", 35).warn).toBe(false);
  });
  it("co2_ppm warns below 350 or above 2000", () => {
    expect(evaluateMetric("co2_ppm", 800).warn).toBe(false);
    expect(evaluateMetric("co2_ppm", 300).warn).toBe(true);
    expect(evaluateMetric("co2_ppm", 2500).warn).toBe(true);
    expect(evaluateMetric("co2_ppm", 100).valid).toBe(false);
  });
  it("null/non-finite stay missing, not zero", () => {
    expect(evaluateMetric("humidity_pct", null).value).toBeNull();
    expect(evaluateMetric("humidity_pct", null).valid).toBe(false);
  });
});

describe("buildSensorSnapshot", () => {
  function row(
    metric: string,
    value: number,
    captured_at: string,
    source = "live",
    extra: Partial<{ id: string; quality: string }> = {},
  ) {
    return {
      id: extra.id ?? `r-${metric}`,
      tent_id: "t1",
      metric,
      value,
      source,
      quality: extra.quality ?? "ok",
      captured_at,
      ts: captured_at,
      created_at: captured_at,
      raw_payload: null,
    };
  }

  it("empty rows → empty snapshot, never zero metrics", () => {
    const snap = buildSensorSnapshot([], { tentId: "t1", now: NOW });
    expect(snap.status).toBe("empty");
    expect(snap.metrics.temp_f).toBeNull();
    expect(snap.metrics.humidity_pct).toBeNull();
    expect(snap.usable).toBe(false);
    expect(snap.tent_id).toBe("t1");
  });

  it("fresh live row → fresh_live, badge says Live + source: live", () => {
    const snap = buildSensorSnapshot(
      [
        row("temp_f", 75, ISO_FRESH, "live"),
        row("humidity_pct", 55, ISO_FRESH, "live"),
        row("vpd_kpa", 1.1, ISO_FRESH, "live"),
      ],
      { tentId: "t1", now: NOW },
    );
    expect(snap.status).toBe("fresh_live");
    expect(snap.freshness).toBe("fresh");
    expect(snap.badge_label).toMatch(/^Live • as of .+ • source: live$/);
    expect(snap.usable).toBe(true);
  });

  it("reading older than 15 minutes → stale (not Live)", () => {
    const snap = buildSensorSnapshot(
      [
        row("temp_f", 75, ISO_STALE, "live"),
        row("humidity_pct", 55, ISO_STALE, "live"),
      ],
      { tentId: "t1", now: NOW },
    );
    expect(snap.status).toBe("stale");
    expect(snap.badge_label).toMatch(/^Stale /);
    expect(snap.badge_label).not.toMatch(/\bLive\b/);
  });

  it("future-dated beyond +5 min → invalid", () => {
    const snap = buildSensorSnapshot(
      [
        row("temp_f", 75, ISO_FUTURE_BAD, "live"),
        row("humidity_pct", 55, ISO_FUTURE_BAD, "live"),
      ],
      { tentId: "t1", now: NOW },
    );
    expect(snap.status).toBe("invalid");
    expect(snap.usable).toBe(false);
  });

  it.each(["manual", "csv", "demo"])(
    "%s source never renders Live (fresh_non_live)",
    (src) => {
      const snap = buildSensorSnapshot(
        [
          row("temp_f", 75, ISO_FRESH, src),
          row("humidity_pct", 55, ISO_FRESH, src),
        ],
        { tentId: "t1", now: NOW },
      );
      expect(snap.status).toBe("fresh_non_live");
      expect(snap.badge_label).not.toMatch(/\bLive\b/);
    },
  );

  it("missing metrics stay missing, not zero", () => {
    const snap = buildSensorSnapshot(
      [row("temp_f", 75, ISO_FRESH, "live")],
      { tentId: "t1", now: NOW },
    );
    expect(snap.metrics.humidity_pct).toBeNull();
    expect(snap.metrics.vpd_kpa).toBeNull();
    expect(snap.metrics.soil_moisture_pct).toBeNull();
  });

  it("invalid required metric → snapshot invalid (not healthy)", () => {
    const snap = buildSensorSnapshot(
      [
        row("temp_f", 250, ISO_FRESH, "live"),
        row("humidity_pct", 55, ISO_FRESH, "live"),
      ],
      { tentId: "t1", now: NOW },
    );
    expect(snap.status).toBe("invalid");
    expect(snap.usable).toBe(false);
  });

  it("invalid optional metric flagged but snapshot remains non-Live healthy", () => {
    const snap = buildSensorSnapshot(
      [
        row("temp_f", 75, ISO_FRESH, "live"),
        row("humidity_pct", 55, ISO_FRESH, "live"),
        row("soil_moisture_pct", 250, ISO_FRESH, "live"),
      ],
      { tentId: "t1", now: NOW },
    );
    // Optional metric is invalid → row stays usable but warning is recorded
    // and the metric itself is marked invalid (not healthy).
    expect(snap.metricDetails.soil_moisture_pct.valid).toBe(false);
    expect(snap.warnings.some((w) => w.startsWith("soil_moisture_pct"))).toBe(
      true,
    );
  });

  it("soil_moisture 0 and 100 warn but stay valid", () => {
    const s0 = evaluateMetric("soil_moisture_pct", 0);
    const s100 = evaluateMetric("soil_moisture_pct", 100);
    expect(s0.valid).toBe(true);
    expect(s0.warn).toBe(true);
    expect(s100.valid).toBe(true);
    expect(s100.warn).toBe(true);
  });

  it("maps temperature_c → temp_f using C→F conversion", () => {
    const snap = buildSensorSnapshot(
      [
        { ...row("temperature_c", 25, ISO_FRESH, "live"), metric: "temperature_c" },
        row("humidity_pct", 55, ISO_FRESH, "live"),
      ],
      { tentId: "t1", now: NOW },
    );
    expect(Math.round((snap.metrics.temp_f ?? 0) * 10) / 10).toBe(77);
  });

  it("required metrics are temp_f and humidity_pct", () => {
    expect(REQUIRED_SNAPSHOT_METRICS).toEqual(["temp_f", "humidity_pct"]);
  });
});

describe("buildSensorSnapshotDetails (Quick Log save payload)", () => {
  const goodSnap = buildSensorSnapshot(
    [
      {
        id: "r1",
        tent_id: "t1",
        metric: "temp_f",
        value: 75,
        source: "live",
        quality: "ok",
        captured_at: ISO_FRESH,
        ts: ISO_FRESH,
        created_at: ISO_FRESH,
        raw_payload: null,
      },
      {
        id: "r2",
        tent_id: "t1",
        metric: "humidity_pct",
        value: 55,
        source: "live",
        quality: "ok",
        captured_at: ISO_FRESH,
        ts: ISO_FRESH,
        created_at: ISO_FRESH,
        raw_payload: null,
      },
    ],
    { tentId: "t1", now: NOW },
  );

  it("returns null when attach=false", () => {
    expect(buildSensorSnapshotDetails(goodSnap, false)).toBeNull();
  });
  it("returns null when snapshot is empty", () => {
    expect(
      buildSensorSnapshotDetails(EMPTY_SENSOR_SNAPSHOT, true),
    ).toBeNull();
  });
  it("returns null when snapshot is invalid", () => {
    const bad = buildSensorSnapshot(
      [
        {
          metric: "temp_f",
          value: 999,
          source: "live",
          captured_at: ISO_FRESH,
          ts: ISO_FRESH,
        } as any,
        {
          metric: "humidity_pct",
          value: 55,
          source: "live",
          captured_at: ISO_FRESH,
          ts: ISO_FRESH,
        } as any,
      ],
      { tentId: "t1", now: NOW },
    );
    expect(buildSensorSnapshotDetails(bad, true)).toBeNull();
  });
  it("includes safe sensor payload when attach=true and ready", () => {
    const payload = buildSensorSnapshotDetails(goodSnap, true);
    expect(payload).not.toBeNull();
    expect(payload!.tent_id).toBe("t1");
    expect(payload!.source).toBe("live");
    expect(payload!.metrics.temp_f).toBe(75);
    expect(payload!.metrics.humidity_pct).toBe(55);
    expect(payload!.status).toBe("fresh_live");
    // Never includes raw_payload.
    expect((payload as any).raw_payload).toBeUndefined();
  });
});

describe("safety — static scan", () => {
  const SOURCES = [
    "src/lib/latestSensorSnapshotRules.ts",
    "src/lib/sensor.ts",
    "src/components/SensorSnapshotPreview.tsx",
  ].map((p) => readFileSync(resolve(process.cwd(), p), "utf8"));

  it("no sensor_readings inserts/updates/deletes", () => {
    for (const s of SOURCES) {
      expect(s).not.toMatch(/sensor_readings[^A-Za-z_].*\.(insert|update|delete|upsert)\s*\(/s);
    }
  });
  it("no action_queue references", () => {
    for (const s of SOURCES) {
      expect(s).not.toMatch(/action_queue/);
    }
  });
  it("no functions.invoke / service_role", () => {
    for (const s of SOURCES) {
      expect(s).not.toMatch(/functions\.invoke/);
      expect(s).not.toMatch(/service_role/i);
    }
  });
  it("no device-control strings", () => {
    for (const s of SOURCES) {
      const lower = s.toLowerCase();
      for (const t of [
        "execute_device",
        "device_command",
        "turn_on",
        "turn_off",
        "relay_on",
        "relay_off",
      ]) {
        expect(lower).not.toContain(t);
      }
    }
  });
  it("no fake live or demo fallback strings", () => {
    for (const s of SOURCES) {
      expect(s).not.toMatch(/['"]demo['"]\s*[:=]\s*true/);
      expect(s).not.toMatch(/fakeLive|FAKE_LIVE|DEMO_SNAPSHOT/);
    }
  });
});
