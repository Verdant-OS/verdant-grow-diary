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
