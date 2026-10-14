import React from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  plantCount: 4,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let head = false;
      const query = {
        select: (...args: unknown[]) => {
          head = !!(args[1] as { head?: boolean } | undefined)?.head;
          return query;
        },
        eq: () => query,
        or: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        range: () => query,
        is: () => query,
        not: () => query,
        lte: () => query,
        gte: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          if (table === "plants" && head) {
            return Promise.resolve({ data: null, error: null, count: io.plantCount }).then(resolve);
          }
          if (table === "tents") {
            return Promise.resolve({ data: [], error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
        },
      };
      return query;
    },
  },
}));

import { useReportsHubData } from "@/hooks/useReportsHubData";

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

it("returns the exact active plant count from the hub read", async () => {
  io.plantCount = 4;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const { result } = renderHook(() => useReportsHubData("grow-a"), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.plantCount).toBe(4);
});
