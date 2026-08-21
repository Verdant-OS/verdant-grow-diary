/**
 * PlantQuickLog — failed manual saves must show the mapped reason message and
 * a concrete recovery action, never the old blanket "check connection" copy.
 *
 * The RPC seam is mocked at useQuickLogV2Save (the documented injection point
 * for failing saves — see quick-log-success-toast-regression.test.tsx). The
 * component must route `result.reason` through describeQuickLogSaveFailure.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PlantQuickLog from "@/components/PlantQuickLog";
import {
  quickLogReasonToOperatorMessage,
  quickLogSaveRecoveryAction,
} from "@/lib/quickLogSaveErrorMessage";

const saveMock = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: saveMock, saving: false, error: null }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
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

async function typeNoteAndSave() {
  fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
    target: { value: "leaf tips yellowing" },
  });
  fireEvent.click(screen.getByTestId("plant-quick-log-save"));
  await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  saveMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  Element.prototype.scrollIntoView ??= () => undefined;
});

describe("PlantQuickLog save-failure messaging", () => {
  it("surfaces the invalid_logged_at message and its recovery action inline", async () => {
    saveMock.mockResolvedValue({ ok: false, reason: "invalid_logged_at" });
    renderSheet();
    await typeNoteAndSave();

    const alert = await screen.findByTestId("plant-quick-log-error");
    expect(alert.textContent).toContain(quickLogReasonToOperatorMessage("invalid_logged_at"));
    expect(alert.textContent).toContain(quickLogSaveRecoveryAction("invalid_logged_at"));
    expect(alert.textContent).not.toMatch(/check connection/i);
    expect(alert.textContent).not.toContain("invalid_logged_at");
  });

  it("surfaces target-ownership failures with a re-select recovery, not connection advice", async () => {
    saveMock.mockResolvedValue({ ok: false, reason: "target_not_owned" });
    renderSheet();
    await typeNoteAndSave();

    const alert = await screen.findByTestId("plant-quick-log-error");
    expect(alert.textContent).toContain(quickLogSaveRecoveryAction("target_not_owned"));
    expect(alert.textContent).toMatch(/re-select/i);
    expect(alert.textContent).not.toMatch(/check connection/i);
  });

  it("surfaces malformed-uuid transport failures via the classified reason", async () => {
    saveMock.mockResolvedValue({ ok: false, reason: "invalid_uuid_input" });
    renderSheet();
    await typeNoteAndSave();

    const alert = await screen.findByTestId("plant-quick-log-error");
    expect(alert.textContent).toContain(quickLogReasonToOperatorMessage("invalid_uuid_input"));
    expect(alert.textContent).not.toMatch(/22P02|PGRST|uuid_input/);
  });

  it("keeps a calm generic message for save_failed and never toasts success", async () => {
    saveMock.mockResolvedValue({ ok: false, reason: "save_failed" });
    renderSheet();
    await typeNoteAndSave();

    const alert = await screen.findByTestId("plant-quick-log-error");
    expect(alert.textContent).toContain(quickLogReasonToOperatorMessage("save_failed"));
    expect(alert.textContent).toContain(quickLogSaveRecoveryAction("save_failed"));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
