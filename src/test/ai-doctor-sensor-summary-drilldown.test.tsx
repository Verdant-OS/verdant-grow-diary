/**
 * AI Doctor — Sensor Summary Drilldown presenter tests.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AiDoctorSensorSummaryDrilldown } from "@/components/AiDoctorSensorSummaryDrilldown";
import type { AiDoctorContextPayload } from "@/lib/aiDoctorEnginePhase1Foundation";
import {
  AI_DOCTOR_METRIC_ORDER,
  AI_DOCTOR_SOURCE_ORDER,
  NO_TRUSTED_VALUE_LABEL,
} from "@/lib/aiDoctorPhase1ResultViewModel";

function ctx(
  overrides: Partial<AiDoctorContextPayload> = {},
): AiDoctorContextPayload {
  return {
    grow_id: "g1",
    tent_id: "t1",
    plant_id: "p1",
    plant_name: "P",
    strain: null,
    stage: null,
    medium: null,
    pot_size: null,
    recent_logs: [],
    recent_photos_count: 0,
    recent_watering_events: 0,
    recent_feeding_events: 0,
    sensor_summary: [],
    source_breakdown: [],
    missing_context: [],
    context_trust_level: "low",
    ...overrides,
  };
}

describe("AiDoctorSensorSummaryDrilldown", () => {
  it("renders all 9 metrics in canonical order", () => {
    render(<AiDoctorSensorSummaryDrilldown context={ctx()} />);
    for (const m of AI_DOCTOR_METRIC_ORDER) {
      expect(screen.getByTestId(`ai-doctor-metric-row-${m}`)).toBeTruthy();
    }
    const list = screen.getByTestId("ai-doctor-sensor-summary-metrics");
    expect(list.getAttribute("data-metric-order")).toBe(
      AI_DOCTOR_METRIC_ORDER.join(","),
    );
  });

  it("renders value/source/captured_at when present", () => {
    render(
      <AiDoctorSensorSummaryDrilldown
        context={ctx({
          sensor_summary: [
            {
              metric: "temperature_c",
              latest_value: 22,
              latest_source: "live",
              latest_captured_at: "2026-06-04T11:00:00Z",
              is_stale: false,
              is_invalid: false,
              is_degraded: false,
              sample_count_7d: 3,
            },
          ],
        })}
      />,
    );
    const row = screen.getByTestId("ai-doctor-metric-row-temperature_c");
    expect(within(row).getByText(/22/)).toBeTruthy();
    expect(within(row).getByText(/Live/)).toBeTruthy();
    expect(within(row).getByText(/2026-06-04T11:00:00Z/)).toBeTruthy();
    expect(row.getAttribute("data-freshness")).toBe("ok");
  });

  it("renders No trusted value when missing", () => {
    render(<AiDoctorSensorSummaryDrilldown context={ctx()} />);
    const row = screen.getByTestId("ai-doctor-metric-row-co2_ppm");
    expect(within(row).getAllByText(NO_TRUSTED_VALUE_LABEL).length).toBeGreaterThanOrEqual(1);
    expect(row.getAttribute("data-freshness")).toBe("missing");
  });

  it("labels stale, degraded, invalid", () => {
    render(
      <AiDoctorSensorSummaryDrilldown
        context={ctx({
          sensor_summary: [
            {
              metric: "humidity_pct",
              latest_value: 50,
              latest_source: "stale",
              latest_captured_at: "2026-06-01T11:00:00Z",
              is_stale: true,
              is_invalid: false,
              is_degraded: true,
              sample_count_7d: 1,
            },
            {
              metric: "vpd_kpa",
              latest_value: null,
              latest_source: "invalid",
              latest_captured_at: "2026-06-04T11:00:00Z",
              is_stale: false,
              is_invalid: true,
              is_degraded: true,
              sample_count_7d: 1,
            },
            {
              metric: "ppfd_umol",
              latest_value: 600,
              latest_source: "csv",
              latest_captured_at: "2026-06-04T11:00:00Z",
              is_stale: false,
              is_invalid: false,
              is_degraded: true,
              sample_count_7d: 1,
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-metric-row-humidity_pct").getAttribute("data-freshness"),
    ).toBe("stale");
    expect(
      screen.getByTestId("ai-doctor-metric-row-vpd_kpa").getAttribute("data-freshness"),
    ).toBe("invalid");
    expect(
      screen.getByTestId("ai-doctor-metric-row-ppfd_umol").getAttribute("data-freshness"),
    ).toBe("degraded");
  });

  it("renders source breakdown in canonical order", () => {
    render(
      <AiDoctorSensorSummaryDrilldown
        context={ctx({
          source_breakdown: [
            { source: "invalid", reading_count_7d: 2 },
            { source: "live", reading_count_7d: 5 },
          ],
        })}
      />,
    );
    const breakdown = screen.getByTestId("ai-doctor-source-breakdown");
    expect(breakdown.getAttribute("data-source-order")).toBe(
      AI_DOCTOR_SOURCE_ORDER.join(","),
    );
    for (const s of AI_DOCTOR_SOURCE_ORDER) {
      expect(screen.getByTestId(`ai-doctor-source-row-${s}`)).toBeTruthy();
    }
  });
});
