/**
 * #2202 Codex P2: a tents/plants read that times out must not record late
 * "supabase:rows" metadata when the response arrives after the deadline.
 * Consumers read that metadata apart from the query result.
 */
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ release: null as null | ((rows: unknown[]) => void) }));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/lib/growRepo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/growRepo")>();
  const deferred = () =>
    new Promise<unknown[]>((resolve) => {
      repo.release = resolve;
    });
  return { ...actual, fetchPlants: vi.fn(deferred), fetchTents: vi.fn(deferred) };
});

import { CRITICAL_READ_DEADLINE_MS } from "@/lib/boundedReadRules";
import { GROW_READ_RETRY_DELAYS_MS } from "@/lib/growsReadRetryRules";
import {
  __resetGrowDataMeta,
  getGrowDataMeta,
  useGrowPlants,
  useGrowTents,
} from "@/hooks/useGrowData";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  __resetGrowDataMeta();
  repo.release = null;
  vi.useFakeTimers();
  // Flush React Query notifications synchronously under fake timers.
  notifyManager.setScheduler((callback) => {
    callback();
  });
});
afterEach(() => {
  notifyManager.setScheduler((callback) => {
    setTimeout(callback, 0);
  });
  vi.useRealTimers();
});

describe("a timed-out grow read keeps its failure metadata", () => {
  it.each([
    ["plants", (): { isError: boolean } => useGrowPlants(), ["grow", "plants", "all", "all"]],
    ["tents", (): { isError: boolean } => useGrowTents(), ["grow", "tents", "all"]],
  ] as const)("does not record late rows for %s", async (_name, hook, key) => {
    const { result } = renderHook(hook, { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS + GROW_READ_RETRY_DELAYS_MS[0]);
    });
    expect(result.current.isError).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
    });
    expect(result.current.isError).toBe(true);
    expect(getGrowDataMeta(key, "owner-1").sourceReason).toBe("fetch-error");

    await act(async () => {
      repo.release?.([{ id: "late-row" }]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getGrowDataMeta(key, "owner-1").sourceReason).toBe("fetch-error");
  });
});
