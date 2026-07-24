/**
 * CultivarFollowButton — sign-in prompt, follow toggle, and updated-nudge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";

let currentUser: { id: string } | null = { id: "user-1" };
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: currentUser, loading: false }) }));

let maybeSingleResult: { data: unknown; error: unknown } = { data: null, error: null };
const upsertSpy = vi.fn();
const deleteSpy = vi.fn();
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(maybeSingleResult),
    upsert: (...a: unknown[]) => {
      upsertSpy(...a);
      return Promise.resolve({ data: null, error: null });
    },
    delete: () => {
      deleteSpy();
      return chain;
    },
    update: () => chain,
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
  });
  return { supabase: { from: () => chain } };
});

import CultivarFollowButton from "@/components/CultivarFollowButton";

const cultivar = VERDANT_CULTIVARS.find((c) => c.slug === "og-kush")!;

function renderButton() {
  return render(
    <MemoryRouter>
      <CultivarFollowButton cultivar={cultivar} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  currentUser = { id: "user-1" };
  maybeSingleResult = { data: null, error: null };
  upsertSpy.mockClear();
  deleteSpy.mockClear();
});
afterEach(cleanup);

describe("CultivarFollowButton", () => {
  it("prompts sign-in when signed out", () => {
    currentUser = null;
    renderButton();
    expect(screen.getByTestId("cultivar-follow-signin")).toHaveAttribute("href", "/auth");
    expect(screen.queryByTestId("cultivar-follow-button")).toBeNull();
  });

  it("lets a signed-in grower follow (persists) and flips to Following", async () => {
    renderButton();
    const btn = await screen.findByTestId("cultivar-follow-button");
    expect(btn).toHaveTextContent("Follow");
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByTestId("cultivar-follow-button")).toHaveTextContent("Following"),
    );
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cultivar_slug: "og-kush", seen_guide_version: cultivar.guideVersion }),
      expect.objectContaining({ onConflict: "user_id,cultivar_slug" }),
    );
  });

  it("shows the updated nudge when the guide advanced past what was seen", async () => {
    maybeSingleResult = { data: { seen_guide_version: 0 }, error: null }; // current guideVersion (1) > 0
    renderButton();
    await waitFor(() =>
      expect(screen.getByTestId("cultivar-follow-updated-badge")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("cultivar-follow-button")).toHaveTextContent("Following");
    expect(screen.getByTestId("cultivar-follow-mark-seen")).toBeInTheDocument();
  });

  it("shows no nudge when the seen version is current", async () => {
    maybeSingleResult = { data: { seen_guide_version: cultivar.guideVersion }, error: null };
    renderButton();
    await screen.findByTestId("cultivar-follow-button");
    expect(screen.queryByTestId("cultivar-follow-updated-badge")).toBeNull();
  });
});
