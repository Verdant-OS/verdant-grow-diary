/**
 * #2032 review 5674750774 (nit): a details.photo_url fallback is signed in its
 * own storage call, so a batch-level failure on that call (an error result or
 * a throw) drops only the fallback photos. The column photos and the report
 * itself still render.
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDiaryRangeReportData } from "@/hooks/useDiaryRangeReportData";

const io = vi.hoisted(() => ({
  diary: [] as unknown[],
  fallbackFailure: "error" as "error" | "throw",
}));

vi.mock("@/store/auth", () => {
  const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  return { useAuth: () => ({ user }) };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          if (paths.includes("owner/grow-a/details.jpg")) {
            if (io.fallbackFailure === "throw") throw new Error("storage batch failure");
            return { data: null, error: new Error("storage batch failure") };
          }
          return {
            data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}` })),
            error: null,
          };
        },
      }),
    },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        or: () => q,
        is: () => q,
        gte: () => q,
        lte: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: () => q,
        then: (resolve: (value: unknown) => unknown) => {
          const data =
            table === "grows"
              ? { id: "grow-a", name: "Grow A", stage: "veg" }
              : table === "tents"
                ? [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }]
                : table === "diary_entries"
                  ? io.diary
                  : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
  },
}));

const at = "2026-01-01T12:00:00.000Z";
const clients: QueryClient[] = [];

beforeEach(() => {
  io.diary = [
    { id: "col", photo_url: "owner/grow-a/col.jpg", entry_at: at, details: null },
    {
      id: "fallback",
      photo_url: null,
      entry_at: at,
      details: { photo_url: "owner/grow-a/details.jpg" },
    },
  ];
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return renderHook(() => useDiaryRangeReportData("grow-a", "2026-01-01", "2026-01-02"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

it.each(["error", "throw"] as const)(
  "a fallback batch %s drops only the fallback photo; the report and column photo render",
  async (failure) => {
    io.fallbackFailure = failure;
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const byId = Object.fromEntries(
      (result.current.data?.diaryEntries ?? []).map((e) => [e.id, e.photo_url]),
    );
    expect(byId.col).toBe("https://signed.example/owner/grow-a/col.jpg");
    expect(byId.fallback ?? null).toBeNull();
  },
);
