/**
 * Audit 2026-11-03 finding 2: on an identified tent the One-Tent Loop card said
 * "Next step unavailable until this record is selected." When the tent's verified
 * active plant count is known, the card now offers a real next step instead,
 * mirroring the grow case ("Add tent"). It never selects a plant for the grower.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";
import {
  ONE_TENT_LOOP_DISABLED_COPY,
  ONE_TENT_LOOP_TENT_ADD_PLANT_LABEL,
  ONE_TENT_LOOP_TENT_CHOOSE_PLANT_COPY,
  resolveOneTentLoopNextStep,
} from "@/lib/oneTentLoopNavigationRules";

const ids = { growId: "g1", tentId: "t1" };

describe("tent next step with a verified plant count (rules)", () => {
  it("offers Add plant for an empty tent, routed to this grow and tent", () => {
    const step = resolveOneTentLoopNextStep("tent", { ...ids, tentPlantCount: 0 });
    expect(step.disabled).toBe(false);
    expect(step.ctaLabel).toBe(ONE_TENT_LOOP_TENT_ADD_PLANT_LABEL);
    expect(step.ctaLabel).toBe("Add plant");
    expect(step.href).toBe("/plants?growId=g1&tentId=t1&intent=one_tent_activation");
  });

  it("asks the grower to choose a plant when the tent has several", () => {
    const step = resolveOneTentLoopNextStep("tent", { ...ids, tentPlantCount: 3 });
    expect(step.disabled).toBe(true);
    expect(step.href).toBeNull();
    expect(step.disabledReason).toBe(ONE_TENT_LOOP_TENT_CHOOSE_PLANT_COPY);
    expect(step.disabledReason).toBe("Choose a plant below to open it.");
  });

  it("still opens the plant when one is known", () => {
    const step = resolveOneTentLoopNextStep("tent", { ...ids, plantId: "p1", tentPlantCount: 1 });
    expect(step).toMatchObject({ disabled: false, ctaLabel: "Open plant", href: "/plants/p1" });
  });

  it.each([[undefined], [null], [-1], [1.5], [Number.NaN]])(
    "keeps today's disabled state when the count is not a verified number (%s)",
    (count) => {
      const step = resolveOneTentLoopNextStep("tent", { ...ids, tentPlantCount: count });
      expect(step).toMatchObject({
        disabled: true,
        href: null,
        disabledReason: ONE_TENT_LOOP_DISABLED_COPY,
      });
    },
  );

  it("never routes Add plant without both the grow and the tent", () => {
    const step = resolveOneTentLoopNextStep("tent", { tentId: "t1", tentPlantCount: 0 });
    expect(step).toMatchObject({ disabled: true, disabledReason: ONE_TENT_LOOP_DISABLED_COPY });
  });

  it("never selects a plant for the grower", () => {
    const step = resolveOneTentLoopNextStep("tent", { ...ids, tentPlantCount: 2 });
    expect(step.href ?? "").not.toMatch(/\/plants\//);
  });
});

describe("tent next step with a verified plant count (card)", () => {
  it("renders the choose-a-plant copy instead of 'unavailable'", () => {
    render(
      <MemoryRouter>
        <OneTentLoopNextStepCard current="tent" ids={{ ...ids, tentPlantCount: 2 }} testId="c" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("c-disabled")).toHaveTextContent("Choose a plant below to open it.");
    expect(screen.queryByText(ONE_TENT_LOOP_DISABLED_COPY)).toBeNull();
  });

  it("renders an Add plant link for an empty tent", () => {
    render(
      <MemoryRouter>
        <OneTentLoopNextStepCard current="tent" ids={{ ...ids, tentPlantCount: 0 }} testId="c" />
      </MemoryRouter>,
    );
    const cta = screen.getByTestId("c-cta");
    expect(cta).toHaveTextContent("Add plant");
    const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe(
      "/plants?growId=g1&tentId=t1&intent=one_tent_activation",
    );
  });
});
