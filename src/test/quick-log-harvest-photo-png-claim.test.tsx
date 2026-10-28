/**
 * The harvest photo picker runs the same PNG signature check as the Photo
 * picker: a renamed non-PNG is rejected and never uploaded, a real PNG is kept
 * and uploaded, and Save stays disabled while a claimed PNG is being read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";

const GROW_EVENT_ID = "77777777-7777-4777-8777-000000000201";

const insertMock = vi.fn();
const updateMock = vi.fn();
const rpcMock = vi.fn();
const uploadMock = vi.fn();
const removeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (...args: unknown[]) => insertMock(table, ...args),
      update: (values: unknown) => {
        const filters: unknown[][] = [];
        const chain = {
          filter: (...args: unknown[]) => {
            filters.push(args);
            return chain;
          },
          select: async () => {
            updateMock(table, values, filters);
            return { data: [{ id: "diary-1" }], error: null };
          },
        };
        return chain;
      },
    }),
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: (bucket: string) => ({
        upload: (...args: unknown[]) => uploadMock(bucket, ...args),
        remove: (...args: unknown[]) => removeMock(bucket, ...args),
      }),
    },
  },
}));

const authState = vi.hoisted(() => ({ user: { id: "user-1" }, loading: false }));
vi.mock("@/store/auth", () => ({
  useAuth: () => authState,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Lets one test hold the signature read open; every other test uses the real check.
const pngRead = vi.hoisted(() => ({
  hold: null as null | ((file: File) => Promise<{ ok: true } | { ok: false; message: string }>),
}));
vi.mock("@/lib/quickLogPhotoContentRules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quickLogPhotoContentRules")>();
  return {
    ...actual,
    validateQuickLogPngClaim: (file: File) =>
      pngRead.hold ? pngRead.hold(file) : actual.validateQuickLogPngClaim(file),
  };
});

const FAKE_PNG = new File(["this is plain text, not a png"], "fake.png", { type: "image/png" });
const REAL_PNG = new File(
  [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])],
  "real.png",
  { type: "image/png" },
);

function openHarvest() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <QuickLogAllActivitiesSection
          growId="grow-1"
          tentId="tent-1"
          plantId="plant-1"
          plantStage="flower"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  if (!screen.queryByTestId("quick-log-all-activities-picker-harvest")) {
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
  }
  fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-harvest"));
}

async function chooseHarvestPhoto(file: File) {
  await act(async () => {
    fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-photo"), {
      target: { files: [file] },
    });
  });
}

const save = () => screen.getByTestId("quick-log-all-activities-save");

describe("Quick Log harvest photo picker PNG check", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    pngRead.hold = null;
    insertMock.mockReset();
    rpcMock.mockReset();
    uploadMock.mockReset();
    removeMock.mockReset();
    rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: GROW_EVENT_ID }, error: null });
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
    insertMock.mockResolvedValue({ error: null });
  });

  it("rejects a renamed text file that claims to be a PNG and never uploads it", async () => {
    openHarvest();
    await chooseHarvestPhoto(FAKE_PNG);
    await waitFor(() => {
      expect(screen.getByTestId("quick-log-all-activities-error").textContent ?? "").toMatch(
        /isn't a PNG/i,
      );
    });
    fireEvent.click(save());
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("keeps a file with the PNG signature and uploads it on save", async () => {
    openHarvest();
    await chooseHarvestPhoto(REAL_PNG);
    await waitFor(() => expect(save()).not.toBeDisabled());
    expect(screen.queryByTestId("quick-log-all-activities-error")).toBeNull();
    fireEvent.click(save());
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(uploadMock.mock.calls[0][2]).toBe(REAL_PNG);
  });

  it("keeps Save disabled while a claimed PNG is being read", async () => {
    let finish: (result: { ok: true }) => void = () => {};
    pngRead.hold = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    openHarvest();
    await chooseHarvestPhoto(REAL_PNG);
    expect(save()).toBeDisabled();
    await act(async () => finish({ ok: true }));
    await waitFor(() => expect(save()).not.toBeDisabled());
  });
});
