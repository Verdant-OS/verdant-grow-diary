/**
 * The harvest photo picker runs the same PNG signature check as the Photo
 * picker: a renamed non-PNG is rejected, and Save waits while a PNG is read.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";

const FAKE_PNG = new File(["this is plain text, not a png"], "fake.png", { type: "image/png" });
const REAL_PNG = new File(
  [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])],
  "real.png",
  { type: "image/png" },
);

function openHarvest() {
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

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("Quick Log harvest photo picker PNG check", () => {
  it("rejects a renamed text file that claims to be a PNG", async () => {
    openHarvest();
    await chooseHarvestPhoto(FAKE_PNG);
    await waitFor(() => {
      expect(screen.getByTestId("quick-log-all-activities-error").textContent ?? "").toMatch(
        /isn't a PNG/i,
      );
    });
  });

  it("accepts a file with the PNG signature", async () => {
    openHarvest();
    await chooseHarvestPhoto(REAL_PNG);
    await waitFor(() => {
      expect(screen.queryByTestId("quick-log-all-activities-error")).toBeNull();
    });
  });
});
