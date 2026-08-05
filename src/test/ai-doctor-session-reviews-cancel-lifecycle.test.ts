/**
 * Proves TanStack cancelQueries aborts the exact AbortSignal passed into the
 * PostgREST builder for ai_doctor_session_reviews — not only the cache layer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";

let receivedSignal: AbortSignal | undefined;
let pendingResolvers: Array<(value: { data: unknown[]; error: null }) => void> = [];

function reviewsChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "in", "order", "limit", "eq", "range", "not", "gte", "or"]) {
    chain[m] = () => chain;
  }
  chain.abortSignal = (signal: AbortSignal) => {
    receivedSignal = signal;
    return chain;
  };
  chain.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) =>
    new Promise<{ data: unknown[]; error: null }>((resolve) => {
      pendingResolvers.push(resolve);
    }).then(onFulfilled, onRejected);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "ai_doctor_session_reviews") {
        // Other tables in accidental mount: empty success thenable
        const c: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "limit", "abortSignal"]) c[m] = () => c;
        c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r);
        return c;
      }
      return reviewsChain();
    },
  },
}));

import { useAiDoctorSessionReviews } from "@/hooks/useAiDoctorSessionReviews";

describe("ai_doctor_session_reviews cancelQueries lifecycle", () => {
  beforeEach(() => {
    receivedSignal = undefined;
    pendingResolvers = [];
  });

  it("cancelQueries aborts the transport signal; cancelled attempt does not publish data", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useAiDoctorSessionReviews(null), { wrapper });

    await waitFor(() => {
      expect(receivedSignal).toBeDefined();
      expect(receivedSignal?.aborted).toBe(false);
    });

    const signalAtCancel = receivedSignal!;
    await queryClient.cancelQueries({ queryKey: ["ai_doctor_session_reviews"] });
    expect(signalAtCancel.aborted).toBe(true);

    // Late resolution of the cancelled transport must not land as success data
    for (const resolve of pendingResolvers) {
      resolve({ data: [{ id: "late-row" }], error: null });
    }

    await waitFor(() => {
      const cached = queryClient.getQueryData(["ai_doctor_session_reviews", null]);
      expect(cached).toBeUndefined();
    });

    queryClient.clear();
  });
});
