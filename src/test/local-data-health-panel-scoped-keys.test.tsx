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
  ensureLocalStorageForTest,
  getLocalStorageMethodOwnerForTest,
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const ACCOUNT_A = "11111111-2222-3333-4444-555555555555";
const ACCOUNT_B = "99999999-8888-7777-6666-555555555555";
const NOW_MS = Date.parse("2026-08-20T00:00:00.000Z");
const BACKUP_STORE_KEY = "verdant.diagnostics.local-backups.v1";
const PENDING_BACKUP_STORE_KEY = "verdant.diagnostics.local-backup-pending.v1";
const RECORD = JSON.stringify({
  plantId: "p1",
  growId: "g1",
  tentId: "t1",
  savedAt: "2026-08-19T00:00:00.000Z",
});

function makePreviousSnapshots(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const value = JSON.stringify({ previousSnapshot: index });
    return {
      id: `existing-backup-${index}`,
      createdAt: new Date(NOW_MS - index * 60_000).toISOString(),
      reason: "existing-test-backup",
      entries: [
        {
          key: `verdant.existing.test.${index}`,
          value,
          sizeBytes: value.length,
        },
      ],
    };
  });
}

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
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

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
    expect(screen.getByText(/can never be used again/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review & clear/i })).toBeEnabled();
  });
});

