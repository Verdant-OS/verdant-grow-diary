/**
 * Low-balance top-up nudge (paid growers, after a saved review).
 *
 * The counterpart to the Free post-value upgrade: that one is strictly
 * Free -> Pro and fails closed for every paid viewer, so a paying grower
 * running out of monthly credits previously got nothing at all — the badge
 * stated the balance and stopped.
 *
 * The invariants defended here are about WHO is asked and WHEN:
 *  - only someone who can actually buy a pack (paid billing provenance)
 *  - only after value was delivered AND durably saved
 *  - never someone who already holds pack credits
 *  - never as a paywall event, because paid growers must not enter the
 *    upgrade funnel
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AI_DOCTOR_LOW_CREDIT_THRESHOLD,
  buildAiDoctorLowCreditTopUpViewModel,
} from "@/lib/aiDoctorLowCreditTopUpViewModel";
import { buildAiDoctorPostValueUpgradeViewModel } from "@/lib/aiDoctorPostValueUpgradeViewModel";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

const ROOT = resolve(__dirname, "../..");
const COMPONENT = readFileSync(
  resolve(ROOT, "src/components/AiDoctorLowCreditTopUp.tsx"),
  "utf8",
);

const paid = (over: Partial<ResolvedEntitlement> = {}): ResolvedEntitlement =>
  ({
    displayPlanId: "pro_monthly",
    effectivePlanId: "pro_monthly",
    status: "active",
    isActive: true,
    source: "lovable_paddle_subscription",
    capabilities: { aiCreditsPerGrow: null },
    degraded: false,
    ...over,
  }) as unknown as ResolvedEntitlement;

const free = (): ResolvedEntitlement =>
  ({
    displayPlanId: "free",
    effectivePlanId: "free",
    status: "active",
    isActive: true,
    source: "free",
    capabilities: { aiCreditsPerGrow: 3 },
    degraded: false,
  }) as unknown as ResolvedEntitlement;

const credit = (over: Record<string, unknown> = {}) => ({
  remaining: 1,
  scope: "per_month" as const,
  scope_limit: 100,
  plan_id: "pro_monthly",
  // A CONFIRMED zero. The offer requires proof that no pack credits are held,
  // so an absent value is not the same as none — see the fail-closed test.
  pack_balance: 0,
  ...over,
});

const build = (over: Record<string, unknown> = {}) =>
  buildAiDoctorLowCreditTopUpViewModel({
    credit: credit(),
    viewerEntitlement: paid(),
    entitlementLoading: false,
    durableSessionSaved: true,
    ...over,
  } as Parameters<typeof buildAiDoctorLowCreditTopUpViewModel>[0]);

describe("low-credit top-up · shows at the right moment", () => {
  it("appears for a paid grower at or under the threshold", () => {
    for (let remaining = 0; remaining <= AI_DOCTOR_LOW_CREDIT_THRESHOLD; remaining += 1) {
      const vm = build({ credit: credit({ remaining }) });
      expect(vm.visible, `remaining=${remaining}`).toBe(true);
    }
  });

  it("stays quiet while there is still headroom", () => {
    const vm = build({ credit: credit({ remaining: AI_DOCTOR_LOW_CREDIT_THRESHOLD + 1 }) });
    expect(vm.visible).toBe(false);
  });

  it("links to the credit-pack section, carrying a safe return path", () => {
    const vm = build({ returnTo: "/doctor/sessions/session-1" });
    expect(vm.visible).toBe(true);
    if (!vm.visible) return;
    const url = new URL(vm.href, "http://verdant.local");
    expect(url.hash).toBe("#buy-credits");
    expect(url.searchParams.get("returnTo")).toBe("/doctor/sessions/session-1");
  });

  it("reports the balance honestly at zero", () => {
    const vm = build({ credit: credit({ remaining: 0 }) });
    expect(vm.visible).toBe(true);
    if (!vm.visible) return;
    // Never claims credits remain when none do.
    expect(vm.label).not.toMatch(/\b0 AI credits left\b/);
    expect(vm.label).toMatch(/used this month/i);
  });

  it("never promises a finite pack lasts until the reset", () => {
    // Packs are 50 or 150 credits and are spent only after the monthly
    // allowance, so a grower can exhaust one before any reset. The copy may
    // say what a pack ADDS, never what it guarantees.
    for (const remaining of [0, 1, 2]) {
      const vm = build({ credit: credit({ remaining }) });
      expect(vm.visible).toBe(true);
      if (!vm.visible) continue;
      expect(vm.label, `remaining=${remaining}`).not.toMatch(/until (they|it) reset/i);
      expect(vm.label, `remaining=${remaining}`).not.toMatch(/\bcovers\b|\bunlimited\b|\benough\b/i);
    }
  });
});

describe("low-credit top-up · fails closed", () => {
  it("never asks before the value is durably saved", () => {
    expect(build({ durableSessionSaved: false }).visible).toBe(false);
  });

  it("never asks while entitlement is still loading", () => {
    expect(build({ entitlementLoading: true }).visible).toBe(false);
  });

  it("never asks a Free grower — they cannot buy a pack", () => {
    // Free growers get the Pro upgrade path instead; a pack would have
    // nothing to add to their per-grow allowance.
    expect(build({ viewerEntitlement: free() }).visible).toBe(false);
  });

  it("never asks a staff-presented viewer without paid billing provenance", () => {
    // Capabilities lifted to paid for presentation, but source stays free.
    // Presentation must not authorize a cost-bearing prompt.
    const staff = paid({ source: "free" } as Partial<ResolvedEntitlement>);
    expect(build({ viewerEntitlement: staff }).visible).toBe(false);
  });

  it("never asks someone who already holds pack credits", () => {
    expect(build({ credit: credit({ pack_balance: 25 }) }).visible).toBe(false);
  });

  it("requires a CONFIRMED zero pack balance, not merely an absent one", () => {
    // Older success envelopes omit pack_balance, and an untrusted response
    // could supply a malformed one. Treating unknown as zero would solicit a
    // pack from someone who may already own credits — so unknown stays quiet.
    expect(build({ credit: credit({ pack_balance: undefined }) }).visible).toBe(false);
    expect(build({ credit: credit({ pack_balance: null }) }).visible).toBe(false);
    expect(build({ credit: credit({ pack_balance: "0" }) }).visible).toBe(false);
    expect(build({ credit: credit({ pack_balance: Number.NaN }) }).visible).toBe(false);
    // Only a real numeric zero opens the offer.
    expect(build({ credit: credit({ pack_balance: 0 }) }).visible).toBe(true);
  });

  it("ignores the per-grow (Free) scope entirely", () => {
    expect(build({ credit: credit({ scope: "per_grow" }) }).visible).toBe(false);
  });

  it("rejects a replayed receipt, which may describe a spent month", () => {
    // useAiDoctorLiveReview reuses the idempotency key across retries, so the
    // spend RPC can return its immutable prior receipt. If that retry crossed
    // the UTC month boundary the balance belongs to an allowance that has
    // since reset, and soliciting a pack from it would be wrong.
    expect(build({ credit: credit({ replayed: true }) }).visible).toBe(false);
    // A fresh receipt is unaffected.
    expect(build({ credit: credit({ replayed: false }) }).visible).toBe(true);
  });

  it("fails closed on malformed or missing balances", () => {
    expect(build({ credit: credit({ remaining: 1.5 }) }).visible).toBe(false);
    expect(build({ credit: credit({ remaining: -1 }) }).visible).toBe(false);
    expect(build({ credit: credit({ remaining: null }) }).visible).toBe(false);
    expect(build({ credit: null }).visible).toBe(false);
    expect(build({ viewerEntitlement: null }).visible).toBe(false);
  });
});

describe("low-credit top-up · cannot collide with the Free upgrade", () => {
  it("the two nudges are mutually exclusive by construction", () => {
    const freeCredit = {
      remaining: 0,
      scope: "per_grow" as const,
      scope_limit: 3,
      plan_id: "free",
    };
    const args = { entitlementLoading: false, durableSessionSaved: true };

    // Free viewer: upgrade visible, top-up hidden.
    expect(
      buildAiDoctorPostValueUpgradeViewModel({
        credit: freeCredit,
        viewerEntitlement: free(),
        ...args,
      }).visible,
    ).toBe(true);
    expect(build({ credit: freeCredit, viewerEntitlement: free() }).visible).toBe(false);

    // Paid viewer: top-up visible, upgrade hidden.
    expect(build().visible).toBe(true);
    expect(
      buildAiDoctorPostValueUpgradeViewModel({
        credit: credit(),
        viewerEntitlement: paid(),
        ...args,
      }).visible,
    ).toBe(false);
  });
});

describe("low-credit top-up · funnel hygiene", () => {
  it("reports as a credit-pack CTA, never as a paywall", () => {
    // A paying grower entering the upgrade funnel would corrupt it — the
    // same invariant AiCreditLimitNotice enforces for denials. The click
    // lives here; the impression lives in the parent (see ordering test).
    expect(COMPONENT).toMatch(/trackFunnelEvent\("credit_pack_cta_clicked"/);
    expect(COMPONENT).not.toMatch(/paywall_viewed|paywall_cta_clicked/);

    const parent = readFileSync(
      resolve(ROOT, "src/components/PlantDetailAiDoctorLiveReview.tsx"),
      "utf8",
    );
    expect(parent).toMatch(
      /trackFunnelEvent\("credit_pack_cta_viewed", \{ surface: AI_DOCTOR_LOW_CREDIT_SURFACE \}\)/,
    );
  });

  it("uses its own surface so it is separable from the denial CTA", () => {
    expect(COMPONENT).toMatch(/AI_DOCTOR_LOW_CREDIT_SURFACE/);
  });

  it("emits the impression from the parent, after the value milestones", () => {
    // React runs child effects BEFORE parent effects, so an impression effect
    // inside the child would report the offer as preceding the result/saved
    // milestones that earn it. The child owns only the click, which is
    // user-initiated and therefore already after both.
    expect(COMPONENT).not.toMatch(/useEffect/);
    expect(COMPONENT).not.toMatch(/credit_pack_cta_viewed/);

    const parent = readFileSync(
      resolve(ROOT, "src/components/PlantDetailAiDoctorLiveReview.tsx"),
      "utf8",
    );
    const saved = parent.indexOf('trackFunnelEvent("ai_doctor_session_saved"');
    const impression = parent.indexOf('trackFunnelEvent("credit_pack_cta_viewed", { surface: AI_DOCTOR_LOW_CREDIT_SURFACE }');
    expect(saved).toBeGreaterThan(-1);
    expect(impression).toBeGreaterThan(-1);
    // Declared after the milestone effect, mirroring the post-value paywall.
    expect(impression).toBeGreaterThan(saved);
    // And deduplicated per result, so a re-render cannot double-count it.
    expect(parent).toMatch(/trackedLowCreditResultRef\.current === review\.result/);
  });
});
