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
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

import { LocalDataHealthPanel } from "@/components/LocalDataHealthPanel";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
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

/**
 * The checks list and the remediation checklist both render a check's name, so
 * an unscoped text query matches twice as soon as a row becomes fixable. Scope
 * every lookup to the checks list.
 */
async function checksList(): Promise<HTMLElement> {
  const anchor = await screen.findByText("Browser storage available");
  const list = anchor.closest("ul");
  expect(list).not.toBeNull();
  return list as HTMLElement;
}

async function schemaRow(name: string): Promise<HTMLElement> {
  const row = within(await checksList())
    .getByText(name)
    .closest("li");
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

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

    expect(await schemaRow("Quick Log last target")).toBeInTheDocument();
  });

  it("never renders the account uuid embedded in the key name", async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, RECORD);
    const { container } = render(<LocalDataHealthPanel />);

    await schemaRow("Quick Log last target");
    // The key IS shown — with its account segment elided.
    expect(screen.getByText("key: verdant.quickLog.lastTarget.v2.<account>")).toBeInTheDocument();
    expect(container.textContent ?? "").not.toContain(ACCOUNT_A);
  });

  it("does not advertise the retired unscoped v1 key, even if one lingers", async () => {
    setLocalStorageItemForTest("verdant.quickLog.lastTarget.v1", RECORD);
    render(<LocalDataHealthPanel />);

    await waitFor(() => expect(screen.getByText("Browser storage available")).toBeInTheDocument());
    const list = await checksList();
    expect(within(list).queryByText(/lastTarget\.v1/)).toBeNull();
    expect(screen.queryByText(/Quick Log last target/)).toBeNull();
  });

  it("shows no last-target row when the device holds none", async () => {
    render(<LocalDataHealthPanel />);

    await waitFor(() => expect(screen.getByText("Browser storage available")).toBeInTheDocument());
    expect(screen.queryByText(/Quick Log last target/)).toBeNull();
  });
});

describe("LocalDataHealthPanel — a malformed scoped record is never reported healthy", () => {
  it("warns on valid JSON that the record parser rejects", async () => {
    // `{}` parses fine. `parseRecentTargetRecord` rejects it, so Quick Log
    // silently offers nothing — the exact shape of failure a diagnostics card
    // exists to make visible.
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, "{}");
    render(<LocalDataHealthPanel />);

    const row = await schemaRow("Quick Log last target");
    expect(within(row).getByText("Warn")).toBeInTheDocument();
    expect(row).toHaveTextContent("missing a usable plantId/savedAt pair");
    expect(row).toHaveTextContent("the stored value has no effect");
  });

  it("warns on a record missing savedAt", async () => {
    setLocalStorageItemForTest(
      `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`,
      JSON.stringify({ plantId: "p1", growId: "g1", tentId: "t1" }),
    );
    render(<LocalDataHealthPanel />);

    const row = await schemaRow("Quick Log last target");
    expect(within(row).getByText("Warn")).toBeInTheDocument();
  });

  it("warns on a nonempty but unreadable savedAt", async () => {
    // `"whenever"` is a nonempty string, so a shape-only check called this
    // healthy while Quick Log silently offered nothing. The parser now
    // requires a timestamp Date.parse can actually read.
    setLocalStorageItemForTest(
      `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`,
      JSON.stringify({ plantId: "p1", growId: "g1", tentId: "t1", savedAt: "whenever" }),
    );
    render(<LocalDataHealthPanel />);

    const row = await schemaRow("Quick Log last target");
    expect(within(row).getByText("Warn")).toBeInTheDocument();
  });

  it("passes a well-formed record", async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, RECORD);
    render(<LocalDataHealthPanel />);

    const row = await schemaRow("Quick Log last target");
    expect(within(row).getByText("Pass")).toBeInTheDocument();
  });

  it("offers honest remediation copy rather than the version-mismatch default", async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, "{}");
    render(<LocalDataHealthPanel />);

    await schemaRow("Quick Log last target");
    // The canned warn copy would claim a future migration handles this. It
    // does not — nothing will ever read this value again.
    expect(screen.queryByText(/A future migration will handle it automatically/)).toBeNull();
    expect(screen.getByText(/does not match the shape this build expects/)).toBeInTheDocument();
  });
});

describe("LocalDataHealthPanel — the account uuid survives no fallback path", () => {
  it("keeps the label redacted when the key vanishes between the run and the drawer", async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, "{}");
    const { container } = render(<LocalDataHealthPanel />);

    await schemaRow("Quick Log last target");

    // Another tab (or DevTools) removes the key after the run. Rediscovery in
    // the drawer now finds no descriptor for it.
    clearLocalStorageForTest();

    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    expect(container.textContent ?? "").not.toContain(ACCOUNT_A);
    expect(document.body.textContent ?? "").not.toContain(ACCOUNT_A);
  });

  it('reports the shape problem in the drawer, not "no issue detected"', async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, "{}");
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    const dialog = await screen.findByRole("dialog");

    // The drawer opened BECAUSE of this problem; saying otherwise contradicts
    // the row the grower just clicked.
    expect(within(dialog).queryByText(/No validation issue detected/)).toBeNull();
    expect(dialog).toHaveTextContent("Unusable shape");
    expect(dialog).toHaveTextContent("missing a usable plantId/savedAt pair");
  });

  it('still says "no issue detected" for a well-formed record', async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, RECORD);
    // Nothing is fixable, so reach the drawer through a second, broken key.
    setLocalStorageItemForTest("verdant.quickLogStarter.draft.v1", "{ not json");
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/Unusable shape/)).toBeNull();
  });

  it("keeps it redacted through the whole clear flow, including the backup list", async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, "{}");
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    // Checklist → review drawer → confirm → notice + backup row. Every one of
    // those renders a storage key somewhere.
    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(document.body.textContent ?? "").not.toContain(ACCOUNT_A);

    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear/i }));
    await waitFor(() => expect(screen.getByText(/Backup saved/)).toBeInTheDocument());

    // The value really is gone, and no stage of the flow printed the account.
    expect(getLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`)).toBeNull();
    expect(document.body.textContent ?? "").not.toContain(ACCOUNT_A);
  });
});
