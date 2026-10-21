import { describe, expect, it } from "vitest";
import {
  OTHER_PORTAL_USER,
  PORTAL_USER,
  SENSITIVE_FAILURE,
  portalSessionHarness,
  recurringRow,
} from "../../supabase/functions/paddle-portal-session/portalSessionTestHarness";

describe("paddle-portal-session through the actual isolated Edge handler", () => {
  it.each([null, "Basic synthetic-caller", "Bearer invalid-jwt"])(
    "rejects unverified authorization %s before privileged work",
    async (authorization) => {
      const h = portalSessionHarness();
      h.state.authenticated = false;
      h.configurePrivilegedKey(false);
      const result = await h.deliver({ authorization });
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ error: "auth_required" });
      expect(h.operations).not.toContain("admin-client");
      expect(h.queries).toEqual([]);
      expect(h.portalCalls).toEqual([]);
    },
  );

  it("authenticates before a privileged client or mirror lookup", async () => {
    const h = portalSessionHarness();
    expect((await h.deliver()).status).toBe(200);
    expect(h.operations.indexOf("authenticate")).toBeLessThan(h.operations.indexOf("admin-client"));
    expect(h.operations.indexOf("authenticate")).toBeLessThan(
      h.operations.indexOf("query:subscriptions"),
    );
    expect(h.networkAttempts).toBe(0);
  });

  it.each([undefined, "", "production", "LIVE", " live "])(
    "refuses unavailable server environment %s after authentication and before mirror/provider work",
    async (environment) => {
      const h = portalSessionHarness();
      h.configureEnvironment(environment);
      expect(await h.deliver()).toMatchObject({ status: 503, body: { error: "unavailable" } });
      expect(h.operations).toContain("authenticate");
      expect(h.queries).toEqual([]);
      expect(h.portalCalls).toEqual([]);
    },
  );

  it("ignores forged customer, user and environment in body and query", async () => {
    const h = portalSessionHarness();
    expect(
      await h.deliver({
        body: { customerId: "ctm_attacker", userId: OTHER_PORTAL_USER, environment: "sandbox" },
        query: "?customerId=ctm_attacker&user_id=other&environment=sandbox",
      }),
    ).toMatchObject({ status: 200 });
    expect(h.portalCalls).toEqual([
      {
        environment: "live",
        customerId: "ctm_live_fixture",
        subscriptionIds: ["sub_live_fixture"],
      },
    ]);
    expect(h.queries[0].filters).toContainEqual({
      key: "user_id",
      operator: "eq",
      value: PORTAL_USER,
    });
  });

  it("selects an older live subscription over a newer sandbox subscription", async () => {
    const h = portalSessionHarness();
    h.subscriptions.push(
      recurringRow({
        environment: "sandbox",
        paddle_subscription_id: "sub_sandbox_fixture",
        paddle_customer_id: "ctm_sandbox_fixture",
        created_at: "2026-10-20T00:00:00Z",
      }),
    );
    h.customers.push({ paddle_customer_id: "ctm_sandbox_fixture", environment: "sandbox" });
    expect((await h.deliver()).status).toBe(200);
    expect(h.portalCalls[0]).toMatchObject({ environment: "live", customerId: "ctm_live_fixture" });
    expect(h.queries[0].filters).toContainEqual({
      key: "environment",
      operator: "eq",
      value: "live",
    });
  });

  it("uses sandbox only when explicitly configured server-side", async () => {
    const h = portalSessionHarness();
    h.configureEnvironment("sandbox");
    h.subscriptions.push(
      recurringRow({
        environment: "sandbox",
        paddle_subscription_id: "sub_sandbox_fixture",
        paddle_customer_id: "ctm_sandbox_fixture",
      }),
    );
    h.customers.push({ paddle_customer_id: "ctm_sandbox_fixture", environment: "sandbox" });
    expect((await h.deliver()).status).toBe(200);
    expect(h.portalCalls[0]).toMatchObject({
      environment: "sandbox",
      customerId: "ctm_sandbox_fixture",
    });
  });

  it("cannot mint another user's portal even when that row is newer", async () => {
    const h = portalSessionHarness();
    h.subscriptions.splice(0, 1, recurringRow({ user_id: OTHER_PORTAL_USER }));
    expect(await h.deliver({ body: { user_id: OTHER_PORTAL_USER } })).toMatchObject({
      status: 404,
      body: { error: "no_subscription" },
    });
    expect(h.portalCalls).toEqual([]);
    expect(
      h.queries.every((query) =>
        query.filters.some((filter) => filter.key === "user_id" && filter.value === PORTAL_USER),
      ),
    ).toBe(true);
  });

  it("orders equal creation times deterministically by subscription ID", async () => {
    const h = portalSessionHarness();
    h.subscriptions.push(recurringRow({ paddle_subscription_id: "sub_z_fixture" }));
    expect((await h.deliver()).status).toBe(200);
    expect(h.portalCalls[0].subscriptionIds).toEqual(["sub_z_fixture"]);
  });

  it("keeps invoice management available for canceled recurring subscriptions", async () => {
    const h = portalSessionHarness();
    h.subscriptions[0].status = "canceled";
    expect((await h.deliver()).status).toBe(200);
    expect(h.portalCalls).toHaveLength(1);
  });

  it.each([
    ["live", "lifetime_only"],
    ["sandbox", "no_subscription"],
  ])(
    "scopes the %s lifetime distinction to the configured live environment",
    async (environment, reason) => {
      const h = portalSessionHarness();
      h.subscriptions.splice(
        0,
        1,
        recurringRow({ environment, paddle_subscription_id: "lifetime_fixture" }),
      );
      expect(await h.deliver()).toMatchObject({ status: 404, body: { error: reason } });
      expect(h.portalCalls).toEqual([]);
      expect(
        h.queries.every((query) =>
          query.filters.some((filter) => filter.key === "environment" && filter.value === "live"),
        ),
      ).toBe(true);
    },
  );

  it("fails closed when the lifetime lookup errors", async () => {
    const h = portalSessionHarness();
    h.subscriptions.length = 0;
    h.state.faults.lifetime = { message: SENSITIVE_FAILURE };
    expect(await h.deliver()).toMatchObject({ status: 503, body: { error: "unavailable" } });
    expect(h.portalCalls).toEqual([]);
  });

  it("fails closed when the subscription lookup errors", async () => {
    const h = portalSessionHarness();
    h.state.faults.subscription = { message: SENSITIVE_FAILURE };
    expect(await h.deliver()).toMatchObject({ status: 503, body: { error: "unavailable" } });
    expect(h.portalCalls).toEqual([]);
  });

  it.each(["absent", "wrong environment", "wrong customer", "query error"])(
    "refuses a canonical customer mirror that is %s",
    async (scenario) => {
      const h = portalSessionHarness();
      if (scenario === "absent") h.customers.length = 0;
      if (scenario === "wrong environment") h.customers[0].environment = "sandbox";
      if (scenario === "wrong customer") h.customers[0].paddle_customer_id = "ctm_other";
      if (scenario === "query error") h.state.faults.customer = { message: SENSITIVE_FAILURE };
      expect(await h.deliver()).toMatchObject({ status: 503, body: { error: "unavailable" } });
      expect(h.portalCalls).toEqual([]);
    },
  );

  it.each([
    { paddle_customer_id: "" },
    { paddle_customer_id: null },
    { paddle_subscription_id: "" },
    { paddle_subscription_id: null },
    { environment: "sandbox" },
  ])("refuses malformed selected subscription data %j", async (override) => {
    const h = portalSessionHarness();
    h.state.results.recurring = [recurringRow(override)];
    expect(await h.deliver()).toMatchObject({ status: 503, body: { error: "unavailable" } });
    expect(h.portalCalls).toEqual([]);
  });

  it.each([
    { paddle_customer_id: "ctm_other", environment: "live" },
    { paddle_customer_id: "ctm_live_fixture", environment: "sandbox" },
  ])("defensively rejects inconsistent returned customer data %j", async (customer) => {
    const h = portalSessionHarness();
    h.state.results.customer = [customer];
    expect(await h.deliver()).toMatchObject({ status: 503, body: { error: "unavailable" } });
    expect(h.portalCalls).toEqual([]);
  });

  it("checks the exact canonical customer ID and environment before minting", async () => {
    const h = portalSessionHarness();
    expect((await h.deliver()).status).toBe(200);
    expect(h.queries.find((query) => query.table === "paddle_customers")?.filters).toEqual(
      expect.arrayContaining([
        { key: "paddle_customer_id", operator: "eq", value: "ctm_live_fixture" },
        { key: "environment", operator: "eq", value: "live" },
      ]),
    );
    expect(h.operations.indexOf("query:paddle_customers")).toBeLessThan(
      h.operations.indexOf("create-portal"),
    );
  });

  it("mints a fresh uncached overview URL on every invocation without logging it", async () => {
    const h = portalSessionHarness();
    const first = await h.deliver();
    const second = await h.deliver();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body).not.toEqual(second.body);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(second.headers.get("Cache-Control")).toBe("no-store");
    expect(h.portalCalls).toHaveLength(2);
    expect(h.logs).toEqual([]);
    expect(Object.keys(first.body)).toEqual(["url"]);
  });

  it.each(["portal", "admin", "auth"] as const)(
    "sanitizes %s exceptions without serializing token or URL material",
    async (stage) => {
      const h = portalSessionHarness();
      let stringifications = 0;
      h.state.faults[stage] = {
        toString() {
          stringifications += 1;
          return SENSITIVE_FAILURE;
        },
      };
      const result = await h.deliver();
      expect(result.status).toBe(stage === "portal" ? 502 : 503);
      expect(result.body).toEqual({
        error: stage === "portal" ? "portal_create_failed" : "unavailable",
      });
      expect(h.logs).toEqual([
        [stage === "portal" ? "portal_create_failed" : "paddle-portal-session error"],
      ]);
      expect(stringifications).toBe(0);
      expect(JSON.stringify({ result: result.body, logs: h.logs })).not.toContain(
        "synthetic-private-marker",
      );
    },
  );

  it.each([undefined, null, "", 42, {}])(
    "rejects a provider response with missing or malformed overview %j",
    async (overview) => {
      const h = portalSessionHarness();
      h.state.portalReply = { urls: { general: { overview } } };
      expect(await h.deliver()).toMatchObject({
        status: 502,
        body: { error: "portal_create_failed" },
      });
      expect(h.logs).toEqual([]);
    },
  );

  it.each([
    ["OPTIONS", 200],
    ["GET", 405],
  ] as const)("handles %s before authentication or IO", async (method, status) => {
    const h = portalSessionHarness();
    expect((await h.deliver({ method, authorization: null })).status).toBe(status);
    expect(h.operations).toEqual([]);
    expect(h.networkAttempts).toBe(0);
  });
});
