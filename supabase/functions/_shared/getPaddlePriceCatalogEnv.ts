/**
 * Env names `get-paddle-price` may read for the public catalog.
 *
 * The live catalog reuses the flat `PADDLE_PRICE_*` names. Gateway selection
 * is `PAYMENTS_ENVIRONMENT` via `resolveRequiredServerBillingEnvironment`,
 * never `PADDLE_ENVIRONMENT` (that name stays `sandbox` for the legacy
 * `paddle-webhook` audit sink).
 *
 * `founder_lifetime` stays in the list only so the cold-start drift guard in
 * `get-paddle-price` finds a name for every `PAID_PLAN_IDS` entry; the function
 * answers `410 plan_retired` before any lookup, so that name needs no value.
 * The Craft names stay empty while Craft has no live Paddle product.
 *
 * The seven `PADDLE_SANDBOX_PRICE_*` copies are the operator prerequisite
 * that must exist before those live names are flipped. The legacy classifier
 * currently maps only pro monthly, pro annual, and founder lifetime; the
 * craft and credit-pack sandbox names are still required so those ids are
 * not left only on the shared live names. This module does not read them.
 *
 * Pure: no Deno, no I/O. The caller passes `getEnv`.
 */

export const GET_PADDLE_PRICE_PLAN_IDS = [
  "pro_monthly",
  "pro_annual",
  "craft_monthly",
  "craft_annual",
  "founder_lifetime",
  "credit_pack_50",
  "credit_pack_150",
] as const;

export type GetPaddlePricePlanId = (typeof GET_PADDLE_PRICE_PLAN_IDS)[number];

export const GET_PADDLE_PRICE_CATALOG_ENV_NAMES = {
  pro_monthly: "PADDLE_PRICE_PRO_MONTHLY",
  pro_annual: "PADDLE_PRICE_PRO_ANNUAL",
  craft_monthly: "PADDLE_PRICE_CRAFT_MONTHLY",
  craft_annual: "PADDLE_PRICE_CRAFT_ANNUAL",
  founder_lifetime: "PADDLE_PRICE_FOUNDER_LIFETIME",
  credit_pack_50: "PADDLE_PRICE_CREDIT_PACK_50",
  credit_pack_150: "PADDLE_PRICE_CREDIT_PACK_150",
} as const satisfies Record<GetPaddlePricePlanId, string>;

/** Must be set to sandbox price ids before `PADDLE_PRICE_*` holds live ids. */
export const PADDLE_SANDBOX_PRICE_COPIES_BEFORE_LIVE = {
  pro_monthly: "PADDLE_SANDBOX_PRICE_PRO_MONTHLY",
  pro_annual: "PADDLE_SANDBOX_PRICE_PRO_ANNUAL",
  craft_monthly: "PADDLE_SANDBOX_PRICE_CRAFT_MONTHLY",
  craft_annual: "PADDLE_SANDBOX_PRICE_CRAFT_ANNUAL",
  founder_lifetime: "PADDLE_SANDBOX_PRICE_FOUNDER_LIFETIME",
  credit_pack_50: "PADDLE_SANDBOX_PRICE_CREDIT_PACK_50",
  credit_pack_150: "PADDLE_SANDBOX_PRICE_CREDIT_PACK_150",
} as const satisfies Record<GetPaddlePricePlanId, string>;

export const PAYMENTS_ENVIRONMENT_ENV_NAME = "PAYMENTS_ENVIRONMENT";

const CATALOG_ENV_NAME_SET: ReadonlySet<string> = new Set(
  Object.values(GET_PADDLE_PRICE_CATALOG_ENV_NAMES),
);

export function readGetPaddlePriceCatalog(
  getEnv: (name: string) => string | undefined,
): Record<GetPaddlePricePlanId, string> {
  const catalog = {} as Record<GetPaddlePricePlanId, string>;
  for (const planId of GET_PADDLE_PRICE_PLAN_IDS) {
    const name = GET_PADDLE_PRICE_CATALOG_ENV_NAMES[planId];
    if (!CATALOG_ENV_NAME_SET.has(name)) {
      throw new Error("get-paddle-price catalog env name is not allowlisted");
    }
    catalog[planId] = (getEnv(name) ?? "").trim();
  }
  return catalog;
}
