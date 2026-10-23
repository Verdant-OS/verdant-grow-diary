/**
 * Global search diary spec — partial failure baseline (requirement 3).
 *
 * Today only `verdant_search` runs privately; cultivar matches stay available
 * when it fails. The diary RPC must follow the same isolation when added.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { clearGlobalSearchPrivateState } from "@/lib/globalSearchSession";

type RpcResult = { data: unknown; error: unknown };

const supabaseMock = vi.hoisted(() => ({
  rpcSpy: vi.fn(async (_name: string, _args: unknown): Promise<RpcResult> => ({
    data: null,
    error: { message: "verdant_search failed" },
  })),
}));

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
  supabaseMock.rpcSpy.mockClear();
});

afterEach(() => {
  clearGlobalSearchPrivateState();
});

describe("global search diary partial failure baseline", () => {
  it("still returns bundled cultivar matches when verdant_search errors", async () => {
    const { result } = renderHook(() => useGlobalSearch("OG"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(supabaseMock.rpcSpy).toHaveBeenCalled());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.results.some((row) => row.entity_type === "cultivar")).toBe(true);
    expect(result.current.results.every((row) => row.entity_type === "cultivar")).toBe(true);
    expect(supabaseMock.rpcSpy).toHaveBeenCalledWith(
      "verdant_search",
      expect.objectContaining({ q: "OG" }),
    );
  });
});
