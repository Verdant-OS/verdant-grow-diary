import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const awards = vi.hoisted(() => ({
  rows: [] as Array<{
    badgeKey: string;
    hiddenAt: string | null;
    revokedAt: string | null;
    userId: string;
  }>,
}));

vi.mock("@/lib/badgeAwardFlags", () => ({
  ownerBadgeShelfEnabled: true,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-badge-1", email: "x@example.invalid" },
    session: {},
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/useOwnerBadgeAwards", () => ({
  useOwnerBadgeAwards: () => ({ data: awards.rows }),
}));

import { OwnerBadgeShelfMount } from "@/components/OwnerBadgeShelf";

describe("OwnerBadgeShelf query user id", () => {
  beforeEach(() => {
    awards.rows = [];
  });

  it("passes the signed-in user id into the shelf", () => {
    awards.rows = [
      {
        badgeKey: "first_diary_entry",
        hiddenAt: null,
        revokedAt: null,
        userId: "user-badge-1",
      },
    ];
    render(<OwnerBadgeShelfMount />);
    expect(screen.getByTestId("owner-badge-shelf")).toBeInTheDocument();
  });

  it("hides another grower's award when the query shelf passes the signed-in user id", () => {
    awards.rows = [
      {
        badgeKey: "first_diary_entry",
        hiddenAt: null,
        revokedAt: null,
        userId: "user-other",
      },
    ];
    render(<OwnerBadgeShelfMount />);
    expect(screen.queryByTestId("owner-badge-shelf")).not.toBeInTheDocument();
  });
});
