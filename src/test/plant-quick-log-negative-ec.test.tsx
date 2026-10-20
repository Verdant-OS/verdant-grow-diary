/**
 * #2159: the plant-page Quick Log saved EC -1 ("Log saved to timeline.",
 * memory "EC -1.00 Fresh"). A negative EC must be refused at the field, named,
 * and never reach the save RPC.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PlantQuickLog from "@/components/PlantQuickLog";
import {
  PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE,
  plantQuickLogEcError,
} from "@/lib/plantQuickLogSensorInputRules";

const saveMock = vi.fn();

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: saveMock, saving: false, error: null }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
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

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true, growEventId: "event-1" });
  Element.prototype.scrollIntoView ??= () => undefined;
});

describe("plantQuickLogEcError", () => {
  it("names a negative EC and accepts blank, zero and positive values", () => {
    expect(plantQuickLogEcError("-1")).toBe(PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE);
    expect(plantQuickLogEcError(" -0.5 ")).toBe(PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE);
    // Codex r4327342150 / Copilot r4327357681: exponent forms parse negative too.
    expect(plantQuickLogEcError("-1e2")).toBe(PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE);
    expect(plantQuickLogEcError("-1e0")).toBe(PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE);
    expect(plantQuickLogEcError("1e0")).toBeNull();
    expect(plantQuickLogEcError("")).toBeNull();
    expect(plantQuickLogEcError("0")).toBeNull();
    expect(plantQuickLogEcError("1.8")).toBeNull();
    expect(PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE).toBe("EC can't be negative.");
  });
});

describe("PlantQuickLog negative EC (#2159)", () => {
  it("shows the error on the EC field and does not save EC -1", async () => {
    renderSheet();
    const ec = screen.getByTestId("plant-quick-log-ec");
    fireEvent.change(ec, { target: { value: "-1" } });

    const message = screen.getByText(PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE);
    expect(ec).toHaveAttribute("aria-invalid", "true");
    expect(ec.getAttribute("aria-describedby")).toBe(message.id);

    const save = screen.getByTestId("plant-quick-log-save");
    expect(save).toBeDisabled();
    // Copilot r4327357765: submit the form directly so the handleSave guard,
    // not only the disabled button, is what refuses the save.
    fireEvent.submit(save.closest("form")!);
    await new Promise((r) => setTimeout(r, 20));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("refuses a negative EC written in exponent notation", async () => {
    renderSheet();
    const ec = screen.getByTestId("plant-quick-log-ec");
    fireEvent.change(ec, { target: { value: "-1e2" } });
    expect(screen.getByText(PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE)).toBeInTheDocument();
    fireEvent.submit(ec.closest("form")!);
    await new Promise((r) => setTimeout(r, 20));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("still saves a valid EC reading", async () => {
    renderSheet();
    fireEvent.change(screen.getByTestId("plant-quick-log-ec"), { target: { value: "1.8" } });
    expect(screen.queryByText(PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE)).toBeNull();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
  });
});
