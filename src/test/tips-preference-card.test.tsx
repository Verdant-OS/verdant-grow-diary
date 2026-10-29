/**
 * Account Preferences › Tips (Simple View Phase 3), with the account behind
 * a fake auth client: the switch and "Bring back hidden tips" write the
 * account copy, controls wait for the account read, and a failed read offers
 * a retry instead of defaults that could overwrite the account.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import AccountPreferences from "@/pages/AccountPreferences";
import { forgetGuidanceState } from "@/lib/guidancePreferenceService";
import { GUIDANCE_COPY, GUIDANCE_METADATA_KEY } from "@/lib/simpleHomeGuidanceRules";

const NOW = "2026-10-29T12:00:00.000Z";
let metadata: Record<string, unknown> = {};
let readFails = false;
const updateUser = vi.fn(async (attrs: { data: Record<string, unknown> }) => {
  metadata = { ...metadata, ...attrs.data };
  return { data: { user: { id: "u1", user_metadata: metadata } }, error: null };
});

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "upsert"]) chain[k] = () => chain;
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.then = (resolve: (r: unknown) => unknown) => resolve({ data: [], error: null });
  return {
    supabase: {
      from: () => chain,
      auth: {
        getUser: async () =>
          readFails
            ? { data: null, error: new Error("offline") }
            : { data: { user: { id: "u1", user_metadata: metadata } }, error: null },
        updateUser: (attrs: { data: Record<string, unknown> }) => updateUser(attrs),
      },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "grower@example.com" } }),
}));

beforeEach(() => {
  forgetGuidanceState();
  updateUser.mockClear();
  metadata = {};
  readFails = false;
});

function renderTips() {
  render(
    <MemoryRouter initialEntries={["/account/preferences"]}>
      <AccountPreferences />
    </MemoryRouter>,
  );
  return screen.getByTestId("tips-card");
}

describe("Tips card", () => {
  it("defaults to on and turning it off writes only the tips key", async () => {
    const card = renderTips();
    const toggle = await within(card).findByRole("switch", {
      name: GUIDANCE_COPY.tipsSettingLabel,
    });
    expect(toggle).toBeChecked();
    expect(within(card).getByTestId("tips-restore")).toBeDisabled();
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(within(card).getByTestId("tips-save-status")).toHaveTextContent(GUIDANCE_COPY.saved),
    );
    expect(updateUser).toHaveBeenCalledWith({
      data: { [GUIDANCE_METADATA_KEY]: { v: 1, tips: "off", notices: {} } },
    });
    expect(toggle).not.toBeChecked();
  });

  it("Bring back hidden tips clears every notice and keeps the tips setting", async () => {
    metadata = {
      [GUIDANCE_METADATA_KEY]: {
        v: 1,
        tips: "off",
        notices: { "first-observation": { dismissCount: 3, dismissedAt: NOW, snoozedUntil: null } },
      },
    };
    const card = renderTips();
    const restore = await within(card).findByTestId("tips-restore");
    await waitFor(() => expect(restore).toBeEnabled());
    await userEvent.click(restore);
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({
        data: { [GUIDANCE_METADATA_KEY]: { v: 1, tips: "off", notices: {} } },
      }),
    );
  });

  it("a failed account read offers a retry and no controls that could overwrite it", async () => {
    readFails = true;
    const card = renderTips();
    expect(await within(card).findByText(GUIDANCE_COPY.accountUnavailable)).toBeInTheDocument();
    expect(within(card).queryByRole("switch")).toBeNull();
    readFails = false;
    await userEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(await within(card).findByRole("switch")).toBeChecked();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
