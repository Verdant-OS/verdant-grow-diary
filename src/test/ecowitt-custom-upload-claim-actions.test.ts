import { describe, expect, it, vi } from "vitest";
import {
  ECOWITT_OPEN_CLAIM_COLUMNS,
  loadOpenEcowittCustomUploadClaim,
  revokeEcowittCustomUploadClaim,
  rotateEcowittCustomUploadClaim,
  type EcowittClaimRpcClient,
  type EcowittOpenClaimClient,
} from "@/lib/ecowittCustomUploadClaimService";

const TENT = "22222222-2222-4222-8222-222222222222";
const CLAIM = "44444444-4444-4444-8444-444444444444";
const TOKEN = "ab".repeat(24);

describe("EcoWitt claim revoke, rotate, and load", () => {
  it("revokes and rotates only through the owner RPCs", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "revoke_ecowitt_custom_upload_claim") return { data: true, error: null };
      return { data: TOKEN, error: null };
    });
    const client = { rpc } as unknown as EcowittClaimRpcClient;
    expect(await revokeEcowittCustomUploadClaim(client, CLAIM)).toEqual({
      ok: true,
      revoked: true,
    });
    expect(await rotateEcowittCustomUploadClaim(client, CLAIM)).toEqual({
      ok: true,
      uploadToken: TOKEN,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "revoke_ecowitt_custom_upload_claim", {
      p_claim_id: CLAIM,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "rotate_ecowitt_custom_upload_claim", {
      p_claim_id: CLAIM,
    });
    expect(await revokeEcowittCustomUploadClaim(client, null)).toEqual({
      ok: false,
      reason: "claim_missing",
    });
  });

  it("loads the open claim without the token or passkey hash", async () => {
    const calls: unknown[] = [];
    const client: EcowittOpenClaimClient = {
      from(table) {
        calls.push(table);
        return {
          select(columns) {
            calls.push(columns);
            return {
              eq(column, value) {
                calls.push([column, value]);
                return {
                  is(column, value) {
                    calls.push([column, value]);
                    return {
                      maybeSingle: async () => ({
                        data: {
                          id: CLAIM,
                          bound_at: "2026-11-02T18:00:00.000Z",
                          revoked_at: null,
                          last_received_at: "2026-11-02T18:00:00.000Z",
                          interval_seconds: 16,
                        },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    const loaded = await loadOpenEcowittCustomUploadClaim(client, TENT);
    expect(loaded).toEqual({
      ok: true,
      claim: {
        id: CLAIM,
        boundAt: "2026-11-02T18:00:00.000Z",
        revokedAt: null,
        lastReceivedAt: "2026-11-02T18:00:00.000Z",
        intervalSeconds: 16,
      },
    });
    expect(calls).toEqual([
      "ecowitt_custom_upload_claims",
      ECOWITT_OPEN_CLAIM_COLUMNS,
      ["tent_id", TENT],
      ["revoked_at", null],
    ]);
    expect(ECOWITT_OPEN_CLAIM_COLUMNS).not.toContain("token_sha256");
    expect(ECOWITT_OPEN_CLAIM_COLUMNS).not.toContain("passkey_sha256");
    expect(JSON.stringify(loaded)).not.toContain("token_sha256");
  });
});
