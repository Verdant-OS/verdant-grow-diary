/**
 * Mutation hook + helper tests for useMarkAiDoctorSessionReview.
 *
 * Verifies:
 *   - Pure helpers (normalizeReviewNote / buildReviewInsertPayload).
 *   - Mutation inserts exactly one row with the correct payload.
 *   - No user_id is sent (DB default + RLS own ownership).
 *   - No update/upsert/delete/rpc/functions.invoke is called.
 *   - Success invalidates the reviews query cache.
 *   - Error path surfaces failure without throwing past the hook.
 *   - Static safety scan on the hook source.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  buildReviewInsertPayload,
  normalizeReviewNote,
  REVIEW_NOTE_MAX_LENGTH,
  useMarkAiDoctorSessionReview,
} from "@/hooks/useMarkAiDoctorSessionReview";

// --- Supabase mock -----------------------------------------------------------
type Call = { table: string; payload: unknown };
const insertCalls: Call[] = [];
let nextInsertError: { message: string } | null = null;
const forbidden = {
  update: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  rpc: vi.fn(),
  functionsInvoke: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => {
  const tableBuilder = (table: string) => ({
    insert: (payload: unknown) => {
      insertCalls.push({ table, payload });
      return Promise.resolve({ data: null, error: nextInsertError });
    },
    update: (...args: unknown[]) => {
      forbidden.update(...args);
      return Promise.resolve({ data: null, error: null });
    },
    upsert: (...args: unknown[]) => {
      forbidden.upsert(...args);
      return Promise.resolve({ data: null, error: null });
    },
    delete: (...args: unknown[]) => {
      forbidden.delete(...args);
      return Promise.resolve({ data: null, error: null });
    },
    select: () => ({ in: () => ({ order: () => ({ limit: () =>
      Promise.resolve({ data: [], error: null }) }) }) }),
  });
  return {
    supabase: {
      from: (table: string) => tableBuilder(table),
      rpc: (...args: unknown[]) => {
        forbidden.rpc(...args);
        return Promise.resolve({ data: null, error: null });
      },
      functions: {
        invoke: (...args: unknown[]) => {
          forbidden.functionsInvoke(...args);
          return Promise.resolve({ data: null, error: null });
        },
      },
    },
  };
});

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    client,
    Wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children),
  };
}

beforeEach(() => {
  insertCalls.length = 0;
  nextInsertError = null;
  Object.values(forbidden).forEach((fn) => fn.mockClear());
});

// --- Pure helpers ------------------------------------------------------------
describe("normalizeReviewNote", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeReviewNote("  hello  ")).toBe("hello");
  });
  it("returns null for empty/whitespace/null/undefined/non-string", () => {
    expect(normalizeReviewNote("")).toBeNull();
    expect(normalizeReviewNote("   ")).toBeNull();
    expect(normalizeReviewNote(null)).toBeNull();
    expect(normalizeReviewNote(undefined)).toBeNull();
    // @ts-expect-error — intentional invalid input
    expect(normalizeReviewNote(123)).toBeNull();
  });
  it("caps at 1000 chars", () => {
    const long = "a".repeat(1500);
    const out = normalizeReviewNote(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(REVIEW_NOTE_MAX_LENGTH);
  });
});

describe("buildReviewInsertPayload", () => {
  it("builds minimal payload for marked_reviewed (no note)", () => {
    const p = buildReviewInsertPayload({
      sessionId: "s1",
      eventType: "marked_reviewed",
    });
    expect(p).toEqual({ session_id: "s1", event_type: "marked_reviewed" });
    expect("note" in p).toBe(false);
  });
  it("includes note for needs_follow_up when provided", () => {
    const p = buildReviewInsertPayload({
      sessionId: "s1",
      eventType: "needs_follow_up",
      note: "  recheck humidity  ",
    });
    expect(p).toEqual({
      session_id: "s1",
      event_type: "needs_follow_up",
      note: "recheck humidity",
    });
  });
  it("omits empty/whitespace notes", () => {
    const p = buildReviewInsertPayload({
      sessionId: "s1",
      eventType: "cleared",
      note: "   ",
    });
    expect("note" in p).toBe(false);
  });
  it("never sets user_id in payload", () => {
    const p = buildReviewInsertPayload({
      sessionId: "s1",
      eventType: "marked_reviewed",
      note: "x",
    });
    expect("user_id" in p).toBe(false);
  });
  it("rejects missing sessionId", () => {
    expect(() =>
      buildReviewInsertPayload({
        sessionId: "",
        eventType: "marked_reviewed",
      }),
    ).toThrow();
  });
  it("rejects unknown event_type", () => {
    expect(() =>
      buildReviewInsertPayload({
        sessionId: "s1",
        // @ts-expect-error — intentional invalid input
        eventType: "deleted",
      }),
    ).toThrow();
  });
});

// --- Mutation behavior -------------------------------------------------------
describe("useMarkAiDoctorSessionReview — mutation", () => {
  it("inserts marked_reviewed with correct payload (no note, no user_id)", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({
      sessionId: "s1",
      eventType: "marked_reviewed",
    });
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0].table).toBe("ai_doctor_session_reviews");
    expect(insertCalls[0].payload).toEqual({
      session_id: "s1",
      event_type: "marked_reviewed",
    });
  });

  it("inserts needs_follow_up with trimmed note", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({
      sessionId: "s1",
      eventType: "needs_follow_up",
      note: "  watch overnight  ",
    });
    expect(insertCalls[0].payload).toEqual({
      session_id: "s1",
      event_type: "needs_follow_up",
      note: "watch overnight",
    });
  });

  it("inserts cleared", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({ sessionId: "s1", eventType: "cleared" });
    expect(insertCalls[0].payload).toEqual({
      session_id: "s1",
      event_type: "cleared",
    });
  });

  it("omits empty/whitespace notes from payload", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({
      sessionId: "s1",
      eventType: "marked_reviewed",
      note: "   ",
    });
    const p = insertCalls[0].payload as Record<string, unknown>;
    expect("note" in p).toBe(false);
  });

  it("caps long notes to 1000 chars before insert", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({
      sessionId: "s1",
      eventType: "needs_follow_up",
      note: "x".repeat(1500),
    });
    const p = insertCalls[0].payload as { note: string };
    expect(p.note.length).toBe(1000);
  });

  it("never includes user_id in the payload", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({
      sessionId: "s1",
      eventType: "marked_reviewed",
    });
    const p = insertCalls[0].payload as Record<string, unknown>;
    expect("user_id" in p).toBe(false);
  });

  it("never calls update / upsert / delete / rpc / functions.invoke", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({
      sessionId: "s1",
      eventType: "marked_reviewed",
    });
    expect(forbidden.update).not.toHaveBeenCalled();
    expect(forbidden.upsert).not.toHaveBeenCalled();
    expect(forbidden.delete).not.toHaveBeenCalled();
    expect(forbidden.rpc).not.toHaveBeenCalled();
    expect(forbidden.functionsInvoke).not.toHaveBeenCalled();
  });

  it("invalidates the ai_doctor_session_reviews query cache on success", async () => {
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({
      sessionId: "s1",
      eventType: "marked_reviewed",
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: ["ai_doctor_session_reviews"],
    });
  });

  it("surfaces an RLS / server error without throwing past the hook caller", async () => {
    nextInsertError = { message: "new row violates row-level security policy" };
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await expect(
      result.current.mutateAsync({
        sessionId: "s1",
        eventType: "marked_reviewed",
      }),
    ).rejects.toMatchObject({ message: /row-level security/ });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// --- Static safety scan ------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const HOOK_SRC = readFileSync(
  resolve(ROOT, "src/hooks/useMarkAiDoctorSessionReview.ts"),
  "utf8",
);

describe("useMarkAiDoctorSessionReview — safety scan", () => {
  it("uses INSERT only — no update/upsert/delete/rpc/functions.invoke", () => {
    expect(HOOK_SRC).not.toMatch(/\.update\(/);
    expect(HOOK_SRC).not.toMatch(/\.upsert\(/);
    expect(HOOK_SRC).not.toMatch(/\.delete\(/);
    expect(HOOK_SRC).not.toMatch(/\.rpc\(/);
    expect(HOOK_SRC).not.toMatch(/functions\.invoke/);
  });
  it("never touches action_queue / alerts / alert_events / tasks", () => {
    expect(HOOK_SRC).not.toMatch(/action_queue/);
    expect(HOOK_SRC).not.toMatch(/from\(["']alerts["']\)/);
    expect(HOOK_SRC).not.toMatch(/alert_events/);
    expect(HOOK_SRC).not.toMatch(/from\(["']tasks["']\)/);
  });
  it("contains no service_role / privileged keys", () => {
    expect(HOOK_SRC.toLowerCase()).not.toContain("service_role");
  });
  it("contains no automation / device-control markers", () => {
    const lower = HOOK_SRC.toLowerCase();
    for (const tok of [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
  it("does not send user_id from the client", () => {
    // Defense in depth: source-level assertion against accidental regressions.
    expect(HOOK_SRC).not.toMatch(/user_id\s*:/);
  });
});
