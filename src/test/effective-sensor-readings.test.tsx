import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({ from: vi.fn(), data: [] as unknown, error: null as unknown }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    in: () => builder,
    limit: () => builder,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: state.data, error: state.error }).then(resolve),
  };
  state.from.mockImplementation(() => builder);
  return { supabase: { from: state.from } };
});
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));
import { useSensorReadings, useSensorReadingsByTents } from "@/hooks/use-sensor-readings";
import { requireEffectiveSensorReadings } from "@/lib/effectiveSensorReadings";
import { buildPrivateSensorQueryKey } from "@/lib/growDataQueryKeyRules";
import { fetchSensorReadings } from "@/lib/growRepo";
import { useGrowSensorReadings } from "@/hooks/useGrowData";
import { usePlantTentLatestReadings } from "@/hooks/usePlantTentLatestReadings";
const tentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const observed = "2026-09-15T08:00:00.123456+00:00";
function row() {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    tent_id: tentId,
    value: 24,
    metric: "temperature_c",
    source: "manual",
    quality: "ok",
    captured_at: observed,
    ts: observed,
    created_at: observed,
    device_id: null,
    raw_payload: null,
    correction_valid: true,
    corrected_at: "2026-09-17T12:00:00Z",
  };
}
function wrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
beforeEach(() => {
  state.from.mockClear();
  state.data = [row()];
  state.error = null;
});
describe("effective sensor read boundary", () => {
  it("loads corrected Plant Detail readings with their historical observation time", async () => {
    const { result } = renderHook(() => usePlantTentLatestReadings(tentId), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.from.mock.calls).toEqual([["sensor_readings_effective"]]);
    expect(result.current.data?.[0]).toMatchObject({
      value: 24,
      captured_at: observed,
      source: "manual",
    });
  });
  it("does not reuse Plant Detail's old unversioned raw cache", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(["plant-tent-environment", tentId], [{ ...row(), value: 25 }]);
    const { result } = renderHook(() => usePlantTentLatestReadings(tentId), {
      wrapper: wrapper(client),
    });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.[0]?.value).toBe(24));
    client.clear();
  });
  it("reports invalid Plant Detail correction evidence as an error without raw fallback", async () => {
    state.data = [{ ...row(), correction_valid: false, value: null }];
    const { result } = renderHook(() => usePlantTentLatestReadings(tentId), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(state.from.mock.calls).toEqual([["sensor_readings_effective"]]);
  });
  it("does not reuse the main Sensors page's older raw-derived cache", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(["grow", "sensors", tentId, "owner", row().user_id], [{ temp: 25 }]);
    const { result } = renderHook(() => useGrowSensorReadings(tentId), {
      wrapper: wrapper(client),
    });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.[0]?.temp).toBe(24));
    expect(state.from.mock.calls).toEqual([["sensor_readings_effective"]]);
    client.clear();
  });
  it("maps the main Sensors repository read from corrected values without promoting its age", async () => {
    const readings = await fetchSensorReadings(tentId);
    expect(state.from.mock.calls).toEqual([["sensor_readings_effective"]]);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      temp: 24,
      capturedAt: observed,
      ts: observed,
      source: "manual",
      observedMetrics: ["temp"],
    });
  });
  it("refuses to map invalid correction evidence into zero-valued chart fields", async () => {
    state.data = [{ ...row(), correction_valid: false, value: null }];
    await expect(fetchSensorReadings(tentId)).rejects.toThrow(/unavailable/i);
    expect(state.from.mock.calls).toEqual([["sensor_readings_effective"]]);
  });
  it("preserves source and original observation time on the corrected value", () => {
    expect(requireEffectiveSensorReadings([row()])).toEqual([row()]);
  });
  it.each([
    null,
    undefined,
    {},
    [null],
    [{ ...row(), correction_valid: false }],
    [{ ...row(), correction_valid: undefined }],
    [{ ...row(), value: null }],
    [{ ...row(), value: NaN }],
    [{ ...row(), captured_at: "invalid" }],
  ])("rejects unusable or unverified response %j", (data) => {
    expect(() => requireEffectiveSensorReadings(data)).toThrow(/unavailable/i);
  });
  it("retains a successful empty read", () => {
    expect(requireEffectiveSensorReadings([])).toEqual([]);
  });
  it("routes the history query through the effective view", async () => {
    const { result } = renderHook(() => useSensorReadings(tentId), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.from).toHaveBeenCalledWith("sensor_readings_effective");
    expect(result.current.data?.[0]).toMatchObject({
      value: 24,
      captured_at: observed,
      source: "manual",
    });
  });
  it("does not reuse raw cached values after switching to the effective contract", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(buildPrivateSensorQueryKey(row().user_id, [tentId, 200]), [
      { ...row(), value: 25 },
    ]);
    const { result } = renderHook(() => useSensorReadings(tentId), { wrapper: wrapper(client) });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.[0]?.value).toBe(24));
    expect(state.from).toHaveBeenCalledTimes(1);
  });
  it("reports unavailable without a raw fallback when the view is absent", async () => {
    state.data = null;
    state.error = { code: "42P01" };
    const { result } = renderHook(() => useSensorReadings(tentId), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(state.from.mock.calls).toEqual([["sensor_readings_effective"]]);
    expect(result.current.data).toBeUndefined();
  });
  it("marks invalid per-tent correction evidence as an error, not successful empty", async () => {
    state.data = [{ ...row(), correction_valid: false, value: null }];
    const { result } = renderHook(() => useSensorReadingsByTents([tentId]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.statusByTent[tentId]).toBe("error"));
    expect(state.from.mock.calls).toEqual([["sensor_readings_effective"]]);
  });
});
