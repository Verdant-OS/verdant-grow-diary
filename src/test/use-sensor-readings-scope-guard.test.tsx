import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromSpy } = vi.hoisted(() => ({ fromSpy: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.order = () => builder;
  builder.eq = () => builder;
  builder.limit = () => Promise.resolve({ data: [], error: null });
  fromSpy.mockImplementation(() => builder);
  return { supabase: { from: fromSpy } };
});

import { useSensorReadings } from "@/hooks/use-sensor-readings";

function createWrapper(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => fromSpy.mockClear());

describe("useSensorReadings scope guard", () => {
  it("does not query Supabase for a legacy mock tent id", async () => {
    renderHook(() => useSensorReadings("t1", 60), { wrapper: createWrapper() });
    await Promise.resolve();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("does not query Supabase for an explicit null tent scope", async () => {
    renderHook(() => useSensorReadings(null, 60), { wrapper: createWrapper() });
    await Promise.resolve();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("does not reuse aggregate cached rows for an explicit null scope", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["sensor_readings", "all", 60], [{ id: "aggregate-row" }]);

    const { result } = renderHook(() => useSensorReadings(null, 60), {
      wrapper: createWrapper(client),
    });

    expect(result.current.data).toBeUndefined();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("preserves the intentional aggregate query when scope is undefined", async () => {
    renderHook(() => useSensorReadings(undefined, 60), { wrapper: createWrapper() });
    await waitFor(() => expect(fromSpy).toHaveBeenCalledTimes(1));
  });
});
