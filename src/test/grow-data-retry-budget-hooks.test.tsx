/**
 * Hook-level bounds for tent and plant reads: a retryable failure is tried
 * through the short backoff, a permission code is not, and a hung read
 * ends inside GROW_READ_BUDGET_MS.
 */
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  tents: 0,
  plants: 0,
  mode: "network" as "network" | "permission" | "hang",
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/lib/growRepo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/growRepo")>();
  const fail = (which: "tents" | "plants") => {
    if (which === "tents") repo.tents += 1;
    else repo.plants += 1;
    if (repo.mode === "permission") {
      throw Object.assign(new Error("permission denied"), { code: "42501" });
    }
    if (repo.mode === "hang") return new Promise(() => {});
    throw new Error("failed to fetch");
  };
  return {
    ...actual,
    fetchTents: vi.fn(() => fail("tents")),
    fetchPlants: vi.fn(() => fail("plants")),
  };
});

import { GROW_READ_BUDGET_MS, GROW_READ_RETRY_DELAYS_MS } from "@/lib/growsReadRetryRules";
import { useGrowPlants, useGrowTents } from "@/hooks/useGrowData";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  repo.tents = 0;
  repo.plants = 0;
  repo.mode = "network";
});

afterEach(() => {
  vi.useRealTimers();
  // Restore React Query's default scheduler even when an assertion throws.
  notifyManager.setScheduler((callback) => {
    setTimeout(callback, 0);
  });
});

describe("tent and plant retry bounds", () => {
  it("exhausts the retry sequence when every read fails", async () => {
    const { result } = renderHook(() => useGrowTents(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(repo.tents).toBe(GROW_READ_RETRY_DELAYS_MS.length + 1);
  });

  it("does not retry a non-retryable permission code", async () => {
    repo.mode = "permission";
    const { result } = renderHook(() => useGrowPlants(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(repo.plants).toBe(1);
  });

  it("ends a hung read inside the total budget", async () => {
    repo.mode = "hang";
    vi.useFakeTimers();
    notifyManager.setScheduler((callback) => {
      callback();
    });
    const { result } = renderHook(() => useGrowTents(), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GROW_READ_BUDGET_MS - 1);
    });
    expect(result.current.isError).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.isError).toBe(true);
    expect(repo.tents).toBe(2);
  });
});
