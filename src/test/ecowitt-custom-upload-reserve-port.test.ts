import { describe, expect, it, vi } from "vitest";
import {
  ECOWITT_CUSTOM_UPLOAD_RESERVE_RPC,
  reserveEcowittCustomUploadReceipt,
} from "../../supabase/functions/_shared/ecowittCustomUploadSupabasePorts";

const CLAIM = "44444444-4444-4444-8444-444444444444";

describe("EcoWitt receipt reserve port", () => {
  it("calls the reserve RPC and keeps a failed reservation from looking stored", async () => {
    const rpc = vi.fn(async () => ({ data: "rate_limited", error: null }));
    const reserved = await reserveEcowittCustomUploadReceipt(
      rpc,
      CLAIM,
      "2026-11-02T18:00:30.000Z",
      "2026-11-02T18:00:00.000Z",
    );
    expect(reserved).toEqual({ ok: false, reason: "rate_limited" });
    expect(rpc).toHaveBeenCalledWith(ECOWITT_CUSTOM_UPLOAD_RESERVE_RPC, {
      p_claim_id: CLAIM,
      p_received_at: "2026-11-02T18:00:30.000Z",
      p_captured_at: "2026-11-02T18:00:00.000Z",
    });
    const missing = await reserveEcowittCustomUploadReceipt(
      async () => ({ data: null, error: { message: "down" } }),
      CLAIM,
      "2026-11-02T18:00:30.000Z",
      "2026-11-02T18:00:00.000Z",
    );
    expect(missing).toEqual({ ok: false, reason: "store_failed" });
  });
});
