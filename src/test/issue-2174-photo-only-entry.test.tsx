/**
 * #2174 — "Photo only" with an attached photo saves as a Photo entry.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const saveCalls: Array<Record<string, unknown>> = [];
const insertCalls: Array<{ table: string; row: Record<string, unknown> }> = [];

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
        upload: async (_path: string, _file: File) => ({
          data: { path: "user/grow/photo.png" },
          error: null,
        }),
        remove: async () => ({ data: null, error: null }),
      }),
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        insertCalls.push({ table, row });
        return Promise.resolve({ data: null, error: null });
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

beforeEach(() => {
  saveCalls.length = 0;
  insertCalls.length = 0;
  if (typeof URL.createObjectURL !== "function") {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => "blob:mock-preview",
    );
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
  }
});

describe("issue 2174 — Photo only saves as a Photo entry", () => {
  it("writes event_type photo and does not save an observation note", async () => {
    renderSheet();
    const library = document.getElementById(
      "plant-quick-log-photo-library-input",
    ) as HTMLInputElement;
    const photo = new File([new Uint8Array([1, 2, 3])], "leaf.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(library, { target: { files: [photo] } });
    });
    fireEvent.click(screen.getByRole("button", { name: /log action photo only/i }));
    expect(screen.getByTestId("plant-quick-log-note")).toHaveValue("Photo only.");
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => {
      expect(insertCalls.length).toBeGreaterThan(0);
    });
    const photoRow = insertCalls.find((call) => call.table === "diary_entries");
    expect(photoRow).toBeTruthy();
    const details = photoRow?.row.details as { event_type?: string } | undefined;
    expect(details?.event_type).toBe("photo");
    expect(saveCalls).toHaveLength(0);
  });
});
