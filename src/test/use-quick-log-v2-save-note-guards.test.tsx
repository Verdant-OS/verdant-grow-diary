import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

const rpcMock = vi.fn();
const readbackMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();
const telemetryMock = vi.fn();
const win = window as unknown as { gtag?: (...args: unknown[]) => void };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));
vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: (...args: unknown[]) => telemetryMock(...args),
}));

const notePayload: QuickLogV2SavePayload = {
  p_target_type: "plant",
  p_target_id: "33333333-3333-4333-8333-333333333333",
  p_action: "note",
  p_volume_ml: null,
  p_note: "Grower note",
  p_temperature_c: null,
  p_humidity_pct: null,
  p_vpd_kpa: null,
  p_occurred_at: null,
  p_idempotency_key: "note-idempotency-key",
};

const confirmedEventId = "77777777-7777-4777-8777-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  win.gtag = vi.fn();
  fromMock.mockImplementation(() => ({ select: selectMock }));
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  eqMock.mockImplementation(() => ({ maybeSingle: readbackMock }));
});

describe("useQuickLogV2Save note lifecycle guards", () => {
  it("fail-closes before RPC when canContinueNote is already false", async () => {
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      expect(await result.current.save(notePayload, { canContinueNote: () => false })).toEqual({
        ok: false,
        reason: "receipt_unverified",
      });
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(false);
  });

  it("fail-closes after RPC when the owning sheet becomes inactive", async () => {
    let active = true;
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: confirmedEventId, reused: false },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      const pending = result.current.save(notePayload, { canContinueNote: () => active });
      active = false;
      expect(await pending).toEqual({ ok: false, reason: "receipt_unverified" });
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(telemetryMock).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(true);
  });

  it("fail-closes during readback verification when the owning sheet becomes inactive", async () => {
    let active = true;
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: confirmedEventId, reused: true },
      error: null,
    });
    readbackMock.mockImplementationOnce(async () => {
      active = false;
      return {
        data: {
          id: confirmedEventId,
          note: notePayload.p_note,
          plant_id: notePayload.p_target_id,
          tent_id: "55555555-5555-4555-8555-555555555555",
        },
        error: null,
      };
    });
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      expect(
        await result.current.save(notePayload, {
          verifyPersistedNote: true,
          canContinueNote: () => active,
        }),
      ).toEqual({ ok: false, reason: "receipt_unverified" });
    });

    expect(readbackMock).toHaveBeenCalledTimes(1);
    expect(telemetryMock).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(true);
  });

  it.each(["true", 1, {}])("requires strict ok===true for Note saves (ok=%j)", async (ok) => {
    rpcMock.mockResolvedValueOnce({ data: { ok, grow_event_id: confirmedEventId }, error: null });
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      expect(await result.current.save(notePayload)).toEqual({ ok: false, reason: "save_failed" });
    });

    expect(telemetryMock).not.toHaveBeenCalled();
  });

  it("treats non-object RPC payloads as failed Note saves", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      expect(await result.current.save(notePayload)).toEqual({ ok: false, reason: "save_failed" });
    });

    expect(telemetryMock).not.toHaveBeenCalled();
  });

  it("does not apply strict ok===true to non-note actions", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: 1, grow_event_id: confirmedEventId },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      expect(
        await result.current.save(
          { ...notePayload, p_action: "water", p_volume_ml: 500 },
          { telemetryIntent: "watering" },
        ),
      ).toMatchObject({ ok: true });
    });

    expect(telemetryMock).toHaveBeenCalledTimes(1);
  });
});
