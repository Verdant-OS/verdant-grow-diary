/**
 * Codex findings on the Photo only write: success telemetry, and an
 * ambiguous diary insert that must not upload a second object on retry.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const saveCalls: Array<Record<string, unknown>> = [];
const insertCalls: Array<{ table: string; row: Record<string, unknown> }> = [];
const uploadPaths: string[] = [];
const photoInsertState: { error: { message: string; code?: string } | null } = { error: null };
const trackQuickLogSuccessMock = vi.fn();

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: async (payload: Record<string, unknown>) => {
      saveCalls.push(payload);
      return { ok: true, growEventId: "ge-1", reused: false };
    },
    saving: false,
    error: null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string, _file: File) => {
          uploadPaths.push(path);
          return { data: { path }, error: null };
        },
        remove: async () => ({ data: null, error: null }),
      }),
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        insertCalls.push({ table, row });
        return Promise.resolve({ data: null, error: photoInsertState.error });
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
  trackQuickLogSuccess: (...args: unknown[]) => trackQuickLogSuccessMock(...args),
}));

import PlantQuickLog from "@/components/PlantQuickLog";

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={() => {}}
        plantId="plant-1"
        plantName="Plant 1"
        growId="grow-1"
        tentId="tent-1"
      />
    </QueryClientProvider>,
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

beforeEach(() => {
  saveCalls.length = 0;
  insertCalls.length = 0;
  uploadPaths.length = 0;
  photoInsertState.error = null;
  trackQuickLogSuccessMock.mockClear();
  if (typeof URL.createObjectURL !== "function") {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => "blob:mock-preview",
    );
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
  }
});

describe("Photo only Codex findings", () => {
  it("emits photo success telemetry after the direct diary insert", async () => {
    renderSheet();
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => {
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(trackQuickLogSuccessMock).toHaveBeenCalledWith("photo", { reused: false });
    });
    expect(saveCalls).toHaveLength(0);
  });

  it("locks an ambiguous Photo only write so a retry does not upload another object", async () => {
    photoInsertState.error = { message: "response lost" };
    renderSheet();
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => {
      expect(screen.getByTestId("plant-quick-log-error").textContent ?? "").toMatch(
        /could not confirm|unconfirmed/i,
      );
    });
    expect(uploadPaths).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
    const savedId = insertCalls[0]?.row.id;
    expect(typeof savedId).toBe("string");
    expect(String(savedId).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => {
      expect(uploadPaths).toHaveLength(1);
      expect(insertCalls).toHaveLength(1);
      expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
    });
    expect(insertCalls[0]?.row.id).toBe(savedId);
    expect(trackQuickLogSuccessMock).not.toHaveBeenCalled();
  });
});
