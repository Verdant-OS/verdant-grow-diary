/**
 * Codex P1: reopening Plant Quick Log must reconcile a persisted photo lock
 * when the exact diary row is readable, instead of leaving Save disabled.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { recordQuickLogPhotoAttachmentRecoveryLock } from "@/lib/quickLogPhotoAttachmentRecovery";

const DIARY_ID = "11111111-1111-4111-8111-111111111111";
const trackQuickLogSuccessMock = vi.fn();

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
        upload: async () => ({ data: { path: "p" }, error: null }),
        remove: async () => ({ data: null, error: null }),
      }),
    },
    from: () => ({
      insert: async () => ({ data: null, error: null }),
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: DIARY_ID }, error: null }),
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

beforeEach(() => {
  trackQuickLogSuccessMock.mockClear();
  window.sessionStorage.clear();
});

describe("Plant Quick Log reopens a confirmed photo lock", () => {
  it("clears the recovery lock and allows another save once the diary row is readable", async () => {
    recordQuickLogPhotoAttachmentRecoveryLock(
      { ownerId: "user-test-1", growId: "grow-1", tentId: "tent-1", plantId: "plant-1" },
      DIARY_ID,
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
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

    await waitFor(() => {
      expect(screen.queryByTestId("plant-quick-log-error")).toBeNull();
    });
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "another note" },
    });
    expect(screen.getByTestId("plant-quick-log-save")).toBeEnabled();
    expect(trackQuickLogSuccessMock).toHaveBeenCalledWith("photo", { reused: false });
  });
});
