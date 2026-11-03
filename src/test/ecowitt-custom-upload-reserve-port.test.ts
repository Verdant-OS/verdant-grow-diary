import { describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/functions/_shared/liveSensorEntitlementGate", () => ({
  requireLiveSensorEntitlement: async () => ({
    ok: true,
    effectivePlanId: "pro",
    source: "subscription",
  }),
}));
import {
  ECOWITT_CUSTOM_UPLOAD_COMMIT_RPC,
  ECOWITT_CUSTOM_UPLOAD_RESERVE_RPC,
  classifyEcowittReadingInsertError,
  ecowittServiceRoleInsertResult,
  handleEcowittCustomUploadWithEntitlement,
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

  it("maps a unique-index insert to duplicate so the replay branch is reachable", async () => {
    expect(classifyEcowittReadingInsertError({ code: "23505", message: "duplicate key" })).toBe(
      "duplicate",
    );
    expect(ecowittServiceRoleInsertResult({ code: "23505" })).toEqual({
      ok: false,
      reason: "duplicate",
    });
    const failedInsert = ecowittServiceRoleInsertResult({ code: "23502" });
    expect(failedInsert.ok).toBe(false);
    if (!failedInsert.ok) expect(failedInsert.reason).toBe("failed");
    const callCommit = vi.fn(async () => ({
      data: null,
      error: { code: "23505", message: "sensor_readings_dedupe_uidx" },
    }));
    const response = await handleEcowittCustomUploadWithEntitlement(
      new Request(`https://example.test/ew/${"ef".repeat(24)}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          PASSKEY: "ab".repeat(16),
          stationtype: "GW1200B",
          dateutc: "2026-11-02 18:00:00",
          temp2f: "72",
          humidity2: "55",
          model: "GW1200B",
        }).toString(),
      }),
      {
        supabase: {},
        expectedBillingEnvironment: "live",
        now: new Date("2026-11-02T18:00:30.000Z"),
        serviceRole: {
          lookupClaim: async () => ({
            id: CLAIM,
            userId: "11111111-1111-4111-8111-111111111111",
            tentId: "22222222-2222-4222-8222-222222222222",
            passkeySha256: null,
            stationtype: null,
            intervalSeconds: 16,
            revokedAt: null,
            lastReceivedAt: null,
            lastCapturedAt: null,
          }),
          callBind: async () => ({ data: true, error: null }),
          callReserve: async () => ({ data: "ok", error: null }),
          insertReadings: async () => ecowittServiceRoleInsertResult({ code: "23505" }),
          callCommit,
          tentChannels: async () => ({ ok: true, airChannels: [2], soilChannels: [] }),
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, stored: 0, reason: "stored" });
    expect(callCommit).toHaveBeenCalledWith(
      ECOWITT_CUSTOM_UPLOAD_COMMIT_RPC,
      expect.objectContaining({ p_claim_id: CLAIM }),
    );
  });
});
