import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";

const EVENT = "11111111-1111-4111-8111-111111111111";
const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: vi.fn(),
}));

describe("unverified note receipt keeps the RPC id", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    const builder: Record<string, unknown> = {};
    const pass = () => builder;
    builder.select = pass;
    builder.eq = pass;
    builder.maybeSingle = () => Promise.resolve({ data: null, error: { message: "read failed" } });
    fromMock.mockReturnValue(builder);
  });

  it("returns the event id when the note readback fails", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: EVENT, reused: false },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());
    let receipt: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      receipt = await result.current.save(
        {
          p_target_type: "tent",
          p_target_id: "33333333-3333-4333-8333-333333333333",
          p_action: "note",
          p_volume_ml: null,
          p_note: "trimmed",
          p_temperature_c: null,
          p_humidity_pct: null,
          p_vpd_kpa: null,
          p_occurred_at: null,
          p_idempotency_key: "11111111-1111-4111-8111-111111111112",
        },
        { verifyPersistedNote: true },
      );
    });
    expect(receipt).toMatchObject({
      ok: false,
      reason: "receipt_unverified",
      growEventId: EVENT,
    });
  });
});
