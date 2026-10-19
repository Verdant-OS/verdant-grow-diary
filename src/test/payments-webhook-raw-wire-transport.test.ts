// Transport, shape and alias cases for the signed raw-wire payments-webhook harness.
// Kept in their own file because src/test/payments-webhook-raw-wire.test.ts is a locked
// scorer (scripts/scorer-lock.mjs); these checks are additive and leave it untouched.
import { describe, expect, it } from "vitest";
import {
  harness,
  subscription,
  transaction,
  type Row,
} from "../../supabase/functions/payments-webhook/rawWireTestHarness";

describe("payments-webhook raw-wire transport, shape and alias guards", () => {
  it("rejects non-POST transport before signature verification", async () => {
    const h = harness();
    expect(await h.deliver(subscription(), { method: "GET" })).toEqual({
      code: 405,
      status: "Method not allowed",
    });
    expect(h.events.size).toBe(0);
  });

  it.each([[{}], [{ event_id: "evt_missing_type", data: {} }], [null], ["not-an-object"]])(
    "rejects signed payloads that cannot normalize to an event (%j)",
    async (payload) => {
      const h = harness();
      expect(await h.deliver(payload)).toEqual({ code: 400, status: "invalid_event_shape" });
      expect(h.events.size).toBe(0);
      expect(h.writes).toEqual([]);
    },
  );

  it("aliases wire subscription_id so recurring transactions stay excluded", async () => {
    const h = harness();
    const raw = transaction("credit_pack_50", {
      subscription_id: "sub_fixture",
      subscriptionId: null,
    });
    expect(await h.deliver(raw)).toEqual({
      code: 200,
      status: "skipped:non_lifetime_transaction",
    });
    expect((h.normalizedEvents[0].data as Row).subscriptionId).toBe("sub_fixture");
  });
});
