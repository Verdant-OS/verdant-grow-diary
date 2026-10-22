import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const OWNER = "5b0f6c1e-2a43-4c1d-9b7e-0d6a1f2e3c4d";
const MEMBER = "9e8d7c6b-5a49-4382-8170-6f5e4d3c2b1a";

const state = vi.hoisted(() => ({
  user: null as { id: string; is_anonymous?: boolean } | null,
  rows: [] as Array<Record<string, unknown>>,
  queryError: null as { message: string } | null,
  from: [] as string[],
}));

vi.mock("@/lib/badgeAwardFlags", () => ({
  ownerBadgeShelfEnabled: false,
  memberBadgeProfileEnabled: true,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: state.user, session: null, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    is() {
      return builder;
    },
    order() {
      return builder;
    },
    then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
      return Promise.resolve({ data: state.rows, error: state.queryError }).then(resolve);
    },
  };
  return {
    supabase: {
      from(table: string) {
        state.from.push(table);
        return builder;
      },
    },
  };
});

import GrowerBadgeProfile from "@/pages/GrowerBadgeProfile";
import { selectMemberProfileBadges } from "@/lib/memberBadgeProfileRules";
import { listMemberBadgeAwards } from "@/lib/memberBadgeProfileService";
import { MEMBER_BADGE_PROFILE_COPY } from "@/constants/memberBadgeProfileCopy";

function award(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    userId: OWNER,
    badgeKey: "first_diary_entry",
    firstRecognizedAt: "2026-10-01T00:00:00Z",
    hiddenAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function renderProfile(profileUserId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GrowerBadgeProfile profileUserId={profileUserId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.user = null;
  state.rows = [];
  state.queryError = null;
  state.from = [];
});

describe("member badge profile supplemental coverage", () => {
  it("breaks first_recognized_at ties by award id", () => {
    const sameDay = "2026-10-02T00:00:00Z";
    const rows = [
      award({ id: "z-last", badgeKey: "first_tent", firstRecognizedAt: sameDay }),
      award({ id: "a-first", badgeKey: "first_diary_entry", firstRecognizedAt: sameDay }),
    ];
    expect(selectMemberProfileBadges(rows, OWNER).map((badge) => badge.id)).toEqual([
      "a-first",
      "z-last",
    ]);
  });

  it("surfaces Supabase read failures instead of returning partial rows", async () => {
    state.queryError = { message: "permission denied" };
    await expect(listMemberBadgeAwards(OWNER)).rejects.toEqual({ message: "permission denied" });
  });

  it("shows the empty copy when the grower has no visible badges", async () => {
    state.user = { id: MEMBER };
    state.rows = [];
    renderProfile(OWNER);
    expect(await screen.findByText(MEMBER_BADGE_PROFILE_COPY.empty)).toBeInTheDocument();
    expect(screen.queryByTestId("member-badge-list")).toBeNull();
    expect(state.from).toEqual(["badge_awards"]);
  });

  it("shows the empty copy when every row is filtered out after read", async () => {
    state.user = { id: MEMBER };
    state.rows = [
      {
        id: "unknown",
        user_id: OWNER,
        badge_key: "top_grower",
        first_recognized_at: "2026-10-01T00:00:00Z",
        hidden_at: null,
        revoked_at: null,
      },
    ];
    renderProfile(OWNER);
    expect(await screen.findByText(MEMBER_BADGE_PROFILE_COPY.empty)).toBeInTheDocument();
    expect(screen.queryByTestId("member-badge-list")).toBeNull();
  });
});
