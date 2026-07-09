/**
 * pheno-hunt-workspace-gate.test.tsx
 * Route-level gate: Free users mounting /pheno-hunts/:id/workspace and
 * /pheno-hunts/:id/keepers see the upgrade card and never mount the page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";

const mode = vi.hoisted(() => ({ current: "free" as "free" | "pro" }));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => {
    const row =
      mode.current === "pro"
        ? {
            id: "r", user_id: "u", plan_id: "pro_monthly", status: "active",
            provider: "paddle", provider_customer_id: null, provider_subscription_id: null,
            current_period_end: "2027-01-01Z", cancel_at_period_end: false,
            founder_number: null, created_at: "", updated_at: "",
          }
        : null;
    return { loading: false, entitlement: resolveEntitlements(row as any, new Date("2026-08-01Z")) };
  },
}));

// Stand-in "workspace" child so the test does not depend on the real
// workspace hook (which reads Supabase). The real route uses the gate to
// wrap the real page — this test verifies the gate's contract.
import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";

function StubWorkspace() {
  return <div data-testid="workspace-content">workspace</div>;
}

function StubKeepers() {
  return <div data-testid="keepers-content">keepers</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/pheno-hunts/:id/workspace"
          element={<PhenoTrackerUpgradeGate><StubWorkspace /></PhenoTrackerUpgradeGate>}
        />
        <Route
          path="/pheno-hunts/:id/keepers"
          element={<PhenoTrackerUpgradeGate><StubKeepers /></PhenoTrackerUpgradeGate>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Pheno workspace/keepers route gate", () => {
  beforeEach(() => cleanup());

  it("Free user cannot reach workspace content", () => {
    mode.current = "free";
    renderAt("/pheno-hunts/abc/workspace");
    expect(screen.queryByTestId("workspace-content")).toBeNull();
    expect(screen.getByTestId("pheno-tracker-upgrade-gate")).toBeDefined();
  });

  it("Free user cannot reach keepers content", () => {
    mode.current = "free";
    renderAt("/pheno-hunts/abc/keepers");
    expect(screen.queryByTestId("keepers-content")).toBeNull();
    expect(screen.getByTestId("pheno-tracker-upgrade-gate")).toBeDefined();
  });

  it("Pro user reaches workspace content", () => {
    mode.current = "pro";
    renderAt("/pheno-hunts/abc/workspace");
    expect(screen.getByTestId("workspace-content")).toBeDefined();
  });

  it("Pro user reaches keepers content", () => {
    mode.current = "pro";
    renderAt("/pheno-hunts/abc/keepers");
    expect(screen.getByTestId("keepers-content")).toBeDefined();
  });
});
