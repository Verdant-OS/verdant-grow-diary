/**
 * get-paddle-price catalog env contract.
 * @source-scan-justified: the edge function entry imports Deno and cannot be evaluated in Vitest; the name lists are imported and asserted as values, and the entry is read only to prove it does not call Deno.env.get("PADDLE_PRICE_*") or mention PADDLE_ENVIRONMENT.
 *
 * Asserts the resolved name lists and that the function reads the catalog
 * only through them. Gateway selection stays PAYMENTS_ENVIRONMENT.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GET_PADDLE_PRICE_CATALOG_ENV_NAMES,
  GET_PADDLE_PRICE_PLAN_IDS,
  PADDLE_SANDBOX_PRICE_COPIES_BEFORE_LIVE,
  PAYMENTS_ENVIRONMENT_ENV_NAME,
  readGetPaddlePriceCatalog,
} from "../../supabase/functions/_shared/getPaddlePriceCatalogEnv.ts";

const LIVE_NAMES = [
  "PADDLE_PRICE_PRO_MONTHLY",
  "PADDLE_PRICE_PRO_ANNUAL",
  "PADDLE_PRICE_CRAFT_MONTHLY",
  "PADDLE_PRICE_CRAFT_ANNUAL",
  "PADDLE_PRICE_FOUNDER_LIFETIME",
  "PADDLE_PRICE_CREDIT_PACK_50",
  "PADDLE_PRICE_CREDIT_PACK_150",
] as const;

const SANDBOX_COPIES = [
  "PADDLE_SANDBOX_PRICE_PRO_MONTHLY",
  "PADDLE_SANDBOX_PRICE_PRO_ANNUAL",
  "PADDLE_SANDBOX_PRICE_CRAFT_MONTHLY",
  "PADDLE_SANDBOX_PRICE_CRAFT_ANNUAL",
  "PADDLE_SANDBOX_PRICE_FOUNDER_LIFETIME",
  "PADDLE_SANDBOX_PRICE_CREDIT_PACK_50",
  "PADDLE_SANDBOX_PRICE_CREDIT_PACK_150",
] as const;

describe("get-paddle-price catalog env names", () => {
  it("reads only the seven live PADDLE_PRICE_* names", () => {
    expect(Object.values(GET_PADDLE_PRICE_CATALOG_ENV_NAMES)).toEqual([...LIVE_NAMES]);
    expect(GET_PADDLE_PRICE_PLAN_IDS).toHaveLength(7);

    const seen: string[] = [];
    const catalog = readGetPaddlePriceCatalog((name) => {
      seen.push(name);
      return `pri_${name}`;
    });

    expect(seen).toEqual([...LIVE_NAMES]);
    expect(catalog.pro_monthly).toBe("pri_PADDLE_PRICE_PRO_MONTHLY");
    expect(catalog.credit_pack_150).toBe("pri_PADDLE_PRICE_CREDIT_PACK_150");
    expect(Object.keys(catalog)).toEqual([...GET_PADDLE_PRICE_PLAN_IDS]);
  });

  it("treats a missing price env as empty and does not read other names", () => {
    const catalog = readGetPaddlePriceCatalog(() => undefined);
    expect(catalog.craft_monthly).toBe("");
    expect(Object.values(catalog).every((value) => value === "")).toBe(true);
  });

  it("names the seven sandbox copies that must exist before the live flip", () => {
    expect(Object.values(PADDLE_SANDBOX_PRICE_COPIES_BEFORE_LIVE)).toEqual([...SANDBOX_COPIES]);
    expect(PAYMENTS_ENVIRONMENT_ENV_NAME).toBe("PAYMENTS_ENVIRONMENT");
  });

  it("selects the gateway with PAYMENTS_ENVIRONMENT, not PADDLE_ENVIRONMENT", () => {
    const source = readFileSync(resolve("supabase/functions/get-paddle-price/index.ts"), "utf8");
    expect(source).toContain("resolveRequiredServerBillingEnvironment");
    expect(source).toContain("readGetPaddlePriceCatalog");
    expect(source).not.toContain("PADDLE_ENVIRONMENT");
    expect(source).not.toMatch(/Deno\.env\.get\(\s*"PADDLE_PRICE_/);
    expect(source).toContain("PAYMENTS_ENVIRONMENT");
  });
});
