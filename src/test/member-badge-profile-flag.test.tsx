import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "5b0f6c1e-2a43-4c1d-9b7e-0d6a1f2e3c4d";
const MEMBER = "9e8d7c6b-5a49-4382-8170-6f5e4d3c2b1a";

const state = vi.hoisted(() => ({
  from: [] as string[],
}));

vi.mock("@/lib/badgeAwardFlags", () => ({
  ownerBadgeShelfEnabled: false,
  memberBadgeProfileEnabled: false,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: MEMBER },
    session: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      state.from.push(table);
      throw new Error("member profile fetch must stay disabled while the flag is off");
    },
  },
}));

import GrowerBadgeProfile from "@/pages/GrowerBadgeProfile";
import { useMemberBadgeAwards } from "@/hooks/useMemberBadgeAwards";
import { MEMBER_BADGE_PROFILE_COPY } from "@/constants/memberBadgeProfileCopy";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.from = [];
});

describe("member badge profile display flag", () => {
  it("keeps the profile fetch disabled while memberBadgeProfileEnabled is off", () => {
    const { result } = renderHook(() => useMemberBadgeAwards(OWNER), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.status).toBe("pending");
    expect(state.from).toEqual([]);
  });

  it("shows the empty copy without touching Supabase when the flag is off", () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GrowerBadgeProfile profileUserId={OWNER} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(MEMBER_BADGE_PROFILE_COPY.empty)).toBeInTheDocument();
    expect(screen.queryByTestId("member-badge-list")).toBeNull();
    expect(state.from).toEqual([]);
  });
});
