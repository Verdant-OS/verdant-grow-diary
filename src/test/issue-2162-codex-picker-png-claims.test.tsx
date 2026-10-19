/**
 * Codex finding: PNG byte checks belong on every Quick Log photo picker,
 * including Plant Quick Log and the standalone Photo activity.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: async () => ({ ok: true, growEventId: "ge-1", reused: false }),
    saving: false,
    error: null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
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

vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import PlantQuickLog from "@/components/PlantQuickLog";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";

const FAKE_PNG = new File(["this is plain text, not a png"], "fake.png", { type: "image/png" });

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
      () => "blob:picker-preview",
    );
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:picker-preview");
  }
});

describe("Quick Log pickers reject a renamed text file", () => {
  it("rejects a fake png on the Plant Quick Log picker", async () => {
    renderPlant();
    const library = screen.getByTestId("plant-quick-log-photo-library-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(library, { target: { files: [FAKE_PNG] } });
    });
    await waitFor(() => {
      expect(screen.getByTestId("plant-quick-log-error").textContent ?? "").toMatch(/isn't a PNG/i);
    });
    expect(screen.queryByTestId("plant-quick-log-photo-preview")).toBeNull();
  });

  it("rejects a fake png on the standalone Photo activity picker", async () => {
    render(
      <MemoryRouter>
        <QuickLogAllActivitiesSection
          growId="grow-1"
          tentId="tent-1"
          plantId="plant-1"
          plantStage="flower"
        />
      </MemoryRouter>,
    );
    const picker = screen.queryByTestId("quick-log-all-activities-picker-photo");
    if (!picker) {
      fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
    }
    fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-photo"));
    await screen.findByTestId("quick-log-all-activities-form");
    await act(async () => {
      fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
        target: { files: [FAKE_PNG] },
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("quick-log-all-activities-error").textContent ?? "").toMatch(
        /isn't a PNG/i,
      );
    });
    expect(screen.queryByText(/Selected: fake.png/i)).toBeNull();
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
  });
});
