import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Supabase mock: a chainable builder that records calls and resolves with a
// configurable payload. Each test sets `mockState` before rendering the hook.
// ---------------------------------------------------------------------------
interface MockState {
  data: unknown[] | null;
  error: { message: string } | null;
  calls: {
    from: string[];
    select: string[];
    in: Array<{ column: string; values: unknown }>;
    order: Array<{ column: string; opts?: unknown }>;
    limit: number[];
    // Forbidden write paths — must remain empty in every test.
    insert: unknown[];
    update: unknown[];
    upsert: unknown[];
    delete: number;
    rpc: string[];
    functionsInvoke: string[];
  };
}

const mockState: MockState = {
  data: [],
  error: null,
  calls: {
    from: [],
    select: [],
    in: [],
    order: [],
    limit: [],
    insert: [],
    update: [],
    upsert: [],
    delete: 0,
    rpc: [],
    functionsInvoke: [],
  },
};

function resetMockState() {
  mockState.data = [];
  mockState.error = null;
  mockState.calls.from = [];
  mockState.calls.select = [];
  mockState.calls.in = [];
  mockState.calls.order = [];
  mockState.calls.limit = [];
  mockState.calls.insert = [];
  mockState.calls.update = [];
  mockState.calls.upsert = [];
  mockState.calls.delete = 0;
  mockState.calls.rpc = [];
  mockState.calls.functionsInvoke = [];
}

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  // Read-only chain methods.
  builder.select = (cols: string) => {
    mockState.calls.select.push(cols);
    return builder;
  };
  builder.in = (column: string, values: unknown) => {
    mockState.calls.in.push({ column, values });
    return builder;
  };
  builder.eq = () => builder;
  builder.order = (column: string, opts?: unknown) => {
    mockState.calls.order.push({ column, opts });
    return builder;
  };
  builder.limit = (n: number) => {
    mockState.calls.limit.push(n);
    return Promise.resolve({ data: mockState.data, error: mockState.error });
  };
  // Forbidden write methods — record and resolve so accidental calls fail
  // safety tests with a clear signal instead of throwing chain errors.
  builder.insert = (payload: unknown) => {
    mockState.calls.insert.push(payload);
    return Promise.resolve({ data: null, error: null });
  };
  builder.update = (payload: unknown) => {
    mockState.calls.update.push(payload);
    return Promise.resolve({ data: null, error: null });
  };
  builder.upsert = (payload: unknown) => {
    mockState.calls.upsert.push(payload);
    return Promise.resolve({ data: null, error: null });
  };
  builder.delete = () => {
    mockState.calls.delete += 1;
    return Promise.resolve({ data: null, error: null });
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      mockState.calls.from.push(table);
      return makeBuilder();
    },
    rpc: (fn: string) => {
      mockState.calls.rpc.push(fn);
      return Promise.resolve({ data: null, error: null });
    },
    functions: {
      invoke: (fn: string) => {
        mockState.calls.functionsInvoke.push(fn);
        return Promise.resolve({ data: null, error: null });
      },
    },
  },
}));

import {
  useAiDoctorSessionReviews,
  AI_DOCTOR_SESSION_REVIEWS_MAX_ROWS,
} from "@/hooks/useAiDoctorSessionReviews";

function wrapperFactory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

const SESSION_A = "11111111-1111-1111-1111-111111111111";
const SESSION_B = "22222222-2222-2222-2222-222222222222";
const USER = "99999999-9999-9999-9999-999999999999";

function reviewRow(
  id: string,
  session_id: string,
  event_type: "marked_reviewed" | "needs_follow_up" | "cleared",
  created_at: string,
  note: string | null = null,
) {
  return { id, user_id: USER, session_id, event_type, note, created_at };
}

beforeEach(() => {
  resetMockState();
});

