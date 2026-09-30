import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useDiaryRangeReportData } from "@/hooks/useDiaryRangeReportData";

const fixture = vi.hoisted(() => ({
  harvests: [] as { harvested_at: string; yield_grams: number; grow_id?: string }[],
  user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: fixture.user }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    from: (table: string) => {
      let lower: string | undefined;
      let upper: string | undefined;
      let cap = Infinity;
      let ascending = true;
      let growId: string | undefined;
      const q = {
        select: () => q,
        eq: (column: string, value: string) => {
          if (column === "grow_id") growId = value;
          return q;
        },
        is: () => q,
        maybeSingle: () => q,
        gte: (_column: string, value: string) => {
          lower = value;
          return q;
        },
        lte: (_column: string, value: string) => {
          upper = value;
          return q;
        },
        order: (_column: string, options: { ascending: boolean }) => {
          ascending = options.ascending;
          return q;
        },
        limit: (value: number) => {
          cap = value;
          return q;
        },
        then: (resolve: (value: unknown) => unknown) => {
          const data =
            table === "grows"
              ? { id: "grow-a", name: "A", stage: "veg" }
              : table === "harvests"
                ? fixture.harvests
                    .filter(
                      (r) =>
                        (!growId || (r.grow_id ?? "grow-a") === growId) &&
                        (!lower || r.harvested_at >= lower) &&
                        (!upper || r.harvested_at <= upper),
                    )
                    .sort(
                      (a, b) => (ascending ? 1 : -1) * a.harvested_at.localeCompare(b.harvested_at),
                    )
                    .slice(0, cap)
                : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
  },
}));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});
const january = { harvested_at: "2026-01-15T12:00:00.000Z", yield_grams: 125 };
async function readJanuary() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const { result } = renderHook(
    () => useDiaryRangeReportData("grow-a", "2026-01-01", "2026-01-31"),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  await waitFor(() => expect(result.current.status).toBe("ready"));
  return result.current.data?.harvests;
}
it("control: returns the January harvest when no newer rows compete for the cap", async () => {
  fixture.harvests = [january];
  expect(await readJanuary()).toEqual([january]);
});
it("keeps January evidence when fifty newer out-of-range harvests exist", async () => {
  fixture.harvests = [
    january,
    ...Array.from({ length: 50 }, (_, i) => ({
      harvested_at: new Date(Date.UTC(2026, 2, i + 1, 12)).toISOString(),
      yield_grams: 10,
    })),
  ];
  expect(await readJanuary()).toEqual([january]);
});
it("includes both UTC day boundaries and excludes adjacent instants", async () => {
  const first = { harvested_at: "2026-01-01T00:00:00.000Z", yield_grams: 1 };
  const last = { harvested_at: "2026-01-31T23:59:59.999Z", yield_grams: 2 };
  fixture.harvests = [
    first,
    last,
    { harvested_at: "2025-12-31T23:59:59.999Z", yield_grams: 3 },
    { harvested_at: "2026-02-01T00:00:00.000Z", yield_grams: 4 },
  ];
  expect(await readJanuary()).toEqual([last, first]);
});
it("retains grow scope while applying the date range", async () => {
  fixture.harvests = [january, { ...january, grow_id: "grow-b", yield_grams: 999 }];
  expect(await readJanuary()).toEqual([january]);
});
it("returns successful empty for a range with no harvests", async () => {
  fixture.harvests = [{ harvested_at: "2026-02-01T00:00:00.000Z", yield_grams: 4 }];
  expect(await readJanuary()).toEqual([]);
});
it("keeps the existing newest-fifty bound within the selected range", async () => {
  fixture.harvests = Array.from({ length: 51 }, (_, i) => ({
    harvested_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    yield_grams: i,
  }));
  const rows = await readJanuary();
  expect(rows).toHaveLength(50);
  expect(rows?.[0].yield_grams).toBe(50);
  expect(rows?.[49].yield_grams).toBe(1);
});
