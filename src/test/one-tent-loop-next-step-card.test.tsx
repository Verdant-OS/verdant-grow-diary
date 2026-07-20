import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

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
    renderCard(<OneTentLoopNextStepCard current="tent" ids={{ tentId: "t1" }} />);
    const cta = screen.getByTestId("one-tent-loop-next-step-card-cta");
    expect(cta).toHaveTextContent("Open plant");
    const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/tents/t1");
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
});
