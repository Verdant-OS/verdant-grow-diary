/**
 * Codex P1 on #2196 at ca86b0f8e ("Claim the pending Photo-only attempt
 * before awaiting its insert"): the session recovery fence used to be written
 * only after createQuickLogPhotoDiaryEntry returned ambiguous. While the first
 * insert was still pending, an SPA unmount + remount of the same plant had a
 * fresh in-flight ref and no session lock, so a second Save uploaded another
 * object and inserted a second UUID. Both rows could commit.
 *
 * The exact scope and entry id must be claimed durably BEFORE the insert is
 * awaited, kept through pending and ambiguous outcomes, and released only on
 * confirmed success or a definitive non-commit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as recoveryModule from "@/lib/quickLogPhotoAttachmentRecovery";
import {
  getQuickLogPhotoAttachmentRecoveryRecord,
  hasQuickLogPhotoAttachmentRecoveryLock,
} from "@/lib/quickLogPhotoAttachmentRecovery";

/**
 * A page reload ends every in-flight attempt but keeps sessionStorage. The
 * module's per-page memory is reset to model that; storage is left as is.
 */
function simulatePageReload() {
  (
    recoveryModule as { resetQuickLogPhotoAttachmentRecoveryMemoryForTests?: () => void }
  ).resetQuickLogPhotoAttachmentRecoveryMemoryForTests?.();
}

type InsertResult = { data: null; error: { message: string; code?: string } | null };
type UploadResult = { data: { path: string } | null; error: { message: string } | null };

const state: {
  insertCalls: Array<Record<string, unknown>>;
  insertGates: Array<(value: InsertResult) => void>;
  uploadPaths: string[];
  uploadGates: Array<(value: UploadResult) => void>;
  uploadRejects: Array<(reason: unknown) => void>;
  deferUploads: boolean;
  removedPaths: string[];
  readableRowId: string | null;
  deferLookups: boolean;
  lookupGates: Array<() => void>;
} = {
  insertCalls: [],
  insertGates: [],
  uploadPaths: [],
  uploadGates: [],
  uploadRejects: [],
  deferUploads: false,
  removedPaths: [],
  readableRowId: null,
  deferLookups: false,
  lookupGates: [],
};

const { trackMock } = vi.hoisted(() => ({ trackMock: vi.fn() }));

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: async () => ({ ok: true, growEventId: "ge-1", reused: false }),
    saving: false,
    error: null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (path: string) => {
          state.uploadPaths.push(path);
          if (!state.deferUploads) return Promise.resolve({ data: { path }, error: null });
          return new Promise((resolve, reject) => {
            state.uploadGates.push(resolve);
            state.uploadRejects.push(reject);
          });
        },
        remove: async (paths: string[]) => {
          state.removedPaths.push(...paths);
          return { data: null, error: null };
        },
      }),
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        state.insertCalls.push(row);
        return new Promise((resolve) => {
          state.insertGates.push(resolve);
        });
      },
      update: () => {
        const chain = {
          eq: () => chain,
          filter: () => chain,
          select: () => Promise.resolve({ data: [{ id: "diary-1" }], error: null }),
        };
        return chain;
      },
      select: () => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return chain;
          },
          maybeSingle: async () => {
            if (state.deferLookups) {
              await new Promise<void>((resolve) => {
                state.lookupGates.push(resolve);
              });
            }
            return {
              data:
                state.readableRowId !== null &&
                filters.id === state.readableRowId &&
                filters.user_id === "user-test-1"
                  ? { id: state.readableRowId }
                  : null,
              error: null,
            };
          },
        };
        return chain;
      },
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-test-1" } }),
}));

vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: [] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: trackMock,
}));

import PlantQuickLog from "@/components/PlantQuickLog";

const SCOPE = {
  ownerId: "user-test-1",
  growId: "grow-1",
  tentId: "tent-1",
  plantId: "plant-1",
} as const;

let entryCreatedEvents: unknown[] = [];
const onEntryCreated = (event: Event) => {
  entryCreatedEvents.push((event as CustomEvent).detail);
};

function sheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={() => {}}
        plantId="plant-1"
        plantName="Plant 1"
        growId="grow-1"
        tentId="tent-1"
      />
    </QueryClientProvider>
  );
}

async function choosePhotoOnly() {
  const library = document.getElementById(
    "plant-quick-log-photo-library-input",
  ) as HTMLInputElement;
  const photo = new File([new Uint8Array([1, 2, 3])], "leaf.jpg", { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(library, { target: { files: [photo] } });
  });
  fireEvent.click(screen.getByRole("button", { name: /log action photo only/i }));
}

