import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/growRepo", () => ({
  insertSensorReading: vi.fn(),
}));

import * as repo from "@/lib/growRepo";
import { tents, plants, sensorReadings } from "@/mock";
import { useInsertSensorReading, validateSensorReadingPayload } from "./useInsertSensorReading";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { client, invalidateSpy, wrapper };
}

const goodPayload = {
  user_id: "u1",
  tent_id: "t1",
  metric: "temperature_c",
  value: 24.5,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useInsertSensorReading", () => {
  it("calls repo with the exact payload on success", async () => {
    (repo.insertSensorReading as any).mockResolvedValue(undefined);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
    result.current.mutate(goodPayload);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(repo.insertSensorReading).toHaveBeenCalledTimes(1);
    expect(repo.insertSensorReading).toHaveBeenCalledWith(goodPayload);
  });

  it("invalidates the ['grow','sensors'] query on success", async () => {
    (repo.insertSensorReading as any).mockResolvedValue(undefined);
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
    result.current.mutate(goodPayload);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["grow", "sensors"] });
  });

  it("surfaces repo errors via mutation state", async () => {
    (repo.insertSensorReading as any).mockRejectedValue(new Error("rls denied"));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
    result.current.mutate(goodPayload);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/rls denied/);
  });

  it("does not write when payload is invalid", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
    result.current.mutate({ ...goodPayload, metric: "bogus" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(repo.insertSensorReading).not.toHaveBeenCalled();
    expect(result.current.error?.message).toMatch(/invalid metric/);
  });

  it("does not mutate exported mock arrays", async () => {
    (repo.insertSensorReading as any).mockResolvedValue(undefined);
    const tentsSnap = JSON.stringify(tents);
    const plantsSnap = JSON.stringify(plants);
    const sensorsSnap = JSON.stringify(sensorReadings);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
    result.current.mutate(goodPayload);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(JSON.stringify(tents)).toBe(tentsSnap);
    expect(JSON.stringify(plants)).toBe(plantsSnap);
    expect(JSON.stringify(sensorReadings)).toBe(sensorsSnap);
  });
});

describe("validateSensorReadingPayload", () => {
  it("accepts a valid payload", () => {
    expect(() => validateSensorReadingPayload(goodPayload)).not.toThrow();
  });
  it("rejects empty user_id, missing tent_id, bad metric, non-finite value", () => {
    expect(() => validateSensorReadingPayload({ ...goodPayload, user_id: "" })).toThrow(/user_id/);
    expect(() => validateSensorReadingPayload({ ...goodPayload, tent_id: "" })).toThrow(/tent_id/);
    expect(() => validateSensorReadingPayload({ ...goodPayload, metric: "x" })).toThrow(/metric/);
    expect(() => validateSensorReadingPayload({ ...goodPayload, value: Number.NaN })).toThrow(/finite/);
  });
  it("accepts a payload without user_id (DB default auth.uid() handles ownership)", () => {
    const { user_id, ...noUid } = goodPayload as any;
    expect(() => validateSensorReadingPayload(noUid)).not.toThrow();
  });
});
