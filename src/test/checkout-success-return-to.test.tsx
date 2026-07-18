/**
 * checkout-success-return-to.test.tsx
 *
 * CheckoutSuccess:
 *  - waits for entitlement `confirmed` before redirecting
 *  - sanitizes the returnTo query param
 *  - redirects to gated Pheno routes after confirm
 *  - falls back safely for missing/invalid returnTo
 *  - never renders payment/customer/subscription IDs
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";

const NOW = new Date("2026-08-01T00:00:00Z");
const mode = vi.hoisted(() => ({
  current: "confirmed" as "confirmed" | "loading" | "free",
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
    if (mode.current === "free") {
      return {
        loading: false,
        entitlement: resolveEntitlements(null, NOW),
        refetch: async () => {},
      };
    }
    const row: BillingSubscriptionRow = {
      id: "r",
      user_id: "u",
      plan_id: "pro_monthly",
      status: "active",
      provider: "paddle",
      provider_customer_id: "ctm_secret_abc",
      provider_subscription_id: "sub_secret_xyz",
      current_period_end: "2027-01-01T00:00:00Z",
      cancel_at_period_end: false,
      founder_number: null,
      created_at: "",
      updated_at: "",
    };
    return {
      loading: false,
      entitlement: resolveEntitlements(row, NOW),
      refetch: async () => {},
    };
  },
}));

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: () => {},
}));

import CheckoutSuccess from "@/pages/CheckoutSuccess";

function PlantDestination() {
  const { id } = useParams();
  const location = useLocation();
  return (
    <div data-testid="landed-plant">
      plant:{id}|{location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/checkout/success" element={<CheckoutSuccess />} />
        <Route
          path="/pheno-hunts/new"
          element={<div data-testid="landed-pheno-new">pheno new</div>}
        />
        <Route
          path="/pheno-hunts/:id/workspace"
          element={<div data-testid="landed-workspace">workspace</div>}
        />
        <Route
          path="/pheno-hunts/:id/keepers"
          element={<div data-testid="landed-keepers">keepers</div>}
        />
        <Route path="/plants/:id" element={<PlantDestination />} />
        <Route path="/" element={<div data-testid="landed-home">home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CheckoutSuccess returnTo handling", () => {
  beforeEach(() => cleanup());

  it("redirects to /pheno-hunts/new when returnTo is valid and entitlement confirmed", async () => {
    mode.current = "confirmed";
    renderAt("/checkout/success?returnTo=%2Fpheno-hunts%2Fnew");
    await waitFor(() => {
      expect(screen.getByTestId("landed-pheno-new")).toBeDefined();
    });
  });

  it("redirects to /pheno-hunts/:id/workspace when returnTo is valid", async () => {
    mode.current = "confirmed";
    renderAt("/checkout/success?returnTo=%2Fpheno-hunts%2Fabc%2Fworkspace");
    await waitFor(() => {
      expect(screen.getByTestId("landed-workspace")).toBeDefined();
    });
  });

  it("redirects to /pheno-hunts/:id/keepers when returnTo is valid", async () => {
    mode.current = "confirmed";
    renderAt("/checkout/success?returnTo=%2Fpheno-hunts%2Fabc%2Fkeepers");
    await waitFor(() => {
      expect(screen.getByTestId("landed-keepers")).toBeDefined();
    });
  });

  it("returns an AI Doctor upgrade to the originating plant once entitlement is confirmed", async () => {
    mode.current = "confirmed";
    const returnTo = "/plants/plant-123?tentId=tent-1#plant-ai-doctor-review";
    renderAt(`/checkout/success?returnTo=${encodeURIComponent(returnTo)}`);
    await waitFor(() => {
      expect(screen.getByTestId("landed-plant")).toHaveTextContent(
        "plant:plant-123|/plants/plant-123?tentId=tent-1#plant-ai-doctor-review",
      );
    });
  });

  it("does not redirect while entitlement is still loading (no flicker into gate)", async () => {
    mode.current = "loading";
    renderAt("/checkout/success?returnTo=%2Fpheno-hunts%2Fnew");
    // Stays on the pending checkout page.
    expect(screen.queryByTestId("landed-pheno-new")).toBeNull();
    expect(screen.getByTestId("checkout-success-pending-heading")).toBeDefined();
  });

  it("does not redirect while entitlement resolves to Free (webhook still pending)", async () => {
    mode.current = "free";
    renderAt("/checkout/success?returnTo=%2Fpheno-hunts%2Fnew");
    expect(screen.queryByTestId("landed-pheno-new")).toBeNull();
    expect(screen.getByTestId("checkout-success-pending-heading")).toBeDefined();
  });

  it("does not auto-redirect when returnTo is missing", async () => {
    mode.current = "confirmed";
    renderAt("/checkout/success");
    // Stays on the success page.
    expect(screen.getByTestId("checkout-success-confirmed-heading")).toBeDefined();
    expect(screen.queryByTestId("landed-pheno-new")).toBeNull();
    // Confirmed paid users enter the core-loop setup path.
    const primary = screen.getByTestId("checkout-success-primary-link");
    expect(primary.getAttribute("href")).toBe("/grows");
    expect(screen.getByTestId("checkout-success-activation-handoff")).toBeDefined();
  });

  it.each([
    ["https://evil.com/pheno-hunts/new"],
    ["//evil.com"],
    ["javascript:alert(1)"],
    ["/%2F%2Fevil.com"],
  ])("does not redirect for unsafe returnTo=%s", async (raw) => {
    mode.current = "confirmed";
    renderAt(`/checkout/success?returnTo=${encodeURIComponent(raw)}`);
    expect(screen.getByTestId("checkout-success-confirmed-heading")).toBeDefined();
    expect(screen.queryByTestId("landed-pheno-new")).toBeNull();
    const primary = screen.getByTestId("checkout-success-primary-link");
    expect(primary.getAttribute("href")).toBe("/grows");
  });

  it("never renders provider customer or subscription IDs", () => {
    mode.current = "confirmed";
    renderAt("/checkout/success");
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/ctm_secret_abc/);
    expect(body).not.toMatch(/sub_secret_xyz/);
    expect(body).not.toMatch(/provider_customer_id/);
    expect(body).not.toMatch(/provider_subscription_id/);
  });
});
