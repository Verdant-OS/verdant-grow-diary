import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), track: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/quickLogSuccessTelemetry", () => ({ trackQuickLogSuccess: mocks.track }));
const id = "77777777-7777-4777-8777-000000000001";
const payload: QuickLogV2SavePayload = {
  p_target_type: "plant",
  p_target_id: "33333333-3333-4333-8333-333333333333",
  p_action: "water",
  p_volume_ml: 250,
  p_note: "Starter watering",
  p_temperature_c: null,
  p_humidity_pct: null,
  p_vpd_kpa: null,
  p_occurred_at: null,
  p_idempotency_key: "starter-water-original-key",
};
beforeEach(() => vi.resetAllMocks());
describe("starter Water manual receipt validation", () => {
  it.each([
    { ok: "false", grow_event_id: id },
    { ok: 1, grow_event_id: id },
    { ok: true },
    { ok: true, grow_event_id: null },
    { ok: true, grow_event_id: "event-not-a-uuid" },
    { ok: true, grow_event_id: {} },
  ])("does not confirm malformed receipt %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => useQuickLogV2Save());
    await act(async () => {
      expect(await result.current.save(payload, { telemetryIntent: "water" })).toMatchObject({
        ok: false,
      });
    });
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it("retries the same payload and accepts a valid reused receipt", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { ok: true }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, grow_event_id: id, reused: true }, error: null });
    const { result } = renderHook(() => useQuickLogV2Save());
    await act(async () => {
      expect((await result.current.save(payload, { telemetryIntent: "water" })).ok).toBe(false);
    });
    expect(mocks.track).not.toHaveBeenCalled();
    await act(async () => {
      expect(await result.current.save(payload, { telemetryIntent: "water" })).toMatchObject({
        ok: true,
        growEventId: id,
        reused: true,
      });
    });
    expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0]);
    expect(mocks.track).toHaveBeenCalledTimes(1);
  });
});