describe("LocalDataHealthPanel — a future timestamp is a fault, expiry is not", () => {
  // `resolveRecentTargetSuggestion` refuses a record stamped in the FUTURE
  // outright — a skewed clock is not evidence — while the panel's validator
  // only asked the parser, which accepts any readable timestamp. The record
  // therefore reported Pass while the suggestion silently never appeared:
  // a clean bill of health over an invisible failure.
  //
  // Pin every offset to one injected instant. This keeps the panel's boundary
  // deterministic without freezing RTL's own async clock.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const stampedAt = (offsetMs: number) =>
    JSON.stringify({
      plantId: "p1",
      growId: "g1",
      tentId: "t1",
      savedAt: new Date(NOW_MS + offsetMs).toISOString(),
    });

  it("warns on a record stamped in the future, and says what to do about it", async () => {
    setLocalStorageItemForTest(
      `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`,
      stampedAt(5 * DAY_MS),
    );
    render(<LocalDataHealthPanel now={() => NOW_MS} />);

    const row = await schemaRow("Quick Log last target");
    expect(within(row).getByText("Warn")).toBeInTheDocument();
    expect(row).toHaveTextContent("savedAt is in the future");
    expect(row).toHaveTextContent("temporarily");
    expect(row).toHaveTextContent("stored target remains intact");
    expect(row).not.toHaveTextContent("the stored value has no effect");

    expect(
      screen.getByText(
        "Check this device's date and time. Once the clock reaches the saved time, Quick Log can consider this target again; current grow, tent, and plant checks still apply. The stored target is intact, so no clearing is needed.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/can never be used again/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Review & clear/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Fix issues" })).toBeDisabled();
  });

  it("passes a record stamped exactly at the injected current time", async () => {
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, stampedAt(0));
    render(<LocalDataHealthPanel now={() => NOW_MS} />);

    const row = await schemaRow("Quick Log last target");
    expect(within(row).getByText("Pass")).toBeInTheDocument();
  });

  it("passes a record stamped moments ago — the positive control", async () => {
    // Differs from the case above in the SIGN of the offset and nothing else,
    // so a Warn there cannot be an artifact of the fixture.
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, stampedAt(-60_000));
    render(<LocalDataHealthPanel now={() => NOW_MS} />);

    const row = await schemaRow("Quick Log last target");
    expect(within(row).getByText("Pass")).toBeInTheDocument();
  });

  it("passes an EXPIRED record — ageing out is not a fault", async () => {
    // 30 days old: the suggestion is gone, and that is the record doing
    // exactly what it was designed to do. Reporting it as a failure would
    // spend the grower's attention on normal behaviour. Deliberate, and
    // pinned so a later change to the future-timestamp rule cannot quietly
    // start flagging ordinary expiry too.
    setLocalStorageItemForTest(
      `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`,
      stampedAt(-30 * DAY_MS),
    );
    render(<LocalDataHealthPanel now={() => NOW_MS} />);

    const row = await schemaRow("Quick Log last target");
    expect(within(row).getByText("Pass")).toBeInTheDocument();
  });

  it("still never renders the account uuid when reporting a future timestamp", async () => {
    setLocalStorageItemForTest(
      `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`,
      stampedAt(5 * DAY_MS),
    );
    const { container } = render(<LocalDataHealthPanel now={() => NOW_MS} />);

    await schemaRow("Quick Log last target");
    expect(container.textContent ?? "").not.toContain(ACCOUNT_A);
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

  it("shows a changed future record as a non-clearable clock mismatch in the drawer", async () => {
    const key = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    setLocalStorageItemForTest(key, "{}");
    render(<LocalDataHealthPanel now={() => NOW_MS} />);
    await schemaRow("Quick Log last target");

    // The value can change in another tab after the checklist was built. The
    // drawer must classify the current bytes rather than carry the old clear
    // recommendation forward.
    setLocalStorageItemForTest(
      key,
      JSON.stringify({
        plantId: "p1",
        growId: "g1",
        tentId: "t1",
        savedAt: "2026-08-20T00:00:00.001Z",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    const dialog = await screen.findByRole("dialog");

    expect(dialog).toHaveTextContent("Clock mismatch");
    expect(dialog).not.toHaveTextContent("Unusable shape");
    expect(dialog).toHaveTextContent("temporarily withholds this remembered target");
    expect(dialog).toHaveTextContent(
      "Check this device's date and time. If it is correct, wait for the current time to catch up. Keep this local record; no data needs to be cleared.",
    );
    expect(screen.getByRole("button", { name: "Nothing to clear" })).toBeDisabled();
    expect(getLocalStorageItemForTest(key)).not.toBeNull();
  });

  it("does not offer to clear a malformed record that became valid before review", async () => {
    const key = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    setLocalStorageItemForTest(key, "{}");
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    // The checks list is now stale. The drawer must classify the current
    // bytes and fail closed when there is no longer a destructive issue.
    setLocalStorageItemForTest(key, RECORD);
    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    const dialog = await screen.findByRole("dialog");

    expect(dialog).toHaveTextContent("No issue detected");
    expect(screen.getByRole("button", { name: "Nothing to clear" })).toBeDisabled();
    expect(getLocalStorageItemForTest(key)).toBe(RECORD);
  });

  it("revalidates reviewed bytes immediately before confirm-time deletion", async () => {
    const key = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    setLocalStorageItemForTest(key, "{}");
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: /Confirm — clear/i })).toBeEnabled();

    // Another document repairs the record after review but before the grower
    // confirms. Deleting the reviewed key list would erase healthy data.
    setLocalStorageItemForTest(key, RECORD);
    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(getLocalStorageItemForTest(key)).toBe(RECORD);
    expect(screen.queryByText(/Backup saved/)).toBeNull();
  });

  it("does not retain a backup for a key skipped by the final pre-delete comparison", async () => {
    const key = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    const backupStoreKey = "verdant.diagnostics.local-backups.v1";
    setLocalStorageItemForTest(key, "{}");
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    await screen.findByRole("dialog");

    // Simulate another tab repairing this key after the first confirm-time
    // validation, while the pre-clear backup is being persisted. The final
    // comparison must preserve the healthy bytes, and the stale bytes must
    // not remain available through Restore.
    const storage = ensureLocalStorageForTest();
    const methodOwner = getLocalStorageMethodOwnerForTest(storage, "setItem");
    const originalSetItem = methodOwner.setItem;
    let replacedDuringBackup = false;
    vi.spyOn(methodOwner, "setItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
      value: string,
    ) {
      originalSetItem.call(this, storageKey, value);
      if (
        !replacedDuringBackup &&
        (storageKey === backupStoreKey || storageKey === PENDING_BACKUP_STORE_KEY)
      ) {
        replacedDuringBackup = true;
        originalSetItem.call(this, key, RECORD);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(replacedDuringBackup).toBe(true);
    expect(getLocalStorageItemForTest(key)).toBe(RECORD);
    expect(screen.getByText(/Skipped 1 key/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    expect(JSON.parse(getLocalStorageItemForTest(backupStoreKey) ?? "[]")).toEqual([]);
  });

  it("preserves a full backup store when every final pre-delete comparison skips", async () => {
    const key = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    const previousSnapshots = makePreviousSnapshots(10);
    const previousStoreBytes = JSON.stringify(previousSnapshots);
    setLocalStorageItemForTest(BACKUP_STORE_KEY, previousStoreBytes);
    setLocalStorageItemForTest(key, "{}");
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(10);

    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    await screen.findByRole("dialog");

    // Replace the only clear candidate while its provisional backup is being
    // persisted. Since the final comparison skips it, no real backup was
    // added and retention must not evict any existing snapshot.
    const storage = ensureLocalStorageForTest();
    const methodOwner = getLocalStorageMethodOwnerForTest(storage, "setItem");
    const originalSetItem = methodOwner.setItem;
    let replacedDuringBackup = false;
    vi.spyOn(methodOwner, "setItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
      value: string,
    ) {
      originalSetItem.call(this, storageKey, value);
      if (
        !replacedDuringBackup &&
        (storageKey === BACKUP_STORE_KEY || storageKey === PENDING_BACKUP_STORE_KEY)
      ) {
        replacedDuringBackup = true;
        originalSetItem.call(this, key, RECORD);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(replacedDuringBackup).toBe(true);
    expect(getLocalStorageItemForTest(key)).toBe(RECORD);
    expect(screen.getByText(/Skipped 1 key/)).toBeInTheDocument();
    expect(getLocalStorageItemForTest(BACKUP_STORE_KEY)).toBe(previousStoreBytes);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(10);
  });

  it("does not clear when the provisional backup cannot be persisted", async () => {
    const key = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    const malformedValue = "{}";
    setLocalStorageItemForTest(key, malformedValue);
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    await screen.findByRole("dialog");

    const storage = ensureLocalStorageForTest();
    const methodOwner = getLocalStorageMethodOwnerForTest(storage, "setItem");
    const originalSetItem = methodOwner.setItem;
    const removeItemOwner = Object.prototype.hasOwnProperty.call(storage, "removeItem")
      ? storage
      : (Object.getPrototypeOf(storage) as Storage);
    const originalRemoveItem = removeItemOwner.removeItem;
    let targetRemoveAttempts = 0;
    vi.spyOn(methodOwner, "setItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
      value: string,
    ) {
      if (storageKey === BACKUP_STORE_KEY || storageKey === PENDING_BACKUP_STORE_KEY) {
        throw new DOMException("Backup quota exhausted", "QuotaExceededError");
      }
      originalSetItem.call(this, storageKey, value);
    });
    vi.spyOn(removeItemOwner, "removeItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
    ) {
      if (storageKey === key) targetRemoveAttempts += 1;
      originalRemoveItem.call(this, storageKey);
    });

    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(targetRemoveAttempts).toBe(0);
    expect(getLocalStorageItemForTest(key)).toBe(malformedValue);
    expect(getLocalStorageItemForTest(BACKUP_STORE_KEY)).toBeNull();
    expect(
      screen.getByText(/Could not clear — a reversible backup could not be saved/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cleared 1 local key/i)).toBeNull();
  });

  it("preserves a nine-snapshot store when every candidate is skipped", async () => {
    const key = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    const previousSnapshots = makePreviousSnapshots(9);
    const previousStoreBytes = JSON.stringify(previousSnapshots);
    setLocalStorageItemForTest(BACKUP_STORE_KEY, previousStoreBytes);
    setLocalStorageItemForTest(key, "{}");
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    await screen.findByRole("dialog");

    const storage = ensureLocalStorageForTest();
    const methodOwner = getLocalStorageMethodOwnerForTest(storage, "setItem");
    const originalSetItem = methodOwner.setItem;
    let replacedDuringBackup = false;
    vi.spyOn(methodOwner, "setItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
      value: string,
    ) {
      originalSetItem.call(this, storageKey, value);
      if (
        !replacedDuringBackup &&
        (storageKey === BACKUP_STORE_KEY || storageKey === PENDING_BACKUP_STORE_KEY)
      ) {
        replacedDuringBackup = true;
        originalSetItem.call(this, key, RECORD);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(replacedDuringBackup).toBe(true);
    expect(getLocalStorageItemForTest(key)).toBe(RECORD);
    expect(getLocalStorageItemForTest(BACKUP_STORE_KEY)).toBe(previousStoreBytes);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(9);
  });

  it("retains exactly ten snapshots after one successful clear at full capacity", async () => {
    const key = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    const malformedValue = "{}";
    const previousSnapshots = makePreviousSnapshots(10);
    setLocalStorageItemForTest(BACKUP_STORE_KEY, JSON.stringify(previousSnapshots));
    setLocalStorageItemForTest(key, malformedValue);
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(getLocalStorageItemForTest(key)).toBeNull();
    const stored = JSON.parse(getLocalStorageItemForTest(BACKUP_STORE_KEY) ?? "[]");
    expect(stored).toHaveLength(10);
    expect(stored[0].entries).toEqual([
      { key, value: malformedValue, sizeBytes: malformedValue.length },
    ]);
    expect(stored.slice(1).map((snapshot: { id: string }) => snapshot.id)).toEqual(
      previousSnapshots.slice(0, 9).map((snapshot) => snapshot.id),
    );
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(10);
  });

  it("finalizes only the cleared key and never restores over the skipped healthy key", async () => {
    const skippedKey = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    const clearedKey = "verdant.quickLogStarter.draft.v1";
    const clearedValue = "{ broken starter draft";
    const previousSnapshots = makePreviousSnapshots(10);
    setLocalStorageItemForTest(BACKUP_STORE_KEY, JSON.stringify(previousSnapshots));
    setLocalStorageItemForTest(skippedKey, "{}");
    setLocalStorageItemForTest(clearedKey, clearedValue);
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    fireEvent.click(screen.getByRole("button", { name: "Fix issues (2)" }));
    await screen.findByRole("dialog");

    const storage = ensureLocalStorageForTest();
    const methodOwner = getLocalStorageMethodOwnerForTest(storage, "setItem");
    const originalSetItem = methodOwner.setItem;
    let replacedDuringBackup = false;
    vi.spyOn(methodOwner, "setItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
      value: string,
    ) {
      originalSetItem.call(this, storageKey, value);
      if (
        !replacedDuringBackup &&
        (storageKey === BACKUP_STORE_KEY || storageKey === PENDING_BACKUP_STORE_KEY)
      ) {
        replacedDuringBackup = true;
        originalSetItem.call(this, skippedKey, RECORD);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear 2 keys/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(getLocalStorageItemForTest(clearedKey)).toBeNull();
    expect(getLocalStorageItemForTest(skippedKey)).toBe(RECORD);
    const stored = JSON.parse(getLocalStorageItemForTest(BACKUP_STORE_KEY) ?? "[]");
    expect(stored).toHaveLength(10);
    expect(stored[0].entries).toEqual([
      { key: clearedKey, value: clearedValue, sizeBytes: clearedValue.length },
    ]);
    expect(stored.slice(1).map((snapshot: { id: string }) => snapshot.id)).toEqual(
      previousSnapshots.slice(0, 9).map((snapshot) => snapshot.id),
    );
    expect(stored.map((snapshot: { id: string }) => snapshot.id)).not.toContain(
      previousSnapshots[9].id,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]);
    await waitFor(() => expect(getLocalStorageItemForTest(clearedKey)).toBe(clearedValue));
    expect(getLocalStorageItemForTest(skippedKey)).toBe(RECORD);
  });

  it("preserves the exact full store when every local removal throws", async () => {
    const key = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    const malformedValue = "{}";
    const previousStoreBytes = JSON.stringify(makePreviousSnapshots(10));
    setLocalStorageItemForTest(BACKUP_STORE_KEY, previousStoreBytes);
    setLocalStorageItemForTest(key, malformedValue);
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");
    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    await screen.findByRole("dialog");

    const storage = ensureLocalStorageForTest();
    const removeItemOwner = Object.prototype.hasOwnProperty.call(storage, "removeItem")
      ? storage
      : (Object.getPrototypeOf(storage) as Storage);
    const originalRemoveItem = removeItemOwner.removeItem;
    let targetRemoveAttempts = 0;
    vi.spyOn(removeItemOwner, "removeItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
    ) {
      if (storageKey === key) {
        targetRemoveAttempts += 1;
        throw new DOMException("Removal blocked", "SecurityError");
      }
      originalRemoveItem.call(this, storageKey);
    });

    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(targetRemoveAttempts).toBe(1);
    expect(getLocalStorageItemForTest(key)).toBe(malformedValue);
    expect(getLocalStorageItemForTest(BACKUP_STORE_KEY)).toBe(previousStoreBytes);
    expect(screen.getByText(/Failed to clear/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(10);
  });

  it("rolls back a cleared key when final backup persistence fails", async () => {
    const skippedKey = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    const clearedKey = "verdant.quickLogStarter.draft.v1";
    const clearedValue = "{ broken starter draft";
    const previousStoreBytes = JSON.stringify(makePreviousSnapshots(10));
    setLocalStorageItemForTest(BACKUP_STORE_KEY, previousStoreBytes);
    setLocalStorageItemForTest(skippedKey, "{}");
    setLocalStorageItemForTest(clearedKey, clearedValue);
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");
    fireEvent.click(screen.getByRole("button", { name: "Fix issues (2)" }));
    await screen.findByRole("dialog");

    const storage = ensureLocalStorageForTest();
    const methodOwner = getLocalStorageMethodOwnerForTest(storage, "setItem");
    const originalSetItem = methodOwner.setItem;
    let mainStoreWrites = 0;
    let replacedDuringBackup = false;
    vi.spyOn(methodOwner, "setItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
      value: string,
    ) {
      if (storageKey === BACKUP_STORE_KEY) {
        mainStoreWrites += 1;
        const pendingExists = this.getItem(PENDING_BACKUP_STORE_KEY) !== null;
        if (pendingExists || mainStoreWrites > 1) {
          throw new DOMException("Final backup write failed", "QuotaExceededError");
        }
      }
      originalSetItem.call(this, storageKey, value);
      if (
        !replacedDuringBackup &&
        (storageKey === BACKUP_STORE_KEY || storageKey === PENDING_BACKUP_STORE_KEY)
      ) {
        replacedDuringBackup = true;
        originalSetItem.call(this, skippedKey, RECORD);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear 2 keys/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(getLocalStorageItemForTest(clearedKey)).toBe(clearedValue);
    expect(getLocalStorageItemForTest(skippedKey)).toBe(RECORD);
    expect(getLocalStorageItemForTest(BACKUP_STORE_KEY)).toBe(previousStoreBytes);
    expect(screen.queryByText(/Backup saved/i)).toBeNull();
    expect(
      screen.getByText(
        /backup finalization failed.*cleared key was restored.*nothing remains cleared/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /Emergency Restore/i })).toBeNull();
  });

  it("quarantines only the still-cleared key when finalization and rollback fail", async () => {
    const skippedKey = `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`;
    const clearedKey = "verdant.quickLogStarter.draft.v1";
    const clearedValue = "{ broken starter draft";
    const previousStoreBytes = JSON.stringify(makePreviousSnapshots(10));
    setLocalStorageItemForTest(BACKUP_STORE_KEY, previousStoreBytes);
    setLocalStorageItemForTest(skippedKey, "{}");
    setLocalStorageItemForTest(clearedKey, clearedValue);
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");
    fireEvent.click(screen.getByRole("button", { name: "Fix issues (2)" }));
    await screen.findByRole("dialog");

    const storage = ensureLocalStorageForTest();
    const methodOwner = getLocalStorageMethodOwnerForTest(storage, "setItem");
    const originalSetItem = methodOwner.setItem;
    let mainStoreWrites = 0;
    let replacedDuringBackup = false;
    const setItemSpy = vi.spyOn(methodOwner, "setItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
      value: string,
    ) {
      if (storageKey === BACKUP_STORE_KEY) {
        mainStoreWrites += 1;
        const pendingExists = this.getItem(PENDING_BACKUP_STORE_KEY) !== null;
        if (pendingExists || mainStoreWrites > 1) {
          throw new DOMException("Final backup write failed", "QuotaExceededError");
        }
      }
      if (storageKey === clearedKey) {
        throw new DOMException("Rollback write failed", "QuotaExceededError");
      }
      originalSetItem.call(this, storageKey, value);
      if (
        !replacedDuringBackup &&
        (storageKey === BACKUP_STORE_KEY || storageKey === PENDING_BACKUP_STORE_KEY)
      ) {
        replacedDuringBackup = true;
        originalSetItem.call(this, skippedKey, RECORD);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /Confirm — clear 2 keys/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(getLocalStorageItemForTest(clearedKey)).toBeNull();
    expect(getLocalStorageItemForTest(skippedKey)).toBe(RECORD);
    expect(getLocalStorageItemForTest(BACKUP_STORE_KEY)).toBe(previousStoreBytes);
    const quarantine = JSON.parse(getLocalStorageItemForTest(PENDING_BACKUP_STORE_KEY) ?? "null");
    expect(quarantine.state).toBe("emergency");
    expect(quarantine.snapshot.entries).toEqual([
      { key: clearedKey, value: clearedValue, sizeBytes: clearedValue.length },
    ]);
    expect(screen.queryByText(/Backup saved/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Emergency Restore\/Retry/i })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(10);

    setItemSpy.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: /Emergency Restore\/Retry/i }));
    await waitFor(() => expect(getLocalStorageItemForTest(clearedKey)).toBe(clearedValue));
    expect(getLocalStorageItemForTest(skippedKey)).toBe(RECORD);
    expect(screen.queryByRole("button", { name: /Emergency Restore\/Retry/i })).toBeNull();
  });

  it("whitelists scoped field metadata and omits an unversioned v value", async () => {
    const PRIVATE_FIELD_NAME = "grower@example.com";
    const PRIVATE_VERSION_VALUE = "private grower note";
    setLocalStorageItemForTest(
      `verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`,
      JSON.stringify({
        [PRIVATE_FIELD_NAME]: "private value",
        v: PRIVATE_VERSION_VALUE,
      }),
    );
    render(<LocalDataHealthPanel />);
    await schemaRow("Quick Log last target");

    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    const dialog = await screen.findByRole("dialog");

    expect(dialog).toHaveTextContent("Unusable shape");
    expect(dialog.textContent ?? "").not.toContain(PRIVATE_FIELD_NAME);
    expect(dialog.textContent ?? "").not.toContain(PRIVATE_VERSION_VALUE);
    expect(within(dialog).queryByText("Found version")).toBeNull();
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

  it("withholds the JSON parser error, which can quote the stored value", async () => {
    // V8's SyntaxError message includes an excerpt of the offending input, so
    // echoing it would put the stored value on screen — the exact thing this
    // panel's header promises it never does.
    const SECRET = "plant-7f3a-grower-private-note";
    const LEAKED_EXCERPT = "plant-7f3a";
    setLocalStorageItemForTest(`verdant.quickLog.lastTarget.v2.${ACCOUNT_A}`, SECRET);
    const { container } = render(<LocalDataHealthPanel />);

    const row = await schemaRow("Quick Log last target");
    expect(within(row).getByText("Fail")).toBeInTheDocument();
    expect(row).toHaveTextContent("not valid JSON");
    expect(row).toHaveTextContent("parser error is withheld");
    expect(container.textContent ?? "").not.toContain(LEAKED_EXCERPT);

    // And not through the drawer either.
    fireEvent.click(screen.getByRole("button", { name: /Review & clear/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(document.body.textContent ?? "").not.toContain(LEAKED_EXCERPT);
  });

  it("proves the withheld text really would have leaked", () => {
    // Control: without this the assertion above could pass for any reason.
    const SECRET = "plant-7f3a-grower-private-note";
    let message = "";
    try {
      JSON.parse(SECRET);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("plant-7f3a");
  });
});
