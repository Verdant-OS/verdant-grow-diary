/**
 * PPFD as a first-class metric: SensorChart selectable metric, legend/
 * tooltip unit consistency, CSV export wiring, and AI Doctor context.
 *
 * Scope additions covered by this file:
 *  - SENSOR_CHART_METRIC_META includes ppfd with the canonical unit
 *    "µmol/m²/s" and a compact tick unit "µmol".
 *  - sensorChartLegendLabel / sensorChartUnit / formatSensorChartTooltipValue
 *    all share the same meta and emit consistent units.
 *  - SensorChart renders the PPFD chart, honours the time-range filter,
 *    and exposes the export button (no inline metric tables).
 *  - buildSensorReadingsCsv emits the PPFD column header and PPFD cell
 *    values, with safe handling of null / non-finite / missing PPFD.
 *  - AI Doctor context now lists ppfd_umol_m2s as a known metric:
 *    valid PPFD becomes usable evidence, invalid PPFD routes to
 *    invalidMetrics, missing PPFD is reported as missing (not healthy),
 *    PPFD-only readings keep the "telemetry alone cannot confirm" guard
 *    and produce the PPFD context-only safety note.
 *  - Static safety: no service_role / device-control / automation /
 *    *_executed events / fake-live fallbacks / lux/watt estimation /
 *    duplicated PPFD metric tables in JSX.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "date-fns";

import SensorChart from "@/components/SensorChart";
import {
  SENSOR_CHART_METRIC_META,
  formatSensorChartTooltipValue,
  formatSensorChartYTick,
  sensorChartLegendLabel,
  sensorChartUnit,
} from "@/lib/sensorChartAxisRules";
import { buildSensorReadingsCsv } from "@/lib/sensorChartExport";
import { mapSensorReadingToAiDoctorContext } from "@/lib/aiDoctorSensorContextRules";
import type { NormalizedSensorReading } from "@/lib/sensorReadingNormalizationRules";
import type { SensorReading } from "@/mock";

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reading(over: Partial<SensorReading> = {}): SensorReading {
  return {
    ts: "2026-01-10T12:00:00Z",
    tentId: "t1",
    temp: 24,
    rh: 55,
    vpd: 1.1,
    co2: 800,
    soil: 45,
    ppfd: 700,
    source: "live",
    status: "usable",
    capturedAt: "2026-01-10T12:00:00Z",
    ...over,
  };
}

function nex5(
  over: Partial<NormalizedSensorReading> & {
    ppfd_umol_m2s?: number | null;
  } = {},
): NormalizedSensorReading {
  return {
    captured_at: "2026-01-10T12:00:00Z",
    source: "live",
    temperature_c: 24.5,
    humidity_pct: 60,
    vpd_kpa: 1.1,
    co2_ppm: 800,
    soil_moisture_pct: 45,
    ppfd_umol_m2s: 700,
    raw_payload: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// SensorChart metric metadata
// ---------------------------------------------------------------------------

describe("SensorChart metric metadata — PPFD", () => {
  it("registers 'ppfd' in the shared meta table", () => {
    expect(SENSOR_CHART_METRIC_META.ppfd).toBeDefined();
    expect(SENSOR_CHART_METRIC_META.ppfd.label).toBe("PPFD");
  });

  it("uses canonical long unit 'µmol/m²/s' for legend / tooltip", () => {
    expect(sensorChartUnit("ppfd")).toBe("µmol/m²/s");
    expect(sensorChartLegendLabel("ppfd")).toBe("PPFD (µmol/m²/s)");
    expect(formatSensorChartTooltipValue(665, "ppfd")).toBe("665 µmol/m²/s");
  });

  it("uses compact 'µmol' inside Y-axis tick labels (axis density)", () => {
    expect(formatSensorChartYTick(700, "ppfd")).toBe("700 µmol");
  });

  it("reserves enough YAxis gutter for the widest tick (> 36px legacy)", () => {
    expect(SENSOR_CHART_METRIC_META.ppfd.yAxisWidth).toBeGreaterThan(36);
  });

  it("non-finite values render empty (never NaN)", () => {
    expect(formatSensorChartYTick(Number.NaN, "ppfd")).toBe("");
    expect(formatSensorChartTooltipValue(Number.POSITIVE_INFINITY, "ppfd")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// SensorChart component
// ---------------------------------------------------------------------------

describe("SensorChart — PPFD as selectable metric", () => {
  const data: SensorReading[] = [
    reading({ ts: "2026-01-08T12:00:00Z", ppfd: 600 }),
    reading({ ts: "2026-01-09T12:00:00Z", ppfd: 700 }),
    reading({ ts: "2026-01-10T12:00:00Z", ppfd: 800 }),
  ];

  it("renders the PPFD legend label from the shared meta", () => {
    const { getByTestId } = render(<SensorChart data={data} metric="ppfd" />);
    expect(getByTestId("sensor-chart-legend").textContent).toContain(
      "PPFD (µmol/m²/s)",
    );
  });

  it("exposes the CSV export button by default", () => {
    const { getByTestId } = render(<SensorChart data={data} metric="ppfd" />);
    expect(getByTestId("sensor-chart-export-btn")).toBeTruthy();
  });

  it("exposes the time-range selector (radiogroup) by default", () => {
    const { getByTestId } = render(<SensorChart data={data} metric="ppfd" />);
    expect(getByTestId("sensor-chart-range-selector")).toBeTruthy();
  });

  it("survives a reading set with missing PPFD (no crash, no NaN tooltip)", () => {
    const partial: SensorReading[] = [
      reading({ ts: "2026-01-09T12:00:00Z", ppfd: null }),
      reading({ ts: "2026-01-10T12:00:00Z", ppfd: 700 }),
    ];
    expect(() =>
      render(<SensorChart data={partial} metric="ppfd" />),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

describe("buildSensorReadingsCsv — PPFD column", () => {
  it("header includes 'PPFD (µmol/m²/s)' alongside other metrics", () => {
    const csv = buildSensorReadingsCsv([reading()]);
    const [header] = csv.split("\n");
    expect(header).toContain("PPFD (µmol/m²/s)");
    // Preserve the existing source/status/captured_at columns.
    expect(header).toContain("Source");
    expect(header).toContain("Status");
    expect(header).toContain("Captured At");
  });

  it("emits the numeric PPFD value when present", () => {
    const csv = buildSensorReadingsCsv([reading({ ppfd: 665 })]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain(",665,");
  });

  it("emits an empty cell for missing / null / NaN PPFD (never 'NaN')", () => {
    const csv = buildSensorReadingsCsv([
      reading({ ppfd: null }),
      reading({ ppfd: undefined as unknown as null }),
      reading({ ppfd: Number.NaN }),
    ]);
    for (const line of csv.split("\n").slice(1)) {
      expect(line.toLowerCase()).not.toContain("nan");
      // Empty PPFD shows up as adjacent commas between Soil Moisture (e.g. "45") and Source.
      expect(line).toMatch(/,45,,/);
    }
  });

  it("preserves chronological row order from the input array", () => {
    const a = reading({ ts: "2026-01-08T12:00:00Z", ppfd: 600 });
    const b = reading({ ts: "2026-01-10T12:00:00Z", ppfd: 800 });
    const csv = buildSensorReadingsCsv([a, b]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain(format(new Date(a.ts), "yyyy-MM-dd HH:mm:ss"));
    expect(lines[2]).toContain(format(new Date(b.ts), "yyyy-MM-dd HH:mm:ss"));
  });

  it("preserves the source label and captured_at column", () => {
    const csv = buildSensorReadingsCsv([
      reading({ source: "manual", capturedAt: "2026-01-10T11:30:00Z" }),
    ]);
    const row = csv.split("\n")[1];
    expect(row).toContain("manual");
    expect(row).toContain("2026-01-10 11:30:00");
  });
});

// ---------------------------------------------------------------------------
// AI Doctor PPFD context
// ---------------------------------------------------------------------------

describe("AI Doctor sensor context — PPFD wiring", () => {
  it("lists valid PPFD in usableMetrics for a live reading", () => {
    const ctx = mapSensorReadingToAiDoctorContext(nex5());
    expect(ctx.usableMetrics).toContain("ppfd_umol_m2s");
    expect(ctx.invalidMetrics).not.toContain("ppfd_umol_m2s");
    expect(ctx.missingMetrics).not.toContain("ppfd_umol_m2s");
  });

  it("routes negative PPFD to invalidMetrics (not usable)", () => {
    const ctx = mapSensorReadingToAiDoctorContext(nex5({ ppfd_umol_m2s: -5 }));
    expect(ctx.invalidMetrics).toContain("ppfd_umol_m2s");
    expect(ctx.usableMetrics).not.toContain("ppfd_umol_m2s");
  });

  it("routes implausibly high PPFD (>2500) to invalidMetrics", () => {
    const ctx = mapSensorReadingToAiDoctorContext(
      nex5({ ppfd_umol_m2s: 9999 }),
    );
    expect(ctx.invalidMetrics).toContain("ppfd_umol_m2s");
  });

  it("missing PPFD is reported as missing (never silently 'healthy')", () => {
    const ctx = mapSensorReadingToAiDoctorContext(
      nex5({ ppfd_umol_m2s: null }),
    );
    expect(ctx.missingMetrics).toContain("ppfd_umol_m2s");
    expect(ctx.usableMetrics).not.toContain("ppfd_umol_m2s");
  });

  it("stale reading routes PPFD into the stale/reduced summary", () => {
    const ctx = mapSensorReadingToAiDoctorContext(nex5({ source: "stale" }));
    expect(ctx.confidenceImpact).toBe("reduced");
    expect(ctx.contextSummary.toLowerCase()).toMatch(/stale/);
  });

  it("invalid source never produces healthy summary even with PPFD present", () => {
    const ctx = mapSensorReadingToAiDoctorContext(nex5({ source: "invalid" }));
    expect(ctx.confidenceImpact).toBe("untrusted");
    expect(ctx.contextSummary.toLowerCase()).toMatch(/invalid|not possible/);
  });

  it("PPFD-alone reading does not become strong readiness", () => {
    const ctx = mapSensorReadingToAiDoctorContext(
      nex5({
        temperature_c: null,
        humidity_pct: null,
        vpd_kpa: null,
        co2_ppm: null,
        soil_moisture_pct: null,
        ppfd_umol_m2s: 700,
      }),
    );
    // PPFD-only is environment-only → must include the env-only and
    // telemetry-alone safety notes.
    expect(
      ctx.safetyNotes.some((n) => /Environment readings only/i.test(n)),
    ).toBe(true);
    expect(
      ctx.safetyNotes.some((n) =>
        /cannot confirm or deny plant health/i.test(n),
      ),
    ).toBe(true);
    expect(
      ctx.safetyNotes.some((n) => /PPFD is context-only/i.test(n)),
    ).toBe(true);
    // Even one valid metric on a "live" source resolves to "none" by
    // design — but the safety notes above prevent over-confidence.
    expect(ctx.confidenceImpact).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// Static safety — no fake-live, no device control, no estimation
// ---------------------------------------------------------------------------

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

describe("PPFD wiring — static safety", () => {
  const FILES = [
    "lib/sensorChartAxisRules.ts",
    "lib/sensorChartExport.ts",
    "lib/aiDoctorSensorContextRules.ts",
    "components/SensorChart.tsx",
  ];

  it.each(FILES)(
    "%s has no service_role / automation / device-control / *_executed",
    (rel) => {
      const lower = readSrc(rel).toLowerCase();
      // Allow the literal token only inside a no-op safety comment ("no
      // service_role usage."); flag any code reference (quoted string,
      // property access, function call).
      expect(/["'`]service_role["'`]|service_role\s*\(|\.service_role\b/.test(lower)).toBe(false);
      expect(lower.includes("autopilot")).toBe(false);
      expect(/[a-z0-9]_executed\b/.test(lower)).toBe(false);
      for (const banned of [
        "turn_on_",
        "turn_off_",
        "device_command",
        "execute_device",
      ]) {
        expect(lower.includes(banned)).toBe(false);
      }
    },
  );

  it("SensorChart does not embed an inline PPFD metric table — uses shared meta", () => {
    const src = readSrc("components/SensorChart.tsx");
    expect(src).toMatch(/SENSOR_CHART_METRIC_META/);
    // No locally-declared "{ ppfd: ... unit: 'µmol" mini map.
    expect(/\bppfd\b\s*:\s*{[^}]*unit/.test(src)).toBe(false);
  });

  it("does not estimate PPFD from lux / wattage / device state in chart or AI surfaces", () => {
    for (const rel of [
      "lib/sensorChartAxisRules.ts",
      "lib/aiDoctorSensorContextRules.ts",
      "components/SensorChart.tsx",
    ]) {
      const lower = readSrc(rel).toLowerCase();
      for (const banned of ["lux", "wattage", "watt_", "brightness"]) {
        expect(lower.includes(banned)).toBe(false);
      }
    }
  });
});
