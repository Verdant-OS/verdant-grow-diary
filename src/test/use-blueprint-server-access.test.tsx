import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBlueprintServerAccess } from "@/hooks/useBlueprintServerAccess";

const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/blueprintAccess.functions", () => ({ getBlueprintAccess: io.fetch }));

let client: QueryClient;
function mount(enabled = true) {
  return renderHook(({ on }) => useBlueprintServerAccess(on, "craft_monthly"), {
    initialProps: { on: enabled },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  io.fetch.mockReset();
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe("useBlueprintServerAccess", () => {
  it("allows only after the server confirms", async () => {
    io.fetch.mockResolvedValue({ allowed: true });
    const { result } = mount();
    expect(result.current).toEqual({ allowed: false, pending: true });
    await waitFor(() => expect(result.current).toEqual({ allowed: true, pending: false }));
  });

  it("stays locked and never asks the server when the client is not entitled", async () => {
    const { result } = mount(false);
    expect(result.current).toEqual({ allowed: false, pending: false });
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it("stays locked when the server denies", async () => {
    io.fetch.mockResolvedValue({ allowed: false, reason: "no_blueprint_plan" });
    const { result } = mount();
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.allowed).toBe(false);
  });

  it("locks again when a recheck fails after an earlier allow", async () => {
    io.fetch.mockResolvedValueOnce({ allowed: true });
    const { result } = mount();
    await waitFor(() => expect(result.current.allowed).toBe(true));

    io.fetch.mockRejectedValueOnce(new Error("token expired"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["blueprint-access", "craft_monthly"] });
    });

    await waitFor(() => expect(result.current.allowed).toBe(false));
    expect(result.current.pending).toBe(false);
  });
});
