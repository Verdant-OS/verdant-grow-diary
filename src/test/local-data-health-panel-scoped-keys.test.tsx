/**
 * LocalDataHealthPanel — account-scoped Quick Log last-target keys.
 *
 * Slice D5 made the last-target memory account-scoped
 * (`verdant.quickLog.lastTarget.v2.<userId>`), so the panel's static key list
 * can no longer name it. This file proves the panel:
 *
 *  - discovers whatever scoped keys this device actually holds,
 *  - never renders the account uuid that is embedded in the key name,
 *  - no longer advertises the retired unscoped `…lastTarget.v1` key.
 *
 * Diary/RLS checks are skipped here by returning a signed-out session; this
 * file is only about the local half.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

import { LocalDataHealthPanel } from "@/components/LocalDataHealthPanel";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const ACCOUNT_A = "11111111-2222-3333-4444-555555555555";
const ACCOUNT_B = "99999999-8888-7777-6666-555555555555";
const RECORD = JSON.stringify({
  plantId: "p1",
  growId: "g1",
  tentId: "t1",
  savedAt: "2026-08-19T00:00:00.000Z",
});

beforeEach(() => clearLocalStorageForTest());
afterEach(() => cleanup());

describe("LocalDataHealthPanel — scoped Quick Log last-target keys", () => {
  it("lists one row per account present on the device", async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, RECORD);
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_B}`, RECORD);
    render(<LocalDataHealthPanel />);

    await waitFor(() => expect(screen.getByText("Browser storage available")).toBeInTheDocument());
    expect(
      screen.getByText("Quick Log last target (account 1 of 2 on this device)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Quick Log last target (account 2 of 2 on this device)"),
    ).toBeInTheDocument();
  });

  it("labels a single account plainly", async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, RECORD);
    render(<LocalDataHealthPanel />);

    await waitFor(() => expect(screen.getByText("Quick Log last target")).toBeInTheDocument());
  });

  it("never renders the account uuid embedded in the key name", async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, RECORD);
    const { container } = render(<LocalDataHealthPanel />);

    await waitFor(() => expect(screen.getByText("Quick Log last target")).toBeInTheDocument());
    // The key IS shown — with its account segment elided.
    expect(screen.getByText("key: verdant.quickLog.lastTarget.v2.<account>")).toBeInTheDocument();
    expect(container.textContent ?? "").not.toContain(ACCOUNT_A);
  });

  it("does not advertise the retired unscoped v1 key, even if one lingers", async () => {
    setLocalStorageItemForTest("verdant.quickLog.lastTarget.v1", RECORD);
    render(<LocalDataHealthPanel />);

    await waitFor(() => expect(screen.getByText("Browser storage available")).toBeInTheDocument());
    const list = screen.getByText("Browser storage available").closest("ul");
    expect(list).not.toBeNull();
    expect(within(list as HTMLElement).queryByText(/lastTarget\.v1/)).toBeNull();
    expect(screen.queryByText(/Quick Log last target/)).toBeNull();
  });

  it("shows no last-target row when the device holds none", async () => {
    render(<LocalDataHealthPanel />);

    await waitFor(() => expect(screen.getByText("Browser storage available")).toBeInTheDocument());
    expect(screen.queryByText(/Quick Log last target/)).toBeNull();
  });
});
