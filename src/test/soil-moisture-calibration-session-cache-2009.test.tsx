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

describe("useSoilMoistureCalibrations session schema_unavailable caching (#2009)", () => {
  beforeEach(() => {
    queryState.requests = 0;
    queryState.error = {
      code: "PGRST205",
      message: "Could not find the table 'public.soil_moisture_calibrations' in the schema cache",
    };
  });

  it("coalesces concurrent mounts across tents so a missing table only 404s once", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const first = renderCalibrationHook(queryClient, TENT_A);
    const second = renderCalibrationHook(queryClient, TENT_B);

    await waitFor(() => expect(first.result.current.availability).toBe("schema_unavailable"));
    await waitFor(() => expect(second.result.current.availability).toBe("schema_unavailable"));

    expect(first.result.current.isError).toBe(false);
    expect(second.result.current.isError).toBe(false);
    expect(queryState.requests).toBe(1);
  });

  it("retains schema_unavailable for the session even after queryClient.clear()", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const first = renderCalibrationHook(queryClient, TENT_A);
    await waitFor(() => expect(first.result.current.availability).toBe("schema_unavailable"));
    expect(queryState.requests).toBe(1);
    first.unmount();

    queryClient.clear();

    const afterClear = renderCalibrationHook(queryClient, TENT_B);
    await waitFor(() => expect(afterClear.result.current.availability).toBe("schema_unavailable"));
    expect(afterClear.result.current.isError).toBe(false);
    expect(afterClear.result.current.data).toEqual([]);
    expect(queryState.requests).toBe(1);
  });

  it("resolves synchronously to schema_unavailable without a loading flash on subsequent mounts", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const first = renderCalibrationHook(queryClient, TENT_A);
    await waitFor(() => expect(first.result.current.availability).toBe("schema_unavailable"));
    expect(queryState.requests).toBe(1);
    first.unmount();

    const second = renderCalibrationHook(queryClient, TENT_B);
    expect(second.result.current.availability).toBe("schema_unavailable");
    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.data).toEqual([]);
    expect(queryState.requests).toBe(1);
  });

  it("still re-requests when a previous error was not a missing-table schema error", async () => {
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
