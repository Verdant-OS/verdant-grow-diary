import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import SubscriberGrowthSprintBoard from "@/components/SubscriberGrowthSprintBoard";
import { buildSubscriberGrowthProgress } from "@/lib/subscriberGrowthSnapshotRules";

const COUNTS = {
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
  pricingInterestOperatorOutreach: 2,
  pricingInterestGrowerInvite: 6,
  pricingInterestContextCheck: 8,
  pricingInterestVpdCalculator: 9,
  allLeads7d: 9,
};

describe("SubscriberGrowthSprintBoard", () => {
  it("renders paid pace, separate pipeline signals, and operator-reviewed actions", () => {
    render(
      <MemoryRouter>
        <SubscriberGrowthSprintBoard
          progress={buildSubscriberGrowthProgress(10, Date.parse("2026-07-14T05:00:00.000Z"))}
          counts={COUNTS}
          acquisitionCounts={{
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
            csvHistory: 4,
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Next 7-day subscriber sprint")).toBeInTheDocument();
    expect(screen.getByTestId("subscriber-growth-sprint-status")).toHaveAttribute(
      "data-status",
      "behind_pace",
    );
    expect(screen.getByText("Paid needed — next 7d")).toBeInTheDocument();
    expect(screen.getByText("Paid added — last 7d")).toBeInTheDocument();
    expect(screen.getByText("Account starts — last 7d")).toBeInTheDocument();
    expect(screen.getByText("Interest signals — last 7d")).toBeInTheDocument();
    expect(screen.getByTestId("subscriber-growth-sprint-comparison-note")).toHaveTextContent(
      /Only active paid entitlements count toward the goal/i,
    );
    expect(screen.getByText("Review due follow-ups").closest("a")).toHaveAttribute(
      "href",
      "/admin/leads?conversion=follow_up",
    );
    expect(screen.getByText("Open interest leads").closest("a")).toHaveAttribute(
      "href",
      "/admin/leads?conversion=first_contact",
    );
    expect(screen.getByText("Audit entitlements").closest("a")).toHaveAttribute(
      "href",
      "/operator/billing-entitlement-resolution",
    );
    expect(screen.getByText("Open Founder launch page").closest("a")).toHaveAttribute(
      "href",
      "/founder",
    );
    expect(screen.getByText("Open grower invite").closest("a")).toHaveAttribute("href", "/invite");
  });

  it("is a read-only presenter with no persistence, billing grant, or automation surface", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/SubscriberGrowthSprintBoard.tsx"),
      "utf8",
    );
    const rules = readFileSync(resolve(__dirname, "../lib/subscriberGrowthSprintRules.ts"), "utf8");
    const combined = `${source}\n${rules}`;

    expect(combined).not.toMatch(/supabase|service_role|\.insert\(|\.update\(|action_queue/i);
    expect(combined).not.toMatch(/device[-_ ]command|mqtt\.publish|webhook\s*\(/i);
    expect(combined).toMatch(/sends no automatic message.*no billing state or entitlement/i);
  });
});
