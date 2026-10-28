import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Cut 001 AC7: a signed-in member sees another grower's active badges on a
// profile page. Logged-out and anonymous visitors see none. Evidence photos
// stay owner-only (AC11, member access to evidence, is NOT_IMPLEMENTED).

const OWNER = "5b0f6c1e-2a43-4c1d-9b7e-0d6a1f2e3c4d";
const MEMBER = "9e8d7c6b-5a49-4382-8170-6f5e4d3c2b1a";

const state = vi.hoisted(() => ({
  user: null as { id: string; is_anonymous?: boolean } | null,
  rows: [] as Array<Record<string, unknown>>,
  from: [] as string[],
  selects: [] as string[],
  eqs: [] as Array<[string, unknown]>,
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
    select(columns: string) {
      state.selects.push(columns);
      return builder;
    },
    eq(column: string, value: unknown) {
      state.eqs.push([column, value]);
      return builder;
    },
    is() {
      return builder;
    },
    order() {
      return builder;
    },
    then(resolve: (value: { data: unknown; error: null }) => unknown) {
      return Promise.resolve({ data: state.rows, error: null }).then(resolve);
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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GrowerBadgeProfile from "@/pages/GrowerBadgeProfile";
import { isProfileUserId, selectMemberProfileBadges } from "@/lib/memberBadgeProfileRules";
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
  state.from = [];
  state.selects = [];
  state.eqs = [];
});

describe("member badge profile rules", () => {
  it("accepts only a UUID profile id", () => {
    expect(isProfileUserId(OWNER)).toBe(true);
    expect(isProfileUserId("not-a-uuid")).toBe(false);
    expect(isProfileUserId("")).toBe(false);
    expect(isProfileUserId(undefined)).toBe(false);
  });

  it("keeps only this grower's active, known badges in a stable order", () => {
    const rows = [
      award({ id: "b", badgeKey: "first_tent", firstRecognizedAt: "2026-10-02T00:00:00Z" }),
      award({
        id: "a",
        badgeKey: "first_recorded_harvest",
        firstRecognizedAt: "2026-10-02T00:00:00Z",
      }),
      award({ id: "c", firstRecognizedAt: "2026-10-01T00:00:00Z" }),
      award({ id: "hidden", badgeKey: "setup_documented", hiddenAt: "2026-10-03T00:00:00Z" }),
      award({ id: "revoked", badgeKey: "setup_documented", revokedAt: "2026-10-03T00:00:00Z" }),
      award({ id: "other", userId: MEMBER }),
      award({ id: "unknown", badgeKey: "top_grower" }),
    ];
    expect(selectMemberProfileBadges(rows, OWNER).map((badge) => badge.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(selectMemberProfileBadges(rows, "not-a-uuid")).toEqual([]);
    expect(selectMemberProfileBadges(rows, null)).toEqual([]);
  });

  it("member copy names no skill, rank, yield, safety or verification", () => {
    const lines = Object.values(MEMBER_BADGE_PROFILE_COPY);
    expect(lines.every((line) => !/\b(skill|rank|yield|safety|verified)\b/i.test(line))).toBe(true);
  });
});

describe("member badge profile service", () => {
  it("reads award rows only, never evidence or photo columns", async () => {
    state.rows = [
      {
        id: "a1",
        user_id: OWNER,
        badge_key: "first_tent",
        first_recognized_at: "2026-10-01T00:00:00Z",
        hidden_at: null,
        revoked_at: null,
      },
    ];
    const rows = await listMemberBadgeAwards(OWNER);
    expect(state.from).toEqual(["badge_awards"]);
    expect(state.selects.join(",")).not.toMatch(/evidence|photo/);
    expect(state.eqs).toContainEqual(["user_id", OWNER]);
    expect(rows).toEqual([award({ badgeKey: "first_tent" })]);
  });
});

describe("GrowerBadgeProfile page", () => {
  it("shows another grower's badges to a signed-in member, with no photos", async () => {
    state.user = { id: MEMBER };
    state.rows = [
      {
        id: "a1",
        user_id: OWNER,
        badge_key: "first_recorded_harvest",
        first_recognized_at: "2026-10-01T00:00:00Z",
        hidden_at: null,
        revoked_at: null,
      },
    ];
    const { container } = renderProfile(OWNER);
    expect(
      await screen.findByText(MEMBER_BADGE_PROFILE_COPY.firstRecordedHarvest),
    ).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(state.from).toEqual(["badge_awards"]);
  });

  it("shows no badges and makes no read for a logged-out visitor", async () => {
    state.user = null;
    state.rows = [{ id: "a1", user_id: OWNER, badge_key: "first_tent" }];
    renderProfile(OWNER);
    expect(screen.queryByTestId("member-badge-list")).toBeNull();
    expect(screen.getByText(MEMBER_BADGE_PROFILE_COPY.signedOut)).toBeInTheDocument();
    expect(state.from).toEqual([]);
  });

  it("treats an anonymous session as logged out", async () => {
    state.user = { id: MEMBER, is_anonymous: true };
    renderProfile(OWNER);
    expect(screen.queryByTestId("member-badge-list")).toBeNull();
    expect(state.from).toEqual([]);
  });

  it("makes no read for a malformed profile id", async () => {
    state.user = { id: MEMBER };
    renderProfile("../evidence");
    expect(screen.queryByTestId("member-badge-list")).toBeNull();
    expect(state.from).toEqual([]);
  });
});
