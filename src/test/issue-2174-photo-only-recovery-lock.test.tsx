/**
 * Codex P1: an ambiguous Photo only write must keep its identity after the
 * sheet closes, so reopening cannot upload a second object or mint a new row.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const insertCalls: Array<{ table: string; row: Record<string, unknown> }> = [];
const uploadPaths: string[] = [];
const photoInsertState: { error: { message: string; code?: string } | null } = { error: null };

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
  trackQuickLogSuccess: vi.fn(),
}));

import PlantQuickLog from "@/components/PlantQuickLog";

function sheet(open: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open={open}
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

beforeEach(() => {
  insertCalls.length = 0;
  uploadPaths.length = 0;
  photoInsertState.error = null;
  window.sessionStorage.clear();
  if (typeof URL.createObjectURL !== "function") {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => "blob:mock-preview",
    );
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
  }
});

describe("ambiguous Photo only recovery across close", () => {
  it("does not upload or insert again after the sheet is closed and reopened", async () => {
    photoInsertState.error = { message: "response lost" };
    const view = render(sheet(true));
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => {
      expect(uploadPaths).toHaveLength(1);
      expect(insertCalls).toHaveLength(1);
    });
    const savedId = insertCalls[0]?.row.id;

    view.unmount();
    render(sheet(true));
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    expect(uploadPaths).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.row.id).toBe(savedId);
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
  });
});
