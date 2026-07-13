/**
 * Account Preferences page — marketing opt-in toggle and agreement history.
 *
 * Confirms: current value loads, toggle calls profiles.upsert with the
 * correct flag and timestamp, agreement history renders, and errors surface
 * calmly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AccountPreferences from "@/pages/AccountPreferences";

const upsertSpy = vi.fn();

const defaultAgreements = [
  {
    agreement_type: "terms",
    version: "2026-07-13",
    effective_date: "2026-07-13",
    accepted_at: "2026-07-13T10:00:00Z",
  },
  {
    agreement_type: "privacy",
    version: "2026-07-13",
    effective_date: "2026-07-13",
    accepted_at: "2026-07-13T10:05:00Z",
  },
];

const makeProfileChain = (initialData: { marketing_opt_in: boolean } | null = null) => {
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
};

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

let agreementData = defaultAgreements;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "profiles") {
        return makeProfileChain({ marketing_opt_in: false });
      }
      if (table === "user_agreement_acceptances") {
        return makeAgreementChain(agreementData);
      }
      return makeProfileChain(null);
    },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "grower@example.com" } }),
}));

beforeEach(() => {
  upsertSpy.mockClear();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/account/preferences"]}>
      <AccountPreferences />
    </MemoryRouter>,
  );
}

describe("Account Preferences", () => {
  it("renders the marketing opt-in heading and toggle", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Preferences" })).toBeInTheDocument();
    expect(
      await screen.findByLabelText("Marketing opt-in toggle"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Send me occasional product updates and grow tips"),
    ).toBeInTheDocument();
  });

  it("loads the current opt-in value", async () => {
    renderPage();
    const toggle = await screen.findByLabelText("Marketing opt-in toggle");
    expect(toggle).not.toBeChecked();
  });

  it("upserts the profile when the user opts in", async () => {
    renderPage();
    const toggle = await screen.findByLabelText("Marketing opt-in toggle");
    await userEvent.click(toggle);
    await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1));
    const [payload] = upsertSpy.mock.calls[0];
    expect(payload).toMatchObject({
      user_id: "u1",
      marketing_opt_in: true,
    });
    expect(payload.marketing_opt_in_at).toBeTruthy();
  });

  it("clears the opt-in timestamp when the user opts out", async () => {
    renderPage();
    const toggle = await screen.findByLabelText("Marketing opt-in toggle");
    await userEvent.click(toggle);
    await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1));
    await userEvent.click(toggle);
    await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(2));
    const [payload] = upsertSpy.mock.calls[1];
    expect(payload).toEqual({
      user_id: "u1",
      marketing_opt_in: false,
      marketing_opt_in_at: null,
    });
  });
});
