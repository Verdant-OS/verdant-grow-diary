/**
 * Codex finding: a PNG claim shorter than the 8-byte signature is not a PNG.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
        upload: vi.fn(async () => ({ data: { path: "p" }, error: null })),
        remove: vi.fn(async () => ({ data: null, error: null })),
      }),
    },
    from: () => ({
      insert: vi.fn(async () => ({ error: null })),
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: [] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import PlantQuickLog from "@/components/PlantQuickLog";

function renderPlant() {
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
  window.sessionStorage.clear();
  if (typeof URL.createObjectURL !== "function") {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => "blob:short-png",
    );
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:short-png");
  }
});

describe("Plant Quick Log rejects an undersized PNG claim", () => {
  it("does not preview or enable save for a one-byte fake.png", async () => {
    renderPlant();
    const library = screen.getByTestId("plant-quick-log-photo-library-input") as HTMLInputElement;
    const tiny = new File([new Uint8Array([0x89])], "fake.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(library, { target: { files: [tiny] } });
    });
    await waitFor(() => {
      expect(screen.getByTestId("plant-quick-log-error").textContent ?? "").toMatch(/isn't a PNG/i);
    });
    expect(screen.queryByTestId("plant-quick-log-photo-preview")).toBeNull();
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
  });
});
