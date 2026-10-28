import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSoilMoistureCalibrations } from "@/hooks/useSoilMoistureCalibrations";

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_A = "22222222-2222-4222-8222-222222222222";
const TENT_B = "33333333-3333-4333-8333-333333333333";

const queryState = vi.hoisted(() => ({
  requests: 0,
  error: null as Record<string, unknown> | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      queryState.requests += 1;
      const query = {
        select: () => query,
        eq: () => query,
        order: () => Promise.resolve({ data: [], error: queryState.error }),
      };
      return query;
    },
  },
}));

function renderCalibrationHook(queryClient: QueryClient, tentId: string) {
  return renderHook(() => useSoilMoistureCalibrations({ growId: GROW_ID, tentId }), {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

function availability(result: unknown): string | undefined {
  return (result as { availability?: string }).availability;
}

describe("useSoilMoistureCalibrations schema session cache", () => {
  beforeEach(() => {
    queryState.requests = 0;
    queryState.error = null;
  });

  it("requests a missing calibration table once per query client", async () => {
    queryState.error = {
      code: "PGRST205",
      message: "Could not find the table 'public.soil_moisture_calibrations' in the schema cache",
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const first = renderCalibrationHook(queryClient, TENT_A);
    await waitFor(() => expect(availability(first.result.current)).toBe("schema_unavailable"));
    expect(first.result.current.isError).toBe(false);
    expect(first.result.current.data).toEqual([]);
    expect(queryState.requests).toBe(1);
    first.unmount();

    const second = renderCalibrationHook(queryClient, TENT_B);
    await waitFor(() => expect(availability(second.result.current)).toBe("schema_unavailable"));
    expect(second.result.current.isError).toBe(false);
    expect(second.result.current.data).toEqual([]);
    expect(queryState.requests).toBe(1);
  });

  it("still requests again when the error is not a missing calibration table", async () => {
    queryState.error = {
      code: "PGRST301",
      message: "soil_moisture_calibrations could not be read because the JWT expired",
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const first = renderCalibrationHook(queryClient, TENT_A);
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    expect(queryState.requests).toBe(1);
    first.unmount();

    const second = renderCalibrationHook(queryClient, TENT_B);
    await waitFor(() => expect(second.result.current.isError).toBe(true));
    expect(queryState.requests).toBe(2);
  });
});
