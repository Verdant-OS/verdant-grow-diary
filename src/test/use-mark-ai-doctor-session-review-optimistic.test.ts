/**
 * Optimistic-cache behavior tests for useMarkAiDoctorSessionReview.
 *
 * Verifies that the mutation:
 *   - prepends a temporary event to every relevant scoped reviews cache
 *   - recomputes the projected status immediately
 *   - rolls back snapshots on server/RLS error
 *   - reconciles via invalidation on settle (success and error)
 *   - never sends user_id from the client
 *   - never calls update / upsert / delete / rpc / functions.invoke
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  buildOptimisticReviewEvent,
  OPTIMISTIC_REVIEW_EVENT_ID_PREFIX,
  useMarkAiDoctorSessionReview,
} from "@/hooks/useMarkAiDoctorSessionReview";
import type { UseAiDoctorSessionReviewsResult } from "@/hooks/useAiDoctorSessionReviews";
import {
  projectLatestReviewStateBySession,
  type AiDoctorSessionReviewEvent,
} from "@/lib/aiDoctorSessionReviewStatusRules";

// --- Supabase mock -----------------------------------------------------------
type Call = { table: string; payload: unknown };
const insertCalls: Call[] = [];
let nextInsertError: { message: string } | null = null;
let pendingInsert: {
  promise: Promise<{ data: null; error: { message: string } | null }>;
  resolve: () => void;
} | null = null;
const forbidden = {
  update: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  rpc: vi.fn(),
  functionsInvoke: vi.fn(),
};

function deferInsert() {
  let resolveOuter!: () => void;
  const promise = new Promise<{ data: null; error: { message: string } | null }>(
    (res) => {
      resolveOuter = () =>
        res({ data: null, error: nextInsertError });
    },
  );
  pendingInsert = { promise, resolve: resolveOuter };
  return pendingInsert;
}

vi.mock("@/integrations/supabase/client", () => {
  const tableBuilder = (table: string) => ({
    insert: (payload: unknown) => {
      insertCalls.push({ table, payload });
      if (pendingInsert) return pendingInsert.promise;
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
    select: () => ({
      in: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
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

function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { client, Wrapper };
}

function seedCache(
  client: QueryClient,
  scope: string[] | null,
  events: AiDoctorSessionReviewEvent[],
): void {
  const result: UseAiDoctorSessionReviewsResult = {
    events,
    stateBySession: projectLatestReviewStateBySession(events),
  };
  client.setQueryData(["ai_doctor_session_reviews", scope], result);
}

function getCache(
  client: QueryClient,
  scope: string[] | null,
): UseAiDoctorSessionReviewsResult | undefined {
  return client.getQueryData<UseAiDoctorSessionReviewsResult>([
    "ai_doctor_session_reviews",
    scope,
  ]);
}

beforeEach(() => {
  insertCalls.length = 0;
  nextInsertError = null;
  pendingInsert = null;
  Object.values(forbidden).forEach((fn) => fn.mockClear());
});

// --- Pure helper -------------------------------------------------------------
describe("buildOptimisticReviewEvent", () => {
  it("produces a temporary event with an optimistic-prefixed id", () => {
    const evt = buildOptimisticReviewEvent({
      sessionId: "s1",
      eventType: "marked_reviewed",
    });
    expect(evt.id.startsWith(OPTIMISTIC_REVIEW_EVENT_ID_PREFIX)).toBe(true);
    expect(evt.session_id).toBe("s1");
    expect(evt.event_type).toBe("marked_reviewed");
    expect(evt.note).toBeNull();
    expect(typeof evt.created_at).toBe("string");
    expect(evt.user_id).toBe(""); // placeholder; never sent to server
  });
  it("normalizes notes the same way the insert payload does", () => {
    const evt = buildOptimisticReviewEvent({
      sessionId: "s1",
      eventType: "needs_follow_up",
      note: "  trim me  ",
    });
    expect(evt.note).toBe("trim me");
  });
});

// --- Optimistic insert into cache --------------------------------------------
describe("useMarkAiDoctorSessionReview — optimistic cache", () => {
  it("prepends an optimistic reviewed event to a session-scoped cache", async () => {
    const { client, Wrapper } = makeClient();
    seedCache(client, ["s1"], []);

    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    const p = result.current.mutateAsync({
      sessionId: "s1",
      eventType: "marked_reviewed",
    });

    // onMutate runs synchronously enough to see optimistic state before await.
    await waitFor(() => {
      const cache = getCache(client, ["s1"]);
      expect(cache?.events.length).toBe(1);
    });
    const cache = getCache(client, ["s1"])!;
    expect(cache.events[0].event_type).toBe("marked_reviewed");
    expect(cache.events[0].id.startsWith(OPTIMISTIC_REVIEW_EVENT_ID_PREFIX)).toBe(
      true,
    );
    expect(cache.stateBySession.get("s1")?.status).toBe("reviewed");

    await p;
  });

  it("prepends optimistic needs_follow_up with normalized note", async () => {
    const { client, Wrapper } = makeClient();
    seedCache(client, ["s1"], []);

    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    const p = result.current.mutateAsync({
      sessionId: "s1",
      eventType: "needs_follow_up",
      note: "  watch overnight  ",
    });

    await waitFor(() => {
      expect(getCache(client, ["s1"])?.events[0]?.event_type).toBe(
        "needs_follow_up",
      );
    });
    const cache = getCache(client, ["s1"])!;
    expect(cache.events[0].note).toBe("watch overnight");
    expect(cache.stateBySession.get("s1")?.status).toBe("needs_follow_up");

    await p;
  });

  it("prepends optimistic cleared event and projects not_reviewed", async () => {
    const { client, Wrapper } = makeClient();
    const prior: AiDoctorSessionReviewEvent = {
      id: "e1",
      user_id: "u1",
      session_id: "s1",
      event_type: "marked_reviewed",
      note: null,
      created_at: "2025-01-01T00:00:00.000Z",
    };
    seedCache(client, ["s1"], [prior]);

    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    const p = result.current.mutateAsync({
      sessionId: "s1",
      eventType: "cleared",
    });

    await waitFor(() => {
      expect(getCache(client, ["s1"])?.events.length).toBe(2);
    });
    const cache = getCache(client, ["s1"])!;
    expect(cache.events[0].event_type).toBe("cleared");
    expect(cache.stateBySession.get("s1")?.status).toBe("not_reviewed");

    await p;
  });

  it("updates the broad (null-scope) cache and skips unrelated session scopes", async () => {
    const { client, Wrapper } = makeClient();
    seedCache(client, null, []); // broad
    seedCache(client, ["s1"], []); // matching narrow
    seedCache(client, ["s2"], []); // unrelated narrow

    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    const p = result.current.mutateAsync({
      sessionId: "s1",
      eventType: "marked_reviewed",
    });

    await waitFor(() => {
      expect(getCache(client, null)?.events.length).toBe(1);
    });
    expect(getCache(client, ["s1"])?.events.length).toBe(1);
    // Unrelated scope must not be touched.
    expect(getCache(client, ["s2"])?.events.length).toBe(0);

    await p;
  });

  it("rolls back every touched cache on server/RLS error", async () => {
    nextInsertError = { message: "new row violates row-level security policy" };
    const { client, Wrapper } = makeClient();
    const prior: AiDoctorSessionReviewEvent = {
      id: "e1",
      user_id: "u1",
      session_id: "s1",
      event_type: "marked_reviewed",
      note: null,
      created_at: "2025-01-01T00:00:00.000Z",
    };
    seedCache(client, null, [prior]);
    seedCache(client, ["s1"], [prior]);

    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await expect(
      result.current.mutateAsync({
        sessionId: "s1",
        eventType: "needs_follow_up",
      }),
    ).rejects.toMatchObject({ message: /row-level security/ });

    // After error + onSettled invalidation, caches should be restored (or
    // refetched to empty by our mock). We assert the rollback shape directly:
    // every event with the optimistic prefix must be gone.
    for (const scope of [null, ["s1"]] as Array<string[] | null>) {
      const cache = getCache(client, scope);
      const optimistic = (cache?.events ?? []).filter((e) =>
        e.id.startsWith(OPTIMISTIC_REVIEW_EVENT_ID_PREFIX),
      );
      expect(optimistic).toEqual([]);
    }
  });

  it("invalidates review-event queries on settle (success path)", async () => {
    const { client, Wrapper } = makeClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    seedCache(client, ["s1"], []);

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

  it("invalidates review-event queries on settle (error path)", async () => {
    nextInsertError = { message: "boom" };
    const { client, Wrapper } = makeClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    seedCache(client, ["s1"], []);

    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await expect(
      result.current.mutateAsync({
        sessionId: "s1",
        eventType: "marked_reviewed",
      }),
    ).rejects.toBeDefined();

    expect(spy).toHaveBeenCalledWith({
      queryKey: ["ai_doctor_session_reviews"],
    });
  });

  it("payload still excludes user_id", async () => {
    const { client, Wrapper } = makeClient();
    seedCache(client, ["s1"], []);
    const { result } = renderHook(() => useMarkAiDoctorSessionReview(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({
      sessionId: "s1",
      eventType: "marked_reviewed",
      note: "x",
    });
    const p = insertCalls[0].payload as Record<string, unknown>;
    expect("user_id" in p).toBe(false);
  });

  it("still never calls update / upsert / delete / rpc / functions.invoke", async () => {
    const { client, Wrapper } = makeClient();
    seedCache(client, ["s1"], []);
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
});
