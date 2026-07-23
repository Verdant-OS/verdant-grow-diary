/**
 * CultivarQaPanel — Pro gating + grounded-answer rendering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";

// isActive and effectivePlanId are decoupled on purpose: the free tier resolves
// to isActive=true, effectivePlanId="free" (resolveEntitlements null_row_free),
// so a realistic free mock must set isActive=true. Gating on isActive alone is
// the bug this suite guards against.
let entitlementState = { isActive: true, effectivePlanId: "free" };
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: entitlementState,
    refetch: () => {},
  }),
}));

let invokeResult: { data: unknown; error: unknown };
const invokeSpy = vi.fn(async () => invokeResult);
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeSpy(...(args as [])) } },
}));

import CultivarQaPanel from "@/components/CultivarQaPanel";

const cultivar = VERDANT_CULTIVARS.find((c) => c.slug === "og-kush")!;

function renderPanel() {
  return render(
    <MemoryRouter>
      <CultivarQaPanel cultivar={cultivar} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  invokeSpy.mockClear();
  invokeResult = { data: { ok: true, answer: "Reported context answer." }, error: null };
  entitlementState = { isActive: true, effectivePlanId: "free" };
});
afterEach(cleanup);

describe("CultivarQaPanel", () => {
  it("shows a Pro upsell (not the ask box) for the FREE tier (isActive=true, plan=free)", () => {
    // Regression: free resolves to isActive=true, so gating on isActive alone
    // wrongly showed the paid ask box to free/signed-out visitors.
    entitlementState = { isActive: true, effectivePlanId: "free" };
    renderPanel();
    expect(screen.getByTestId("cultivar-qa-upsell")).toBeInTheDocument();
    expect(screen.getByTestId("cultivar-qa-upgrade-cta")).toHaveAttribute("href", "/pricing");
    expect(screen.queryByTestId("cultivar-qa-input")).toBeNull();
  });

  it("shows a Pro upsell for a degraded/inactive entitlement", () => {
    entitlementState = { isActive: false, effectivePlanId: "free" };
    renderPanel();
    expect(screen.getByTestId("cultivar-qa-upsell")).toBeInTheDocument();
    expect(screen.queryByTestId("cultivar-qa-input")).toBeNull();
  });

  it("shows the ask box for paid users and renders a grounded answer", async () => {
    entitlementState = { isActive: true, effectivePlanId: "pro_monthly" };
    renderPanel();
    expect(screen.queryByTestId("cultivar-qa-upsell")).toBeNull();
    fireEvent.change(screen.getByTestId("cultivar-qa-input"), {
      target: { value: "What flowering window is reported?" },
    });
    fireEvent.click(screen.getByTestId("cultivar-qa-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("cultivar-qa-answer")).toHaveTextContent(
        "Reported context answer.",
      ),
    );
    expect(invokeSpy).toHaveBeenCalledWith(
      "ai-cultivar-qa",
      expect.objectContaining({
        body: expect.objectContaining({ cultivarSlug: "og-kush" }),
      }),
    );
  });

  it("shows an error notice (never a fabricated answer) when the call fails", async () => {
    entitlementState = { isActive: true, effectivePlanId: "pro_monthly" };
    invokeResult = { data: { ok: false, reason: "upstream_error" }, error: null };
    renderPanel();
    fireEvent.change(screen.getByTestId("cultivar-qa-input"), {
      target: { value: "What is the lineage?" },
    });
    fireEvent.click(screen.getByTestId("cultivar-qa-submit"));
    await waitFor(() => expect(screen.getByTestId("cultivar-qa-error")).toBeInTheDocument());
    expect(screen.queryByTestId("cultivar-qa-answer")).toBeNull();
  });
});
