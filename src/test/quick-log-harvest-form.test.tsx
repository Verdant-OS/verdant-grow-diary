/**
 * QuickLog Harvest form v1b.next — dedicated tests covering:
 *  - Wet/dry weight + unit selector rendering.
 *  - Weights are optional; negative values are dropped.
 *  - Safety copy never implies readiness / final yield.
 *  - quicklog_save_event is called with event_type='harvest' and
 *    p_details.harvest carries the sanitized fields.
 *  - Failed / stale-backend saves do not dispatch verdant:entry-created
 *    and never fake-remap Harvest as observation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

function mount() {
  return render(
    <QuickLogAllActivitiesSection
      growId="g1"
      tentId="t1"
      plantId="p1"
    />,
  );
}

function selectHarvest() {
  fireEvent.click(
    screen.getByTestId("quick-log-all-activities-picker-harvest"),
  );
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("Harvest Quick Log form", () => {
  it("renders wet weight, dry weight, unit selector, and optional note", async () => {
    mount();
    selectHarvest();
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    expect(
      screen.getByTestId("quick-log-all-activities-harvest-wet"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("quick-log-all-activities-harvest-dry"),
    ).toBeInTheDocument();
    const unit = screen.getByTestId(
      "quick-log-all-activities-harvest-unit",
    ) as HTMLSelectElement;
    expect(Array.from(unit.options).map((o) => o.value)).toEqual([
      "g",
      "oz",
      "lb",
      "kg",
    ]);
    expect(screen.getByTestId("quick-log-all-activities-note")).toBeInTheDocument();
  });

  it("safety copy explicitly denies readiness / final-yield claims", async () => {
    mount();
    selectHarvest();
    const form = await screen.findByTestId("quick-log-all-activities-form");
    const text = (form.textContent ?? "").toLowerCase();
    // The safety line must be present verbatim and must include the
    // "does not claim" denial for both readiness and final yield.
    expect(text).toContain("does not claim harvest readiness or final yield");
    // No affirmative readiness/success verbs.
    expect(text).not.toMatch(/ready to harvest|harvest ready|success/);
  });

  it("saves Harvest with sanitized p_details.harvest and dispatches on success", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "ge-1" },
      error: null,
    });
    const events: Event[] = [];
    const handler = (e: Event) => events.push(e);
    window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);

    mount();
    selectHarvest();
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-wet"),
      { target: { value: "120" } },
    );
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-dry"),
      { target: { value: "" } }, // empty — dropped by sanitizer
    );
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-unit"),
      { target: { value: "g" } },
    );
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "Removed main cola" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [fn, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("harvest");
    expect(args.p_note).toBe("Removed main cola");
    expect(args.p_details).toEqual({
      harvest: { wetWeight: "120", weightUnit: "g" },
    });

    await waitFor(() => expect(events.length).toBe(1));
    window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);
  });

  it("stale backend invalid_event_type does not dispatch and does not fake-save", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: false, reason: "invalid_event_type" },
      error: null,
    });
    const events: Event[] = [];
    const handler = (e: Event) => events.push(e);
    window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);

    mount();
    selectHarvest();
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock.mock.calls.length).toBe(1);
    expect(events.length).toBe(0);
    // No saved-item chip should appear.
    expect(
      screen.queryByTestId(/quick-log-all-activities-saved-item-/),
    ).toBeNull();
    window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);
  });

  it("Harvest with only a note omits p_details.harvest", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "ge-2" },
      error: null,
    });
    mount();
    selectHarvest();
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "Just a note" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const args = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_event_type).toBe("harvest");
    expect(args.p_note).toBe("Just a note");
    expect(args.p_details).toBeNull();
  });
});
