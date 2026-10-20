/**
 * Codex P1 on #2196 (PlantQuickLog.tsx:572, "Retain confirmed photo saves
 * after unmount"): a Photo only diary insert that SUCCEEDS after the sheet
 * unmounts, or after it switches to another plant, is a durable save. Its
 * confirmed-save bookkeeping (telemetry, Timeline refresh, the one
 * `verdant:entry-created` signal) must still run against the plant the save
 * was made for — never against the plant the sheet shows now — and nothing
 * may fire before the insert is confirmed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const insertCalls: Array<{ table: string; row: Record<string, unknown> }> = [];
const uploadPaths: string[] = [];
const gates: {
  insert:
    ((value: { data: null; error: { message: string; code?: string } | null }) => void) | null;
} = { insert: null };

const { refreshMock, rememberMock, trackMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  rememberMock: vi.fn(),
  trackMock: vi.fn(),
}));

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
        upload: async (path: string) => {
          uploadPaths.push(path);
          return { data: { path }, error: null };
        },
        remove: async () => ({ data: null, error: null }),
      }),
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        insertCalls.push({ table, row });
        return new Promise((resolve) => {
          gates.insert = resolve;
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
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
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

vi.mock("@/lib/quickLogV2RefreshRules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quickLogV2RefreshRules")>();
  return { ...actual, applyQuickLogV2Refresh: refreshMock };
});

vi.mock("@/lib/quickLogRecentTargetStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quickLogRecentTargetStore")>();
  return { ...actual, rememberRecentQuickLogTarget: rememberMock };
});

import PlantQuickLog from "@/components/PlantQuickLog";
import { hasQuickLogPhotoAttachmentRecoveryLock } from "@/lib/quickLogPhotoAttachmentRecovery";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function sheet(plantId: string, onSaved = vi.fn()) {
  return (
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={() => {}}
        onSaved={onSaved}
        plantId={plantId}
        plantName={plantId}
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

const entryCreated: Array<{ plantId?: unknown }> = [];
function onEntryCreated(event: Event) {
  entryCreated.push(((event as CustomEvent).detail ?? {}) as { plantId?: unknown });
}

beforeEach(() => {
  insertCalls.length = 0;
  uploadPaths.length = 0;
  entryCreated.length = 0;
  gates.insert = null;
  refreshMock.mockReset();
  rememberMock.mockReset();
  trackMock.mockReset();
  window.sessionStorage.clear();
  window.addEventListener("verdant:entry-created", onEntryCreated);
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

async function startPhotoOnlySave() {
  await choosePhotoOnly();
  fireEvent.click(screen.getByTestId("plant-quick-log-save"));
  await waitFor(() => expect(gates.insert).toBeTruthy());
  // Nothing confirmed yet: no success side effects before the insert settles.
  expect(trackMock).not.toHaveBeenCalled();
  expect(refreshMock).not.toHaveBeenCalled();
  expect(rememberMock).not.toHaveBeenCalled();
  expect(entryCreated).toHaveLength(0);
}

describe("confirmed Photo only save that settles after the sheet lost its context", () => {
  it("still refreshes, signals Timeline once and records telemetry after unmount", async () => {
    const onSaved = vi.fn();
    const view = render(sheet("plant-1", onSaved));
    await startPhotoOnlySave();

    view.unmount();
    await act(async () => {
      gates.insert?.({ data: null, error: null });
    });

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(refreshMock.mock.calls[0]?.[1]).toEqual({
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
    });
    expect(entryCreated).toHaveLength(1);
    expect(entryCreated[0]?.plantId).toBe("plant-1");
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("photo", { reused: false });
    expect(rememberMock).toHaveBeenCalledTimes(1);
    expect(rememberMock.mock.calls[0]?.[0]).toMatchObject({
      plantId: "plant-1",
      growId: "grow-1",
      tentId: "tent-1",
    });
    expect(rememberMock.mock.calls[0]?.[1]).toBe("user-test-1");
    // The confirmed row needs no recovery fence, and the stale sheet does not
    // run its UI completion callbacks.
    expect(
      hasQuickLogPhotoAttachmentRecoveryLock({
        ownerId: "user-test-1",
        growId: "grow-1",
        tentId: "tent-1",
        plantId: "plant-1",
      }),
    ).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(1);
    expect(uploadPaths).toHaveLength(1);
  });

  it("attributes the confirmed save to the original plant after a target switch", async () => {
    const view = render(sheet("plant-1"));
    await startPhotoOnlySave();

    view.rerender(sheet("plant-2"));
    await act(async () => {
      gates.insert?.({ data: null, error: null });
    });

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(refreshMock.mock.calls[0]?.[1]).toEqual({
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
    });
    expect(entryCreated).toHaveLength(1);
    expect(entryCreated[0]?.plantId).toBe("plant-1");
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(rememberMock).toHaveBeenCalledTimes(1);
    expect(rememberMock.mock.calls[0]?.[0]).toMatchObject({ plantId: "plant-1" });
    // The new plant's draft is untouched by the stale continuation.
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
    expect(insertCalls).toHaveLength(1);
  });

  it("keeps the mounted success path to exactly one signal and one refresh", async () => {
    const onSaved = vi.fn();
    render(sheet("plant-1", onSaved));
    await startPhotoOnlySave();
    await act(async () => {
      gates.insert?.({ data: null, error: null });
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(entryCreated).toHaveLength(1);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(rememberMock).toHaveBeenCalledTimes(1);
  });
});
