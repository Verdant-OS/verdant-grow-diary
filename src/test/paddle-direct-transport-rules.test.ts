/**
 * Pure rules for the env-gated direct Paddle sandbox transport.
 * No Deno, no I/O, no clock. Production (both direct vars unset) stays gateway.
 */
import { describe, expect, it } from "vitest";
import {
  PADDLE_SANDBOX_API_BASE,
  applyDirectModeExternalIdFallback,
  directPriceLookupPath,
  extractDirectPriceId,
  externalIdFromCustomData,
  resolvePaddleTransport,
  type PaddleTransport,
} from "../../supabase/functions/_shared/paddleDirectTransport.ts";

const SANDBOX_KEY = "pdl_sdbx_DO_NOT_LEAK_fixturekey";
const PRODUCTION_URL = "https://knkwiiywfkbqznbxwqfh.supabase.co";

type EnvMap = Record<string, string | undefined>;

function getEnv(map: EnvMap): (name: string) => string | undefined {
  return (name) => map[name];
}

function validDirectEnv(overrides: EnvMap = {}): EnvMap {
  return {
    PADDLE_DIRECT_API_KEY: SANDBOX_KEY,
    PADDLE_API_BASE: PADDLE_SANDBOX_API_BASE,
    PAYMENTS_ENVIRONMENT: "sandbox",
    SUPABASE_URL: "https://fixture.invalid",
    ...overrides,
  };
}

function assertRefusalOmitsKey(result: PaddleTransport, secret: string | undefined) {
  expect(result.mode).toBe("refused");
  if (result.mode !== "refused") return;
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain("apiKey");
  if (secret && secret.trim().length > 0) {
    expect(serialized).not.toContain(secret.trim());
    expect(result.reason).not.toContain(secret.trim());
  }
}

describe("resolvePaddleTransport", () => {
  it("returns gateway when both direct vars are unset, including on live and production", () => {
    expect(resolvePaddleTransport("live", getEnv({}))).toEqual({ mode: "gateway" });
    expect(
      resolvePaddleTransport(
        "live",
        getEnv({
          PAYMENTS_ENVIRONMENT: "live",
          SUPABASE_URL: PRODUCTION_URL,
        }),
      ),
    ).toEqual({ mode: "gateway" });
    expect(PADDLE_SANDBOX_API_BASE).toBe("https://sandbox-api.paddle.com");
  });

  it("returns direct for a sandbox key, exact sandbox base, and a non-production project", () => {
    expect(resolvePaddleTransport("sandbox", getEnv(validDirectEnv()))).toEqual({
      mode: "direct",
      apiKey: SANDBOX_KEY,
      base: PADDLE_SANDBOX_API_BASE,
    });
  });

  it("trims a sandbox key and still refuses to fall back when the key is only whitespace", () => {
    expect(
      resolvePaddleTransport(
        "sandbox",
        getEnv(validDirectEnv({ PADDLE_DIRECT_API_KEY: `  ${SANDBOX_KEY}  ` })),
      ),
    ).toEqual({
      mode: "direct",
      apiKey: SANDBOX_KEY,
      base: PADDLE_SANDBOX_API_BASE,
    });
  });

  const refusals: Array<{
    name: string;
    env: "sandbox" | "live";
    map: EnvMap;
    reason: string;
  }> = [
    {
      name: "env=live",
      env: "live",
      map: validDirectEnv(),
      reason: "direct_requires_sandbox_env",
    },
    {
      name: "PAYMENTS_ENVIRONMENT unset",
      env: "sandbox",
      map: validDirectEnv({ PAYMENTS_ENVIRONMENT: undefined }),
      reason: "direct_requires_payments_env_sandbox",
    },
    {
      name: "PAYMENTS_ENVIRONMENT live",
      env: "sandbox",
      map: validDirectEnv({ PAYMENTS_ENVIRONMENT: "live" }),
      reason: "direct_requires_payments_env_sandbox",
    },
    {
      name: "live API base",
      env: "sandbox",
      map: validDirectEnv({ PADDLE_API_BASE: "https://api.paddle.com" }),
      reason: "direct_base_not_sandbox_host",
    },
    {
      name: "sandbox base with a trailing slash",
      env: "sandbox",
      map: validDirectEnv({ PADDLE_API_BASE: "https://sandbox-api.paddle.com/" }),
      reason: "direct_base_not_sandbox_host",
    },
    {
      name: "http sandbox base",
      env: "sandbox",
      map: validDirectEnv({ PADDLE_API_BASE: "http://sandbox-api.paddle.com" }),
      reason: "direct_base_not_sandbox_host",
    },
    {
      name: "key without _sdbx",
      env: "sandbox",
      map: validDirectEnv({ PADDLE_DIRECT_API_KEY: "pdl_live_DO_NOT_LEAK" }),
      reason: "direct_key_not_sandbox",
    },
    {
      name: "empty key",
      env: "sandbox",
      map: validDirectEnv({ PADDLE_DIRECT_API_KEY: "" }),
      reason: "direct_key_not_sandbox",
    },
    {
      name: "whitespace key",
      env: "sandbox",
      map: validDirectEnv({ PADDLE_DIRECT_API_KEY: "   " }),
      reason: "direct_key_not_sandbox",
    },
    {
      name: "only the key is set",
      env: "sandbox",
      map: validDirectEnv({ PADDLE_API_BASE: undefined }),
      reason: "direct_base_not_sandbox_host",
    },
    {
      name: "only the base is set",
      env: "sandbox",
      map: validDirectEnv({ PADDLE_DIRECT_API_KEY: undefined }),
      reason: "direct_key_not_sandbox",
    },
    {
      name: "production Supabase project",
      env: "sandbox",
      map: validDirectEnv({ SUPABASE_URL: PRODUCTION_URL }),
      reason: "direct_forbidden_on_production_project",
    },
  ];

  it.each(refusals)("refuses $name", ({ env, map, reason }) => {
    const result = resolvePaddleTransport(env, getEnv(map));
    expect(result).toEqual({ mode: "refused", reason });
    assertRefusalOmitsKey(result, map.PADDLE_DIRECT_API_KEY);
  });
});

