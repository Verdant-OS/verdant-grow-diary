/**
 * Account Preferences — home view card (Simple/Advanced).
 *
 * The cards layout is the second entry point for the account-backed preference;
 * choosing Advanced must write auth metadata and confirm in the UI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import AccountPreferences from "@/pages/AccountPreferences";
import { resetUiViewPreferenceStoreForTest } from "@/lib/uiViewPreferenceService";
import { UI_VIEW_METADATA_KEY } from "@/lib/uiViewPreferenceRules";

const upsertSpy = vi.fn();

const authUiView = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
}));

const defaultAgreements = [
  {
    agreement_type: "terms",
    version: "2026-07-13",
    effective_date: "2026-07-13",
    accepted_at: "2026-07-13T10:00:00Z",
  },
];

function makeProfileChain(initialData: { marketing_opt_in: boolean } | null = null) {
  const result = { data: initialData, error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    single: () => Promise.resolve(result),
    upsert: (...args: unknown[]) => {
      upsertSpy(...args);
      return Promise.resolve({ data: null, error: null });
    },
  };
  return chain;
}

function makeAgreementChain(data: typeof defaultAgreements) {
  const result = { data, error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    then: (resolve: (r: typeof result) => unknown) => resolve(result),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => authUiView.getUser(...args),
      updateUser: (...args: unknown[]) => authUiView.updateUser(...args),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return makeProfileChain({ marketing_opt_in: false });
      }
      if (table === "user_agreement_acceptances") {
        return makeAgreementChain(defaultAgreements);
      }
      return makeProfileChain(null);
    },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "grower@example.com" } }),
}));

beforeEach(() => {
  resetUiViewPreferenceStoreForTest();
  window.localStorage.clear();
  upsertSpy.mockClear();
  authUiView.getUser.mockReset();
  authUiView.updateUser.mockReset();
  authUiView.getUser.mockResolvedValue({
    data: { user: { id: "u1", user_metadata: {} } },
    error: null,
  });
  authUiView.updateUser.mockImplementation(async (attrs: { data: Record<string, unknown> }) => ({
    data: { user: { id: "u1", user_metadata: { ...attrs.data } } },
    error: null,
  }));
});

afterEach(() => cleanup());

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/account/preferences"]}>
      <AccountPreferences />
    </MemoryRouter>,
  );
}

describe("Account Preferences — home view", () => {
  it("renders card choices once the account read settles", async () => {
    renderPage();
    const card = await screen.findByTestId("home-view-card");
    expect(within(card).getByRole("heading", { name: "Home view" })).toBeInTheDocument();
    expect(await within(card).findByTestId("ui-view-choice-simple")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(card).getByTestId("ui-view-choice-advanced")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("choosing Advanced writes auth metadata and shows a saved confirmation", async () => {
    renderPage();
    const card = await screen.findByTestId("home-view-card");
    fireEvent.click(await within(card).findByTestId("ui-view-choice-advanced"));
    await waitFor(() => expect(authUiView.updateUser).toHaveBeenCalledTimes(1));
    expect(authUiView.updateUser.mock.calls[0][0]).toMatchObject({
      data: { [UI_VIEW_METADATA_KEY]: "advanced" },
    });
    expect(await within(card).findByTestId("ui-view-switch-status")).toHaveTextContent(
      /Saved to your account/i,
    );
    expect(window.localStorage.getItem("verdant:uiView:u1")).toBe("advanced");
  });
});
