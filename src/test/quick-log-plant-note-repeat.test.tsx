/**
 * PlantQuickLog repeats the same confirmed note block as the other Quick Logs.
 * A failed save is not recorded, so the same text can be retried. A fresh
 * mount reads the persisted entry.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PlantQuickLog from "@/components/PlantQuickLog";
import { QUICK_LOG_NOTE_ALREADY_SAVED_COPY } from "@/lib/quickLogNoteSaveRules";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const saveMock = vi.fn();

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: saveMock, saving: false, error: null }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: [] }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => ({ preference: "celsius" }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn().mockResolvedValue({}) }) },
    from: () => ({ update: () => ({ filter: vi.fn().mockResolvedValue({ error: null }) }) }),
  },
}));

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={() => undefined}
        plantId="plant-1"
        plantName="Test Plant"
        growId="grow-1"
        tentId="tent-1"
      />
    </QueryClientProvider>,
  );
}

function typeAndSave(note: string) {
  fireEvent.change(screen.getByTestId("plant-quick-log-note"), { target: { value: note } });
  fireEvent.click(screen.getByTestId("plant-quick-log-save"));
}

beforeEach(() => {
  clearLocalStorageForTest();
  saveMock.mockReset();
  Element.prototype.scrollIntoView ??= () => undefined;
});

describe("PlantQuickLog note repeat block", () => {
  it("blocks the same note after a confirmed save, including a fresh mount", async () => {
    saveMock.mockResolvedValue({ ok: true, growEventId: "event-1" });
    const first = renderSheet();
    typeAndSave("leaf tips yellowing");
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    first.unmount();

    renderSheet();
    typeAndSave("leaf tips yellowing");
    expect(await screen.findByText(QUICK_LOG_NOTE_ALREADY_SAVED_COPY)).toBeTruthy();
    expect(saveMock).toHaveBeenCalledTimes(1);

    typeAndSave("new growth looks even");
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
  });

  it("allows the same note again after the save failed", async () => {
    saveMock.mockResolvedValueOnce({ ok: false, reason: "save_failed", definitiveRejected: true });
    saveMock.mockResolvedValueOnce({ ok: true, growEventId: "event-2" });
    renderSheet();
    typeAndSave("leaf tips yellowing");
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    typeAndSave("leaf tips yellowing");
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
  });
});
