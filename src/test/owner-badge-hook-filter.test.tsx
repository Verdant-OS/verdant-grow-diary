import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, from, rpc } = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/badgeAwardFlags", () => ({
  ownerBadgeShelfEnabled: true,
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
    rpc,
  },
}));

import { useOwnerBadgeAwards } from "@/hooks/useOwnerBadgeAwards";

function queryBuilder(rows: unknown[]) {
  const api = {
    select: vi.fn(() => api),
    eq: vi.fn(() => api),
    order: vi.fn(() => api),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  return api;
}

describe("owner badge hook backup filter", () => {
  beforeEach(() => {
    getSession.mockReset();
    from.mockReset();
    rpc.mockReset();
    getSession.mockResolvedValue({
      data: { session: { user: { id: "user-shelf-a" } } },
      error: null,
    });
    rpc.mockResolvedValue({ data: { status: "unchanged", award_id: null }, error: null });
    from.mockReturnValue(
      queryBuilder([
        {
          id: "award-self",
          user_id: "user-shelf-a",
          badge_key: "first_diary_entry",
          first_recognized_at: "2026-10-01T00:00:00Z",
          hidden_at: null,
          restored_at: null,
          revoked_at: null,
        },
        {
          id: "award-other",
          user_id: "user-other",
          badge_key: "first_diary_entry",
          first_recognized_at: "2026-10-02T00:00:00Z",
          hidden_at: null,
          restored_at: null,
          revoked_at: null,
        },
      ]),
    );
  });

  it("applies the backup filter to the signed-in user", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useOwnerBadgeAwards(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((award) => award.userId)).toEqual(["user-shelf-a"]);
  });
});
