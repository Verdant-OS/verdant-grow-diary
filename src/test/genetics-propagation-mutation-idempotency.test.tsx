/**
 * genetics-propagation-mutation-idempotency
 *
 * The anti-duplication gate at the hook layer: a retry after a failure must
 * reuse the SAME idempotency key (so the server collapses it to the original and
 * cannot create a duplicate), and a fresh submit must mint a new key.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

const mocks = vi.hoisted(() => {
  let counter = 0;
  return {
    calls: [] as Array<{ key: string }>,
    // First call fails, subsequent calls succeed — models a transient failure.
    fail: { value: true },
    newKey: () => `key-${++counter}`,
  };
});

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));

vi.mock("@/lib/genetics/traceabilityApi", () => ({
  newIdempotencyKey: mocks.newKey,
  upsertAccession: async (_payload: unknown, key: string) => {
    mocks.calls.push({ key });
    if (mocks.fail.value) {
      mocks.fail.value = false;
      return { ok: false, error: "transient" };
    }
    return { ok: true, data: { accession_id: "acc-1" }, reused: false };
  },
  archiveAccession: async () => ({ ok: false, error: "x" }),
  upsertBatch: async () => ({ ok: false, error: "x" }),
  assignPlants: async () => ({ ok: false, error: "x" }),
  recordScreening: async () => ({ ok: false, error: "x" }),
  openQuarantine: async () => ({ ok: false, error: "x" }),
  transitionQuarantine: async () => ({ ok: false, error: "x" }),
}));

import { useUpsertAccession } from "@/hooks/useGeneticsMutations";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("idempotent mutation hooks", () => {
  it("reuses the same key on retry, then reports saved", async () => {
    mocks.calls.length = 0;
    mocks.fail.value = true;

    const { result } = renderHook(() => useUpsertAccession(), { wrapper });

    await act(async () => {
      await result.current.submit({ source_kind: "seed" });
    });
    expect(result.current.status).toBe("failed");
    expect(mocks.calls).toHaveLength(1);

    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe("saved"));

    // Two calls, IDENTICAL key — the server would dedupe the retry.
    expect(mocks.calls).toHaveLength(2);
    expect(mocks.calls[0].key).toBe(mocks.calls[1].key);
  });

  it("mints a fresh key for a brand-new submission", async () => {
    mocks.calls.length = 0;
    mocks.fail.value = false;

    const { result } = renderHook(() => useUpsertAccession(), { wrapper });
    await act(async () => {
      await result.current.submit({ source_kind: "seed" });
    });
    await act(async () => {
      await result.current.submit({ source_kind: "clone" });
    });
    expect(mocks.calls).toHaveLength(2);
    expect(mocks.calls[0].key).not.toBe(mocks.calls[1].key);
  });

  it("retry with no pending attempt is a no-op", async () => {
    const { result } = renderHook(() => useUpsertAccession(), { wrapper });
    let res: { ok: boolean } | undefined;
    await act(async () => {
      res = await result.current.retry();
    });
    expect(res?.ok).toBe(false);
  });
});
