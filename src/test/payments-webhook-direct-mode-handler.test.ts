/**
 * Signed handler cases for direct-mode webhook agreement.
 * These call the payments-webhook entry point through the raw-wire harness
 * and assert HTTP status plus persisted rows.
 */
import { describe, expect, it } from "vitest";
import {
  harness,
  LIVE_WEBHOOK_SECRET,
  subscription,
  transaction,
  USER_ID,
} from "../../supabase/functions/payments-webhook/rawWireTestHarness";

const SOURCE_IMPORT_ID = "9b95b0b8-e10f-441a-862e-1936a6d818ab";
const PRODUCTION_SUPABASE_URL = "https://knkwiiywfkbqznbxwqfh.supabase.co";

const DIRECT_SANDBOX_ENV = {
  PADDLE_DIRECT_API_KEY: "pdl_sdbx_fixture",
  PADDLE_API_BASE: "https://sandbox-api.paddle.com",
  PAYMENTS_ENVIRONMENT: "sandbox",
  SUPABASE_URL: "https://fixture.invalid",
} as const;

function priceOnlySubscription() {
  return subscription("subscription.created", {
    items: [
      {
        price: {
          id: "pri_fixture",
          product_id: "pro_fixture",
          name: "Monthly",
          import_meta: { external_id: SOURCE_IMPORT_ID, imported_from: "paddle_classic" },
          custom_data: { external_id: "pro_monthly" },
        },
      },
    ],
  });
}

