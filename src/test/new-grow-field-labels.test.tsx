/**
 * Audit 2026-11-03 finding 12: New Grow's Type, Stage and Notes controls were
 * not exposed with clear labels in the accessibility tree. Each visible label
 * is now tied to its control, so assistive tech announces "Type", "Stage" and
 * "Notes (optional)" the same way it already announced "Name".
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, loading: false }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [],
    activeGrowId: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: FREE_CAPABILITIES },
    refetch: vi.fn(async () => undefined),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Grows from "@/pages/Grows";

async function openNewGrow() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Grows />
    </MemoryRouter>,
  );
  await user.click(screen.getByTestId("grows-new-button"));
}

describe("New grow dialog field labels", () => {
  it("names the Type and Stage pickers by their visible labels", async () => {
    await openNewGrow();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Stage" })).toBeInTheDocument();
  });

  it("names the notes field by its visible label", async () => {
    await openNewGrow();
    const notes = screen.getByLabelText("Notes (optional)");
    expect(notes.tagName).toBe("TEXTAREA");
  });

  it("keeps the Name field labelled as before", async () => {
    await openNewGrow();
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "placeholder",
      "Tent #1, Backyard, Mothers…",
    );
  });

  it("gives every labelled control a distinct id", async () => {
    await openNewGrow();
    const ids = ["Name", "Notes (optional)"]
      .map((name) => screen.getByLabelText(name).id)
      .concat(["Type", "Stage"].map((name) => screen.getByRole("combobox", { name }).id));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
