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
import {
  getQuickLogPhotoAttachmentRecoveryRecord,
  hasQuickLogPhotoAttachmentRecoveryLock,
} from "@/lib/quickLogPhotoAttachmentRecovery";

type InsertResult = { data: null; error: { message: string; code?: string } | null };
type UploadResult = { data: { path: string } | null; error: { message: string } | null };

const state: {
  insertCalls: Array<Record<string, unknown>>;
  insertGates: Array<(value: InsertResult) => void>;
  uploadPaths: string[];
  uploadGates: Array<(value: UploadResult) => void>;
  deferUploads: boolean;
  removedPaths: string[];
  readableRowId: string | null;
} = {
  insertCalls: [],
  insertGates: [],
  uploadPaths: [],
  uploadGates: [],
  deferUploads: false,
  removedPaths: [],
  readableRowId: null,
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
          return new Promise((resolve) => {
            state.uploadGates.push(resolve);
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
          maybeSingle: async () => ({
            data:
              state.readableRowId !== null &&
              filters.id === state.readableRowId &&
              filters.user_id === "user-test-1"
                ? { id: state.readableRowId }
                : null,
            error: null,
          }),
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
  state.deferUploads = false;
  state.removedPaths = [];
  state.readableRowId = null;
  trackMock.mockClear();
  entryCreatedEvents = [];
  window.addEventListener("verdant:entry-created", onEntryCreated);
  window.sessionStorage.clear();
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

  it("never inserts a second id when two uploads race and the first attempt claims the scope", async () => {
    state.deferUploads = true;
    const view = render(sheet());
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.uploadGates).toHaveLength(1));
    view.unmount();

    render(sheet());
    await settle();
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.uploadGates).toHaveLength(2));

    await act(async () => {
      state.uploadGates[0]?.({ data: { path: state.uploadPaths[0] }, error: null });
    });
    await waitFor(() => expect(state.insertCalls).toHaveLength(1));
    const firstId = state.insertCalls[0]?.id;

    await act(async () => {
      state.uploadGates[1]?.({ data: { path: state.uploadPaths[1] }, error: null });
    });
    await settle();

    expect(state.insertCalls).toHaveLength(1);
    expect(getQuickLogPhotoAttachmentRecoveryRecord(SCOPE)?.diaryEntryId).toBe(firstId);
    // The second object was never referenced by any insert, so it is removed.
    expect(state.removedPaths).toEqual([state.uploadPaths[1]]);
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
  });
});
