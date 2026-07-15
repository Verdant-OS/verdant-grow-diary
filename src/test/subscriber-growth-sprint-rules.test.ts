import { describe, expect, it } from "vitest";

import { buildSubscriberGrowthSprintBoard } from "@/lib/subscriberGrowthSprintRules";
import {
  buildSubscriberGrowthProgress,
  type SubscriberGrowthCounts,
} from "@/lib/subscriberGrowthSnapshotRules";
import type { SignupAcquisitionCounts } from "@/lib/signupAcquisitionSnapshotRules";

const COUNTS: SubscriberGrowthCounts = {
  activationMetricsAvailable: true,
  activePaid: 10,
  proMonthly: 4,
  proAnnual: 3,
  founderLifetime: 3,
  atRisk: 1,
  scheduledCancellation: 2,
  newActive7d: 4,
  newActive30d: 10,
  activePaidWithGrow: 10,
  activePaidWithTent: 9,
  activePaidWithPlant: 8,
  activePaidWithFirstSignal: 7,
  activePaidCoreActivated: 6,
  pricingInterestTotal: 18,
  pricingInterest7d: 7,
  pricingInterestNeedsContact: 6,
  pricingInterestFollowUpDue: 2,
  pricingInterestContacted7d: 5,
  pricingInterestDirect: 2,
  pricingInterestLanding: 4,
  pricingInterestPricingPage: 3,
  pricingInterestFounderPage: 5,
  pricingInterestFounderShare: 3,
  pricingInterestReferral: 4,
  pricingInterestGrowerInvite: 6,
  pricingInterestContextCheck: 8,
  pricingInterestVpdCalculator: 9,
  allLeads7d: 9,
};

const ACQUISITION: SignupAcquisitionCounts = {
  accountsTotal: 20,
  accounts7d: 8,
  attributedTotal: 12,
  attributed7d: 7,
  unattributedTotal: 8,
  landingPage: 3,
  pricingPage: 2,
  founderPage: 1,
  founderShare: 2,
  pricingInterestShare: 1,
  operatorOutreach: 0,
  growerInvite: 2,
  contextCheck: 1,
  vpdCalculator: 3,
};

describe("subscriber growth sprint rules", () => {
  it("turns authoritative counts into a deterministic behind-pace action order", () => {
    const progress = buildSubscriberGrowthProgress(10, Date.parse("2026-07-14T05:00:00.000Z"));
    const board = buildSubscriberGrowthSprintBoard({
      progress,
      counts: COUNTS,
      acquisitionCounts: ACQUISITION,
    });

    expect(board).toMatchObject({
      status: "behind_pace",
      windowDays: 7,
      requiredPaidNextWindow: 13,
      observedPaid7d: 4,
      paidPaceGap: 9,
      accounts7d: 8,
      interest7d: 7,
      followUpDue: 2,
      needsFirstContact: 6,
      atRisk: 1,
      scheduledCancellation: 2,
    });
    expect(board.actions.map((action) => action.id)).toEqual([
      "follow_up_due",
      "first_contact",
      "protect_retention",
      "close_pace_gap",
      "activate_referrals",
    ]);
    expect(board.comparisonNote).toMatch(/separate windows, not a cohort conversion rate/i);
    expect(
      buildSubscriberGrowthSprintBoard({
        progress,
        counts: COUNTS,
        acquisitionCounts: ACQUISITION,
      }),
    ).toEqual(board);
  });

  it("flags the activation handoff without asserting account-to-paid causality", () => {
    const board = buildSubscriberGrowthSprintBoard({
      progress: buildSubscriberGrowthProgress(10, Date.parse("2026-07-14T05:00:00.000Z")),
      counts: { ...COUNTS, newActive7d: 0, pricingInterestFollowUpDue: 0 },
      acquisitionCounts: { ...ACQUISITION, accounts7d: 5 },
    });

    expect(board.actions.some((action) => action.id === "review_activation")).toBe(true);
    expect(board.actions.find((action) => action.id === "review_activation")?.description).toMatch(
      /separate windows.*without assuming causality/i,
    );
  });

  it("keeps an on-pace quiet state useful and does not require acquisition data", () => {
    const board = buildSubscriberGrowthSprintBoard({
      progress: buildSubscriberGrowthProgress(94, Date.parse("2026-07-14T05:00:00.000Z")),
      counts: {
        ...COUNTS,
        activePaid: 94,
        newActive7d: 2,
        pricingInterestNeedsContact: 0,
        pricingInterestFollowUpDue: 0,
        atRisk: 0,
        scheduledCancellation: 0,
      },
      acquisitionCounts: null,
    });

    expect(board.status).toBe("on_pace");
    expect(board.requiredPaidNextWindow).toBe(1);
    expect(board.accounts7d).toBeNull();
    expect(board.actions.map((action) => action.id)).toEqual(["maintain_pace"]);
  });

  it("handles reached, deadline-passed, and invalid aggregate boundaries", () => {
    const reached = buildSubscriberGrowthSprintBoard({
      progress: buildSubscriberGrowthProgress(101, Date.parse("2026-09-02T05:00:00.000Z")),
      counts: {
        ...COUNTS,
        newActive7d: Number.NaN,
        pricingInterest7d: -1,
        pricingInterestNeedsContact: 0,
        pricingInterestFollowUpDue: 0,
        atRisk: 0,
        scheduledCancellation: 0,
      },
    });
    expect(reached).toMatchObject({
      status: "goal_reached",
      requiredPaidNextWindow: 0,
      observedPaid7d: 0,
      interest7d: 0,
    });

    const passed = buildSubscriberGrowthSprintBoard({
      progress: buildSubscriberGrowthProgress(100, Date.parse("2026-09-02T05:00:00.000Z")),
      counts: {
        ...COUNTS,
        newActive7d: 0,
        pricingInterestNeedsContact: 0,
        pricingInterestFollowUpDue: 0,
        atRisk: 0,
        scheduledCancellation: 0,
      },
    });
    expect(passed).toMatchObject({
      status: "deadline_passed",
      windowDays: 0,
      requiredPaidNextWindow: 1,
    });
    expect(passed.actions.map((action) => action.id)).toContain("close_pace_gap");
  });
});
