import { CREDIT_PACKS, PRICING } from "@/constants/pricing";
import { isProductionCheckoutHostname } from "@/lib/paddleEnvironment";

export type StripeBillingEnvironment = "sandbox" | "live";

export function stripeTokenEnvironment(token: unknown): StripeBillingEnvironment | null {
  if (typeof token !== "string") return null;
  if (/^pk_test_[A-Za-z0-9]+$/.test(token)) return "sandbox";
  if (/^pk_live_[A-Za-z0-9]+$/.test(token)) return "live";
  return null;
}

export function stripeCheckoutEnvironment(input: {
  token: unknown;
  hostname: string;
  disabled: boolean;
}): StripeBillingEnvironment | null {
  if (input.disabled) return null;
  const environment = stripeTokenEnvironment(input.token);
  if (environment === "live" && !isProductionCheckoutHostname(input.hostname)) return null;
  return environment;
}

export function stripeCatalogOffer(priceId: unknown) {
  if (typeof priceId !== "string") return null;
  const plans = [
    { id: "pro_monthly", amount: PRICING.pro.monthlyPrice * 100, interval: "month" },
    { id: "pro_annual", amount: PRICING.pro.annualPrice * 100, interval: "year" },
    { id: "craft_monthly", amount: PRICING.craft.monthlyPrice * 100, interval: "month" },
    { id: "craft_annual", amount: PRICING.craft.annualPrice * 100, interval: "year" },
  ] as const;
  const plan = plans.find((offer) => offer.id === priceId);
  if (plan) return { ...plan, kind: "subscription" as const, currency: "usd" as const };
  const pack = CREDIT_PACKS.find((offer) => offer.sku === priceId);
  return pack
    ? { id: pack.sku, amount: pack.priceUsd * 100, credits: pack.credits, kind: "payment" as const, currency: "usd" as const }
    : null;
}

export const STRIPE_FULFILLMENT_PENDING_MESSAGE =
  "Checkout is unavailable while payment and account records are being connected. No payment has been taken.";