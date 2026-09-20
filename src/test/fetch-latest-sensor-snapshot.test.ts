import { beforeEach, describe, it, expect, vi } from "vitest";
import { fetchLatestSensorSnapshot } from "@/lib/quick-log/fetchLatestSensorSnapshot";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";

function mockSensorRows(data: Array<Record<string, unknown>>, error: unknown = null) {
  const effectiveRows = data.map((row, index) => ({
    ...row,
    id: `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, "0")}`,
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    tent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ts: row.ts ?? row.captured_at,
    created_at: row.created_at ?? row.captured_at,
    device_id: null,
    correction_valid: row.correction_valid ?? true,
  }));
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "gte", "lte", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.limit = vi.fn(() => Promise.resolve({ data: effectiveRows, error }));
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  return builder;
}

function physicalGatewayPayload() {
  return {
    vendor: "ecowitt_windows_testbench",
    metadata: {
      reported_verdant_source: "live",
      raw_payload: {
        stationtype: "GW2000A_V3.2.4",
        model: "GW2000A",
        dateutc: "2026-06-09 12:00:00",
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSensorRows([]);
});

describe("fetchLatestSensorSnapshot", () => {
  it("uses a corrected manual value instead of the flat RPC value and preserves observation time", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { captured_at: "2026-06-09T12:00:00Z", temperature: 99 },
      error: null,
    } as never);
    const builder = mockSensorRows([
      {
        metric: "temperature_c",
        value: 24,
        quality: "ok",
        source: "manual",
        captured_at: "2026-06-09T11:59:00Z",
        raw_payload: null,
      },
    ]);
    await expect(fetchLatestSensorSnapshot("tent-1")).resolves.toEqual({
      source: "manual",
      captured_at: "2026-06-09T11:59:00Z",
      metrics: { temperature: 24 },
    });
    expect(supabase.from).toHaveBeenCalledWith("sensor_readings_effective");
    expect(builder.eq).toHaveBeenCalledWith("tent_id", "tent-1");
    expect(builder.gte).toHaveBeenCalledWith("captured_at", "2026-06-09T08:00:00.000Z");
    expect(builder.lte).toHaveBeenCalledWith("captured_at", "2026-06-09T12:00:00Z");
    expect(builder.limit).toHaveBeenCalledWith(200);
  });
  it("does not fall back to the flat RPC when correction evidence is invalid", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { captured_at: "2026-06-09T12:00:00Z", temperature: 99 },
      error: null,
    } as never);
    mockSensorRows([
      {
        metric: "temperature_c",
        value: 24,
        quality: "ok",
        source: "manual",
        captured_at: "2026-06-09T12:00:00Z",
        raw_payload: null,
        correction_valid: false,
      },
    ]);
    await expect(fetchLatestSensorSnapshot("tent-1")).resolves.toBeNull();
  });
  it("does not attach the flat RPC value when the effective view read fails", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { captured_at: "2026-06-09T12:00:00Z", temperature: 99 },
      error: null,
    } as never);
    mockSensorRows([], new Error("private failure"));
    await expect(fetchLatestSensorSnapshot("tent-1")).resolves.toBeNull();
  });
  it("returns null when RPC returns null data", async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });
    const result = await fetchLatestSensorSnapshot("tent-1");
    expect(result).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith("get_latest_tent_sensor_snapshot", {
      _tent_id: "tent-1",
    });
  });

  it("returns null when all metrics are null", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: {
        captured_at: null,
        source: null,
        temperature: null,
        humidity: null,
        vpd: null,
        soil_temp: null,
        soil_ec: null,
        ppfd: null,
      },
      error: null,
    });
    const result = await fetchLatestSensorSnapshot("tent-1");
    expect(result).toBeNull();
  });

  it("transforms flat JSONB into canonical snapshot shape", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: {
        captured_at: "2026-06-09T12:00:00Z",
        source: "pi_bridge",
        temperature: 24.3,
        humidity: 55.0,
        vpd: 1.2,
        soil_temp: null,
        soil_ec: 1.5,
        ppfd: 800,
      },
      error: null,
    });
    mockSensorRows([
      {
        id: "temp",
        metric: "temperature_c",
        value: 24.3,
        quality: "ok",
        source: "pi_bridge",
        captured_at: "2026-06-09T12:00:00Z",
        created_at: "2026-06-09T12:00:01Z",
        raw_payload: {},
      },
      {
        id: "humidity",
        metric: "humidity_pct",
        value: 55,
        quality: "ok",
        source: "pi_bridge",
        captured_at: "2026-06-09T12:00:00Z",
        created_at: "2026-06-09T12:00:01Z",
        raw_payload: {},
      },
      {
        id: "vpd",
        metric: "vpd_kpa",
        value: 1.2,
        quality: "ok",
        source: "pi_bridge",
        captured_at: "2026-06-09T12:00:00Z",
        created_at: "2026-06-09T12:00:01Z",
        raw_payload: {},
      },
      {
        id: "ec",
        metric: "ec",
        value: 1.5,
        quality: "ok",
        source: "pi_bridge",
        captured_at: "2026-06-09T12:00:00Z",
        created_at: "2026-06-09T12:00:01Z",
        raw_payload: {},
      },
      {
        id: "ppfd",
        metric: "ppfd",
        value: 800,
        quality: "ok",
        source: "pi_bridge",
        captured_at: "2026-06-09T12:00:00Z",
        created_at: "2026-06-09T12:00:01Z",
        raw_payload: {},
      },
    ]);
    const result = await fetchLatestSensorSnapshot("tent-1");
    expect(result).toEqual({
      source: "pi_bridge",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: {
        temperature: 24.3,
        humidity: 55.0,
        vpd: 1.2,
        soil_ec: 1.5,
        ppfd: 800,
      },
    });
  });

  it("returns no snapshot for diagnostic-only Windows testbench rows", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: { captured_at: "2026-06-09T12:00:00Z", source: "live" },
      error: null,
    });
    mockSensorRows([
      {
        id: "diagnostic-temp",
        metric: "temperature_c",
        value: 99,
        quality: "ok",
        source: "live",
        captured_at: "2026-06-09T12:00:00Z",
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "test" },
        },
      },
    ]);

    await expect(fetchLatestSensorSnapshot("tent-1")).resolves.toBeNull();
  });

  it("does not combine newer diagnostics into an older physical live cohort", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: { captured_at: "2026-06-09T12:00:00Z", source: "live" },
      error: null,
    });
    mockSensorRows([
      {
        id: "diagnostic-temp",
        metric: "temperature_c",
        value: 99,
        quality: "ok",
        source: "live",
        captured_at: "2026-06-09T12:00:00Z",
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "test" },
        },
      },
      {
        id: "physical-temp",
        metric: "temperature_c",
        value: 24.3,
        quality: "ok",
        source: "live",
        captured_at: "2026-06-09T11:59:00Z",
        raw_payload: physicalGatewayPayload(),
      },
      {
        id: "physical-humidity",
        metric: "humidity_pct",
        value: 55,
        quality: "ok",
        source: "live",
        captured_at: "2026-06-09T11:59:00Z",
        raw_payload: physicalGatewayPayload(),
      },
    ]);

    await expect(fetchLatestSensorSnapshot("tent-1")).resolves.toEqual({
      source: "live",
      captured_at: "2026-06-09T11:59:00Z",
      metrics: { temperature: 24.3, humidity: 55 },
    });
  });

  it("keeps physical gateway rows carried by the legacy listener vendor", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: { captured_at: "2026-06-09T12:00:00Z", source: "live" },
      error: null,
    });
    mockSensorRows([
      {
        id: "physical-temp",
        metric: "temperature_c",
        value: 24.3,
        quality: "ok",
        source: "live",
        captured_at: "2026-06-09T12:00:00Z",
        raw_payload: physicalGatewayPayload(),
      },
    ]);

    const result = await fetchLatestSensorSnapshot("tent-1");
    expect(result).toEqual({
      source: "live",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: { temperature: 24.3 },
    });
    expect(JSON.stringify(result)).not.toContain("raw_payload");
  });

  it("returns null on RPC error", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: "db down" },
    });
    const result = await fetchLatestSensorSnapshot("tent-1");
    expect(result).toBeNull();
  });
});
