/**
 * aiCreditLimitNoticeViewModel — surface=coach branch tests (S3.2).
 *
 * Locks Coach copy to the spec and re-asserts the trust-gate rules:
 *  - Paid plans never receive paywallVm.
 *  - Unknown plan never receives paywallVm.
 *  - Copy is free of banned words.
 *  - All branches set charged=false.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiCreditLimitNoticeViewModel,
  type AiCreditDenial,
} from "@/lib/aiCreditLimitNoticeViewModel";
import {
  paywallCtaFindBannedWords,
  paywallCtaViewModelText,
} from "@/lib/paywallCtaViewModel";

const denial = (plan_id: string | null | undefined): AiCreditDenial => ({
  ok: false,
  status: "denied",
  reason: "limit_reached",
  scope: plan_id === "free" ? "per_grow" : "per_month",
  scope_used: 100,
  scope_limit: 100,
  remaining: 0,
  plan_id: plan_id ?? null,
});

describe("aiCreditLimitNoticeViewModel — Coach surface (S3.2)", () => {
  it("free + per_grow → Coach upsell copy with PaywallCta /pricing", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: denial("free"),
      surface: "coach",
    });
    expect(vm.kind).toBe("upsell");
    expect(vm.surface).toBe("coach");
    expect(vm.title).toBe("You've used your AI Coach checks for this grow.");
    expect(vm.body).toBe(
      "Free grows include 3 AI checks. Pro gives you 100 AI checks per month across every grow. This request was not charged.",
    );
    expect(vm.paywallVm).toBeDefined();
    expect(vm.paywallVm?.primaryCtaHref).toBe("/pricing");
    expect(vm.paywallVm?.primaryCtaLabel).toBe("See plans");
    expect(vm.charged).toBe(false);
  });

  it.each(["pro_monthly", "pro_annual", "founder_lifetime"])(
    "%s → Coach wait copy, NO paywallVm",
    (plan) => {
      const vm = buildAiCreditLimitNoticeViewModel({
        credit: denial(plan),
        surface: "coach",
      });
      expect(vm.kind).toBe("wait");
      expect(vm.surface).toBe("coach");
      expect(vm.title).toBe("You've used your 100 AI checks this month.");
      expect(vm.body).toBe(
        "Your monthly allowance resets on the 1st of the month (UTC). This request was not charged. Existing notes stay available.",
      );
      expect(vm.paywallVm).toBeUndefined();
      expect(vm.charged).toBe(false);
      // plan-neutral wait copy: never says "Pro" or "Founder".
      expect(vm.title.toLowerCase()).not.toContain("pro");
      expect(vm.body.toLowerCase()).not.toContain("pro");
      expect(vm.title.toLowerCase()).not.toContain("founder");
    },
  );

  it.each([null, undefined, "mystery_plan"])(
    "%s plan_id → Coach unknown copy, NO paywallVm",
    (plan) => {
      const vm = buildAiCreditLimitNoticeViewModel({
        credit: denial(plan as string | null | undefined),
        surface: "coach",
      });
      expect(vm.kind).toBe("unknown");
      expect(vm.surface).toBe("coach");
      expect(vm.title).toBe("You've reached an AI Coach limit.");
      expect(vm.body).toBe("This request was not charged. Please try again later.");
      expect(vm.paywallVm).toBeUndefined();
      expect(vm.charged).toBe(false);
    },
  );

  it("Coach copy across every branch is free of banned words", () => {
    for (const plan of ["free", "pro_monthly", "pro_annual", "founder_lifetime", "mystery"]) {
      const vm = buildAiCreditLimitNoticeViewModel({
        credit: denial(plan),
        currentPlanLabel: "Free",
        surface: "coach",
      });
      const blob =
        vm.title +
        "\n" +
        vm.body +
        (vm.paywallVm ? "\n" + paywallCtaViewModelText(vm.paywallVm) : "");
      expect(paywallCtaFindBannedWords(blob)).toEqual([]);
    }
  });

  it("default surface is 'doctor' (S3.0 byte-for-byte preserved)", () => {
    const vm = buildAiCreditLimitNoticeViewModel({ credit: denial("free") });
    expect(vm.surface).toBe("doctor");
    expect(vm.title).toBe("You've used your AI Doctor checks for this grow.");
  });
});
