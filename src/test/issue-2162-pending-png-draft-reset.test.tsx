/**
 * Codex P1: a Photo activity PNG check still in flight must not install that
 * file after the grower cancels or switches plant.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const pngGate = vi.hoisted(() => ({
  resolve: null as null | ((result: { ok: true } | { ok: false; message: string }) => void),
}));

vi.mock("@/lib/quickLogPhotoContentRules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/quickLogPhotoContentRules")>(
    "@/lib/quickLogPhotoContentRules",
  );
  return {
    ...actual,
    validateQuickLogPngClaim: (file: { name?: string | null; type?: string | null }) => {
      if (!actual.fileClaimsPng(file)) return Promise.resolve({ ok: true as const });
      return new Promise((resolve) => {
        pngGate.resolve = resolve;
      });
    },
  };
});

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

vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: vi.fn(),
}));

import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";

function mount(plantId: string) {
  return (
    <MemoryRouter>
      <QuickLogAllActivitiesSection
        growId="grow-1"
        tentId="tent-1"
        plantId={plantId}
        plantStage="flower"
      />
    </MemoryRouter>
  );
}

function selectPhoto() {
  const picker = screen.queryByTestId("quick-log-all-activities-picker-photo");
  if (!picker) {
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
  }
  fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-photo"));
}

beforeEach(() => {
  pngGate.resolve = null;
  window.sessionStorage.clear();
});

describe("pending Photo PNG checks do not survive a draft change", () => {
  it("does not install the file after cancel", async () => {
    render(mount("plant-1"));
    selectPhoto();
    await screen.findByTestId("quick-log-all-activities-photo-file");
    const png = new File(["not-a-real-png-header"], "stale.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [png] },
    });
    await waitFor(() => expect(pngGate.resolve).toBeTruthy());
    fireEvent.click(screen.getByTestId("quick-log-all-activities-cancel"));
    selectPhoto();
    expect(screen.queryByText(/Selected: stale.png/i)).toBeNull();
    await act(async () => {
      pngGate.resolve?.({ ok: true });
    });
    expect(screen.queryByText(/Selected: stale.png/i)).toBeNull();
  });

  it("does not install the file after the plant changes", async () => {
    const view = render(mount("plant-1"));
    selectPhoto();
    await screen.findByTestId("quick-log-all-activities-photo-file");
    const png = new File(["not-a-real-png-header"], "stale.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [png] },
    });
    await waitFor(() => expect(pngGate.resolve).toBeTruthy());
    view.rerender(mount("plant-2"));
    selectPhoto();
    expect(screen.queryByText(/Selected: stale.png/i)).toBeNull();
    await act(async () => {
      pngGate.resolve?.({ ok: true });
    });
    expect(screen.queryByText(/Selected: stale.png/i)).toBeNull();
  });
});
