import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import {
  ONE_TENT_LOOP_DISABLED_COPY,
  ONE_TENT_LOOP_PENDING_COPY,
} from "@/lib/oneTentLoopNavigationRules";

function renderCard(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("OneTentLoopNextStepCard", () => {
  it("renders disabled calm copy when required ids are missing", () => {
    renderCard(<OneTentLoopNextStepCard current="tent" />);
    expect(screen.getByTestId("one-tent-loop-next-step-card-disabled")).toHaveTextContent(
      /Next step unavailable until this record is selected\./,
    );
  });

  it("renders the safe CTA label and a link when ids are present", () => {
    renderCard(<OneTentLoopNextStepCard current="tent" ids={{ plantId: "p1" }} />);
    const cta = screen.getByTestId("one-tent-loop-next-step-card-cta");
    expect(cta).toHaveTextContent("Open plant");
    const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/plants/p1");
  });

  it("renders a disabled tent → plant handoff when only the current tent is known", () => {
    renderCard(<OneTentLoopNextStepCard current="tent" ids={{ tentId: "t1" }} />);
    expect(screen.getByTestId("one-tent-loop-next-step-card-disabled")).toHaveTextContent(
      ONE_TENT_LOOP_DISABLED_COPY,
    );
    expect(screen.queryByTestId("one-tent-loop-next-step-card-cta")).toBeNull();
  });

  it("uses approval-required wording when on the action-queue step CTA", () => {
    renderCard(<OneTentLoopNextStepCard current="action-queue" ids={{ actionId: "x1" }} />);
    const cta = screen.getByTestId("one-tent-loop-next-step-card-cta");
    expect(cta).toHaveTextContent(/approval-required/i);
  });

  it("does not render any internal IDs as visible copy", () => {
    const { container } = renderCard(
      <OneTentLoopNextStepCard
        current="plant"
        ids={{
          plantId: "secret-plant-id-12345",
          tentId: "secret-tent-id-12345",
          growId: "secret-grow-id-12345",
        }}
      />,
    );
    expect(container.textContent ?? "").not.toContain("secret-plant-id-12345");
    expect(container.textContent ?? "").not.toContain("secret-tent-id-12345");
    expect(container.textContent ?? "").not.toContain("secret-grow-id-12345");
  });

  it("dispatches one exact Quick Log prefill event instead of navigating", () => {
    const listener = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    try {
      renderCard(
        <OneTentLoopNextStepCard
          current="plant"
          ids={{ plantId: "p1", tentId: "t1", growId: "g1" }}
        />,
      );

      const cta = screen.getByTestId("one-tent-loop-next-step-card-cta");
      expect(cta.tagName).toBe("BUTTON");
      expect(cta.querySelector("a")).toBeNull();
      fireEvent.click(cta);

      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
        plantId: "p1",
        plantName: null,
        tentId: "t1",
        tentName: null,
        growId: "g1",
        eventType: "observation",
        suggestSnapshot: true,
      });
    } finally {
      window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    }
  });

  it("renders helper copy for downstream steps and omits it for upstream steps", () => {
    const { unmount } = renderCard(<OneTentLoopNextStepCard current="timeline" />);
    expect(screen.getByTestId("one-tent-loop-next-step-card-helper")).toHaveTextContent(
      /Open Sensor Snapshot from Timeline to cross-check telemetry and proceed\./,
    );
    unmount();

    renderCard(<OneTentLoopNextStepCard current="sensor-snapshot" />);
    expect(screen.getByTestId("one-tent-loop-next-step-card-helper")).toHaveTextContent(
      /Open AI Doctor page to review available context/,
    );
  });

  it("renders approval-required helper copy on the alert step", () => {
    renderCard(<OneTentLoopNextStepCard current="alert" />);
    expect(screen.getByTestId("one-tent-loop-next-step-card-helper")).toHaveTextContent(
      /approval-required Action Queue/i,
    );
  });

  it("does not render helper copy for upstream steps (no noisy duplication)", () => {
    renderCard(<OneTentLoopNextStepCard current="grow" ids={{ growId: "g1" }} />);
    expect(screen.queryByTestId("one-tent-loop-next-step-card-helper")).toBeNull();
  });

  /**
   * The `pending` hold (B6 review round 4).
   *
   * The carry lookup is a second request. While it is in flight the page is
   * already interactive, so a CTA offered then would traverse with the
   * grower's plant silently dropped. `pending` withholds the CTA for exactly
   * that window — and only the owning page knows when it applies, so it is
   * an opt-in prop rather than something the card infers.
   */
  describe("pending hold", () => {
    const PLANT = "3f7a1e2c-9b04-4d51-8a6e-2c5f70b81d93";
    const TENT = "11111111-2222-4333-8444-555555555555";

    it("withholds the CTA while a carried selection is still being checked", () => {
      renderCard(
        <OneTentLoopNextStepCard
          current="timeline"
          ids={{ tentId: TENT, plantId: PLANT }}
          pending
        />,
      );

      // THE property: no navigable CTA exists during the window, so there is
      // nothing to click that would drop the plant.
      expect(screen.queryByTestId("one-tent-loop-next-step-card-cta")).toBeNull();
      expect(screen.queryByRole("link")).toBeNull();

      const held = screen.getByTestId("one-tent-loop-next-step-card-pending");
      expect(held).toHaveTextContent(ONE_TENT_LOOP_PENDING_COPY);
      // Announced, not merely styled — the CTA vanishing is otherwise silent
      // to anyone not watching that spot on the page.
      expect(held).toHaveAttribute("role", "status");
    });

    it("says 'checking', never 'select a record' — the record IS selected", () => {
      renderCard(
        <OneTentLoopNextStepCard
          current="timeline"
          ids={{ tentId: TENT, plantId: PLANT }}
          pending
        />,
      );

      // Reusing the disabled copy would tell the grower to do a thing they
      // have already done. The two states must stay distinguishable.
      expect(screen.queryByTestId("one-tent-loop-next-step-card-disabled")).toBeNull();
      expect(screen.queryByText(ONE_TENT_LOOP_DISABLED_COPY)).toBeNull();
      expect(ONE_TENT_LOOP_PENDING_COPY).not.toBe(ONE_TENT_LOOP_DISABLED_COPY);
    });

    it("restores the full CTA — with the plant carried — once the hold lifts", () => {
      renderCard(
        <OneTentLoopNextStepCard current="timeline" ids={{ tentId: TENT, plantId: PLANT }} />,
      );

      expect(screen.queryByTestId("one-tent-loop-next-step-card-pending")).toBeNull();
      const cta = screen.getByTestId("one-tent-loop-next-step-card-cta");
      const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
      // The hold is worth having only if what follows it carries the plant.
      expect(anchor?.getAttribute("href")).toContain(`plantId=${PLANT}`);
    });

    it("defaults to no hold, so every existing mount is unchanged", () => {
      renderCard(<OneTentLoopNextStepCard current="tent" ids={{ plantId: "p1" }} />);
      expect(screen.queryByTestId("one-tent-loop-next-step-card-pending")).toBeNull();
      expect(screen.getByTestId("one-tent-loop-next-step-card-cta")).toHaveTextContent(
        "Open plant",
      );
    });
  });
});
