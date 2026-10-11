import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { BADGE_AWARD_COPY } from "@/constants/badgeAwardCopy";
import { OwnerBadgeShelf } from "@/components/OwnerBadgeShelf";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-badge-1", email: "x@example.invalid" },
    session: {},
    loading: false,
    signOut: vi.fn(),
  }),
}));

import Settings from "@/pages/Settings";

beforeEach(() => {
  try {
    clearLocalStorageForTest();
  } catch {
    /* ignore */
  }
});

const visibleAward = { badgeKey: "first_diary_entry", hiddenAt: null };

describe("OwnerBadgeShelf", () => {
  it("renders nothing while the display flag is off", () => {
    render(<OwnerBadgeShelf enabled={false} awards={[visibleAward]} />);
    expect(screen.queryByTestId("owner-badge-shelf")).not.toBeInTheDocument();
  });

  it("renders the documentation sentence for a visible award", () => {
    render(<OwnerBadgeShelf enabled awards={[visibleAward]} />);
    expect(screen.getByTestId("owner-badge-shelf")).toHaveAttribute(
      "aria-label",
      BADGE_AWARD_COPY.shelfLabel,
    );
    expect(screen.getByTestId("owner-badge-first-diary-entry")).toHaveTextContent(
      BADGE_AWARD_COPY.firstDiaryEntry,
    );
  });

  it("renders nothing when the only award is hidden", () => {
    render(
      <OwnerBadgeShelf
        enabled
        awards={[{ badgeKey: "first_diary_entry", hiddenAt: "2026-10-10T00:00:00Z" }]}
      />,
    );
    expect(screen.queryByTestId("owner-badge-shelf")).not.toBeInTheDocument();
  });

  it("does not mount the shelf on Settings while the flag is off", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("owner-badge-shelf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});