async function settle(ms = 40) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Start the first attempt, then unmount while its insert is still pending. */
async function startFirstAttemptAndUnmount() {
  const view = render(sheet());
  await choosePhotoOnly();
  fireEvent.click(screen.getByTestId("plant-quick-log-save"));
  await waitFor(() => expect(state.insertCalls).toHaveLength(1));
  const firstId = state.insertCalls[0]?.id as string;
  view.unmount();
  return firstId;
}

/** Remount the same plant and try to save again before the first insert settles. */
async function remountAndAttemptSecondSave() {
  render(sheet());
  await settle();
  await choosePhotoOnly();
  fireEvent.click(screen.getByTestId("plant-quick-log-save"));
  await settle();
}

beforeEach(() => {
  state.insertCalls = [];
  state.insertGates = [];
  state.uploadPaths = [];
  state.uploadGates = [];
  state.uploadRejects = [];
  state.deferUploads = false;
  state.removedPaths = [];
  state.readableRowId = null;
  state.deferLookups = false;
  state.lookupGates = [];
  trackMock.mockClear();
  entryCreatedEvents = [];
  window.addEventListener("verdant:entry-created", onEntryCreated);
  window.sessionStorage.clear();
  simulatePageReload();
  if (typeof URL.createObjectURL !== "function") {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => "blob:mock-preview",
    );
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
  }
});

afterEach(() => {
  window.removeEventListener("verdant:entry-created", onEntryCreated);
  vi.restoreAllMocks();
});

