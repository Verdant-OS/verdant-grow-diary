import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectVisibleOwnerBadgeAwards } from "@/lib/badgeAwardRules";

const { getSession, from } = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-shelf-a" },
    session: { user: { id: "user-shelf-a" } },
    loading: false,
    signOut: async () => {},
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession },
    from,
    rpc: vi.fn(),
  },
}));

import { listOwnerBadgeAwards } from "@/lib/badgeAwardService";
import { useOwnerBadgeAwards } from "@/hooks/useOwnerBadgeAwards";

function queryBuilder(rows: unknown[]) {
  const eq = vi.fn();
  const order = vi.fn();
  const api = {
    select: vi.fn(() => api),
    eq: (...args: unknown[]) => {
      eq(...args);
      return api;
    },
    order: (...args: unknown[]) => {
      order(...args);
      return api;
    },
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
    calls: { eq, order },
  };
  return api;
}

describe("owner badge shelf scope", () => {
  beforeEach(() => {
    getSession.mockReset();
    from.mockReset();
  });

  it("filters the award query to the signed-in user and orders by id", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "user-shelf-a" } } },
      error: null,
    });
    const builder = queryBuilder([
      {
        id: "award-1",
        user_id: "user-shelf-a",
        badge_key: "first_diary_entry",
        first_recognized_at: "2026-10-01T00:00:00Z",
        hidden_at: null,
        restored_at: null,
        revoked_at: null,
      },
    ]);
    from.mockReturnValue(builder);

    const rows = await listOwnerBadgeAwards();

    expect(from).toHaveBeenCalledWith("badge_awards");
    expect(builder.calls.eq).toHaveBeenCalledWith("user_id", "user-shelf-a");
    expect(builder.calls.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(rows.map((row) => row.userId)).toEqual(["user-shelf-a"]);
  });

  it("drops another grower's active award from the shelf", () => {
    const visible = selectVisibleOwnerBadgeAwards(
      [
        {
          badgeKey: "first_diary_entry",
          hiddenAt: null,
          revokedAt: null,
          userId: "user-shelf-a",
        },
        {
          badgeKey: "first_diary_entry",
          hiddenAt: null,
          revokedAt: null,
          userId: "user-other",
        },
      ],
      "user-shelf-a",
    );
    expect(visible.map((award) => award.userId)).toEqual(["user-shelf-a"]);
  });

  it("scopes the react-query key to the signed-in user", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => useOwnerBadgeAwards(), { wrapper });
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([["owner-badge-awards", "user-shelf-a"]]);
  });
});
