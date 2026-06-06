/**
 * Gated-feature empty-state regression tests.
 *
 * Verifies the calm "needs-context" copy + CTA buttons for the Global
 * Fast Add menu (the gated state every Fast Add action falls into when
 * no plant/tent is selected). Also pins the Reports / Grow Learning Hub
 * empty-state copy.
 *
 * Pure render tests. No Supabase, no AI, no network, no automation.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GlobalFastAddButton from "@/components/GlobalFastAddButton";
import {
  FAST_ADD_ACTIONS,
  FAST_ADD_NO_CONTEXT_COPY,
  FAST_ADD_PICKER_CTAS,
} from "@/lib/fastAddActionRules";
import { REPORTS_HUB_EMPTY_COPY } from "@/lib/reportsHubViewModel";

afterEach(() => cleanup());

function renderFastAddNoContext() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <GlobalFastAddButton context={null} />
    </MemoryRouter>,
  );
}

describe("Gated feature — Global Fast Add (no plant/tent selected)", () => {
  it.each(FAST_ADD_ACTIONS.map((a) => [a.id, a.label] as const))(
    "shows the calm helper text + CTA buttons when '%s' is invoked without context",
    (actionId) => {
      renderFastAddNoContext();
      fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
      fireEvent.click(screen.getByTestId(`global-fast-add-action-${actionId}`));

      // Helper text must appear with the locked copy.
      const notice = screen.getByTestId("global-fast-add-needs-context");
      expect(notice).toHaveTextContent(FAST_ADD_NO_CONTEXT_COPY);

      // Both CTA buttons must render with the expected labels.
      for (const cta of FAST_ADD_PICKER_CTAS) {
        const btn = screen.getByTestId(`global-fast-add-cta-${cta.id}`);
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveTextContent(cta.label);
      }
    },
  );

  it("ships the calm needs-context copy in a static sr-only node for audits", () => {
    renderFastAddNoContext();
    expect(
      screen.getByTestId("global-fast-add-needs-context-copy"),
    ).toHaveTextContent(FAST_ADD_NO_CONTEXT_COPY);
  });

  it("CTA destinations point to /plants and /tents (mounted auth routes)", () => {
    const dests = FAST_ADD_PICKER_CTAS.map((c) => c.to).sort();
    expect(dests).toEqual(["/plants", "/tents"]);
  });
});

describe("Gated feature — Reports / Grow Learning Hub empty copy", () => {
  it("locks the empty-state helper text", () => {
    expect(REPORTS_HUB_EMPTY_COPY).toMatch(/no grow learning data yet/i);
    expect(REPORTS_HUB_EMPTY_COPY).toMatch(/log/i);
  });
});
