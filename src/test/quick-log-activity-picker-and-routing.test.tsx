/**
 * quick-log-activity-picker + save-routing tests for Verdant Quick Log
 * Activity Types v1a — no schema change.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { renderHook, act } from "@testing-library/react";

import QuickLogActivityPicker from "@/components/QuickLogActivityPicker";
import {
  QUICK_LOG_ACTIVITY_DEFINITIONS,
  QUICK_LOG_HARVEST_DISABLED_REASON,
  QUICK_LOG_HARVEST_BACKEND_UNAVAILABLE_REASON,
} from "@/constants/quickLogActivityTypes";
import { useQuickLogActivitySave } from "@/hooks/useQuickLogActivitySave";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

beforeEach(() => {
  rpcMock.mockReset();
});

describe("QuickLogActivityPicker", () => {
  it("renders every supported v1a activity label", () => {
    const onSelect = vi.fn();
    render(<QuickLogActivityPicker onSelect={onSelect} />);
    for (const def of Object.values(QUICK_LOG_ACTIVITY_DEFINITIONS)) {
      expect(screen.getByText(def.label)).toBeInTheDocument();
    }
  });

  it("renders Harvest disabled with backend-update copy", () => {
    render(<QuickLogActivityPicker onSelect={vi.fn()} />);
    const harvest = screen.getByTestId("quick-log-activity-harvest");
    expect(harvest).toBeDisabled();
    expect(
      screen.getByTestId("quick-log-activity-harvest-disabled-reason"),
    ).toHaveTextContent(QUICK_LOG_HARVEST_DISABLED_REASON);
  });

  it("calls onSelect for enabled activities but never for Harvest", () => {
    const onSelect = vi.fn();
    render(<QuickLogActivityPicker onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("quick-log-activity-feeding"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe("feeding");

    fireEvent.click(screen.getByTestId("quick-log-activity-harvest"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("uses safety copy from shared definitions (no diagnosis/recommendation)", () => {
    render(<QuickLogActivityPicker onSelect={vi.fn()} />);
    expect(
      screen.getByTestId("quick-log-activity-feeding-safety"),
    ).toHaveTextContent(/not a nutrient recommendation/i);
    expect(
      screen.getByTestId("quick-log-activity-training-safety"),
    ).toHaveTextContent(/does not mean the plant was safe to train/i);
    expect(
      screen.getByTestId("quick-log-activity-defoliation-safety"),
    ).toHaveTextContent(/does not diagnose recovery or plant stress/i);
    expect(
      screen.getByTestId("quick-log-activity-issue_observation-safety"),
    ).toHaveTextContent(/not a diagnosis by itself/i);
    expect(
      screen.getByTestId("quick-log-activity-manual_sensor_snapshot-safety"),
    ).toHaveTextContent(/manual, not live sensor data/i);
  });
});

describe("useQuickLogActivitySave — routing", () => {
  it("routes Note through quicklog_save_manual with p_action=note", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, grow_event_id: "n1" }, error: null });
    const { result } = renderHook(() => useQuickLogActivitySave());
    let res!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      res = await result.current.save({
        activityId: "note",
        growId: "g1",
        plantId: "p1",
        note: "hello",
      });
    });
    expect(res.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, payload] = rpcMock.mock.calls[0];
    expect(name).toBe("quicklog_save_manual");
    expect(payload.p_action).toBe("note");
    expect(payload.p_grow_id).toBe("g1");
  });

  it("routes Watering through quicklog_save_manual with p_action=water", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, grow_event_id: "w1" }, error: null });
    const { result } = renderHook(() => useQuickLogActivitySave());
    await act(async () => {
      await result.current.save({
        activityId: "watering",
        growId: "g1",
      });
    });
    const [name, payload] = rpcMock.mock.calls[0];
    expect(name).toBe("quicklog_save_manual");
    expect(payload.p_action).toBe("water");
  });

  it.each([
    ["feeding", "feeding"],
    ["training", "training"],
    ["photo", "photo"],
    ["environment_check", "environment"],
    ["issue_observation", "observation"],
  ] as const)(
    "routes %s through quicklog_save_event with event_type=%s",
    async (activityId, eventType) => {
      rpcMock.mockResolvedValueOnce({
        data: { ok: true, grow_event_id: "e1" },
        error: null,
      });
      const { result } = renderHook(() => useQuickLogActivitySave());
      await act(async () => {
        await result.current.save({
          activityId,
          growId: "g1",
          idempotencyKey: "idem-key-12345",
        });
      });
      const [name, payload] = rpcMock.mock.calls[0];
      expect(name).toBe("quicklog_save_event");
      expect(payload.p_event_type).toBe(eventType);
    },
  );

  it("Defoliation persists as event_type=training with details.subtype=defoliation", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "d1" },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogActivitySave());
    await act(async () => {
      await result.current.save({
        activityId: "defoliation",
        growId: "g1",
        idempotencyKey: "idem-key-12345",
      });
    });
    const [name, payload] = rpcMock.mock.calls[0];
    expect(name).toBe("quicklog_save_event");
    expect(payload.p_event_type).toBe("training");
    expect(payload.p_details).toEqual({ subtype: "defoliation" });
  });

  it("Harvest never calls any RPC and returns disabled reason", async () => {
    const { result } = renderHook(() => useQuickLogActivitySave());
    let res!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      res = await result.current.save({
        activityId: "harvest",
        growId: "g1",
      });
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("harvest_disabled");
    expect(res.disabledReason).toBe(QUICK_LOG_HARVEST_DISABLED_REASON);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("never writes event_type='harvest' for any activity", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: "x" }, error: null });
    const { result } = renderHook(() => useQuickLogActivitySave());
    for (const id of [
      "note",
      "watering",
      "feeding",
      "training",
      "defoliation",
      "photo",
      "environment_check",
      "issue_observation",
    ] as const) {
      await act(async () => {
        await result.current.save({
          activityId: id,
          growId: "g1",
          idempotencyKey: "idem-key-12345",
        });
      });
    }
    for (const call of rpcMock.mock.calls) {
      const payload = call[1] as { p_event_type?: string };
      if (payload && payload.p_event_type != null) {
        expect(payload.p_event_type).not.toBe("harvest");
      }
    }
  });

  it("failed save does not dispatch verdant:entry-created", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const listener = vi.fn();
    window.addEventListener("verdant:entry-created", listener);
    const { result } = renderHook(() => useQuickLogActivitySave());
    let res!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      res = await result.current.save({
        activityId: "feeding",
        growId: "g1",
        idempotencyKey: "idem-key-12345",
      });
    });
    window.removeEventListener("verdant:entry-created", listener);
    expect(res.ok).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("successful save dispatches verdant:entry-created exactly once", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, grow_event_id: "e2" }, error: null });
    const listener = vi.fn();
    window.addEventListener("verdant:entry-created", listener);
    const { result } = renderHook(() => useQuickLogActivitySave());
    await act(async () => {
      await result.current.save({
        activityId: "training",
        growId: "g1",
        idempotencyKey: "idem-key-12345",
      });
    });
    window.removeEventListener("verdant:entry-created", listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("event route requires an idempotency key", async () => {
    const { result } = renderHook(() => useQuickLogActivitySave());
    let res!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      res = await result.current.save({
        activityId: "training",
        growId: "g1",
      });
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("missing_idempotency_key");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
