import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const props = {
  growId: "grow-1",
  tentId: "tent-1",
  plantId: "plant-1",
};

function section(plantStage: unknown) {
  return <QuickLogAllActivitiesSection {...props} plantStage={plantStage} />;
}

function openHarvest() {
  fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
  fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-harvest"));
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("QuickLogAllActivitiesSection harvest stage fence", () => {
  it("re-checks current context and never writes a stale harvest after flower changes to seedling", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "must-not-be-used" },
      error: null,
    });
    const entryCreated = vi.fn();
    window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, entryCreated);
    const { rerender } = render(section("flower"));

    openHarvest();
    const save = await screen.findByTestId("quick-log-all-activities-save");
    expect(save).not.toBeDisabled();

    rerender(section("seedling"));

    expect(save).toBeDisabled();
    expect(
      await screen.findByTestId("quick-log-all-activities-harvest-stage-blocked"),
    ).toHaveTextContent(/Flower, Flush, or Harvest stages/i);

    fireEvent.click(save);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(entryCreated).not.toHaveBeenCalled();
    expect(screen.queryByTestId("quick-log-all-activities-saved")).toBeNull();

    window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, entryCreated);
  });

  it("preserves eligible flower harvest persistence as event_type=harvest", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "harvest-1" },
      error: null,
    });
    const entryCreated = vi.fn();
    window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, entryCreated);
    render(section("flower"));

    openHarvest();
    fireEvent.change(await screen.findByTestId("quick-log-all-activities-note"), {
      target: { value: "Main cola harvested" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock.mock.calls[0][0]).toBe("quicklog_save_event");
    expect(rpcMock.mock.calls[0][1]).toMatchObject({
      p_event_type: "harvest",
      p_plant_id: "plant-1",
    });
    await waitFor(() => expect(entryCreated).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("quick-log-all-activities-saved-item")).toHaveAttribute(
      "data-saved-activity-id",
      "harvest",
    );

    window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, entryCreated);
  });
});
