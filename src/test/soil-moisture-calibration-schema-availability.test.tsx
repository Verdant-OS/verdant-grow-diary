import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSoilMoistureCalibrations } from "@/hooks/useSoilMoistureCalibrations";

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";

const queryState = vi.hoisted(() => ({
  data: [] as unknown[],
  error: null as Record<string, unknown> | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => Promise.resolve({ data: queryState.data, error: queryState.error }),
      };
      return query;
    },
  },
}));

function renderCalibrationHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useSoilMoistureCalibrations({ growId: GROW_ID, tentId: TENT_ID }), {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

function availability(result: unknown): string | undefined {
  return (result as { availability?: string }).availability;
}

describe("useSoilMoistureCalibrations schema availability", () => {
  beforeEach(() => {
    queryState.data = [];
    queryState.error = null;
  });

  it("returns a typed schema-unavailable state for PGRST205 naming the calibration table", async () => {
    queryState.error = {
      code: "PGRST205",
      message: "Could not find the table 'public.soil_moisture_calibrations' in the schema cache",
    };

    const { result } = renderCalibrationHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(availability(result.current)).toBe("schema_unavailable");
  });

  it("returns schema-unavailable for 42P01 only when the calibration table is named", async () => {
    queryState.error = {
      code: "42P01",
      message: "relation does not exist",
      details: 'relation "public.soil_moisture_calibrations" does not exist',
    };

    const { result } = renderCalibrationHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(availability(result.current)).toBe("schema_unavailable");
  });

  it.each([
    {
      code: "PGRST205",
      message: "Could not find the table 'public.sensor_readings' in the schema cache",
    },
    { code: "42P01", message: 'relation "public.sensor_readings" does not exist' },
    {
      code: "PGRST301",
      message: "soil_moisture_calibrations could not be read because the JWT expired",
    },
  ])("preserves non-matching errors ($code)", async (error) => {
    queryState.error = error;

    const { result } = renderCalibrationHook();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(availability(result.current)).toBe("error");
  });

  it("keeps successful rows available and maps their public shape", async () => {
    queryState.data = [
      {
        id: "cal-1",
        grow_id: GROW_ID,
        tent_id: TENT_ID,
        plant_id: null,
        device_id: "probe-1",
        dry_raw: 20,
        wet_raw: 80,
        source: "manual",
        is_active: true,
        created_at: "2026-08-15T00:00:00.000Z",
        updated_at: "2026-08-15T00:00:00.000Z",
      },
    ];

    const { result } = renderCalibrationHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(availability(result.current)).toBe("available");
    expect(result.current.data).toEqual([
      expect.objectContaining({ id: "cal-1", growId: GROW_ID, tentId: TENT_ID }),
    ]);
  });
});
