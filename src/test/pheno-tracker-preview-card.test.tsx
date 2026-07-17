/**
 * pheno-tracker-preview-card.test.tsx
 *
 * Free → highlights + "View Demo" (→ /pheno-comparison) + "Upgrade to Pro"
 * (→ /pricing). Pro/Founder → "Start Pheno Hunt" (→ /pheno-hunts/new).
 * Forbidden marketing phrases stay absent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";

const NOW = new Date("2026-08-01T00:00:00Z");
const mode = vi.hoisted(() => ({
  current: "free" as "free" | "pro" | "founder" | "loading",
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => {
    if (mode.current === "loading") {
      return {
        loading: true,
        entitlement: resolveEntitlements(null, NOW),
        refetch: async () => {},
      };
    }
    const base: BillingSubscriptionRow = {
      id: "r",
      user_id: "u",
      plan_id: "pro_monthly",
      status: "active",
      provider: "paddle",
      provider_customer_id: null,
      provider_subscription_id: null,
      current_period_end: "2027-01-01T00:00:00Z",
      cancel_at_period_end: false,
      founder_number: null,
      created_at: "",
      updated_at: "",
    };
    let row: BillingSubscriptionRow | null = null;
    if (mode.current === "pro") row = base;
    if (mode.current === "founder")
      row = { ...base, plan_id: "founder_lifetime", current_period_end: null };
    return {
      loading: false,
      entitlement: resolveEntitlements(row, NOW),
      refetch: async () => {},
    };
  },
}));

import PhenoTrackerPreviewCard from "@/components/PhenoTrackerPreviewCard";

const FORBIDDEN = [
  /AI picks winners/i,
  /guaranteed keeper/i,
  /guaranteed yield/i,
  /automated breeding/i,
  /autopilot/i,
  /device control/i,
];

function renderCard() {
  return render(
    <MemoryRouter>
      <PhenoTrackerPreviewCard />
    </MemoryRouter>,
  );
}

describe("PhenoTrackerPreviewCard", () => {
  beforeEach(() => cleanup());

  it("Free user sees Upgrade + View Demo CTAs", () => {
    mode.current = "free";
    renderCard();
    const card = screen.getByTestId("pheno-tracker-preview-card");
    expect(card.getAttribute("data-entitled")).toBe("false");
    expect(screen.getByTestId("pheno-tracker-preview-card-upgrade-link").getAttribute("href")).toBe(
      "/pricing",
    );
    expect(screen.getByTestId("pheno-tracker-preview-card-demo-link").getAttribute("href")).toBe(
      "/pheno-comparison",
    );
    expect(screen.queryByTestId("pheno-tracker-preview-card-start-link")).toBeNull();
    const body = document.body.textContent ?? "";
    for (const rx of FORBIDDEN) expect(body).not.toMatch(rx);
    // Key highlights render.
    for (const bullet of [
      /Pheno hunts/i,
      /Candidate evidence/i,
      /Evidence Packet Map/i,
      /Keeper decisions/i,
      /Replication readiness/i,
      /Post-harvest/i,
      /Export your pheno report/i,
    ]) {
      expect(body).toMatch(bullet);
    }
  });

  it("Pro user sees Start Pheno Hunt CTA", () => {
    mode.current = "pro";
    renderCard();
    const card = screen.getByTestId("pheno-tracker-preview-card");
    expect(card.getAttribute("data-entitled")).toBe("true");
    expect(screen.getByTestId("pheno-tracker-preview-card-start-link").getAttribute("href")).toBe(
      "/pheno-hunts/new",
    );
    expect(screen.queryByTestId("pheno-tracker-preview-card-upgrade-link")).toBeNull();
    expect(screen.queryByTestId("pheno-tracker-preview-card-demo-link")).toBeNull();
  });

  it("Founder Lifetime user sees Start Pheno Hunt CTA", () => {
    mode.current = "founder";
    renderCard();
    expect(screen.getByTestId("pheno-tracker-preview-card-start-link").getAttribute("href")).toBe(
      "/pheno-hunts/new",
    );
  });
});
