/**
 * useQuickLogActivitySave — manual-route RPC contract.
 *
 * Regression for the dead p_grow_id payload: every deployed
 * quicklog_save_manual signature is target-scoped
 * (p_target_type/p_target_id/p_idempotency_key/...), so the old
 * p_grow_id shape always failed with PGRST202 and quietly made Quick Log
 * notes/waterings unsavable through this hook. These tests pin the real
 * payload shape so it cannot drift back.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { useQuickLogActivitySave } from "@/hooks/useQuickLogActivitySave";

const OK_RESPONSE = {
  data: { ok: true, grow_event_id: "event-1", reused: false },
  error: null,
};

beforeEach(() => {
  rpcMock.mockReset();
});

type SaveResult = Awaited<
  ReturnType<ReturnType<typeof useQuickLogActivitySave>["save"]>
>;

async function save(input: Parameters<ReturnType<typeof useQuickLogActivitySave>["save"]>[0]) {
  const { result } = renderHook(() => useQuickLogActivitySave());
  let res!: SaveResult;
  await act(async () => {
    res = await result.current.save(input);
  });
  return res;
}

describe("useQuickLogActivitySave — quicklog_save_manual payload shape", () => {
  it("sends the exact target-scoped signature for a plant note", async () => {
    rpcMock.mockResolvedValueOnce(OK_RESPONSE);
    const res = await save({
      activityId: "note",
      growId: "grow-1",
      tentId: "tent-1",
      plantId: "plant-1",
      note: "leaf tips ok",
      idempotencyKey: "idem-key-12345678",
      extraDetails: { subtype: "morning" },
    });
    expect(res.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, payload] = rpcMock.mock.calls[0];
    expect(name).toBe("quicklog_save_manual");
    expect(payload).toEqual({
      p_target_type: "plant",
      p_target_id: "plant-1",
      p_action: "note",
      p_volume_ml: null,
      p_note: "leaf tips ok",
      p_temperature_c: null,
      p_humidity_pct: null,
      p_vpd_kpa: null,
      p_occurred_at: null,
      p_details: { subtype: "morning" },
      p_idempotency_key: "idem-key-12345678",
    });
    expect(payload).not.toHaveProperty("p_grow_id");
    expect(payload).not.toHaveProperty("p_tent_id");
    expect(payload).not.toHaveProperty("p_plant_id");
  });

  it("falls back to the tent target and threads the watering volume", async () => {
    rpcMock.mockResolvedValueOnce(OK_RESPONSE);
    await save({
      activityId: "watering",
      growId: "grow-1",
      tentId: "tent-1",
      volumeMl: 500,
    });
    const [, payload] = rpcMock.mock.calls[0];
    expect(payload.p_target_type).toBe("tent");
    expect(payload.p_target_id).toBe("tent-1");
    expect(payload.p_action).toBe("water");
    expect(payload.p_volume_ml).toBe(500);
  });

  it("omits p_details without extra details and nulls a server-invalid key", async () => {
    rpcMock.mockResolvedValueOnce(OK_RESPONSE);
    await save({
      activityId: "note",
      growId: "grow-1",
      plantId: "plant-1",
      idempotencyKey: "short",
    });
    const [, payload] = rpcMock.mock.calls[0];
    expect(payload).not.toHaveProperty("p_details");
    expect(payload.p_idempotency_key).toBeNull();
  });

  it("refuses to call the RPC without a tent or plant target", async () => {
    const res = await save({ activityId: "note", growId: "grow-1" });
    expect(res).toEqual({ ok: false, reason: "missing_target" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("surfaces the server reused flag on duplicate submissions", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "event-1", reused: true },
      error: null,
    });
    const res = await save({
      activityId: "note",
      growId: "grow-1",
      plantId: "plant-1",
      idempotencyKey: "idem-key-12345678",
    });
    expect(res.ok).toBe(true);
    expect(res.reused).toBe(true);
    expect(res.growEventId).toBe("event-1");
  });

  it("maps an RPC error to save_failed without dispatching success", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await save({
      activityId: "note",
      growId: "grow-1",
      plantId: "plant-1",
    });
    expect(res).toEqual({ ok: false, reason: "save_failed" });
  });
});
