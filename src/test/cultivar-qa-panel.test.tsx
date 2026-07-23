/**
 * CultivarQaPanel — Pro gating + grounded-answer rendering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";

let isActive = false;
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { isActive, effectivePlanId: isActive ? "pro_monthly" : "free" },
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
});
afterEach(cleanup);

describe("CultivarQaPanel", () => {
  it("shows a Pro upsell (not the ask box) for non-paid users", () => {
    isActive = false;
    renderPanel();
    expect(screen.getByTestId("cultivar-qa-upsell")).toBeInTheDocument();
    expect(screen.getByTestId("cultivar-qa-upgrade-cta")).toHaveAttribute("href", "/pricing");
    expect(screen.queryByTestId("cultivar-qa-input")).toBeNull();
  });

  it("shows the ask box for paid users and renders a grounded answer", async () => {
    isActive = true;
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
    isActive = true;
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