describe("Photo only claims its exact scope and id before awaiting the insert", () => {
  it("records the session claim for the exact entry id while the insert is pending", async () => {
    const firstId = await startFirstAttemptAndUnmount();

    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(true);
    expect(getQuickLogPhotoAttachmentRecoveryRecord(SCOPE)?.diaryEntryId).toBe(firstId);
  });

  it("a remount of the same plant cannot upload or insert again while the first insert is pending", async () => {
    await startFirstAttemptAndUnmount();
    await remountAndAttemptSecondSave();

    expect(state.uploadPaths).toHaveLength(1);
    expect(state.insertCalls).toHaveLength(1);
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
  });

  it("releases the claim and announces once when the first insert is confirmed", async () => {
    await startFirstAttemptAndUnmount();
    await remountAndAttemptSecondSave();

    await act(async () => {
      state.insertGates[0]?.({ data: null, error: null });
    });
    await settle();

    expect(state.uploadPaths).toHaveLength(1);
    expect(state.insertCalls).toHaveLength(1);
    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(false);
    expect(entryCreatedEvents).toHaveLength(1);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(state.removedPaths).toEqual([]);
  });

  it("keeps the claim for the same id when the first insert stays ambiguous after reconciliation", async () => {
    const firstId = await startFirstAttemptAndUnmount();
    await remountAndAttemptSecondSave();

    await act(async () => {
      state.insertGates[0]?.({ data: null, error: { message: "response lost" } });
    });
    await settle();

    expect(state.uploadPaths).toHaveLength(1);
    expect(state.insertCalls).toHaveLength(1);
    expect(getQuickLogPhotoAttachmentRecoveryRecord(SCOPE)?.diaryEntryId).toBe(firstId);
    expect(entryCreatedEvents).toHaveLength(0);
    expect(trackMock).not.toHaveBeenCalled();
    expect(state.removedPaths).toEqual([]);
  });

  it("releases the claim after a definitive non-commit without announcing a save", async () => {
    await startFirstAttemptAndUnmount();
    await remountAndAttemptSecondSave();

    await act(async () => {
      state.insertGates[0]?.({
        data: null,
        error: { message: "permission denied", code: "42501" },
      });
    });
    await settle();

    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(false);
    expect(entryCreatedEvents).toHaveLength(0);
    expect(state.insertCalls).toHaveLength(1);
  });

  it("announces once when a remount reconciles the committed row before the first response arrives", async () => {
    const firstId = await startFirstAttemptAndUnmount();
    // The first insert committed but its response is still in flight.
    state.readableRowId = firstId;
    render(sheet());
    await settle();

    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(false);
    expect(entryCreatedEvents).toHaveLength(1);

    await act(async () => {
      state.insertGates[0]?.({ data: null, error: null });
    });
    await settle();

    expect(state.insertCalls).toHaveLength(1);
    expect(entryCreatedEvents).toHaveLength(1);
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  // Codex P1-1 on #2196 at 27aeff639: the claim used to start only after the
  // upload. A remount during the first upload could start a second upload,
  // and if the first attempt finished (upload, insert, release) before the
  // second upload settled, the second claimed an empty scope and inserted.
  it("claims the scope before uploading, so a remount mid-upload cannot start a second attempt", async () => {
    state.deferUploads = true;
    const view = render(sheet());
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.uploadGates).toHaveLength(1));
    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(true);
    view.unmount();

    render(sheet());
    await settle();
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await settle();

    // The first attempt finishes completely before anything else settles.
    await act(async () => {
      state.uploadGates[0]?.({ data: { path: state.uploadPaths[0] }, error: null });
    });
    await waitFor(() => expect(state.insertCalls).toHaveLength(1));
    await act(async () => {
      state.insertGates[0]?.({ data: null, error: null });
    });
    await settle();
    for (const gate of state.uploadGates.slice(1)) {
      await act(async () => {
        gate({ data: { path: "late" }, error: null });
      });
    }
    await settle();

    expect(state.uploadPaths).toHaveLength(1);
    expect(state.insertCalls).toHaveLength(1);
    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(false);
    expect(entryCreatedEvents).toHaveLength(1);
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it("releases the early claim when the upload definitively fails, without inserting", async () => {
    state.deferUploads = true;
    render(sheet());
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.uploadGates).toHaveLength(1));
    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(true);

    await act(async () => {
      state.uploadGates[0]?.({ data: null, error: { message: "network" } });
    });
    await settle();

    expect(state.insertCalls).toHaveLength(0);
    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(false);
    expect(screen.getByText(/could not upload the photo, so nothing was saved/i)).toBeTruthy();
  });

  // Codex P1-2 on #2196 at 27aeff639: an `unavailable` claim (browser storage
  // cannot persist the fence) used to fall through to the diary insert.
  it.each([
    ["setItem throws", "setItem"],
    ["getItem throws", "getItem"],
  ] as const)(
    "fails closed with no upload or insert when the session fence is unavailable (%s)",
    async (_label, method) => {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      const view = render(sheet());
      await choosePhotoOnly();
      fireEvent.click(screen.getByTestId("plant-quick-log-save"));
      await settle();
      view.unmount();

      render(sheet());
      await settle();
      await choosePhotoOnly();
      fireEvent.click(screen.getByTestId("plant-quick-log-save"));
      await settle();

      expect(state.uploadPaths).toHaveLength(0);
      expect(state.insertCalls).toHaveLength(0);
      expect(entryCreatedEvents).toHaveLength(0);
      expect(screen.getByText(/could not reserve this photo save/i)).toBeTruthy();
    },
  );

  // Codex P1-3 on #2196 at 27aeff639: when the first insert's own response
  // arrived before the remount's exact-row lookup, both paths announced.
  it("announces once when the insert response wins over the remount reconciliation", async () => {
    const firstId = await startFirstAttemptAndUnmount();
    state.readableRowId = firstId;
    state.deferLookups = true;
    render(sheet());
    await waitFor(() => expect(state.lookupGates).toHaveLength(1));

    await act(async () => {
      state.insertGates[0]?.({ data: null, error: null });
    });
    await settle();
    expect(entryCreatedEvents).toHaveLength(1);

    await act(async () => {
      state.lookupGates[0]?.();
    });
    await settle();

    expect(state.insertCalls).toHaveLength(1);
    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(false);
    expect(entryCreatedEvents).toHaveLength(1);
    expect(trackMock).toHaveBeenCalledTimes(1);
    // The confirmed row unlocks the remounted sheet.
    expect(screen.queryByText(/could not confirm the photo attachment/i)).toBeNull();
  });

  // Codex re-review at c3db89609, defect 1: a reload during the upload ended
  // the attempt before its insert could start, but the session reservation
  // stayed and closing/reopening never restored Save.
  it("drops a reservation whose upload was ended by a reload, so Save works again", async () => {
    state.deferUploads = true;
    const view = render(sheet());
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.uploadGates).toHaveLength(1));
    view.unmount();
    simulatePageReload();

    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(false);
    render(sheet());
    await settle();
    expect(screen.queryByText(/could not confirm the photo attachment/i)).toBeNull();

    state.deferUploads = false;
    await choosePhotoOnly();
    expect(screen.getByTestId("plant-quick-log-save")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.insertCalls).toHaveLength(1));
    expect(state.uploadPaths).toHaveLength(2);
  });

  // Codex P1 at 28d51a2e9: a sheet remounted while the insert was pending ran
  // its one-shot lookup, missed, and stayed locked after the original save
  // settled, until a close/reopen.
  it.each([
    ["the insert is confirmed", { data: null, error: null }, true],
    [
      "the insert is definitively rejected",
      { data: null, error: { message: "permission denied", code: "42501" } },
      false,
    ],
  ] as const)(
    "restores Save on a remounted sheet when the pending insert settles (%s)",
    async (_label, result, announces) => {
      await startFirstAttemptAndUnmount();
      render(sheet());
      await settle();
      expect(screen.getByText(/could not confirm the photo attachment/i)).toBeTruthy();

      await act(async () => {
        state.insertGates[0]?.(result);
      });
      await settle();

      expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(false);
      expect(screen.queryByText(/could not confirm the photo attachment/i)).toBeNull();
      await choosePhotoOnly();
      expect(screen.getByTestId("plant-quick-log-save")).not.toBeDisabled();
      expect(entryCreatedEvents).toHaveLength(announces ? 1 : 0);
      expect(state.insertCalls).toHaveLength(1);
    },
  );

  // Codex P1 at eaeeb2b45: releasing a live upload reservation read the store
  // after dropping its live marker, so the reader filtered the record as stale
  // and the release returned before removing it or notifying the sheet.
  it.each([
    ["the upload returns an error", "error"],
    ["the upload throws", "throw"],
  ] as const)(
    "restores Save on a remounted sheet when the original upload ends before any insert (%s)",
    async (_label, outcome) => {
      state.deferUploads = true;
      const view = render(sheet());
      await choosePhotoOnly();
      fireEvent.click(screen.getByTestId("plant-quick-log-save"));
      await waitFor(() => expect(state.uploadGates).toHaveLength(1));
      view.unmount();

      render(sheet());
      await settle();
      expect(screen.getByText(/could not confirm the photo attachment/i)).toBeTruthy();

      await act(async () => {
        if (outcome === "error") {
          state.uploadGates[0]?.({ data: null, error: { message: "network" } });
        } else {
          state.uploadRejects[0]?.(new Error("network"));
        }
      });
      await settle();

      expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(false);
      expect(screen.queryByText(/could not confirm the photo attachment/i)).toBeNull();
      expect(state.insertCalls).toHaveLength(0);
      expect(entryCreatedEvents).toHaveLength(0);
      expect(trackMock).not.toHaveBeenCalled();

      state.deferUploads = false;
      await choosePhotoOnly();
      expect(screen.getByTestId("plant-quick-log-save")).not.toBeDisabled();
    },
  );

  it("stays locked when a fence for a different target is released", async () => {
    await startFirstAttemptAndUnmount();
    render(sheet());
    await settle();

    const otherScope = { ...SCOPE, plantId: "plant-2" };
    act(() => {
      expect(
        recoveryModule.claimQuickLogPhotoAttachmentRecoveryLock(otherScope, "other-entry"),
      ).toBe("claimed");
      expect(
        recoveryModule.releaseQuickLogPhotoAttachmentRecoveryLockForEntry(
          otherScope,
          "other-entry",
        ),
      ).toBe(true);
    });
    await settle();

    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(true);
    expect(screen.getByText(/could not confirm the photo attachment/i)).toBeTruthy();
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
  });

  it("stays locked when the pending insert succeeds but storage refuses to remove the fence", async () => {
    await startFirstAttemptAndUnmount();
    render(sheet());
    await settle();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    await act(async () => {
      state.insertGates[0]?.({ data: null, error: null });
    });
    await settle();

    expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(true);
    expect(screen.getByText(/could not confirm the photo attachment/i)).toBeTruthy();
    expect(entryCreatedEvents).toHaveLength(1);
    expect(state.insertCalls).toHaveLength(1);
  });

  it("keeps the fence across a reload once the insert has started", async () => {
    const firstId = await startFirstAttemptAndUnmount();
    simulatePageReload();

    expect(getQuickLogPhotoAttachmentRecoveryRecord(SCOPE)?.diaryEntryId).toBe(firstId);
    await remountAndAttemptSecondSave();
    expect(state.uploadPaths).toHaveLength(1);
    expect(state.insertCalls).toHaveLength(1);
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
  });

  // Codex re-review at c3db89609, defect 2: when the browser refused to remove
  // the fence, both completion paths still reported a release and announced.
  it.each([
    ["insert response first", "insert-first"],
    ["remount lookup first", "lookup-first"],
  ] as const)(
    "announces once when storage refuses to remove the fence (%s)",
    async (_label, order) => {
      const firstId = await startFirstAttemptAndUnmount();
      state.readableRowId = firstId;
      state.deferLookups = true;
      render(sheet());
      await waitFor(() => expect(state.lookupGates).toHaveLength(1));
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      const settleInsert = async () => {
        await act(async () => {
          state.insertGates[0]?.({ data: null, error: null });
        });
        await settle();
      };
      const settleLookup = async () => {
        await act(async () => {
          state.lookupGates[0]?.();
        });
        await settle();
      };
      if (order === "insert-first") {
        await settleInsert();
        await settleLookup();
      } else {
        await settleLookup();
        await settleInsert();
      }

      expect(state.insertCalls).toHaveLength(1);
      expect(entryCreatedEvents).toHaveLength(1);
      expect(trackMock).toHaveBeenCalledTimes(1);
      // The fence could not be removed, so this sheet stays locked (fail-closed).
      expect(hasQuickLogPhotoAttachmentRecoveryLock(SCOPE)).toBe(true);
    },
  );
});
