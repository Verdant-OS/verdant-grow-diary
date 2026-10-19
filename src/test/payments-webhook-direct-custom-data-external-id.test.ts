/**
 * Behavioral webhook normalization. The signed HTTP handler stays in
 * payments-webhook/index.ts and is not imported here: that file binds Deno,
 * and the raw-wire harness is outside this slice. These tests call the same
 * pure functions the handler calls.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeWebhookItemResources,
  priceExternalIdFromResolvedPrice,
} from "../../supabase/functions/_shared/paddleDirectTransport.ts";

const wireItems = [
  {
    price: {
      id: "pri_new",
      import_meta: null,
      custom_data: { external_id: "pro_monthly" },
    },
    product: {
      id: "prod_new",
      import_meta: null,
      custom_data: { external_id: "verdant_pro" },
    },
  },
  {
    price: {
      id: "pri_keep",
      import_meta: { external_id: "pro_annual" },
      custom_data: { external_id: "pro_monthly" },
    },
    product: {
      id: "prod_keep",
      import_meta: { external_id: "verdant_pro" },
    },
  },
];

type NormalizedItem = {
  price: { id?: string; importMeta?: { externalId?: string } | null; custom_data?: unknown };
  product: { id?: string; importMeta?: { externalId?: string } | null };
};

describe("webhook custom_data.external_id normalization", () => {
  it("copies custom_data.external_id onto importMeta only in direct mode", () => {
    const direct = normalizeWebhookItemResources(wireItems, true) as NormalizedItem[];
    const gateway = normalizeWebhookItemResources(wireItems, false) as NormalizedItem[];

    expect(direct[0]?.price.importMeta).toEqual({ externalId: "pro_monthly" });
    expect(direct[0]?.product.importMeta).toEqual({ externalId: "verdant_pro" });
    expect(direct[1]?.price.importMeta).toMatchObject({ externalId: "pro_annual" });
    expect(direct[0]?.price.custom_data).toEqual({ external_id: "pro_monthly" });

    expect(gateway[0]?.price.importMeta).toBeNull();
    expect(gateway[0]?.product.importMeta).toBeNull();
    expect(gateway[0]?.price.custom_data).toEqual({ external_id: "pro_monthly" });
    expect(gateway[1]?.price.importMeta).toMatchObject({ externalId: "pro_annual" });
    expect(wireItems[0]?.price).not.toHaveProperty("importMeta");
  });

  it("reads a resolved price customData.external_id only when directMode is on", () => {
    const price = {
      importMeta: null,
      customData: { external_id: "founder_lifetime" },
    };
    expect(priceExternalIdFromResolvedPrice(price, true)).toBe("founder_lifetime");
    expect(priceExternalIdFromResolvedPrice(price, false)).toBeNull();
    expect(
      priceExternalIdFromResolvedPrice(
        { importMeta: { externalId: "pro_annual" }, customData: { external_id: "pro_monthly" } },
        true,
      ),
    ).toBe("pro_annual");
  });
});

describe("payments-webhook calls the shared normalizer", () => {
  const WEBHOOK = readFileSync(
    resolve(process.cwd(), "supabase/functions/payments-webhook/index.ts"),
    "utf8",
  );

  it("passes directMode into item normalization and price external-id resolution", () => {
    expect(WEBHOOK).toContain("normalizeWebhookItemResources(data.items, directMode)");
    expect(WEBHOOK).toContain("priceExternalIdFromResolvedPrice(priced, directMode)");
    expect(WEBHOOK).toContain("const directMode = isPaddleDirectMode(env)");
  });
});
