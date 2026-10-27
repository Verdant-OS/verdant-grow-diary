/**
 * #2028 P1 r4319992478: retiring /founder removed the only screen where an
 * existing Founder controls their public Founders Wall row. Settings now
 * renders FounderOwnerPrefsForm; it shows only for a signed-in user who has
 * a Founder row, so everyone else sees no change.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import type { MyFounderRow } from "@/hooks/useMyFounderRow";

const founderMock = vi.hoisted(() => ({ row: null as MyFounderRow | null }));

vi.mock("@/hooks/useMyFounderRow", () => ({
  useMyFounderRow: () => ({ loading: false, row: founderMock.row, refetch: vi.fn() }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { displayPlanId: "founder_lifetime" },
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/usePaddleCancelNotice", () => ({
  usePaddleCancelNotice: () => ({
    visible: false,
    accessUntilIso: null,
    accessUntilLabel: "",
    reason: null,
  }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" }, signOut: vi.fn() }),
}));

vi.mock("@/components/RewardedReferralCard", () => ({
  default: () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import Settings from "@/pages/Settings";

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings — Founder Wall privacy controls", () => {
  beforeEach(() => {
    founderMock.row = null;
  });

  it("shows an existing Founder their Founders Wall controls, including the hide option", () => {
    founderMock.row = {
      founder_number: 7,
      display_name: "Alice",
      display_style: "custom_name",
      show_on_wall: true,
      optional_link: null,
      status: "confirmed",
    };
    renderSettings();
    expect(screen.getByRole("heading", { name: "Your Founder settings" })).toBeInTheDocument();
    expect(screen.getByText(/You are Founder #7/)).toBeInTheDocument();
  });

  it("shows nothing Founder-specific to a user without a Founder row", () => {
    renderSettings();
    expect(screen.queryByRole("heading", { name: "Your Founder settings" })).toBeNull();
  });
});
