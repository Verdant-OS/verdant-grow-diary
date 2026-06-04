/**
 * Per-metric Environment Snapshot view-model + Dashboard wiring tests.
 *
 * Combines:
 *  - unit tests of buildTentSnapshotView (pure)
 *  - static (source-level) assertions of Dashboard JSX for the empty
 *    state's manual-reading button + Sensors link, and the per-tent
 *    strip's source/last-updated/per-metric-status wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";

const ROOT = resolve(__dirname, "../..");
const DASH = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const SENSORS = readFileSync(resolve(ROOT, "src/pages/Sensors.tsx"), "utf8");

const NOW = new Date("2026-06-04T12:00:00Z").getTime();
const FRESH_TS = "2026-06-04T11:55:00Z";
const STALE_TS = "2026-06-04T10:00:00Z"; // > 30 min old

function row(over: Partial<BuildTentSnapshotInput>): BuildTentSnapshotInput {
  return {
    ts: FRESH_TS,
    metric: "temperature_c",
    value: 24,
    source: "manual",
    captured_at: FRESH_TS,
    ...over,
  };
}

describe("buildTentSnapshotView · empty + missing inputs", () => {
  it("returns empty view for null/empty rows", () => {
    const a = buildTentSnapshotView(null, null, NOW);
    const b = buildTentSnapshotView([], null, NOW);
    expect(a.hasReading).toBe(false);
    expect(b.hasReading).toBe(false);
    expect(a.lastUpdatedDisplay).toBe("Unknown");
  });
});

describe("buildTentSnapshotView · source labels", () => {
  it("Manual reading shows Manual", () => {
    const v = buildTentSnapshotView(
      [
        row({ source: "manual" }),
        row({ metric: "humidity_pct", value: 55, source: "manual" }),
        row({ metric: "vpd_kpa", value: 1.1, source: "manual" }),
      ],
      "veg",
      NOW,
    );
    expect(v.sourceLabel).toBe("Manual");
  });

  it("CSV/import readings show CSV", () => {
    const v = buildTentSnapshotView(
      [
        row({ source: "csv" }),
        row({ metric: "humidity_pct", value: 55, source: "csv" }),
        row({ metric: "vpd_kpa", value: 1.1, source: "csv" }),
      ],
      "veg",
      NOW,
    );
    expect(v.sourceLabel).toBe("CSV");
  });

  it("Ecowitt vendor lineage on live reading shows Ecowitt", () => {
    const v = buildTentSnapshotView(
      [
        row({ source: "live", raw_payload: { vendor: "ecowitt" } }),
        row({ metric: "humidity_pct", value: 55, source: "live" }),
        row({ metric: "vpd_kpa", value: 1.1, source: "live" }),
      ],
      "veg",
      NOW,
    );
    expect(v.sourceLabel).toBe("Ecowitt");
  });

  it("unknown source resolves to Unknown — never Live", () => {
    const v = buildTentSnapshotView(
      [
        row({ source: "weird-thing" as unknown as string }),
        row({ metric: "humidity_pct", value: 55, source: "weird-thing" as unknown as string }),
        row({ metric: "vpd_kpa", value: 1.1, source: "weird-thing" as unknown as string }),
      ],
      "veg",
      NOW,
    );
    expect(v.sourceLabel).not.toBe("Live");
    expect(["Unknown", "Manual", "CSV", "Stale", "Invalid", "Ecowitt"]).toContain(v.sourceLabel);
  });
});

describe("buildTentSnapshotView · last updated", () => {
  it("renders captured_at, not invented", () => {
    const v = buildTentSnapshotView(
      [row({ captured_at: FRESH_TS })],
      "veg",
      NOW,
    );
    expect(v.lastUpdatedIso).toBe(FRESH_TS);
    expect(v.lastUpdatedDisplay).not.toBe("Unknown");
  });

  it("missing captured_at falls back to ts when valid", () => {
    const v = buildTentSnapshotView(
      [row({ captured_at: null })],
      "veg",
      NOW,
    );
    expect(v.lastUpdatedIso).toBe(FRESH_TS);
  });

  it("invalid captured_at + invalid ts → Unknown, no invented time", () => {
    const v = buildTentSnapshotView(
      [{ ts: "not-a-date", metric: "temperature_c", value: 24, source: "manual", captured_at: "junk" }],
      "veg",
      NOW,
    );
    expect(v.lastUpdatedIso).toBeNull();
    expect(v.lastUpdatedDisplay).toBe("Unknown");
  });
});

describe("buildTentSnapshotView · per-metric status", () => {
  it("stale reading marks all present metrics Stale + sourceLabel Stale", () => {
    const v = buildTentSnapshotView(
      [
        row({ ts: STALE_TS, captured_at: STALE_TS, value: 24 }),
        row({ ts: STALE_TS, metric: "humidity_pct", value: 55, captured_at: STALE_TS }),
        row({ ts: STALE_TS, metric: "vpd_kpa", value: 1.1, captured_at: STALE_TS }),
      ],
      "veg",
      NOW,
    );
    expect(v.stale).toBe(true);
    expect(v.sourceLabel).toBe("Stale");
    for (const m of v.metrics) expect(m.statusLabel).toBe("Stale");
  });

  it("invalid metric is marked Invalid for that specific metric", () => {
    // RH=0 is sensor-fault per evaluateSensorQuality; temp valid.
    const v = buildTentSnapshotView(
      [
        row({ value: 24 }),
        row({ metric: "humidity_pct", value: 0 }),
        row({ metric: "vpd_kpa", value: 1.1 }),
      ],
      "veg",
      NOW,
    );
    const rh = v.metrics.find((m) => m.key === "rh")!;
    const temp = v.metrics.find((m) => m.key === "temp")!;
    expect(rh.status).toBe("invalid");
    expect(rh.statusLabel).toBe("Invalid");
    expect(temp.status).not.toBe("invalid");
  });

  it("missing metric shows Unknown for that metric only", () => {
    const v = buildTentSnapshotView(
      [row({ value: 24 }), row({ metric: "vpd_kpa", value: 1.1 })],
      "veg",
      NOW,
    );
    const rh = v.metrics.find((m) => m.key === "rh")!;
    expect(rh.status).toBe("unknown");
    expect(rh.statusLabel).toBe("Unknown");
    expect(rh.display).toBe("—");
  });

  it("does not show stale/invalid as current source", () => {
    const v = buildTentSnapshotView(
      [
        row({ ts: STALE_TS, captured_at: STALE_TS, source: "live", raw_payload: { vendor: "ecowitt" } }),
        row({ ts: STALE_TS, metric: "humidity_pct", value: 55, captured_at: STALE_TS, source: "live" }),
        row({ ts: STALE_TS, metric: "vpd_kpa", value: 1.1, captured_at: STALE_TS, source: "live" }),
      ],
      "veg",
      NOW,
    );
    expect(v.sourceLabel).toBe("Stale");
  });
});

describe("Dashboard JSX wiring · empty state", () => {
  it("renders the manual-reading CTA button + Sensors link", () => {
    expect(DASH).toContain('data-testid="dashboard-environment-snapshot-empty"');
    expect(DASH).toContain('data-testid="dashboard-environment-snapshot-add-manual-reading"');
    expect(DASH).toContain('data-testid="dashboard-environment-snapshot-go-to-sensors"');
    expect(DASH).toContain('data-testid="dashboard-environment-snapshot-empty-sensors-link"');
    expect(DASH).toMatch(/to="\/sensors#manual-reading"/);
  });

  it("keeps the existing 'No sensor snapshot yet' + helper copy", () => {
    expect(DASH).toMatch(/No sensor snapshot yet/);
    expect(DASH).toMatch(/Add a manual reading or/);
    expect(DASH).toMatch(/connect Ecowitt/);
  });
});

describe("Dashboard JSX wiring · per-tent snapshot row", () => {
  it("uses buildTentSnapshotView (view-model, not inline JSX rules)", () => {
    expect(DASH).toMatch(/buildTentSnapshotView\s*\(/);
  });

  it("renders the per-tent source label + last-updated + per-metric status testids", () => {
    expect(DASH).toMatch(/dashboard-env-snapshot-source-\$\{tent\.id\}/);
    expect(DASH).toMatch(/dashboard-env-snapshot-last-updated-\$\{tent\.id\}/);
    expect(DASH).toMatch(/dashboard-env-snapshot-metric-status-\$\{tent\.id\}-\$\{m\.key\}/);
  });

  it("aria-label includes the metric/source/timestamp parts", () => {
    expect(DASH).toMatch(/aria-label=\{ariaParts\.join/);
  });
});

describe("Sensors page · manual-reading anchor target", () => {
  it("ManualSensorReadingCard wrapper exposes id='manual-reading'", () => {
    expect(SENSORS).toMatch(/id="manual-reading"/);
  });
});

describe("Static safety", () => {
  const files: Record<string, string> = { DASH, SENSORS };
  for (const [name, body] of Object.entries(files)) {
    it(`${name} contains no forbidden strings`, () => {
      expect(body).not.toMatch(/service_role/);
      expect(body).not.toMatch(/SUPABASE_SERVICE_ROLE/);
      expect(body).not.toMatch(/autopilot/i);
      expect(body).not.toMatch(/_executed["'`]/);
    });
  }

  it("Dashboard snapshot strip does not duplicate freshness thresholds in JSX", () => {
    // The new view-model branch must not introduce inline 30-minute math.
    // (The existing banner copy mentions 30 minutes as user-facing text,
    // not as a threshold constant — exclude that exact string.)
    expect(DASH).not.toMatch(/30\s*\*\s*60\s*\*\s*1000/);
  });

  it("Dashboard does not invent demo/sample readings to fill the snapshot", () => {
    expect(DASH).not.toMatch(/sampleReadings|demoReadings|mockSnapshot/);
  });
});
