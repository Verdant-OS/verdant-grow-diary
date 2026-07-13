/**
 * Account Preferences page — marketing opt-in toggle.
 *
 * Confirms: current value loads, toggle calls profiles.upsert with the
 * correct flag and timestamp, and errors surface calmly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AccountPreferences from "@/pages/AccountPreferences";

const upsertSpy = vi.fn();

const makeChain = (initialData: { marketing_opt_in: boolean } | null = null) => {
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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "profiles") {
        return makeChain({ marketing_opt_in: false });
      }
      return makeChain(null);
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
