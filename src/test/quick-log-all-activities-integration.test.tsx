/**
 * Integration tests for Verdant Quick Log Activity Types v1a.next —
 * QuickLogAllActivitiesSection.
 *
 * Proves end-to-end that every supported v1a activity:
 *  - renders via shared QuickLogActivityPicker (no duplicate taxonomy)
 *  - routes saves through the shared useQuickLogActivitySave hook
 *  - dispatches verdant:entry-created only on confirmed success
 *  - appears in the local "What was saved" breakdown only on success
 *  - Harvest saves only when the selected plant stage is eligible
 *  - failed saves do not dispatch and do not add saved items
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import { QUICK_LOG_ACTIVITY_DEFINITIONS } from "@/constants/quickLogActivityTypes";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";
import { QUICK_LOG_V2_OPEN_EVENT } from "@/lib/quickLogV2OpenIntent";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const GROW = "grow-1";
const TENT = "tent-1";
const PLANT = "plant-1";

function mountSection(props?: Partial<React.ComponentProps<typeof QuickLogAllActivitiesSection>>) {
  return render(
    <QuickLogAllActivitiesSection
      growId={GROW}
      tentId={TENT}
      plantId={PLANT}
      plantStage="flower"
      {...props}
    />,
  );
}

function revealAdditionalActivities() {
  const disclosure = screen.getByRole("button", {
    name: "More activity types",
  });
  if (disclosure.getAttribute("aria-expanded") === "false") {
    fireEvent.click(disclosure);
  }
}

function selectActivity(activityId: string) {
  const testId = `quick-log-all-activities-picker-${activityId}`;
  if (!screen.queryByTestId(testId)) revealAdditionalActivities();
  fireEvent.click(screen.getByTestId(testId));
}

function listenForEntryCreated() {
  const evts: CustomEvent[] = [];
  const handler = (e: Event) => evts.push(e as CustomEvent);
  window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);
  return {
    events: evts,
    dispose: () =>
      window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler),
  };
}

async function saveWithNote(activityId: string, note = "  short observation  ") {
  selectActivity(activityId);
  await screen.findByTestId("quick-log-all-activities-form");
  const textarea = screen.queryByTestId("quick-log-all-activities-note");
  if (textarea) fireEvent.change(textarea, { target: { value: note } });
  fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
}

async function saveWithoutNote(activityId: string) {
  selectActivity(activityId);
  await screen.findByTestId("quick-log-all-activities-form");
  fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("QuickLogAllActivitiesSection — shared taxonomy", () => {
  it("renders every supported activity from shared definitions after disclosure", () => {
    mountSection();
    revealAdditionalActivities();
    for (const def of Object.values(QUICK_LOG_ACTIVITY_DEFINITIONS)) {
      expect(
        screen.getByTestId(`quick-log-all-activities-picker-${def.id}`),
      ).toBeInTheDocument();
    }
  });

  it("renders Harvest as enabled for an eligible plant stage", () => {
    mountSection();
    revealAdditionalActivities();
    const btn = screen.getByTestId("quick-log-all-activities-picker-harvest");
    expect(btn).not.toBeDisabled();
    expect(
      screen.queryByTestId(
        "quick-log-all-activities-picker-harvest-disabled-reason",
      ),
    ).toBeNull();
  });
});

describe("QuickLogAllActivitiesSection — save routing", () => {
  it("Note → quicklog_save_manual with p_action=note; dispatches + saved breakdown", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-note" },
      error: null,
    });
    const l = listenForEntryCreated();
    mountSection();
    await saveWithNote("note", "seedling perky");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_manual");
    expect(args.p_action).toBe("note");
    // Real deployed signature is target-scoped; the RPC derives grow/tent
    // server-side from the owned plant target (p_grow_id never existed).
    expect(args.p_target_type).toBe("plant");
    expect(args.p_target_id).toBe(PLANT);
    expect(args).not.toHaveProperty("p_grow_id");
    expect(args.p_note).toBe("seedling perky");
    await waitFor(() => expect(l.events.length).toBe(1));
    const items = await screen.findAllByTestId("quick-log-all-activities-saved-item");
    expect(items[0]).toHaveAttribute("data-saved-activity-id", "note");
    expect(items[0]).toHaveTextContent(/plant note/i);
    l.dispose();
  });

  it("Training → quicklog_save_event carries the chosen technique in p_details", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-train" },
      error: null,
    });
    mountSection();
    selectActivity("training");
    await screen.findByTestId("quick-log-all-activities-form");
    // The structured technique select is rendered from the detail-field spec.
    const technique = screen.getByTestId("quick-log-all-activities-detail-technique");
    fireEvent.change(technique, { target: { value: "topping" } });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "topped above 5th node" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("training");
    expect(args.p_details).toMatchObject({ technique: "topping" });
    // Never leak a reserved identity key through the detail seam.
    expect(args.p_details).not.toHaveProperty("user_id");
  });

  it("Defoliation → quicklog_save_event carries amount + canopy area in p_details (with subtype fence)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-defol" },
      error: null,
    });
    mountSection();
    selectActivity("defoliation");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-amount"), {
      target: { value: "moderate" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-canopyArea"), {
      target: { value: "lower" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "cleared lower fan leaves" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("training"); // defoliation persists as training + subtype
    expect(args.p_details).toMatchObject({
      subtype: "defoliation",
      amount: "moderate",
      canopyArea: "lower",
    });
  });

  it("Photo → quicklog_save_event carries subject + caption in p_details", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-photo" },
      error: null,
    });
    mountSection();
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-subject"), {
      target: { value: "buds" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-caption"), {
      target: { value: "day 40 flower" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("photo");
    expect(args.p_details).toMatchObject({ subject: "buds", caption: "day 40 flower" });
  });

  it("Issue/Observation → quicklog_save_event carries observed sign + location (never a cause)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-obs" },
      error: null,
    });
    mountSection();
    selectActivity("issue_observation");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-observedSign"), {
      target: { value: "discoloration" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-observationLocation"), {
      target: { value: "lower_leaves" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "noticed this today" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("observation");
    expect(args.p_details).toMatchObject({
      subtype: "issue",
      observedSign: "discoloration",
      observationLocation: "lower_leaves",
    });
  });

  it("Environment check → quicklog_save_event carries qualitative check + manual (plausible) temp/RH", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-env" },
      error: null,
    });
    mountSection();
    selectActivity("environment_check");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-checkType"), {
      target: { value: "airflow" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-manualTempC"), {
      target: { value: "24" },
    });
    // Physically impossible humidity must be dropped at the sanitize seam.
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-manualHumidityPct"), {
      target: { value: "999" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "bumped the fan up a notch" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("environment");
    expect(args.p_details).toMatchObject({ checkType: "airflow", manualTempC: "24" });
    // The impossible humidity was dropped, not stored.
    expect(args.p_details).not.toHaveProperty("manualHumidityPct");
  });

  it("Training drops an unchosen (blank) technique — no technique key in p_details", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-train2" },
      error: null,
    });
    mountSection();
    await saveWithNote("training", "defoliated nothing, just LST by hand");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("training");
    // No technique chosen → sanitized out, not persisted as blank.
    if (args.p_details) expect(args.p_details).not.toHaveProperty("technique");
  });

  it("Watering emits the exact structured V2 intent after the parent-close seam, with no inline Save or RPC", () => {
    const order: string[] = [];
    const events: CustomEvent[] = [];
    const listener = (event: Event) => {
      order.push("dispatch");
      events.push(event as CustomEvent);
    };
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);
    mountSection({ onBeforeStructuredWaterOpen: () => order.push("close") });

    selectActivity("watering");

    window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);
    expect(order).toEqual(["close", "dispatch"]);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({ targetKey: "plant:plant-1", action: "water" });
    expect(screen.queryByTestId("quick-log-all-activities-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-all-activities-save")).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Watering fails closed for an external block, missing grow, or missing plant/tent target", () => {
    const events: CustomEvent[] = [];
    const listener = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);

    const blocked = mountSection({ externalPersistenceBlockReason: "Target unavailable." });
    selectActivity("watering");
    expect(screen.getByTestId("quick-log-all-activities-structured-water-error")).toHaveTextContent(
      "Target unavailable.",
    );
    blocked.unmount();

    const noGrow = mountSection({ growId: null });
    selectActivity("watering");
    expect(screen.getByTestId("quick-log-all-activities-structured-water-error")).toHaveTextContent(
      /missing grow context/i,
    );
    noGrow.unmount();

    mountSection({ plantId: null, tentId: null });
    selectActivity("watering");
    expect(screen.getByTestId("quick-log-all-activities-structured-water-error")).toHaveTextContent(
      /choose a plant or tent/i,
    );

    window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);
    expect(events).toHaveLength(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Feeding → quicklog_save_event event_type=feeding", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-f" },
      error: null,
    });
    mountSection();
    await saveWithNote("feeding", "1/2 dose base");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("feeding");
    expect(typeof args.p_idempotency_key).toBe("string");
    expect(args.p_idempotency_key.length).toBeGreaterThanOrEqual(8);
  });

  it("Training → quicklog_save_event event_type=training (no defoliation subtype)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-t" },
      error: null,
    });
    mountSection();
    await saveWithNote("training", "topped node 5");
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("training");
    expect(args.p_details ?? null).toBeNull();
  });

  it("Defoliation → event_type=training + details.subtype=defoliation (fence)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-d" },
      error: null,
    });
    mountSection();
    await saveWithNote("defoliation", "removed 6 fan leaves");
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("training");
    expect(args.p_details).toEqual({ subtype: "defoliation" });
  });

  it("Photo → quicklog_save_event event_type=photo", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-p" },
      error: null,
    });
    mountSection();
    await saveWithoutNote("photo");
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("photo");
  });

  it("Environment check → quicklog_save_event event_type=environment", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-env" },
      error: null,
    });
    mountSection();
    await saveWithNote("environment_check", "temp felt warm");
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("environment");
  });

  it("Issue / observation → quicklog_save_event event_type=observation with issue subtype", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-obs" },
      error: null,
    });
    mountSection();
    await saveWithNote("issue_observation", "yellowing on fan leaf");
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("observation");
    expect(args.p_details).toEqual({ subtype: "issue" });
  });
});

describe("QuickLogAllActivitiesSection — Harvest v1b", () => {
  it("Harvest saves via quicklog_save_event event_type=harvest and appears in saved breakdown", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-h" },
      error: null,
    });
    const l = listenForEntryCreated();
    mountSection();
    await saveWithNote("harvest", "wet trim 210g");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("harvest");
    // Harvest must not be faked as observation or other type.
    expect(args.p_event_type).not.toBe("observation");
    await waitFor(() => expect(l.events.length).toBe(1));
    const items = await screen.findAllByTestId(
      "quick-log-all-activities-saved-item",
    );
    expect(items[0]).toHaveAttribute("data-saved-activity-id", "harvest");
    expect(items[0]).toHaveTextContent(/harvest/i);
    l.dispose();
  });

  it("failed Harvest RPC does not dispatch and shows no saved item", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const l = listenForEntryCreated();
    mountSection();
    await saveWithNote("harvest", "x");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(l.events.length).toBe(0);
    expect(
      screen.queryByTestId("quick-log-all-activities-saved"),
    ).toBeNull();
    l.dispose();
  });

  it("unsaved Harvest draft does not appear in saved breakdown", () => {
    mountSection();
    selectActivity("harvest");
    // Cancel without saving.
    const cancel = screen.queryByTestId("quick-log-all-activities-cancel");
    if (cancel) fireEvent.click(cancel);
    expect(
      screen.queryByTestId("quick-log-all-activities-saved"),
    ).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("no NON-harvest supported activity emits event_type='harvest'", async () => {
    for (const def of Object.values(QUICK_LOG_ACTIVITY_DEFINITIONS)) {
      if (!def.enabled) continue;
      if (def.saveRoute !== "event") continue;
      if (def.id === "harvest") continue;
      rpcMock.mockReset();
      rpcMock.mockResolvedValueOnce({
        data: { ok: true, grow_event_id: `id-${def.id}` },
        error: null,
      });
      const { unmount } = mountSection();
      await saveWithNote(def.id, "x");
      const [, args] = rpcMock.mock.calls[0];
      expect(args.p_event_type).not.toBe("harvest");
      unmount();
    }
  });
});

describe("QuickLogAllActivitiesSection — failure paths", () => {
  it("failed RPC does NOT dispatch verdant:entry-created and shows no saved item", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const l = listenForEntryCreated();
    mountSection();
    await saveWithNote("feeding", "x");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await screen.findByTestId("quick-log-all-activities-error");
    expect(l.events.length).toBe(0);
    expect(screen.queryByTestId("quick-log-all-activities-saved")).toBeNull();
    l.dispose();
  });

  it("unsaved draft selection never appears in saved breakdown", async () => {
    mountSection();
    selectActivity("training");
    await screen.findByTestId("quick-log-all-activities-form");
    // User cancels without saving.
    fireEvent.click(screen.getByTestId("quick-log-all-activities-cancel"));
    expect(screen.queryByTestId("quick-log-all-activities-saved")).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Manual sensor snapshot is deferred to the existing card path (no RPC)", async () => {
    mountSection();
    selectActivity("manual_sensor_snapshot");
    await screen.findByTestId("quick-log-all-activities-manual-sensor-hint");
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("QuickLogAllActivitiesSection — safety copy", () => {
  it("does not use recommendation / diagnosis / healthy language in visible copy", () => {
    mountSection();
    const root = screen.getByTestId("quick-log-all-activities");
    const txt = root.textContent?.toLowerCase() ?? "";
    // Forbidden: recommendation/certainty phrasing.
    expect(txt).not.toMatch(/we recommend/);
    expect(txt).not.toMatch(/\bis safe to (feed|train|defoliate)/);
    expect(txt).not.toMatch(/ready to harvest/);
    expect(txt).not.toMatch(/plant is healthy/);
    expect(txt).not.toMatch(/guaranteed/);
  });
});

describe("QuickLogAllActivitiesSection — Harvest v1b.next hardening", () => {
  it("stale backend (invalid_event_type) shows backend-unavailable copy, no dispatch, no saved item, no Timeline write, no observation fallback", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: false, reason: "invalid_event_type" },
      error: null,
    });
    const l = listenForEntryCreated();
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-wet"),
      { target: { value: "120" } },
    );
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-note"),
      { target: { value: "cola down" } },
    );
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    // Exactly one RPC — no observation-fallback second call.
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("harvest");

    const err = await screen.findByTestId("quick-log-all-activities-error");
    expect(err.textContent?.toLowerCase()).toContain(
      "not enabled on this backend yet",
    );
    expect(l.events.length).toBe(0);
    expect(screen.queryByTestId("quick-log-all-activities-saved")).toBeNull();
    l.dispose();
  });

  it("saved breakdown shows concise harvest wet/dry/unit details after success", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-hd" },
      error: null,
    });
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-wet"),
      { target: { value: "120" } },
    );
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-dry"),
      { target: { value: "32" } },
    );
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    const items = await screen.findAllByTestId(
      "quick-log-all-activities-saved-item",
    );
    const txt = items[0].textContent ?? "";
    expect(txt).toMatch(/harvest/i);
    expect(txt).toMatch(/wet\s*120\s*g/i);
    expect(txt).toMatch(/dry\s*32\s*g/i);
    expect(txt.toLowerCase()).not.toContain("yield");
  });

  it("saved breakdown hides missing dry/wet and stays plain Harvest with no weights", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-hd2" },
      error: null,
    });
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-wet"),
      { target: { value: "50" } },
    );
    // dry left empty
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    const items = await screen.findAllByTestId(
      "quick-log-all-activities-saved-item",
    );
    const txt = items[0].textContent ?? "";
    expect(txt).toMatch(/wet\s*50\s*g/i);
    expect(txt.toLowerCase()).not.toMatch(/\bdry\b/);
  });

  it("negative wet weight shows inline validation and blocks the save", async () => {
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-wet"),
      { target: { value: "-3" } },
    );
    const err = await screen.findByTestId(
      "quick-log-all-activities-harvest-wet-error",
    );
    expect(err.textContent).toMatch(/cannot be negative/i);
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("negative dry weight shows inline validation and blocks the save", async () => {
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-dry"),
      { target: { value: "-1.5" } },
    );
    const err = await screen.findByTestId(
      "quick-log-all-activities-harvest-dry-error",
    );
    expect(err.textContent).toMatch(/cannot be negative/i);
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("valid decimals save correctly and appear in saved breakdown", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-dec" },
      error: null,
    });
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-wet"),
      { target: { value: "12.5" } },
    );
    fireEvent.change(
      screen.getByTestId("quick-log-all-activities-harvest-dry"),
      { target: { value: "3.25" } },
    );
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_details).toEqual({
      harvest: { wetWeight: "12.5", dryWeight: "3.25", weightUnit: "g" },
    });
    const items = await screen.findAllByTestId(
      "quick-log-all-activities-saved-item",
    );
    expect(items[0].textContent).toMatch(/12\.5/);
    expect(items[0].textContent).toMatch(/3\.25/);
  });
});