describe("direct-mode payments-webhook handler", () => {
  it("writes the custom_data plan and the catalog product external id for a price-only item", async () => {
    const h = harness({
      env: DIRECT_SANDBOX_ENV,
      productsGet: () => ({
        id: "pro_fixture",
        name: "Do not guess this name",
        importMeta: { externalId: SOURCE_IMPORT_ID },
        customData: { external_id: "verdant_pro" },
      }),
    });

    expect(await h.deliver(priceOnlySubscription())).toEqual({
      code: 200,
      status: "processed:upsert_subscription",
    });
    expect(h.productLookups).toEqual(["pro_fixture"]);
    expect(h.subscriptions.get("sub_fixture")).toMatchObject({
      user_id: USER_ID,
      price_id: "pro_monthly",
      product_id: "verdant_pro",
    });
    expect(h.subscriptions.get("sub_fixture")?.product_id).not.toBe("Do not guess this name");
    expect(h.subscriptions.get("sub_fixture")?.product_id).not.toBe(SOURCE_IMPORT_ID);
    expect(h.subscriptions.get("sub_fixture")?.price_id).not.toBe(SOURCE_IMPORT_ID);
  });

  it("does not invent a product id when the catalog product has a name and no external id", async () => {
    const h = harness({
      env: DIRECT_SANDBOX_ENV,
      productsGet: () => ({
        id: "pro_fixture",
        name: "Do not guess this name",
        importMeta: { externalId: SOURCE_IMPORT_ID },
      }),
    });

    expect(await h.deliver(priceOnlySubscription())).toEqual({
      code: 200,
      status: "skipped:missing_product_external_id",
    });
    expect(h.productLookups).toEqual(["pro_fixture"]);
    expect(h.writes).toEqual([]);
    expect(h.subscriptions.size).toBe(0);
  });

  it("keeps processing a live notification when a direct variable is set", async () => {
    const h = harness({
      env: {
        PADDLE_DIRECT_API_KEY: "pdl_live_should_not_take_the_webhook_down",
        PADDLE_API_BASE: "https://api.paddle.com",
      },
    });

    expect(
      await h.deliver(subscription(), {
        environment: "live",
        secret: LIVE_WEBHOOK_SECRET,
      }),
    ).toEqual({ code: 200, status: "processed:upsert_subscription" });
    expect(h.subscriptions.get("sub_fixture")).toMatchObject({
      price_id: "pro_monthly",
      product_id: "verdant_pro",
      environment: "live",
    });
  });

  it("resolves a price lookup through the gateway when a direct variable is set on the production project", async () => {
    const h = harness({
      env: {
        ...DIRECT_SANDBOX_ENV,
        SUPABASE_URL: PRODUCTION_SUPABASE_URL,
      },
    });

    expect(await h.deliver(transaction(null))).toEqual({
      code: 200,
      status: "processed:grant_credit_pack",
    });
    expect(h.lookups).toEqual(["pri_fixture"]);
    expect(h.rpcCalls[0]).toMatchObject({
      name: "grant_lovable_credit_pack",
      args: { p_environment: "sandbox", p_credits: 50 },
    });
  });

  it("records a price-only cancellation without calling the product catalog", async () => {
    const h = harness({
      env: DIRECT_SANDBOX_ENV,
      productsGet: () => {
        throw new Error("catalog unavailable");
      },
    });
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
          scheduled_change: { action: "cancel", effective_at: "2026-11-16T00:00:00Z" },
          items: [
            {
              price: {
                id: "pri_fixture",
                product_id: "pro_fixture",
                custom_data: { external_id: "pro_monthly" },
              },
            },
          ],
        }),
      ),
    ).toEqual({ code: 200, status: "processed:update_subscription" });
    expect(h.productLookups).toEqual([]);
    expect(h.subscriptions.get("sub_fixture")).toMatchObject({ status: "canceled" });
  });

  it("keeps the gateway path when a direct variable is set on the production project", async () => {
    const h = harness({
      env: {
        ...DIRECT_SANDBOX_ENV,
        SUPABASE_URL: PRODUCTION_SUPABASE_URL,
      },
    });

    expect(await h.deliver(subscription())).toEqual({
      code: 200,
      status: "processed:upsert_subscription",
    });
    expect(h.productLookups).toEqual([]);
    expect(h.subscriptions.get("sub_fixture")).toMatchObject({
      price_id: "pro_monthly",
      product_id: "verdant_pro",
    });
  });

  it("rejects a non-production direct misconfig without the generic internal failure", async () => {
    const h = harness({
      env: {
        PADDLE_DIRECT_API_KEY: "not-a-sandbox-key",
        PADDLE_API_BASE: "https://api.paddle.com",
        PAYMENTS_ENVIRONMENT: "sandbox",
        SUPABASE_URL: "https://fixture.invalid",
      },
    });

    expect(await h.deliver(subscription())).toEqual({
      code: 503,
      status: "paddle_direct_config_refused",
    });
    expect(h.writes).toEqual([]);
    expect(h.subscriptions.size).toBe(0);
    expect(h.events.size).toBe(0);
  });

  // #2252 Codex r4320245615: a failing catalog read must not lose the event.
  it("records the event as failed before a catalog failure and asks for a retry", async () => {
    const h = harness({
      env: DIRECT_SANDBOX_ENV,
      productsGet: () => {
        throw new Error("catalog unavailable");
      },
    });

    expect((await h.deliver(priceOnlySubscription())).code).toBe(500);
    expect(h.events.get("evt_subscription.created")).toMatchObject({
      processing_status: "failed",
      processed_ok: false,
    });
    expect(String(h.events.get("evt_subscription.created")?.last_error)).toContain(
      "catalog_lookup_failed",
    );
    expect(h.subscriptions.size).toBe(0);
  });

  it("processes the recorded event on retry after a catalog failure, then stays idempotent", async () => {
    let calls = 0;
    const h = harness({
      env: DIRECT_SANDBOX_ENV,
      productsGet: () => {
        calls += 1;
        if (calls === 1) throw new Error("catalog unavailable");
        return { id: "pro_fixture", customData: { external_id: "verdant_pro" } };
      },
    });

    expect((await h.deliver(priceOnlySubscription())).code).toBe(500);
    expect(await h.deliver(priceOnlySubscription())).toEqual({
      code: 200,
      status: "processed:upsert_subscription",
    });
    expect(h.events.get("evt_subscription.created")).toMatchObject({
      processing_status: "processed",
    });
    expect(h.subscriptions.get("sub_fixture")).toMatchObject({
      user_id: USER_ID,
      price_id: "pro_monthly",
      product_id: "verdant_pro",
    });

    const writes = h.writes.length;
    expect(await h.deliver(priceOnlySubscription())).toEqual({
      code: 200,
      status: "duplicate_processed",
    });
    expect(h.writes.length).toBe(writes);
    expect(h.productLookups).toEqual(["pro_fixture", "pro_fixture"]);
  });
});
