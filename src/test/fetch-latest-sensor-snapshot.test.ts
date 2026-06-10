import { describe, it, expect, vi } from "vitest";
import { fetchLatestSensorSnapshot } from "@/lib/quick-log/fetchLatestSensorSnapshot";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";

describe("fetchLatestSensorSnapshot", () => {
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

  it("returns null on RPC error", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: "db down" },
    });
    const result = await fetchLatestSensorSnapshot("tent-1");
    expect(result).toBeNull();
  });
});
