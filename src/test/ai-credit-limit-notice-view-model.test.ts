import { describe, it, expect } from "vitest";
import {
  buildAiCreditLimitNoticeViewModel,
  type AiCreditDenial,
} from "@/lib/aiCreditLimitNoticeViewModel";
import {
  paywallCtaFindBannedWords,
  paywallCtaViewModelText,
} from "@/lib/paywallCtaViewModel";

const baseDenial = (plan_id: string | null | undefined): AiCreditDenial => ({
  ok: false,
  status: "denied",
  reason: "limit_reached",
  scope: plan_id === "free" ? "per_grow" : "per_month",
  scope_used: 100,
  scope_limit: 100,
  remaining: 0,
  plan_id: plan_id ?? null,
});

describe("aiCreditLimitNoticeViewModel — branching by credit.plan_id", () => {
  it("free → upsell, paywallVm present, charged=false", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: baseDenial("free"),
    });
    expect(vm.kind).toBe("upsell");
    expect(vm.paywallVm).toBeDefined();
    expect(vm.charged).toBe(false);
    expect(vm.paywallVm?.primaryCtaHref).toBe("/pricing");
  });

  it.each(["pro_monthly", "pro_annual", "founder_lifetime"])(
    "%s → wait, NO paywallVm (trust gate), charged=false",
    (plan) => {
      const vm = buildAiCreditLimitNoticeViewModel({
        credit: baseDenial(plan),
      });
      expect(vm.kind).toBe("wait");
      expect(vm.paywallVm).toBeUndefined();
      expect(vm.charged).toBe(false);
      // plan-neutral copy — must never say "Pro"
      expect(vm.title.toLowerCase()).not.toContain("pro");
      expect(vm.body.toLowerCase()).not.toContain("pro");
    },
  );

  it.each([null, undefined, "mystery_plan"])(
    "%s plan_id → unknown, NO paywallVm, charged=false",
    (plan) => {
      const vm = buildAiCreditLimitNoticeViewModel({
        credit: baseDenial(plan as string | null | undefined),
      });
      expect(vm.kind).toBe("unknown");
      expect(vm.paywallVm).toBeUndefined();
      expect(vm.charged).toBe(false);
    },
  );

  it("upsell paywall copy is free of banned words", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: baseDenial("free"),
      currentPlanLabel: "Free",
    });
    expect(vm.paywallVm).toBeDefined();
    const blob =
      paywallCtaViewModelText(vm.paywallVm!) + "\n" + vm.title + "\n" + vm.body;
    expect(paywallCtaFindBannedWords(blob)).toEqual([]);
  });

  it("wait + unknown copy free of banned words", () => {
    for (const plan of ["pro_monthly", "founder_lifetime", "mystery"]) {
      const vm = buildAiCreditLimitNoticeViewModel({
        credit: baseDenial(plan),
      });
      expect(paywallCtaFindBannedWords(vm.title + "\n" + vm.body)).toEqual([]);
    }
  });
});
