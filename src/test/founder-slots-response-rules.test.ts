import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFounderSlotsResponse } from "@/lib/founderSlotsResponseRules";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import { useFounderSlotsRemaining } from "@/hooks/useFounderSlotsRemaining";

const HOOK_SOURCE = readFileSync(
  resolve(process.cwd(), "src/hooks/useFounderSlotsRemaining.ts"),
  "utf8",
);

beforeEach(() => {
  invoke.mockReset();
});

describe("Founder slots response rules", () => {
  it.each([
    [0, 75, true],
    [42, 33, false],
    [75, 0, false],
  ])("accepts remaining=%s and derives claimed=%s", (remaining, claimed, soldOut) => {
    expect(parseFounderSlotsResponse({ remaining, total: 75 })).toEqual({
      remaining,
      total: 75,
      claimed,
      soldOut,
    });
  });

  it.each([-1, 76, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid numeric remaining=%s",
    (remaining) => {
      expect(parseFounderSlotsResponse({ remaining, total: 75 })).toBeNull();
    },
  );

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a numeric string", "42"],
    ["a boolean", true],
    ["an empty object", {}],
    ["an array", []],
  ])("rejects %s", (_label, value) => {
    expect(parseFounderSlotsResponse(value)).toBeNull();
  });

  it.each([
    ["missing total", { remaining: 42 }],
    ["wrong total", { remaining: 42, total: 74 }],
    ["string total", { remaining: 42, total: "75" }],
    ["extra field", { remaining: 42, total: 75, internal: "not public" }],
  ])("rejects %s", (_label, value) => {
    expect(parseFounderSlotsResponse(value)).toBeNull();
  });

  it("is deterministic, mutation-free, and returns a fresh result", () => {
    const input = Object.freeze({ remaining: 23, total: 75 });
    const first = parseFounderSlotsResponse(input);
    const second = parseFounderSlotsResponse(input);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(input).toEqual({ remaining: 23, total: 75 });
  });
});

describe("useFounderSlotsRemaining wiring", () => {
  it("uses the exact parser and never clamps or floors malformed data into ready state", () => {
    expect(HOOK_SOURCE).toContain("parseFounderSlotsResponse(data)");
    expect(HOOK_SOURCE).not.toMatch(/Math\.(?:floor|min|max)\(/);
    expect(HOOK_SOURCE).not.toMatch(/remaining\s*<=\s*0/);
  });

  it("keeps failures presentation-only and invokes only the public counter", () => {
    const invokes = [...HOOK_SOURCE.matchAll(/functions\.invoke\(\s*["']([^"']+)["']/g)].map(
      (match) => match[1],
    );

    expect(invokes).toEqual(["founder-slots-remaining"]);
    expect(HOOK_SOURCE).not.toMatch(/supabase\s*\.\s*from\(/);
    expect(HOOK_SOURCE).not.toMatch(/service_role/);
  });

  it("publishes ready state only after the exact response contract passes", async () => {
    invoke.mockResolvedValue({ data: { remaining: 42, total: 75 }, error: null });
    const { result } = renderHook(() => useFounderSlotsRemaining());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      remaining: 42,
      total: 75,
      claimed: 33,
      soldOut: false,
    });
    expect(invoke).toHaveBeenCalledWith("founder-slots-remaining", { body: {} });
  });

  it("fails soft instead of trusting a malformed successful response", async () => {
    invoke.mockResolvedValue({ data: { remaining: 41.5, total: 75 }, error: null });
    const { result } = renderHook(() => useFounderSlotsRemaining());

    await waitFor(() => expect(result.current.status).toBe("unknown"));
    expect(result.current).toEqual({
      status: "unknown",
      remaining: null,
      total: 75,
      claimed: null,
      soldOut: false,
    });
  });

  it("keeps an invocation error authoritative even if data is present", async () => {
    invoke.mockResolvedValue({
      data: { remaining: 42, total: 75 },
      error: { message: "unavailable" },
    });
    const { result } = renderHook(() => useFounderSlotsRemaining());

    await waitFor(() => expect(result.current.status).toBe("unknown"));
    expect(result.current.remaining).toBeNull();
    expect(result.current.soldOut).toBe(false);
  });
});
