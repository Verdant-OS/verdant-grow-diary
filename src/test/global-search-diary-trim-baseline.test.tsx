/**
 * Global search diary spec — query trim baseline (requirement 5).
 *
 * The hook trims before debounce/RPC; diary search will share the same trim so
 * surrounding spaces are never part of the pattern (`"  yel  "` → `yel`).
 */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { clearGlobalSearchPrivateState } from "@/lib/globalSearchSession";

type RpcResult = { data: unknown; error: unknown };

const supabaseMock = vi.hoisted(() => {
  const state = {
    rpcImpl: (async () => ({ data: [], error: null })) as (
      name: string,
      args: unknown,
    ) => Promise<RpcResult>,
  };
  return {
    state,
    rpcSpy: vi.fn((name: string, args: unknown) => state.rpcImpl(name, args)),
  };
});

const { rpcSpy } = supabaseMock;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => supabaseMock.rpcSpy(name, args),
  },
}));

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  rpcSpy.mockClear();
  supabaseMock.state.rpcImpl = async () => ({ data: [], error: null });
});

afterEach(() => {
  clearGlobalSearchPrivateState();
});

describe("global search diary trim baseline", () => {
  it('sends trimmed q to verdant_search for padded input "  yel  "', async () => {
    renderHook(() => useGlobalSearch("  yel  "), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(rpcSpy).toHaveBeenCalledWith("verdant_search", expect.objectContaining({ q: "yel" })),
    );
  });
});
