/**
 * useBlueprintServerAccess must drop an earlier allow as soon as `enabled`
 * goes false (the client entitlement changed), even with the allow still in
 * the query cache. use-blueprint-server-access.test.tsx covers the rest.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBlueprintServerAccess } from "@/hooks/useBlueprintServerAccess";

const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/blueprintAccess.functions", () => ({ getBlueprintAccess: io.fetch }));

let client: QueryClient;
function mount(enabled: boolean) {
  return renderHook(({ on }) => useBlueprintServerAccess(on, "craft_monthly"), {
    initialProps: { on: enabled },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  io.fetch.mockReset();
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe("useBlueprintServerAccess — enabled goes false", () => {
  it("locks at once after an earlier allow, without asking the server again", async () => {
    io.fetch.mockResolvedValue({ allowed: true, reason: "allowed" });
    const { result, rerender } = mount(true);
    await waitFor(() => expect(result.current).toEqual({ allowed: true, pending: false }));
    expect(io.fetch).toHaveBeenCalledTimes(1);

    rerender({ on: false });
    expect(result.current).toEqual({ allowed: false, pending: false });
    expect(client.getQueryData(["blueprint-access", "craft_monthly"])).toEqual({
      allowed: true,
      reason: "allowed",
    });
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });

  it("is not pending while disabled, even before any server answer", () => {
    io.fetch.mockReturnValue(new Promise(() => {}));
    const { result, rerender } = mount(true);
    expect(result.current).toEqual({ allowed: false, pending: true });
    rerender({ on: false });
    expect(result.current).toEqual({ allowed: false, pending: false });
  });
});
