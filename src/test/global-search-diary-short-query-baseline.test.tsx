/**
 * Global search diary spec — short-query baseline (requirement 5).
 *
 * Entity/cultivar search keeps today's short-query behaviour ("OG"). The diary
 * read will enforce a separate 3-character minimum and must not disable this path.
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

describe("global search diary short-query baseline", () => {
  it('still calls verdant_search for "OG" and never verdant_search_diary', async () => {
    const { result } = renderHook(() => useGlobalSearch("OG"), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(rpcSpy).toHaveBeenCalledWith(
        "verdant_search",
        expect.objectContaining({ q: "OG", max_results: 20 }),
      ),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(rpcSpy.mock.calls.some(([name]) => name === "verdant_search_diary")).toBe(false);
  });
});
