/**
 * VER-287: one transient tent or plant failure must not become the dashboard
 * "grow data unavailable" card. The query retries inside its budget, then
 * publishes the successful rows.
 */
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  tents: 0,
  plants: 0,
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/lib/growRepo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/growRepo")>();
  return {
    ...actual,
    fetchTents: vi.fn(async () => {
      repo.tents += 1;
      if (repo.tents === 1) throw new Error("failed to fetch");
      return [{ id: "tent-1", name: "Flower" }];
    }),
    fetchPlants: vi.fn(async () => {
      repo.plants += 1;
      if (repo.plants === 1) throw new Error("network request failed");
      return [{ id: "plant-1", name: "One" }];
    }),
  };
});

import { useGrowPlants, useGrowTents } from "@/hooks/useGrowData";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  repo.tents = 0;
  repo.plants = 0;
});

describe("dashboard grow reads recover from one transient failure", () => {
  it("returns tents after the first read fails", async () => {
    const { result } = renderHook(() => useGrowTents(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.[0]?.id).toBe("tent-1");
  });

  it("returns plants after the first read fails", async () => {
    const { result } = renderHook(() => useGrowPlants(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.[0]?.id).toBe("plant-1");
  });
});
