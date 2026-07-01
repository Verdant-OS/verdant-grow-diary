/**
 * Integration tests for Verdant Quick Log Activity Types v1a.next —
 * QuickLogAllActivitiesSection.
 *
 * Proves end-to-end that every supported v1a activity:
 *  - renders via shared QuickLogActivityPicker (no duplicate taxonomy)
 *  - routes saves through the shared useQuickLogActivitySave hook
 *  - dispatches verdant:entry-created only on confirmed success
 *  - appears in the local "What was saved" breakdown only on success
 *  - Harvest never opens a form, never RPCs, never dispatches, never
 *    appears in the saved breakdown
 *  - failed saves do not dispatch and do not add saved items
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import {
  QUICK_LOG_ACTIVITY_DEFINITIONS,
  QUICK_LOG_HARVEST_DISABLED_REASON,
} from "@/constants/quickLogActivityTypes";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";

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
      {...props}
    />,
  );
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
  fireEvent.click(screen.getByTestId(`quick-log-all-activities-picker-${activityId}`));
  const textarea = await screen.findByTestId("quick-log-all-activities-note");
  fireEvent.change(textarea, { target: { value: note } });
  fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
}

async function saveWithoutNote(activityId: string) {
  fireEvent.click(screen.getByTestId(`quick-log-all-activities-picker-${activityId}`));
  await screen.findByTestId("quick-log-all-activities-form");
  fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("QuickLogAllActivitiesSection — shared taxonomy", () => {
  it("renders every supported v1a activity from shared definitions", () => {
    mountSection();
    for (const def of Object.values(QUICK_LOG_ACTIVITY_DEFINITIONS)) {
      expect(
        screen.getByTestId(`quick-log-all-activities-picker-${def.id}`),
      ).toBeInTheDocument();
    }
  });

  it("renders Harvest visibly disabled with backend-update copy", () => {
    mountSection();
    const btn = screen.getByTestId("quick-log-all-activities-picker-harvest");
    expect(btn).toBeDisabled();
    expect(
      screen.getByTestId(
        "quick-log-all-activities-picker-harvest-disabled-reason",
      ),
    ).toHaveTextContent(QUICK_LOG_HARVEST_DISABLED_REASON);
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
    expect(args.p_grow_id).toBe(GROW);
    expect(args.p_plant_id).toBe(PLANT);
    expect(args.p_note).toBe("seedling perky");
    await waitFor(() => expect(l.events.length).toBe(1));
    const items = await screen.findAllByTestId("quick-log-all-activities-saved-item");
    expect(items[0]).toHaveAttribute("data-saved-activity-id", "note");
    expect(items[0]).toHaveTextContent(/plant note/i);
    l.dispose();
  });

  it("Watering → quicklog_save_manual with p_action=water", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-w" },
      error: null,
    });
    mountSection();
    await saveWithoutNote("watering");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_manual");
    expect(args.p_action).toBe("water");
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

describe("QuickLogAllActivitiesSection — Harvest exclusion", () => {
  it("Harvest cannot open a form and never calls any RPC", () => {
    const l = listenForEntryCreated();
    mountSection();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-harvest"));
    expect(screen.queryByTestId("quick-log-all-activities-form")).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(l.events.length).toBe(0);
    l.dispose();
  });

  it("no supported activity ever emits event_type='harvest'", async () => {
    // Sweep every enabled event-route activity and assert the payload.
    for (const def of Object.values(QUICK_LOG_ACTIVITY_DEFINITIONS)) {
      if (!def.enabled) continue;
      if (def.saveRoute !== "event") continue;
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
    fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-training"));
    await screen.findByTestId("quick-log-all-activities-form");
    // User cancels without saving.
    fireEvent.click(screen.getByTestId("quick-log-all-activities-cancel"));
    expect(screen.queryByTestId("quick-log-all-activities-saved")).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Manual sensor snapshot is deferred to the existing card path (no RPC)", async () => {
    mountSection();
    fireEvent.click(
      screen.getByTestId("quick-log-all-activities-picker-manual_sensor_snapshot"),
    );
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
    expect(txt).not.toMatch(/safe to feed/);
    expect(txt).not.toMatch(/safe to train/);
    expect(txt).not.toMatch(/ready to harvest/);
    expect(txt).not.toMatch(/plant is healthy/);
    expect(txt).not.toMatch(/guaranteed/);
  });
});
