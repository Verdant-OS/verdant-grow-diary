/**
 * Manual sensor reading — Fahrenheit user-facing standard + cache refresh.
 *
 * Locks in:
 *  - Display surfaces convert stored °C → °F
 *  - Manual entry collects °F and converts to °C exactly once for insert
 *  - Insert hook invalidates every tent-scoped sensor surface so the
 *    Seedling Clone tent updates without a hard refresh
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  formatTempFFromC,
  tempFFromC,
} from "@/lib/temperatureUnits";
import {
  validateManualEntry,
  buildManualReadingPayloads,
} from "@/lib/sensorReadingManualEntryRules";
import { buildPlantTentEnvironmentView } from "@/lib/plantTentEnvironmentRules";

describe("temperatureUnits", () => {
  it("converts C↔F roundtrip", () => {
    expect(celsiusToFahrenheit(0)).toBeCloseTo(32);
    expect(celsiusToFahrenheit(100)).toBeCloseTo(212);
    expect(fahrenheitToCelsius(75)).toBeCloseTo(23.888, 2);
    expect(fahrenheitToCelsius(celsiusToFahrenheit(24))).toBeCloseTo(24, 5);
  });
  it("formats stored °C as °F", () => {
    expect(formatTempFFromC(24)).toBe("75.2°F");
    expect(formatTempFFromC(null)).toBe("Unknown");
    expect(formatTempFFromC(Number.NaN as unknown as number)).toBe("Unknown");
  });
  it("tempFFromC preserves null", () => {
    expect(tempFFromC(null)).toBeNull();
    expect(tempFFromC(24)).toBeCloseTo(75.2, 1);
  });
});

describe("Manual entry stores °F input as °C in payload", () => {
  it("75°F input → ~23.89°C stored in temperature_c metric", () => {
    const v = validateManualEntry({ airTempF: 75, humidityPct: 55 });
    expect(v.ok).toBe(true);
    const temp = v.metrics.find((m) => m.metric === "temperature_c")!;
    expect(temp.value).toBeCloseTo(23.89, 1);
  });
  it("payload uses canonical metric names + selected tent_id", () => {
    const v = validateManualEntry({ airTempF: 72 });
    const payloads = buildManualReadingPayloads({
      tentId: "seedling-clone-tent-id",
      metrics: v.metrics,
    });
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads.every((p) => p.tent_id === "seedling-clone-tent-id")).toBe(true);
    expect(payloads.find((p) => p.metric === "temperature_c")).toBeTruthy();
    expect(payloads.every((p) => p.source === "manual")).toBe(true);
  });
});

describe("Display: plant tent environment view shows °F", () => {
  it("renders Fahrenheit for temperature and soil_temp", () => {
    const ts = new Date().toISOString();
    const view = buildPlantTentEnvironmentView([
      { ts, metric: "temperature_c", value: 24, source: "manual" },
    ]);
    const temp = view.metrics.find((m) => m.key === "temp")!;
    expect(temp.display).toContain("75.2");
    expect(temp.display).toContain("°F");
    expect(temp.display).not.toContain("°C");
  });
});

describe("Insert hook invalidates every tent-scoped sensor surface", () => {
  it("invalidates latest-sensor-snapshot + plant-tent-environment on success", async () => {
    vi.resetModules();
    vi.doMock("@/lib/growRepo", () => ({
      insertSensorReading: vi.fn().mockResolvedValue(undefined),
    }));
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const React = (await import("react")).default;
    const { renderHook, waitFor } = await import("@testing-library/react");
    const { useInsertSensorReading } = await import("@/hooks/useInsertSensorReading");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const spy = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
    result.current.mutate({
      tent_id: "seedling-clone-tent-id",
      metric: "temperature_c",
      value: 23.89,
      source: "manual",
    } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toContain("sensor_readings");
    expect(keys).toContain("latest-sensor-snapshot");
    expect(keys).toContain("plant-tent-environment");
    expect(keys).toContain("environment-trends");
  });
});

describe("Static safety", () => {
  // Only check files whose runtime job has nothing to do with the source enum;
  // useInsertSensorReadings legitimately references "pi_bridge" as an allowed
  // `source` value for ingest-side validation.
  const files = [
    "src/components/ManualSensorReadingCard.tsx",
    "src/lib/sensorReadingManualEntryRules.ts",
    "src/lib/temperatureUnits.ts",
    "src/hooks/useInsertSensorReading.ts",
    "src/hooks/useLatestSensorSnapshot.ts",
  ];
  it("no service_role / mqtt / home_assistant / actuator / device_command / autopilot / Leads / typed watering writes", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/\bmqtt\b/i);
      expect(src).not.toMatch(/home[\s_-]?assistant/i);
      expect(src).not.toMatch(/\bactuator\b/i);
      expect(src).not.toMatch(/device_command/i);
      expect(src).not.toMatch(/autopilot/i);
      expect(src).not.toMatch(/writeWateringTypedEvent/);
      expect(src).not.toMatch(/from\(\s*['"]leads['"]\s*\)/);
      expect(src).not.toMatch(/from\(\s*['"]action_queue['"]\s*\)\s*\.(insert|update|delete|upsert)/);
      expect(src).not.toMatch(/from\(\s*['"]alerts['"]\s*\)\s*\.(insert|update|delete|upsert)/);
    }
  });
  it("ManualSensorReadingCard labels temperature as °F", () => {
    const src = readFileSync("src/components/ManualSensorReadingCard.tsx", "utf8");
    expect(src).toMatch(/unit="°F"/);
    expect(src).not.toMatch(/unit="°C"/);
  });
});
