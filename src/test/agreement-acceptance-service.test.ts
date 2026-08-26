/**
 * recordOwnAgreementAcceptances — server auth.uid() write path.
 *
 * Pins that the client RPC never forwards a client-chosen user_id and that
 * the payload shape matches what the forward-repair migration expects.
 */
import { describe, it, expect, vi } from "vitest";
import {
  RECORD_OWN_AGREEMENT_ACCEPTANCES_RPC,
  acceptancePayloadsForCurrentAgreements,
  recordOwnAgreementAcceptances,
} from "@/lib/agreementAcceptanceService";
import { CURRENT_AGREEMENT_LIST } from "@/constants/agreements";

describe("acceptancePayloadsForCurrentAgreements", () => {
  it("omits user_id and covers every current agreement", () => {
    const payloads = acceptancePayloadsForCurrentAgreements("TestAgent/1.0");
    expect(payloads).toHaveLength(CURRENT_AGREEMENT_LIST.length);
    for (const payload of payloads) {
      expect(payload).not.toHaveProperty("user_id");
      expect(payload.user_agent).toBe("TestAgent/1.0");
      expect(CURRENT_AGREEMENT_LIST.some((a) => a.type === payload.agreement_type)).toBe(true);
    }
  });
});

describe("recordOwnAgreementAcceptances", () => {
  it("calls the auth.uid() RPC with payloads that exclude user_id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const payloads = acceptancePayloadsForCurrentAgreements(null);
    const { error } = await recordOwnAgreementAcceptances({ rpc }, payloads);
    expect(error).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(RECORD_OWN_AGREEMENT_ACCEPTANCES_RPC, {
      p_acceptances: payloads,
    });
    const sent = rpc.mock.calls[0][1].p_acceptances as Array<Record<string, unknown>>;
    expect(sent.every((row) => !Object.prototype.hasOwnProperty.call(row, "user_id"))).toBe(true);
  });

  it("surfaces RPC errors without throwing", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "new row violates row-level security policy", code: "42501" },
    });
    const { error } = await recordOwnAgreementAcceptances(
      { rpc },
      acceptancePayloadsForCurrentAgreements(),
    );
    expect(error?.code).toBe("42501");
  });
});
