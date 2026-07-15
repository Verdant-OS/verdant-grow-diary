import { describe, expect, it } from "vitest";

import { buildSubscriberActivationViewModel } from "@/lib/subscriberActivationRules";
import type { SubscriberGrowthCounts } from "@/lib/subscriberGrowthSnapshotRules";

const COUNTS: SubscriberGrowthCounts = {
  activationMetricsAvailable: true,
  activePaid: 10,
  proMonthly: 4,
  proAnnual: 3,
  founderLifetime: 3,
  atRisk: 0,
  scheduledCancellation: 0,
  newActive7d: 2,
  newActive30d: 5,
  activePaidWithGrow: 9,
  activePaidWithTent: 8,
  activePaidWithPlant: 7,
  activePaidWithFirstSignal: 6,
  activePaidCoreActivated: 5,
  pricingInterestTotal: 0,
  pricingInterest7d: 0,
  pricingInterestNeedsContact: 0,
  pricingInterestFollowUpDue: 0,
  pricingInterestContacted7d: 0,
  pricingInterestDirect: 0,
  pricingInterestLanding: 0,
  pricingInterestPricingPage: 0,
  pricingInterestFounderPage: 0,
  pricingInterestFounderShare: 0,
  pricingInterestReferral: 0,
  pricingInterestGrowerInvite: 0,
  pricingInterestContextCheck: 0,
  pricingInterestVpdCalculator: 0,
  allLeads7d: 0,
};

describe("subscriber activation rules", () => {
  it("builds a deterministic aggregate activation opportunity", () => {
    const vm = buildSubscriberActivationViewModel(COUNTS);
    expect(vm).toMatchObject({
      activePaid: 10,
      coreActivated: 5,
      needsCoreActivation: 5,
      activationRatePercent: 50,
      status: "activation_incomplete",
    });
    expect(vm.guidance).toContain("Grow → Tent → Plant → first diary or sensor signal");
    expect(buildSubscriberActivationViewModel(COUNTS)).toEqual(vm);
  });

  it("reports full observed activation without claiming retention", () => {
    const vm = buildSubscriberActivationViewModel({
      ...COUNTS,
      activePaidWithGrow: 10,
      activePaidWithTent: 10,
      activePaidWithPlant: 10,
      activePaidWithFirstSignal: 10,
      activePaidCoreActivated: 10,
    });
    expect(vm.status).toBe("activation_observed");
    expect(vm.activationRatePercent).toBe(100);
    expect(vm.guidance).toContain("Keep monitoring early retention");
  });

  it("fails closed when aggregate stages contradict the paid cohort", () => {
    const vm = buildSubscriberActivationViewModel({
      ...COUNTS,
      activePaidWithGrow: 11,
    });
    expect(vm).toMatchObject({
      status: "integrity_mismatch",
      activationRatePercent: null,
      needsCoreActivation: 0,
    });
  });

  it("does not calculate a rate without an active-paid cohort", () => {
    const vm = buildSubscriberActivationViewModel({
      ...COUNTS,
      activePaid: 0,
      activePaidWithGrow: 0,
      activePaidWithTent: 0,
      activePaidWithPlant: 0,
      activePaidWithFirstSignal: 0,
      activePaidCoreActivated: 0,
    });
    expect(vm.status).toBe("no_active_paid");
    expect(vm.activationRatePercent).toBeNull();
  });

  it("does not treat fields missing from an older RPC as zero activation", () => {
    const vm = buildSubscriberActivationViewModel({
      ...COUNTS,
      activationMetricsAvailable: false,
      activePaidWithGrow: 0,
      activePaidWithTent: 0,
      activePaidWithPlant: 0,
      activePaidWithFirstSignal: 0,
      activePaidCoreActivated: 0,
    });
    expect(vm.status).toBe("metrics_unavailable");
    expect(vm.activationRatePercent).toBeNull();
    expect(vm.guidance).toContain("Do not infer missing product activity");
  });
});
