import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  track: vi.fn(),
  eventRead: vi.fn(),
  waterRead: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => (table === "grow_events" ? mocks.eventRead() : mocks.waterRead()),
        }),
      }),
    }),
  },
}));
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
  p_occurred_at: "2026-09-26T04:00:00.000Z",
  p_idempotency_key: "starter-water-original-key",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.eventRead.mockResolvedValue({
    data: {
      id,
      event_type: "watering",
      source: "manual",
      is_deleted: false,
      grow_id: "grow-1",
      plant_id: payload.p_target_id,
      tent_id: "tent-1",
      occurred_at: payload.p_occurred_at,
      note: payload.p_note,
    },
    error: null,
  });
  mocks.waterRead.mockResolvedValue({ data: { event_id: id, volume_ml: 250 }, error: null });
});
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
    expect(mocks.eventRead).toHaveBeenCalledTimes(1);
    expect(mocks.waterRead).toHaveBeenCalledTimes(1);
  });

  it("does not confirm a reused Note event with the Watering key", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: id, reused: true },
      error: null,
    });
    mocks.eventRead.mockResolvedValue({
      data: {
        id,
        event_type: "observation",
        source: "manual",
        is_deleted: false,
        plant_id: payload.p_target_id,
        occurred_at: payload.p_occurred_at,
        note: payload.p_note,
      },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());
    await act(async () => {
      expect(await result.current.save(payload, { telemetryIntent: "water" })).toMatchObject({
        ok: false,
        reason: "receipt_mismatch",
      });
    });
    expect(mocks.waterRead).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it.each([{ grow_id: "another-grow" }, { tent_id: "another-tent" }])(
    "does not confirm a reused Watering saved in a different context %j",
    async (change) => {
      mocks.rpc.mockResolvedValue({
        data: { ok: true, grow_event_id: id, reused: true },
        error: null,
      });
      mocks.eventRead.mockResolvedValue({
        data: {
          id,
          event_type: "watering",
          source: "manual",
          is_deleted: false,
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: payload.p_target_id,
          occurred_at: payload.p_occurred_at,
          note: payload.p_note,
          ...change,
        },
        error: null,
      });
      const { result } = renderHook(() => useQuickLogV2Save());
      await act(async () => {
        expect(
          await result.current.save(payload, {
            expectedWaterTarget: {
              plantId: payload.p_target_id,
              growId: "grow-1",
              tentId: "tent-1",
            },
          }),
        ).toMatchObject({ ok: false, reason: "receipt_mismatch" });
      });
      expect(mocks.waterRead).not.toHaveBeenCalled();
      expect(mocks.track).not.toHaveBeenCalled();
    },
  );

  it("rejects a new Water receipt saved under a moved plant's new grow or tent", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: id, reused: false },
      error: null,
    });
    mocks.eventRead.mockResolvedValue({
      data: {
        id,
        event_type: "watering",
        source: "manual",
        is_deleted: false,
        grow_id: "new-grow",
        tent_id: "new-tent",
        plant_id: payload.p_target_id,
        occurred_at: payload.p_occurred_at,
        note: payload.p_note,
      },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());
    await act(async () => {
      expect(
        await result.current.save(payload, {
          expectedWaterTarget: {
            plantId: payload.p_target_id,
            growId: "grow-1",
            tentId: "tent-1",
          },
        }),
      ).toMatchObject({ ok: false, reason: "receipt_mismatch" });
    });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("does not confirm a reused Watering that has been retracted", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: id, reused: true },
      error: null,
    });
    mocks.eventRead.mockResolvedValue({
      data: {
        id,
        event_type: "watering",
        source: "manual",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: payload.p_target_id,
        occurred_at: payload.p_occurred_at,
        note: payload.p_note,
        is_deleted: true,
      },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());
    await act(async () => {
      expect(await result.current.save(payload)).toMatchObject({
        ok: false,
        reason: "receipt_mismatch",
      });
    });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it.each([
    { plant_id: "55555555-5555-4555-8555-555555555555" },
    { note: "another Watering" },
    { occurred_at: "2026-09-26T05:00:00.000Z" },
  ])("does not confirm a reused Watering with different persisted context %j", async (change) => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: id, reused: true },
      error: null,
    });
    mocks.eventRead.mockResolvedValue({
      data: {
        id,
        event_type: "watering",
        source: "manual",
        is_deleted: false,
        plant_id: payload.p_target_id,
        occurred_at: payload.p_occurred_at,
        note: payload.p_note,
        ...change,
      },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());
    await act(async () => {
      expect(await result.current.save(payload)).toMatchObject({
        ok: false,
        reason: "receipt_mismatch",
      });
    });
    expect(mocks.waterRead).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("does not confirm a reused Watering with a different volume or missing child", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: id, reused: true },
      error: null,
    });
    mocks.waterRead.mockResolvedValueOnce({ data: { event_id: id, volume_ml: 500 }, error: null });
    const { result } = renderHook(() => useQuickLogV2Save());
    await act(async () => {
      expect(await result.current.save(payload)).toMatchObject({
        ok: false,
        reason: "receipt_mismatch",
      });
    });
    mocks.waterRead.mockResolvedValueOnce({ data: null, error: null });
    await act(async () => {
      expect(await result.current.save(payload)).toMatchObject({
        ok: false,
        reason: "receipt_unverified",
      });
    });
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
