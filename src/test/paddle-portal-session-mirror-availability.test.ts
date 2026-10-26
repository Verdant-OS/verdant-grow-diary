import { describe, expect, it } from "vitest";
import {
  OTHER_PORTAL_USER,
  PORTAL_USER,
  SENSITIVE_FAILURE,
  portalSessionHarness,
  recurringRow,
} from "../../supabase/functions/paddle-portal-session/portalSessionTestHarness";

describe("portal availability with independently delivered customer mirrors", () => {
  it.each(["live", "sandbox"])(
    "uses only the authenticated %s subscription when its customer mirror is absent",
    async (environment) => {
      const h = portalSessionHarness();
      h.configureEnvironment(environment);
      h.customers.length = 0;
      h.subscriptions.splice(
        0,
        1,
        recurringRow({
          environment,
          paddle_customer_id: "ctm_owned_fixture",
          paddle_subscription_id: "sub_owned_fixture",
        }),
        recurringRow({
          user_id: OTHER_PORTAL_USER,
          paddle_customer_id: "ctm_other_fixture",
          paddle_subscription_id: "sub_other_fixture",
          environment,
          created_at: "2026-10-22T00:00:00Z",
        }),
        recurringRow({
          environment: environment === "live" ? "sandbox" : "live",
          created_at: "2026-10-23T00:00:00Z",
        }),
      );

      const result = await h.deliver({
        body: { customerId: "ctm_attacker", userId: OTHER_PORTAL_USER, environment: "attacker" },
        query: "?customerId=ctm_attacker&environment=attacker",
      });

      expect(result.status).toBe(200);
      expect(Object.keys(result.body)).toEqual(["url"]);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
      expect(h.portalCalls).toEqual([
        {
          environment,
          customerId: "ctm_owned_fixture",
          subscriptionIds: ["sub_owned_fixture"],
        },
      ]);
      expect(h.queries[0].filters).toEqual(
        expect.arrayContaining([
          { key: "user_id", operator: "eq", value: PORTAL_USER },
          { key: "environment", operator: "eq", value: environment },
        ]),
      );
      expect(h.logs).toEqual([["portal_customer_mirror_missing"]]);
      expect(h.networkAttempts).toBe(0);
    },
  );

  it("ignores unrelated customer mirrors instead of using their customer ID", async () => {
    const h = portalSessionHarness();
    h.customers.splice(0, 1, { paddle_customer_id: "ctm_unrelated", environment: "live" });
    expect((await h.deliver()).status).toBe(200);
    expect(h.portalCalls).toEqual([
      {
        environment: "live",
        customerId: "ctm_live_fixture",
        subscriptionIds: ["sub_live_fixture"],
      },
    ]);
    expect(h.logs).toEqual([["portal_customer_mirror_missing"]]);
  });

  it.each(["sandbox", null, "invalid"])(
    "rejects a present customer's conflicting environment %s",
    async (environment) => {
      const h = portalSessionHarness();
      h.customers[0].environment = environment;
      expect(await h.deliver()).toMatchObject({ status: 503, body: { error: "unavailable" } });
      expect(h.portalCalls).toEqual([]);
      expect(h.logs).toEqual([["portal_customer_mirror_mismatch"]]);
    },
  );

  it("rejects an inconsistent customer ID returned by the mirror lookup", async () => {
    const h = portalSessionHarness();
    h.state.results.customer = [{ paddle_customer_id: "ctm_other", environment: "live" }];
    expect(await h.deliver()).toMatchObject({ status: 503, body: { error: "unavailable" } });
    expect(h.portalCalls).toEqual([]);
    expect(h.logs).toEqual([["portal_customer_mirror_mismatch"]]);
  });

  it("distinguishes a failed mirror lookup from confirmed absence without logging its payload", async () => {
    const h = portalSessionHarness();
    h.customers.length = 0;
    let stringifications = 0;
    h.state.faults.customer = {
      message: SENSITIVE_FAILURE,
      toString() {
        stringifications += 1;
        return SENSITIVE_FAILURE;
      },
    };
    expect(await h.deliver()).toMatchObject({ status: 503, body: { error: "unavailable" } });
    expect(h.portalCalls).toEqual([]);
    expect(h.logs).toEqual([["portal_customer_mirror_lookup_failed"]]);
    expect(stringifications).toBe(0);
    expect(JSON.stringify(h.logs)).not.toContain("synthetic-private-marker");
  });

  it("does not use the missing-mirror path before authentication", async () => {
    const h = portalSessionHarness();
    h.customers.length = 0;
    h.state.authenticated = false;
    expect(await h.deliver()).toMatchObject({ status: 401, body: { error: "auth_required" } });
    expect(h.queries).toEqual([]);
    expect(h.portalCalls).toEqual([]);
    expect(h.logs).toEqual([]);
  });

  it("does not use the missing-mirror path when only another user has a subscription", async () => {
    const h = portalSessionHarness();
    h.customers.length = 0;
    h.subscriptions[0].user_id = OTHER_PORTAL_USER;
    expect(await h.deliver({ body: { userId: OTHER_PORTAL_USER } })).toMatchObject({
      status: 404,
      body: { error: "no_subscription" },
    });
    expect(h.queries.every((query) => query.table === "subscriptions")).toBe(true);
    expect(h.portalCalls).toEqual([]);
    expect(h.logs).toEqual([]);
  });
});
