import { describe, expect, it, vi } from "vitest";
import {
  createEcowittCustomUploadClaim,
  type EcowittClaimRpcClient,
} from "@/lib/ecowittCustomUploadClaimService";

const TENT = "22222222-2222-4222-8222-222222222222";
const CLAIM = "44444444-4444-4444-8444-444444444444";
const TOKEN = "ef".repeat(24);

describe("EcoWitt claim create service", () => {
  it("returns the one-time token from the RPC and refuses a missing tent", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ claim_id: CLAIM, upload_token: TOKEN }],
      error: null,
    }));
    const client: EcowittClaimRpcClient = { rpc };
    const created = await createEcowittCustomUploadClaim(client, TENT);
    expect(created).toEqual({ ok: true, claimId: CLAIM, uploadToken: TOKEN });
    expect(rpc).toHaveBeenCalledWith("create_ecowitt_custom_upload_claim", { p_tent_id: TENT });
    expect(await createEcowittCustomUploadClaim(client, null)).toEqual({
      ok: false,
      reason: "tent_missing",
    });
  });

  it("does not accept a token that is not hex", async () => {
    const client: EcowittClaimRpcClient = {
      rpc: async () => ({
        data: [{ claim_id: CLAIM, upload_token: "not a real token" }],
        error: null,
      }),
    };
    expect(await createEcowittCustomUploadClaim(client, TENT)).toEqual({
      ok: false,
      reason: "malformed_response",
    });
  });
});
