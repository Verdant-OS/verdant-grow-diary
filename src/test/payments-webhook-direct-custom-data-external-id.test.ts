/**
 * Variant B: the pure custom-data fallback, plus static pins that
 * payments-webhook applies it only when directMode is on.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyDirectModeExternalIdFallback } from "../../supabase/functions/_shared/paddleDirectTransport.ts";

const WEBHOOK = readFileSync(
  resolve(process.cwd(), "supabase/functions/payments-webhook/index.ts"),
  "utf8",
);

describe("direct-mode custom_data external id fallback", () => {
  it("fills price and product importMeta from custom data and leaves an existing externalId", () => {
    const items = [
      {
        price: { id: "pri_new", import_meta: null, custom_data: { external_id: "pro_monthly" } },
        product: { id: "prod_new", import_meta: null, custom_data: { external_id: "verdant_pro" } },
      },
      {
        price: {
          id: "pri_keep",
          importMeta: { externalId: "pro_annual" },
          custom_data: { external_id: "pro_monthly" },
        },
        product: { id: "prod_keep", importMeta: { externalId: "verdant_pro" } },
      },
    ];
    const result = applyDirectModeExternalIdFallback(items) as Array<{
      price: { importMeta?: { externalId?: string } };
      product: { importMeta?: { externalId?: string } };
    }>;

    expect(result[0]?.price.importMeta).toEqual({ externalId: "pro_monthly" });
    expect(result[0]?.product.importMeta).toEqual({ externalId: "verdant_pro" });
    expect(result[1]?.price.importMeta).toEqual({ externalId: "pro_annual" });
    expect(result[1]?.product.importMeta).toEqual({ externalId: "verdant_pro" });
    expect(items[0]?.price).not.toHaveProperty("importMeta");
  });

  it("calls applyDirectModeExternalIdFallback only inside if (directMode)", () => {
    const calls = [
      ...WEBHOOK.matchAll(/applyDirectModeExternalIdFallback\s*\(\s*data\.items\s*\)/g),
    ];
    expect(calls).toHaveLength(1);
    const callAt = calls[0]?.index ?? -1;
    const guardAt = WEBHOOK.lastIndexOf("if (directMode)", callAt);
    expect(guardAt).toBeGreaterThan(-1);
    const window = WEBHOOK.slice(guardAt, callAt + "applyDirectModeExternalIdFallback(".length);
    expect(window).toMatch(
      /if \(directMode\) \{\s*data\.items = applyDirectModeExternalIdFallback\($/,
    );
    expect(WEBHOOK).toContain("normalizeVerifiedPaddleEvent(verified.event, { directMode })");
    expect(WEBHOOK).toContain("const directMode = isPaddleDirectMode(env)");
    expect(WEBHOOK).toContain("buildDeps(directMode)");
  });

  it("falls back to customData.external_id only when directMode", () => {
    const resolverStart = WEBHOOK.indexOf("async resolvePriceExternalIdByPaddleId");
    const resolverEnd = WEBHOOK.indexOf("async allocateFounderLifetime");
    expect(resolverStart).toBeGreaterThan(-1);
    expect(resolverEnd).toBeGreaterThan(resolverStart);
    const resolver = WEBHOOK.slice(resolverStart, resolverEnd);

    expect(resolver).toMatch(
      /importMeta\s*\?\s*\.externalId\s*\?\?\s*\(\s*directMode\s*\?[\s\S]*?customData\?\.external_id\s*:\s*null\s*\)\s*\?\?\s*null/,
    );
    expect(resolver.match(/customData\?\.external_id/g)).toEqual(["customData?.external_id"]);
    expect(resolver).not.toMatch(/:\s*price[\s\S]{0,80}customData\?\.external_id/);
  });
});
