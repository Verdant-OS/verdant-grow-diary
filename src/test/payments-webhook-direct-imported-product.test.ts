/**
 * #2252: in direct mode a subscription item's product can carry only Paddle's
 * import_meta.external_id (a source-provider id) and no custom_data. That id
 * is not a Verdant product id, so the handler must read the catalog product's
 * custom_data, and must never persist the source id.
 */
import { describe, expect, it } from "vitest";
import {
  harness,
  subscription,
  USER_ID,
} from "../../supabase/functions/payments-webhook/rawWireTestHarness";

const SOURCE_IMPORT_ID = "9b95b0b8-e10f-441a-862e-1936a6d818ab";

const DIRECT_SANDBOX_ENV = {
  PADDLE_DIRECT_API_KEY: "pdl_sdbx_fixture",
  PADDLE_API_BASE: "https://sandbox-api.paddle.com",
  PAYMENTS_ENVIRONMENT: "sandbox",
  SUPABASE_URL: "https://fixture.invalid",
} as const;

function importedProductSubscription() {
  return subscription("subscription.created", {
    items: [
      {
        price: {
          id: "pri_fixture",
          product_id: "pro_fixture",
          custom_data: { external_id: "pro_monthly" },
        },
        product: {
          id: "pro_fixture",
          name: "Imported product",
          import_meta: { external_id: SOURCE_IMPORT_ID, imported_from: "paddle_classic" },
        },
      },
    ],
  });
}

describe("direct-mode webhook with an imported product", () => {
  it("reads the catalog product's custom_data instead of the source import id", async () => {
    const h = harness({
      env: DIRECT_SANDBOX_ENV,
      productsGet: () => ({
        id: "pro_fixture",
        importMeta: { externalId: SOURCE_IMPORT_ID },
        customData: { external_id: "verdant_pro" },
      }),
    });

    expect(await h.deliver(importedProductSubscription())).toEqual({
      code: 200,
      status: "processed:upsert_subscription",
    });
    expect(h.productLookups).toEqual(["pro_fixture"]);
    expect(h.subscriptions.get("sub_fixture")).toMatchObject({
      user_id: USER_ID,
      price_id: "pro_monthly",
      product_id: "verdant_pro",
    });
  });

  it("skips instead of persisting the source import id when the catalog has no custom_data", async () => {
    const h = harness({
      env: DIRECT_SANDBOX_ENV,
      productsGet: () => ({
        id: "pro_fixture",
        importMeta: { externalId: SOURCE_IMPORT_ID },
      }),
    });

    expect(await h.deliver(importedProductSubscription())).toEqual({
      code: 200,
      status: "skipped:missing_product_external_id",
    });
    expect(h.productLookups).toEqual(["pro_fixture"]);
    expect(h.writes).toEqual([]);
    expect(h.subscriptions.size).toBe(0);
  });
});