describe("useAiDoctorSessionReviews", () => {
  it("returns empty events and empty projection when no rows exist", async () => {
    mockState.data = [];
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useAiDoctorSessionReviews(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.events).toEqual([]);
    expect(result.current.data?.stateBySession.size).toBe(0);
  });

  it("queries the correct table, columns, ordering, and limit", async () => {
    mockState.data = [];
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useAiDoctorSessionReviews(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockState.calls.from).toEqual(["ai_doctor_session_reviews"]);
    expect(mockState.calls.select[0]).toContain("id");
    expect(mockState.calls.select[0]).toContain("session_id");
    expect(mockState.calls.select[0]).toContain("event_type");
    expect(mockState.calls.select[0]).toContain("created_at");
    expect(mockState.calls.order).toEqual([
      { column: "created_at", opts: { ascending: true } },
    ]);
    expect(mockState.calls.limit).toEqual([AI_DOCTOR_SESSION_REVIEWS_MAX_ROWS]);
    // No session-id scoping when called with no argument.
    expect(mockState.calls.in).toEqual([]);
  });

  it("projects reviewed status correctly", async () => {
    mockState.data = [
      reviewRow("a", SESSION_A, "marked_reviewed", "2026-05-01T10:00:00Z"),
    ];
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useAiDoctorSessionReviews(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.stateBySession.get(SESSION_A)?.status).toBe(
      "reviewed",
    );
  });

  it("projects needs_follow_up status correctly", async () => {
    mockState.data = [
      reviewRow("a", SESSION_A, "marked_reviewed", "2026-05-01T10:00:00Z"),
      reviewRow("b", SESSION_A, "needs_follow_up", "2026-05-01T11:00:00Z", "wait 24h"),
    ];
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useAiDoctorSessionReviews(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const s = result.current.data?.stateBySession.get(SESSION_A);
    expect(s?.status).toBe("needs_follow_up");
    expect(s?.latestNote).toBe("wait 24h");
  });

  it("projects cleared as not_reviewed", async () => {
    mockState.data = [
      reviewRow("a", SESSION_A, "needs_follow_up", "2026-05-01T10:00:00Z"),
      reviewRow("b", SESSION_A, "cleared", "2026-05-01T12:00:00Z"),
    ];
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useAiDoctorSessionReviews(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.stateBySession.get(SESSION_A)?.status).toBe(
      "not_reviewed",
    );
  });

  it("handles multiple sessions independently", async () => {
    mockState.data = [
      reviewRow("a1", SESSION_A, "marked_reviewed", "2026-05-01T10:00:00Z"),
      reviewRow("a2", SESSION_A, "needs_follow_up", "2026-05-01T11:00:00Z"),
      reviewRow("b1", SESSION_B, "marked_reviewed", "2026-05-01T09:00:00Z"),
    ];
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useAiDoctorSessionReviews(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.stateBySession.get(SESSION_A)?.status).toBe(
      "needs_follow_up",
    );
    expect(result.current.data?.stateBySession.get(SESSION_B)?.status).toBe(
      "reviewed",
    );
  });

  it("scopes the query by session IDs when provided", async () => {
    mockState.data = [];
    const { wrapper } = wrapperFactory();
    renderHook(
      () => useAiDoctorSessionReviews([SESSION_B, SESSION_A, SESSION_A]),
      { wrapper },
    );
    await waitFor(() => expect(mockState.calls.from.length).toBe(1));
    // De-duped + sorted for stable cache key.
    expect(mockState.calls.in).toEqual([
      { column: "session_id", values: [SESSION_A, SESSION_B] },
    ]);
  });

  it("skips fetching when scoped to an empty session list", async () => {
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useAiDoctorSessionReviews([]), {
      wrapper,
    });
    // Give react-query a tick; query should be disabled and never run.
    await new Promise((r) => setTimeout(r, 20));
    expect(mockState.calls.from).toEqual([]);
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("surfaces Supabase errors via query error state", async () => {
    mockState.error = { message: "rls denied" };
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useAiDoctorSessionReviews(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error as { message?: string } | null;
    expect(err?.message).toMatch(/rls denied/);
    expect(result.current.data).toBeUndefined();
  });

  it("never invokes write paths, RPC, or edge functions", async () => {
    mockState.data = [
      reviewRow("a", SESSION_A, "marked_reviewed", "2026-05-01T10:00:00Z"),
    ];
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(
      () => useAiDoctorSessionReviews([SESSION_A]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockState.calls.insert).toEqual([]);
    expect(mockState.calls.update).toEqual([]);
    expect(mockState.calls.upsert).toEqual([]);
    expect(mockState.calls.delete).toBe(0);
    expect(mockState.calls.rpc).toEqual([]);
    expect(mockState.calls.functionsInvoke).toEqual([]);
  });
});

describe("static safety scan: useAiDoctorSessionReviews", () => {
  const hookSrc = fs.readFileSync(
    path.resolve(__dirname, "../hooks/useAiDoctorSessionReviews.ts"),
    "utf8",
  );

  it("hook module has no write paths or unsafe markers", () => {
    expect(hookSrc).not.toMatch(/\.insert\s*\(/);
    expect(hookSrc).not.toMatch(/\.update\s*\(/);
    expect(hookSrc).not.toMatch(/\.upsert\s*\(/);
    expect(hookSrc).not.toMatch(/\.delete\s*\(/);
    expect(hookSrc).not.toMatch(/functions\.invoke/);
    expect(hookSrc).not.toMatch(/service_role/);
    expect(hookSrc).not.toMatch(/action_queue/);
    expect(hookSrc).not.toMatch(/\balerts\b/);
    expect(hookSrc).not.toMatch(/\btasks\b/);
    expect(hookSrc).not.toMatch(/device[_-]?control/i);
    expect(hookSrc).not.toMatch(/lovable[_-]?api/i);
    // Comments may use the word "automation" only via the safety envelope
    // wording; ensure no automation API call shape is present.
    expect(hookSrc).not.toMatch(/runAutomation|triggerAutomation/);
  });

  it("hook reads only from the review event table", () => {
    const fromCalls = hookSrc.match(/\.from\(["']([^"']+)["']/g) ?? [];
    // The string literal appears as "ai_doctor_session_reviews" as never).
    const fromCallsLoose =
      hookSrc.match(/\.from\(\s*["']([^"']+)["']/g) ?? [];
    const all = [...fromCalls, ...fromCallsLoose];
    for (const call of all) {
      expect(call).toContain("ai_doctor_session_reviews");
    }
  });
});
