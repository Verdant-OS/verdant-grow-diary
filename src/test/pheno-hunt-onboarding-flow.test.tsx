/**
 * pheno-hunt-onboarding-flow.test.tsx
 *
 * Verifies the guided flow in /pheno-hunts/new:
 *  - Pro user sees the stepper and can move through steps
 *  - Grow-scoped candidate list; toggling candidates updates status
 *  - Evidence goals selector renders and toggles
 *  - Packet-map preview always shows "Not recorded" cells
 *  - createPhenoHunt is only invoked from a valid draft
 *  - Free/canceled users never reach the page (route gate covers it, and
 *    the write-path guard blocks the handler as belt-and-suspenders)
 *  - Forbidden marketing phrases are absent
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";

const NOW = new Date("2026-08-01T00:00:00Z");
const entMode = vi.hoisted(() => ({
  current: "pro" as "pro" | "founder" | "free" | "canceled",
}));

const createPhenoHuntMock = vi.hoisted(() => vi.fn(async () => ({
  huntId: "hunt-1",
  taggedPlantIds: ["p1", "p2"],
})));

const supabaseMock = vi.hoisted(() => {
  const growRow = { id: "grow-1", name: "Basement A" };
  const plantRows = [
    { id: "p1", name: "Plant A", strain: "OG", tent_id: null },
    { id: "p2", name: "Plant B", strain: "Haze", tent_id: null },
    { id: "p3", name: "Plant C", strain: null, tent_id: null },
  ];
  function makeQuery(table: string) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({
        data: table === "grows" ? growRow : null,
        error: null,
      }),
      then: (onFulfilled: (v: any) => any) =>
        Promise.resolve({
          data: table === "plants" ? plantRows : null,
          error: null,
        }).then(onFulfilled),
    };
    return chain;
  }
  return {
    from: (table: string) => makeQuery(table),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => {
    const base: BillingSubscriptionRow = {
      id: "r", user_id: "u1",
      plan_id: "pro_monthly", status: "active",
      provider: "paddle",
      provider_customer_id: null, provider_subscription_id: null,
      current_period_end: "2027-01-01T00:00:00Z", cancel_at_period_end: false,
      founder_number: null, created_at: "", updated_at: "",
    };
    let row: BillingSubscriptionRow | null = null;
    if (entMode.current === "pro") row = base;
    if (entMode.current === "founder") row = { ...base, plan_id: "founder_lifetime" };
    if (entMode.current === "canceled") row = { ...base, status: "canceled" };
    return {
      loading: false,
      entitlement: resolveEntitlements(row, NOW),
      refetch: async () => {},
    };
  },
}));

vi.mock("@/lib/phenoHuntService", async () => {
  const actual = await vi.importActual<typeof import("@/lib/phenoHuntService")>(
    "@/lib/phenoHuntService",
  );
  return {
    ...actual,
    createPhenoHunt: createPhenoHuntMock,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import PhenoHuntNew from "@/pages/PhenoHuntNew";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/new?growId=grow-1"]}>
      <Routes>
        <Route path="/pheno-hunts/new" element={<PhenoHuntNew />} />
        <Route path="/logs" element={<div data-testid="landed-logs">logs</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const FORBIDDEN = [
  /AI picks winners/i,
  /guaranteed keeper/i,
  /guaranteed yield/i,
  /automated breeding/i,
  /autopilot/i,
];

describe("PhenoHuntNew onboarding flow", () => {
  beforeEach(() => {
    cleanup();
    createPhenoHuntMock.mockClear();
  });

  it("Pro user sees the stepper starting on the basics step", async () => {
    entMode.current = "pro";
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("pheno-hunt-onboarding")).toBeDefined(),
    );
    expect(screen.getByTestId("pheno-onboarding-stepper")).toBeDefined();
    expect(screen.getByTestId("pheno-step-basics")).toBeDefined();
    const body = document.body.textContent ?? "";
    for (const rx of FORBIDDEN) expect(body).not.toMatch(rx);
  });

  it("Founder Lifetime user sees the same flow", async () => {
    entMode.current = "founder";
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("pheno-hunt-onboarding")).toBeDefined(),
    );
    expect(screen.getByTestId("pheno-onboarding-stepper")).toBeDefined();
  });

  it("candidate selection filters by grow and updates readiness status", async () => {
    entMode.current = "pro";
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-onboarding-stepper"));
    // Move to candidates step.
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-candidates"));
    // Grow-scoped plant list from the mocked query.
    expect(screen.getByTestId("ph-plant-list")).toBeDefined();
    expect(screen.getByTestId("ph-toggle-p1")).toBeDefined();
    expect(screen.getByTestId("ph-toggle-p2")).toBeDefined();
    expect(screen.getByTestId("ph-toggle-p3")).toBeDefined();
    // 0 → 1 → tracking only
    fireEvent.click(screen.getByTestId("ph-toggle-p1"));
    expect(screen.getByTestId("pheno-candidate-status").textContent).toMatch(
      /tracking only/i,
    );
    // 2 → comparison-eligible
    fireEvent.click(screen.getByTestId("ph-toggle-p2"));
    expect(screen.getByTestId("pheno-candidate-status").textContent).toMatch(
      /comparison-eligible/i,
    );
  });

  it("evidence goals render, packet-map preview shows Not recorded cells, checklist shows readiness", async () => {
    entMode.current = "pro";
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-onboarding-stepper"));

    // Select two candidates first.
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-candidates"));
    fireEvent.click(screen.getByTestId("ph-toggle-p1"));
    fireEvent.click(screen.getByTestId("ph-toggle-p2"));

    // Goals step.
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-goals"));
    expect(screen.getByTestId("pheno-evidence-goals")).toBeDefined();
    expect(screen.getByTestId("pheno-evidence-goals-toggle-structure")).toBeDefined();
    expect(screen.getByTestId("pheno-evidence-goals-toggle-post_cure")).toBeDefined();

    // Packet preview.
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-packet_preview"));
    expect(screen.getByTestId("pheno-evidence-packet-map")).toBeDefined();
    // Cells default to Not recorded and are marked disabled.
    const cell = screen.getByTestId("pheno-evidence-packet-map-cell-p1-structure");
    expect(cell.textContent).toMatch(/Not recorded/i);
    expect(cell.getAttribute("aria-disabled")).toBe("true");

    // Checklist.
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-checklist"));
    const list = screen.getByTestId("pheno-comparison-ready-checklist");
    expect(list.getAttribute("data-readiness")).toBe("comparison_ready");
    expect(
      screen
        .getByTestId("pheno-comparison-ready-checklist-item-post_cure")
        .getAttribute("data-status"),
    ).toBe("pending");
  });

  it("createPhenoHunt is called once with the drafted candidates + name", async () => {
    entMode.current = "pro";
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-onboarding-stepper"));
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-candidates"));
    fireEvent.click(screen.getByTestId("ph-toggle-p1"));
    fireEvent.click(screen.getByTestId("ph-toggle-p2"));
    // Save from any step.
    fireEvent.click(screen.getByTestId("ph-save-btn"));
    await waitFor(() => expect(createPhenoHuntMock).toHaveBeenCalledTimes(1));
    const call = createPhenoHuntMock.mock.calls[0]?.[0] as
      | { growId: string; plantIds: string[]; name: string }
      | undefined;
    expect(call).toBeDefined();
    expect(call!.growId).toBe("grow-1");
    expect(call!.plantIds).toEqual(["p1", "p2"]);
    expect(call!.name.length).toBeGreaterThan(0);
  });

  it("createPhenoHunt is NOT called from an incomplete draft (no candidates)", async () => {
    entMode.current = "pro";
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-onboarding-stepper"));
    const save = screen.getByTestId("ph-save-btn") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(createPhenoHuntMock).not.toHaveBeenCalled();
  });

  it("Canceled Pro (write-forbidden) cannot invoke createPhenoHunt from write handler", async () => {
    // Simulates a race where the handler fires despite the gate — the
    // write-path guard still blocks. We drive the handler by preparing a
    // valid draft in Pro mode, then flipping to canceled before clicking.
    entMode.current = "pro";
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-onboarding-stepper"));
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-candidates"));
    fireEvent.click(screen.getByTestId("ph-toggle-p1"));
    fireEvent.click(screen.getByTestId("ph-toggle-p2"));

    entMode.current = "canceled";
    // Force a re-render by clicking a stepper button so vm/entitlement refresh.
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-checklist"));
    createPhenoHuntMock.mockClear();
    fireEvent.click(screen.getByTestId("ph-save-btn"));
    // Even if the button were clickable, canWriteFeatureData blocks the call.
    await new Promise((r) => setTimeout(r, 0));
    expect(createPhenoHuntMock).not.toHaveBeenCalled();
  });
});
