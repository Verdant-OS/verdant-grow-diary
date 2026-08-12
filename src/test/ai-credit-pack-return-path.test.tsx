/**
 * Credit-pack top-up keeps the buyer's place.
 *
 * A paying grower who exhausts the monthly AI allowance is the only person in
 * the app the pack CTA is actually for — `creditPackPurchaseEligible` requires
 * paid billing provenance, so Free never sees this link. That made the top-up
 * link the one money-spending path in the product that forgot where the buyer
 * came from: the Free upsell branch directly above it already carried a
 * `returnTo`, while the paid top-up went to a bare `/pricing#buy-credits`.
 *
 * The mechanism these tests pin is deliberately split across two consumers:
 *   - Pricing scrolls to the pack section on `location.hash`
 *   - `usePaddleCheckout.defaultSuccessUrl` reads `returnTo` out of
 *     `location.search` to build the post-checkout landing
 * so the return path MUST live in the query and the anchor MUST stay last.
 * Putting the return path in the fragment would still scroll and still look
 * right, and would silently strand the buyer — hence the parsed assertions
 * below rather than string comparisons alone.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AiCreditLimitNotice from "@/components/AiCreditLimitNotice";
import {
  buildAiCreditLimitNoticeViewModel,
  type AiCreditDenial,
} from "@/lib/aiCreditLimitNoticeViewModel";
import { buildPlantAiDoctorReviewPath } from "@/lib/aiDoctorEntryRules";
import {
  buildCreditPackSuccessUrl,
  CREDIT_PACK_RETURN_TO_PARAM,
  sanitizeCheckoutReturnTo,
} from "@/lib/checkoutReturnTo";

const PRICING = readFileSync(resolve(__dirname, "../..", "src/pages/Pricing.tsx"), "utf8");

const NOTICE = readFileSync(
  resolve(__dirname, "../..", "src/components/AiCreditLimitNotice.tsx"),
  "utf8",
);

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: {
      displayPlanId: "free",
      effectivePlanId: "free",
      status: "active",
      isActive: true,
      capabilities: {},
      degraded: false,
      degradedReason: "null_row_free",
      source: "free",
    },
    refetch: async () => undefined,
  }),
}));

const denial = (plan_id: string | null): AiCreditDenial => ({
  ok: false,
  status: "denied",
  reason: "limit_reached",
  scope: plan_id === "free" ? "per_grow" : "per_month",
  scope_used: 100,
  scope_limit: 100,
  remaining: 0,
  plan_id,
});

const vmFor = (planId: string | null, returnTo?: string | null) =>
  buildAiCreditLimitNoticeViewModel({ credit: denial(planId), returnTo });

/** Mirrors how `defaultSuccessUrl` actually reads the value at checkout time. */
function readAsCheckoutWould(href: string) {
  const url = new URL(href, "http://checkout-return-to.local");
  return {
    returnTo: new URLSearchParams(url.search).get("returnTo"),
    hash: url.hash,
    pathname: url.pathname,
  };
}

describe("credit pack top-up · return path", () => {
  it("stays byte-identical when there is no return path to carry", () => {
    // The link's prior behavior, preserved exactly so existing pins hold.
    expect(vmFor("pro_monthly").packHref).toBe("/pricing#buy-credits");
  });

  it("carries a safe return path in the query, with the anchor still last", () => {
    const href = vmFor("pro_monthly", "/plants/plant-123").packHref ?? "";
    const parsed = readAsCheckoutWould(href);
    expect(parsed.pathname).toBe("/pricing");
    expect(parsed.returnTo).toBe("/plants/plant-123");
    // Anchor preserved — Pricing still scrolls to the pack section.
    expect(parsed.hash).toBe("#buy-credits");
  });

  it("round-trips the anchored review path a grower reaches from a tent alert", () => {
    // The alert CTA deep-links to the review anchor; a denial there must be
    // able to send the buyer back to that same anchor, not the page top.
    const anchored = buildPlantAiDoctorReviewPath({ plantId: "plant-1", tentId: "tent-1" });
    expect(anchored).toBeTruthy();

    const href = vmFor("pro_monthly", anchored).packHref ?? "";
    const parsed = readAsCheckoutWould(href);
    // Survives sanitization intact, fragment included — this is the whole point.
    expect(parsed.returnTo).toBe(anchored);
    expect(parsed.returnTo).toContain("#");
    expect(parsed.hash).toBe("#buy-credits");
  });

  it("drops an unsafe return path rather than building an off-site CTA", () => {
    const href = vmFor("pro_monthly", "https://not-verdant.example/phish").packHref ?? "";
    expect(href).toBe("/pricing#buy-credits");
    expect(href).not.toContain("not-verdant");
  });

  it("never offers a pack to viewers who cannot buy one", () => {
    // Free gets the upgrade path; unknown gets no CTA at all. Neither may
    // carry a top-up href, even when a return path was supplied.
    expect(vmFor("free", "/plants/plant-123").packHref).toBeUndefined();
    expect(vmFor(null, "/plants/plant-123").packHref).toBeUndefined();
  });
});

