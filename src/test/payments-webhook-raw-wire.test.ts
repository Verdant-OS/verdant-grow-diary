import { describe, expect, it } from "vitest";
import {
  harness,
  subscription,
  transaction,
  USER_ID,
  START,
  END,
  type Row,
} from "../../supabase/functions/payments-webhook/rawWireTestHarness";

describe("signed raw Paddle notifications through the actual payments-webhook handler", () => {
  it.each([
    ["subscription.created", "active"],
    ["subscription.updated", "active"],
    ["subscription.activated", "active"],
    ["subscription.resumed", "active"],
    ["subscription.trialing", "trialing"],
    ["subscription.past_due", "past_due"],
    ["subscription.paused", "paused"],
  ])("processes raw %s with the existing %s status semantics", async (type, status) => {
    const h = harness();
    const raw = subscription(type, { status });
    expect(await h.deliver(raw)).toEqual({ code: 200, status: "processed:upsert_subscription" });
    expect(h.subscriptions.get("sub_fixture")).toMatchObject({
      user_id: USER_ID,
      paddle_customer_id: "ctm_fixture",
      price_id: "pro_monthly",
      product_id: "verdant_pro",
      status,
      current_period_start: START,
      current_period_end: END,
      environment: "sandbox",
      cancel_at_period_end: false,
    });
    expect(h.events.get(raw.event_id)).toMatchObject({
      processing_status: "processed",
      user_id: USER_ID,
      price_external_id: "pro_monthly",
      payload: raw,
    });
  });

  it("renews the period and then records a scheduled cancellation without changing status", async () => {
    const h = harness();
    await h.deliver(subscription());
    const renewal = subscription("subscription.updated", {
      current_billing_period: { starts_at: END, ends_at: "2026-12-16T00:00:00Z" },
      scheduled_change: { action: "cancel", effective_at: "2026-12-16T00:00:00Z" },
    });
    expect(await h.deliver(renewal)).toEqual({
      code: 200,
      status: "processed:upsert_subscription",
    });
    expect(h.subscriptions.get("sub_fixture")).toMatchObject({
      status: "active",
      current_period_start: END,
      current_period_end: "2026-12-16T00:00:00Z",
      cancel_at_period_end: true,
      scheduled_change_action: "cancel",
      scheduled_change_at: "2026-12-16T00:00:00Z",
    });
  });

  it("applies raw cancellation to an existing row, preserving null period semantics", async () => {
    const h = harness();
    h.subscriptions.set("sub_fixture", {
      paddle_subscription_id: "sub_fixture",
      environment: "sandbox",
      status: "active",
    });
    expect(
      await h.deliver(
        subscription("subscription.canceled", {
          status: "canceled",
          current_billing_period: null,
          scheduled_change: { action: "cancel", effective_at: END },
        }),
      ),
    ).toEqual({ code: 200, status: "processed:update_subscription" });
    expect(h.subscriptions.get("sub_fixture")).toMatchObject({
      status: "canceled",
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: true,
      scheduled_change_at: END,
    });
  });

  it.each([null, "credit_pack_50", "founder_lifetime"])(
    "excludes raw recurring transactions before lookup or one-time grants (%s)",
    async (sku) => {
      const h = harness();
      expect(await h.deliver(transaction(sku, { subscription_id: "sub_fixture" }))).toEqual({
        code: 200,
        status: "skipped:non_lifetime_transaction",
      });
      expect(h.lookups).toEqual([]);
      expect(h.grants.size).toBe(0);
      expect(h.subscriptions.size).toBe(0);
      expect(h.emails).toEqual([]);
    },
  );

  it.each(["credit_pack_50", "credit_pack_150"])(
    "grants raw one-time %s without granting a plan, and formats its confirmation",
    async (sku) => {
      const h = harness();
      expect(await h.deliver(transaction(sku))).toEqual({
        code: 200,
        status: "processed:grant_credit_pack",
      });
      expect(h.grants.get("txn_fixture")).toMatchObject({
        p_expected_user_id: USER_ID,
        p_credits: sku === "credit_pack_50" ? 50 : 150,
        p_sku: sku,
        p_environment: "sandbox",
      });
      expect(h.subscriptions.size).toBe(0);
      expect(h.lookups).toEqual([]);
      expect(h.emails[0]).toMatchObject({
        recipientEmail: "fixture@example.invalid",
        idempotencyKey: "order-confirm:txn_fixture",
        templateData: { amountFormatted: "9.00 USD", orderId: "txn_fixture" },
      });
    },
  );

  it("keeps the existing price API fallback for raw one-time transactions", async () => {
    const h = harness();
    expect(await h.deliver(transaction(null))).toEqual({
      code: 200,
      status: "processed:grant_credit_pack",
    });
    expect(h.lookups).toEqual(["pri_fixture"]);
    expect(h.grants.get("txn_fixture")).toMatchObject({
      p_expected_user_id: USER_ID,
      p_credits: 50,
    });
  });

  it("routes an existing Founder SKU through the unchanged protected allocator", async () => {
    const h = harness();
    expect(await h.deliver(transaction("founder_lifetime"))).toEqual({
      code: 200,
      status: "processed:record_lifetime",
    });
    expect(h.rpcCalls[0]).toMatchObject({
      name: "allocate_lovable_founder_lifetime",
      args: {
        p_user_id: USER_ID,
        p_paddle_transaction_id: "txn_fixture",
        p_paddle_customer_id: "ctm_fixture",
        p_environment: "sandbox",
      },
    });
    expect(h.writes).toEqual([]);
  });

  it.each([
    [{ custom_data: { user_id: USER_ID, nested: { userId: USER_ID } } }, "missing_user_id"],
    [{ custom_data: null }, "missing_user_id"],
    [{ items: [{ price: { import_meta: null } }] }, "missing_price_external_id"],
    [
      {
        items: [
          {
            price: { import_meta: { external_id: "not_a_plan" } },
            product: { import_meta: { external_id: "verdant_pro" } },
          },
        ],
      },
      "unknown_price_id",
    ],
  ])("preserves fail-closed processor decisions for %s", async (overrides, reason) => {
    const h = harness();
    const raw = subscription("subscription.created", overrides);
    expect(await h.deliver(raw)).toEqual({ code: 200, status: `skipped:${reason}` });
    expect(h.writes).toEqual([]);
    expect(h.events.get(raw.event_id)?.payload).toEqual(raw);
  });

  it("retains already camelCase payload compatibility", async () => {
    const h = harness();
    expect(
      await h.deliver({
        eventId: "evt_camel",
        eventType: "subscription.created",
        data: {
          id: "sub_fixture",
          customerId: "ctm_fixture",
          customData: { userId: USER_ID },
          currentBillingPeriod: { startsAt: START, endsAt: END },
          items: [
            {
              price: { importMeta: { externalId: "pro_monthly" } },
              product: { importMeta: { externalId: "verdant_pro" } },
            },
          ],
        },
      }),
    ).toEqual({ code: 200, status: "processed:upsert_subscription" });
  });

  it("preserves arbitrary custom_data keys rather than recursively renaming them", async () => {
    const h = harness();
    const raw = subscription();
    await h.deliver(raw);
    expect((h.normalizedEvents[0].data as Row).customData).toEqual(raw.data.custom_data);
  });

  it.each([{ data: null }, { data: [] }, { data: "invalid" }])(
    "keeps malformed data $data from granting access",
    async ({ data }) => {
      const h = harness();
      expect(await h.deliver({ ...subscription(), data })).toEqual({
        code: 200,
        status: "skipped:missing_user_id",
      });
      expect(h.writes).toEqual([]);
    },
  );

  it.each([
    { items: null },
    { items: [] },
    { items: [null] },
    { items: [{ price: null, product: null }] },
  ])("keeps malformed items $items from granting access", async ({ items }) => {
    const h = harness();
    expect(await h.deliver(subscription("subscription.created", { items }))).toEqual({
      code: 200,
      status: "skipped:missing_price_external_id",
    });
    expect(h.writes).toEqual([]);
  });

  it("preserves explicit null wire fields instead of falling back to stale camelCase aliases", async () => {
    const h = harness();
    expect(
      await h.deliver(
        subscription("subscription.created", {
          custom_data: null,
          customData: { userId: USER_ID },
        }),
      ),
    ).toEqual({ code: 200, status: "skipped:missing_user_id" });
    expect(h.writes).toEqual([]);
  });

  it("preserves null billing periods and scheduled changes", async () => {
    const h = harness();
    expect(
      await h.deliver(
        subscription("subscription.paused", {
          status: "paused",
          current_billing_period: null,
          scheduled_change: null,
        }),
      ),
    ).toEqual({ code: 200, status: "processed:upsert_subscription" });
    expect(h.subscriptions.get("sub_fixture")).toMatchObject({
      status: "paused",
      current_period_start: null,
      current_period_end: null,
      scheduled_change_action: null,
      scheduled_change_at: null,
      cancel_at_period_end: false,
    });
  });

  it("uses raw top-level currency when confirmation totals omit currency", async () => {
    const h = harness();
    expect(
      await h.deliver(
        transaction("credit_pack_50", { details: { totals: { grand_total: "900" } } }),
      ),
    ).toEqual({ code: 200, status: "processed:grant_credit_pack" });
    expect(h.emails[0]).toMatchObject({ templateData: { amountFormatted: "9.00 USD" } });
  });

  it("keeps the confirmation helper's totals currency precedence", async () => {
    const h = harness();
    await h.deliver(transaction("credit_pack_50", { currency_code: "EUR" }));
    expect(h.emails[0]).toMatchObject({ templateData: { amountFormatted: "9.00 USD" } });
  });

  it("uses the explicitly selected live secret and keeps live row provenance", async () => {
    const h = harness();
    expect(
      await h.deliver(subscription(), {
        environment: "live",
        secret: "different-live-fixture-secret",
      }),
    ).toEqual({ code: 200, status: "processed:upsert_subscription" });
    expect(h.subscriptions.get("sub_fixture")?.environment).toBe("live");
  });

  it("rejects a semantically identical body whose whitespace differs from the signed bytes", async () => {
    const h = harness();
    const raw = subscription();
    expect(await h.deliver(raw, { signedBody: JSON.stringify(raw) })).toEqual({
      code: 401,
      status: "signature_mismatch",
    });
    expect(h.events.size).toBe(0);
  });

  it("keeps processed duplicates idempotent and historical terminal skips unrecovered", async () => {
    const h = harness();
    const raw = subscription();
    expect(await h.deliver(raw)).toEqual({ code: 200, status: "processed:upsert_subscription" });
    expect(await h.deliver(raw)).toEqual({ code: 200, status: "duplicate_processed" });
    expect(h.writes).toHaveLength(1);
    const old = subscription("subscription.updated");
    h.events.set(old.event_id, {
      paddle_event_id: old.event_id,
      processing_status: "skipped",
      skip_reason: "missing_user_id",
    });
    expect(await h.deliver(old)).toEqual({ code: 200, status: "duplicate_skipped" });
    expect(h.writes).toHaveLength(1);
  });

  it("retains write-failure retry semantics", async () => {
    const h = harness();
    h.setFailWrite(true);
    const raw = subscription();
    expect(await h.deliver(raw)).toEqual({ code: 500, status: "processing_failed" });
    expect(h.events.get(raw.event_id)?.processing_status).toBe("failed");
    h.setFailWrite(false);
    expect(await h.deliver(raw)).toEqual({ code: 200, status: "processed:upsert_subscription" });
    expect(h.writes).toHaveLength(1);
  });

  it.each([
    [{ signedBody: "{}" }, 401, "signature_mismatch"],
    [{ secret: "incorrect-fixture-secret" }, 401, "signature_mismatch"],
    [{ timestamp: 1 }, 401, "timestamp_stale"],
    [{ timestamp: Math.floor(Date.now() / 1000) + 3600 }, 401, "timestamp_future"],
    [{ signature: "" }, 400, "missing_header"],
    [{ environment: "invalid" }, 400, "Invalid env"],
    [{ environment: "live" }, 401, "signature_mismatch"],
    [{ body: "{invalid-json" }, 400, "invalid_json"],
  ] as const)(
    "rejects invalid signed transport %s before any persistence",
    async (options, code, status) => {
      const h = harness();
      expect(await h.deliver(subscription(), options)).toEqual({ code, status });
      expect(h.events.size).toBe(0);
      expect(h.writes).toEqual([]);
    },
  );

  it("fails closed without the environment-specific webhook secret", async () => {
    const h = harness();
    h.clearWebhookSecret();
    expect(await h.deliver(subscription())).toEqual({
      code: 500,
      status: "webhook_secret_not_configured",
    });
    expect(h.events.size).toBe(0);
  });
});
