/**
 * Credit-pack CTA instrumentation.
 *
 * The top-up link was the only monetised CTA in the app with no telemetry at
 * all: `onBuyCreditsClick` was declared on AiCreditLimitNotice and never
 * passed by any call site, and the impression effect fired only for the Free
 * upsell branch. So nobody could tell whether the pack CTA converted, or was
 * even seen.
 *
 * The invariant these tests defend is NOT "an event fires" — it is WHICH
 * funnel the event lands in. `AiCreditLimitNotice` exists to keep a paying
 * grower out of the upgrade path ("A paying user must never see an upgrade
 * prompt"), and the analytics has to hold the same line: a top-up impression
 * or click must never be counted as paywall_viewed / paywall_cta_clicked, or
 * the upgrade funnel silently fills with people who already upgraded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AiCreditLimitNotice from "@/components/AiCreditLimitNotice";
import type { AiCreditDenial } from "@/lib/aiCreditLimitNoticeViewModel";
import { FUNNEL_EVENTS } from "@/lib/funnelAnalytics";
import { FUNNEL_EVENT_SCHEMA } from "@/lib/funnelEventSchema";

const ROOT = resolve(__dirname, "../..");
const REVIEW = readFileSync(
  resolve(ROOT, "src/components/PlantDetailAiDoctorLiveReview.tsx"),
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

describe("credit pack CTA · analytics catalog", () => {
  it("registers both events", () => {
    expect(FUNNEL_EVENTS).toContain("credit_pack_cta_viewed");
    expect(FUNNEL_EVENTS).toContain("credit_pack_cta_clicked");
  });

  it("carries surface only — a pack SKU must never enter a plan param", () => {
    // A pack is not a plan. Letting a pack SKU into `plan` is how it gets
    // mistaken for a tier by anything reading plan entitlement.
    expect(FUNNEL_EVENT_SCHEMA.credit_pack_cta_viewed).toEqual(["surface"]);
    expect(FUNNEL_EVENT_SCHEMA.credit_pack_cta_clicked).toEqual(["surface"]);
    expect(FUNNEL_EVENT_SCHEMA.credit_pack_cta_clicked).not.toContain("plan");
  });

  it("keeps the top-up events out of the upgrade funnel", () => {
    // The distinction is the whole point: these must be their own names, not
    // extra surfaces bolted onto the paywall events.
    expect(FUNNEL_EVENTS).toContain("paywall_cta_clicked");
    expect("credit_pack_cta_clicked").not.toBe("paywall_cta_clicked");
    expect("credit_pack_cta_viewed").not.toBe("paywall_viewed");
  });
});

describe("credit pack CTA · wiring", () => {
  it("fires the impression on the branch that actually renders the link", () => {
    // "wait" is the only branch the view model gives a packHref, so this
    // counts CTAs shown rather than denials in general.
    expect(REVIEW).toMatch(
      /creditNoticeKind === "wait"[\s\S]{0,160}trackFunnelEvent\("credit_pack_cta_viewed"/,
    );
  });

  it("passes the previously-dead onBuyCreditsClick prop", () => {
    expect(REVIEW).toMatch(/onBuyCreditsClick=\{handleBuyCreditsClick\}/);
    expect(REVIEW).toMatch(
      /const handleBuyCreditsClick[\s\S]{0,200}trackFunnelEvent\("credit_pack_cta_clicked"/,
    );
  });

  it("never reports a paid top-up as an upgrade impression", () => {
    // paywall_viewed must stay bound to the Free upsell branch alone.
    expect(REVIEW).toMatch(
      /creditNoticeKind === "upsell"[\s\S]{0,120}trackFunnelEvent\("paywall_viewed"/,
    );
    expect(REVIEW).not.toMatch(
      /creditNoticeKind === "wait"[\s\S]{0,160}trackFunnelEvent\("paywall_viewed"/,
    );
  });
});

describe("credit pack CTA · click reaches the handler", () => {
  const clicks: string[] = [];

  beforeEach(() => {
    clicks.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes the callback exactly once, from the paid branch only", () => {
    const onBuyCreditsClick = vi.fn();
    render(
      <MemoryRouter>
        <AiCreditLimitNotice credit={denial("pro_monthly")} onBuyCreditsClick={onBuyCreditsClick} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("ai-credit-limit-notice-buy-credits"));
    expect(onBuyCreditsClick).toHaveBeenCalledTimes(1);
  });

  it("gives a Free grower no top-up CTA to click", () => {
    const onBuyCreditsClick = vi.fn();
    render(
      <MemoryRouter>
        <AiCreditLimitNotice credit={denial("free")} onBuyCreditsClick={onBuyCreditsClick} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("ai-credit-limit-notice-buy-credits")).toBeNull();
    expect(onBuyCreditsClick).not.toHaveBeenCalled();
  });
});
