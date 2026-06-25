/**
 * Manual sensor save must NEVER pass a non-UUID tent_id to Supabase.
 *
 * Bug repro: on mobile, demo/mock tent ids (e.g. "t1") slipped into the
 * manual sensor save path and Postgres rejected the insert with
 * `invalid input syntax for type uuid: "t1"`. These tests lock in the
 * UUID guard at the hook layer and the static safety expectation that
 * demo ids never appear in real insert payloads.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/growRepo", () => ({
  insertSensorReading: vi.fn(),
}));

import * as repo from "@/lib/growRepo";
import {
  useInsertSensorReading,
  validateSensorReadingPayload,
  type InsertSensorReadingPayload,
} from "@/hooks/useInsertSensorReading";
import { isUuid } from "@/lib/isUuid";

const REAL_UUID = "11111111-1111-4111-8111-111111111111";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { wrapper };
}

const basePayload = (tent_id: string): InsertSensorReadingPayload => ({
  tent_id,
  metric: "temperature_c",
  value: 24.5,
  source: "manual",
});

beforeEach(() => vi.clearAllMocks());

describe("isUuid", () => {
  it("accepts canonical uuid shape", () => {
    expect(isUuid(REAL_UUID)).toBe(true);
  });
  it("rejects demo/mock ids", () => {
    for (const v of ["t1", "tent-1", "demo-tent", "sample-tent", "", null, undefined]) {
      expect(isUuid(v as unknown)).toBe(false);
    }
  });
});

describe("validateSensorReadingPayload UUID guard", () => {
  it("throws clear error for non-UUID tent_id", () => {
    expect(() => validateSensorReadingPayload(basePayload("t1"))).toThrow(
      /Select a real tent/,
    );
  });
  it("accepts a real UUID tent_id", () => {
    expect(() => validateSensorReadingPayload(basePayload(REAL_UUID))).not.toThrow();
  });
});

describe("useInsertSensorReading UUID guard", () => {
  it("blocks the Supabase call when tent_id is 't1'", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
    result.current.mutate(basePayload("t1"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(repo.insertSensorReading).not.toHaveBeenCalled();
    expect(result.current.error?.message).toMatch(/Select a real tent/);
  });

  it("blocks demo-tent, tent-1, sample-tent", async () => {
    for (const bad of ["tent-1", "demo-tent", "sample-tent"]) {
      const { wrapper } = makeWrapper();
      const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
      result.current.mutate(basePayload(bad));
      await waitFor(() => expect(result.current.isError).toBe(true));
    }
    expect(repo.insertSensorReading).not.toHaveBeenCalled();
  });

  it("calls Supabase when tent_id is a valid UUID", async () => {
    vi.mocked(repo.insertSensorReading).mockResolvedValue(undefined);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
    result.current.mutate(basePayload(REAL_UUID));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(repo.insertSensorReading).toHaveBeenCalledTimes(1);
    expect(repo.insertSensorReading).toHaveBeenCalledWith(
      expect.objectContaining({ tent_id: REAL_UUID, source: "manual" }),
    );
  });
});

describe("ManualSensorReadingCard static safety", () => {
  it("does not hardcode demo tent ids in the save path", () => {
    const src = readFileSync(
      resolve(__dirname, "../components/ManualSensorReadingCard.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/tentId\s*=\s*["'](t1|tent-1|demo-tent|sample-tent)["']/);
    expect(src).toMatch(/isUuid\(tentId\)/);
  });
});