describe("credit pack top-up · never auto-redirects a buyer", () => {
  /**
   * The regression this guards (Codex P1 on #893):
   *
   * /checkout/success auto-redirects on `returnTo` the moment `confirmed` is
   * true, and `confirmed` is `isActive && effectivePlanId !== "free"` — which
   * every pack buyer already satisfies on arrival, since paid provenance is
   * what makes them eligible to buy a pack. The bounded "confirming…" poll
   * gates on that same signal, so it never waits either. A pack credits a
   * separate grant ledger asynchronously, so forwarding `returnTo` bounces the
   * buyer to the credit wall before their credits exist — denied after paying,
   * with the confirmation page gone from history via `replace: true`.
   */
  it("carries the origin under a param that is NOT the redirect trigger", () => {
    const url = new URL(buildCreditPackSuccessUrl("https://app.example", "/plants/plant-123"));
    expect(url.pathname).toBe("/checkout/success");
    // The auto-redirect keys on `returnTo`; this must never populate it.
    expect(url.searchParams.get("returnTo")).toBeNull();
    expect(url.searchParams.get(CREDIT_PACK_RETURN_TO_PARAM)).toBe("/plants/plant-123");
  });

  it("keeps the pack param distinct from the redirect param by name", () => {
    // If these ever collide the redirect silently reactivates.
    expect(CREDIT_PACK_RETURN_TO_PARAM).not.toBe("returnTo");
  });

  it("applies the same sanitization as every other return path", () => {
    const url = new URL(
      buildCreditPackSuccessUrl("https://app.example", "https://not-verdant.example/phish"),
    );
    expect(url.search).toBe("");
    expect(url.toString()).not.toContain("not-verdant");
  });

  it("round-trips the anchored review path a grower reaches from a tent alert", () => {
    const anchored = buildPlantAiDoctorReviewPath({ plantId: "plant-1", tentId: "tent-1" });
    const url = new URL(buildCreditPackSuccessUrl("https://app.example", anchored));
    expect(url.searchParams.get(CREDIT_PACK_RETURN_TO_PARAM)).toBe(anchored);
    // And the page will re-sanitize it before rendering a link.
    expect(sanitizeCheckoutReturnTo(url.searchParams.get(CREDIT_PACK_RETURN_TO_PARAM))).toBe(
      anchored,
    );
  });

  it("routes pack checkout through that success URL, not the shared default", () => {
    // The shared default forwards `returnTo` and would re-arm the redirect.
    expect(PRICING).toMatch(/return isPack\s*\?\s*buildCreditPackSuccessUrl\(/);
  });

  it("applies it on the recovery retry too, not just the first attempt", () => {
    // A retry falling back to the shared default would re-arm the redirect for
    // exactly the buyer whose first attempt already failed.
    const both = PRICING.match(/successUrl:\s*packSuccessUrlFor\(/g) ?? [];
    expect(both.length).toBe(2);
    expect(PRICING).toMatch(/priceId:\s*rawSku,\s*successUrl:\s*packSuccessUrlFor\(rawSku\)/);
  });

  it("leaves plan checkouts on the shared default, where returnTo is correct", () => {
    // Subscriptions SHOULD auto-redirect: `confirmed` genuinely reflects the
    // thing that was purchased. Only packs need the separate param.
    expect(PRICING).toMatch(/const isPack = CREDIT_PACKS\.some/);
    expect(PRICING).toMatch(/:\s*undefined;/);
  });
});

describe("credit pack top-up · presenter", () => {
  it("renders the href the view model built", () => {
    render(
      <MemoryRouter>
        <AiCreditLimitNotice credit={denial("pro_monthly")} returnTo="/plants/plant-123" />
      </MemoryRouter>,
    );
    const link = screen.getByTestId("ai-credit-limit-notice-buy-credits");
    expect(link).toHaveAttribute("href", vmFor("pro_monthly", "/plants/plant-123").packHref);
  });

  it("builds the destination in the view model, never by hand in the presenter", () => {
    // A hardcoded path here is what caused the bug: it could not carry a
    // return target, so the string itself must not come back.
    expect(NOTICE).not.toContain('"/pricing#buy-credits"');
    expect(NOTICE).toContain("vm.packHref");
  });
});
