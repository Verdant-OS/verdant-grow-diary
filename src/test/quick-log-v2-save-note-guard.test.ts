import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

const rpcMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
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

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  selectMock.mockReset();
  eqMock.mockReset();
  maybeSingleMock.mockReset();
  fromMock.mockImplementation(() => ({ select: selectMock }));
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  eqMock.mockImplementation(() => ({ maybeSingle: maybeSingleMock }));
});

describe("useQuickLogV2Save note ownership guard", () => {
  it("does not dispatch when the owning sheet is already inactive", async () => {
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

  it("aborts after RPC when ownership is lost before readback", async () => {
    let active = true;
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001", reused: true },
      error: null,
    });
    maybeSingleMock.mockImplementation(async () => {
      active = false;
      return {
        data: {
          id: "77777777-7777-4777-8777-000000000001",
          note: "Grower note",
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

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
    expect(result.current.saving).toBe(true);
  });

  it("requires strict ok=true for Note saves even when other actions accept truthy ok", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: "true", grow_event_id: "77777777-7777-4777-8777-000000000001" },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      expect(await result.current.save(notePayload)).toEqual({
        ok: false,
        reason: "save_failed",
      });
    });
  });

  it("rejects Note success without a UUID grow_event_id", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "not-a-uuid" },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      expect(await result.current.save(notePayload)).toEqual({
        ok: false,
        reason: "receipt_unverified",
      });
    });

    expect(fromMock).not.toHaveBeenCalled();
  });
});
