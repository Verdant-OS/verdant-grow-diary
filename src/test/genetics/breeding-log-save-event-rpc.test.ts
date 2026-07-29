import { describe, expect, it, vi } from "vitest";
import {
  BREEDING_LOG_SAVE_EVENT_RPC,
  interpretBreedingLogSaveEventResult,
  isMissingRpcError,
  saveBreedingLogEvent,
  type BreedingLogSaveEventParams,
} from "@/lib/genetics/breedingLogSaveEventRpc";

const params: BreedingLogSaveEventParams = {
  p_idempotency_key: "idem-1",
  p_grow_id: "grow-1",
  p_plant_id: "plant-1",
  p_event_type: "pollination",
  p_tent_id: null,
  p_method: null,
  p_intensity: null,
  p_details: {},
};

describe("isMissingRpcError", () => {
  it("detects PostgREST/postgres missing-function signals", () => {
    expect(isMissingRpcError({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpcError({ code: "42883" })).toBe(true);
    expect(isMissingRpcError({ message: "Could not find the function public.x" })).toBe(true);
    expect(
      isMissingRpcError({ message: "function public.breeding_log_save_event(...) does not exist" }),
    ).toBe(true);
  });

  it("does not misclassify ordinary failures", () => {
    expect(isMissingRpcError(null)).toBe(false);
    expect(isMissingRpcError(undefined)).toBe(false);
    expect(isMissingRpcError({})).toBe(false);
    expect(isMissingRpcError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingRpcError({ message: "permission denied for function" })).toBe(false);
    expect(isMissingRpcError({ message: "network error" })).toBe(false);
  });
});

describe("interpretBreedingLogSaveEventResult", () => {
  it("returns saved only on ok + grow_event_id", () => {
    expect(interpretBreedingLogSaveEventResult({ ok: true, grow_event_id: "e1" }, null)).toEqual({
      status: "saved",
      growEventId: "e1",
    });
  });

  it("rejects partial/failed rows without inventing success", () => {
    expect(interpretBreedingLogSaveEventResult({ ok: true }, null).status).toBe("rejected");
    expect(interpretBreedingLogSaveEventResult({ ok: false, reason: "nope" }, null)).toEqual({
      status: "rejected",
      reason: "nope",
    });
    expect(interpretBreedingLogSaveEventResult(null, null).status).toBe("rejected");
  });

  it("classifies a missing RPC separately from a generic error", () => {
    expect(interpretBreedingLogSaveEventResult(null, { code: "PGRST202" }).status).toBe(
      "schema_out_of_sync",
    );
    expect(interpretBreedingLogSaveEventResult(null, { message: "boom" }).status).toBe("error");
  });
});

describe("saveBreedingLogEvent", () => {
  it("calls the RPC by name with the given params", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, grow_event_id: "e9" }, error: null });
    const outcome = await saveBreedingLogEvent({ rpc }, params);
    expect(rpc).toHaveBeenCalledWith(BREEDING_LOG_SAVE_EVENT_RPC, params);
    expect(outcome).toEqual({ status: "saved", growEventId: "e9" });
  });

  it("surfaces schema_out_of_sync when the function is absent", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    expect((await saveBreedingLogEvent({ rpc }, params)).status).toBe("schema_out_of_sync");
  });

  it("never throws when the client throws", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("socket closed"));
    const outcome = await saveBreedingLogEvent({ rpc }, params);
    expect(outcome).toEqual({ status: "error", reason: "socket closed" });
  });

  it("never reports success on a rejected row", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: false, reason: "denied" }, error: null });
    const outcome = await saveBreedingLogEvent({ rpc }, params);
    expect(outcome.status).toBe("rejected");
  });
});