describe("direct price lookup", () => {
  it("builds the single-price path and encodes the configured id", () => {
    expect(directPriceLookupPath("pri_sandbox_123")).toBe("/prices/pri_sandbox_123");
    expect(directPriceLookupPath("pri a/b")).toBe("/prices/pri%20a%2Fb");
  });

  it("returns the price id only for an active object whose custom_data matches", () => {
    expect(
      extractDirectPriceId(
        {
          data: {
            id: "pri_ok",
            status: "active",
            custom_data: { external_id: "pro_monthly" },
          },
        },
        "pro_monthly",
      ),
    ).toBe("pri_ok");
  });

  it.each([
    [
      "archived",
      { data: { id: "pri_x", status: "archived", custom_data: { external_id: "pro_monthly" } } },
    ],
    [
      "mismatched",
      { data: { id: "pri_x", status: "active", custom_data: { external_id: "pro_annual" } } },
    ],
    ["missing custom_data", { data: { id: "pri_x", status: "active" } }],
    [
      "list-shaped body",
      { data: [{ id: "pri_x", status: "active", custom_data: { external_id: "pro_monthly" } }] },
    ],
  ])("returns null for %s", (_name, body) => {
    expect(extractDirectPriceId(body, "pro_monthly")).toBeNull();
  });

  it("accepts a source import id and still rejects a custom_data plan conflict", () => {
    expect(
      extractDirectPriceId(
        {
          data: {
            id: "pri_imported",
            status: "active",
            custom_data: { external_id: "pro_monthly" },
            import_meta: {
              external_id: "9b95b0b8-e10f-441a-862e-1936a6d818ab",
              imported_from: "paddle_classic",
            },
          },
        },
        "pro_monthly",
      ),
    ).toBe("pri_imported");
    expect(
      extractDirectPriceId(
        {
          data: {
            id: "pri_imported_plan_shaped",
            status: "active",
            custom_data: { external_id: "pro_monthly" },
            import_meta: { external_id: "pro_annual" },
          },
        },
        "pro_monthly",
      ),
    ).toBe("pri_imported_plan_shaped");
    expect(
      extractDirectPriceId(
        {
          data: {
            id: "pri_wrong_plan",
            status: "active",
            custom_data: { external_id: "pro_annual" },
            import_meta: { external_id: "9b95b0b8-e10f-441a-862e-1936a6d818ab" },
          },
        },
        "pro_monthly",
      ),
    ).toBeNull();
  });
});

describe("applyDirectModeExternalIdFallback", () => {
  it("reads a non-empty external id from custom_data or customData", () => {
    expect(externalIdFromCustomData({ custom_data: { external_id: "pro_monthly" } })).toBe(
      "pro_monthly",
    );
    expect(externalIdFromCustomData({ customData: { external_id: "verdant_pro" } })).toBe(
      "verdant_pro",
    );
    expect(externalIdFromCustomData({ custom_data: { external_id: "" } })).toBeUndefined();
    expect(externalIdFromCustomData({ custom_data: { external_id: 12 } })).toBeUndefined();
    expect(externalIdFromCustomData(null)).toBeUndefined();
  });

  it("fills only absent importMeta and keeps an existing importMeta.externalId", () => {
    const items = [
      {
        price: { id: "pri_new", custom_data: { external_id: "pro_monthly" }, extra: "keep" },
        product: { id: "prod_new", customData: { external_id: "verdant_pro" } },
        note: "item",
      },
      {
        price: {
          id: "pri_keep",
          importMeta: { externalId: "pro_annual", note: "stay" },
          custom_data: { external_id: "pro_monthly" },
        },
        product: {
          id: "prod_keep",
          importMeta: { externalId: "verdant_pro" },
          custom_data: { external_id: "other_product" },
        },
      },
      {
        price: {
          id: "pri_blank",
          importMeta: {},
          custom_data: { external_id: "founder_lifetime" },
        },
        product: { id: "prod_blank" },
      },
    ];

    const result = applyDirectModeExternalIdFallback(items) as typeof items;

    expect(result[0]?.price.importMeta).toEqual({ externalId: "pro_monthly" });
    expect(result[0]?.price).toMatchObject({ id: "pri_new", extra: "keep" });
    expect(result[0]?.product.importMeta).toEqual({ externalId: "verdant_pro" });
    expect(result[0]?.note).toBe("item");
    expect(items[0]?.price).not.toHaveProperty("importMeta");

    expect(result[1]?.price.importMeta).toEqual({ externalId: "pro_annual", note: "stay" });
    expect(result[1]?.product.importMeta).toEqual({ externalId: "verdant_pro" });

    expect(result[2]?.price.importMeta).toEqual({ externalId: "founder_lifetime" });
    expect(result[2]?.product).toEqual({ id: "prod_blank" });
    expect(result[2]?.product).not.toHaveProperty("importMeta");
  });
});
