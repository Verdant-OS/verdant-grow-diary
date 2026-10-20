/**
 * #2256: in "Actual watts + efficacy" mode the wall draw is the PPF input, so
 * 0 W must show an inline error and the help copy must say the field is
 * required. PPF mode keeps 0 W as a valid "no energy cost" entry.
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LightCalculatorTab from "@/components/grow-help/LightCalculatorTab";
import { createDefaultGrowHelpToolkitState, type LightInputs } from "@/lib/growHelpToolkitState";

function inputsFor(ppfMode: LightInputs["ppfMode"], actualWattsPerFixture: number): LightInputs {
  return {
    ...createDefaultGrowHelpToolkitState().light,
    ppfMode,
    canopyLength: 4,
    canopyWidth: 4,
    fixtureCount: 1,
    ppfPerFixture: 800,
    efficacy: 2.7,
    actualWattsPerFixture,
    targetPpfd: 800,
  };
}

function Harness({ initial }: { initial: LightInputs }) {
  const [inputs, setInputs] = useState(initial);
  return (
    <LightCalculatorTab
      inputs={inputs}
      cycle={createDefaultGrowHelpToolkitState().cycle}
      unitSystem="us"
      onChange={setInputs}
      onPushLight={vi.fn()}
    />
  );
}

function wattsField() {
  return screen.getByLabelText("Actual wall draw per fixture");
}

describe("Light planner wall draw in watts mode (#2256)", () => {
  it("shows an inline error and required help copy for 0 W", () => {
    render(<Harness initial={inputsFor("watts", 0)} />);

    expect(wattsField()).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Actual wall draw per fixture must be between 0.1 and 100000."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Required in this mode/)).toBeInTheDocument();
    expect(screen.queryByText(/Optional for PPF math/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("shows the estimated-PPF result at 300 W", () => {
    render(<Harness initial={inputsFor("watts", 300)} />);

    expect(wattsField()).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("PPF estimated from watts × efficacy")).toBeInTheDocument();
  });

  it("flags 0 W typed into the field after a valid value", () => {
    render(<Harness initial={inputsFor("watts", 300)} />);

    fireEvent.change(wattsField(), { target: { value: "0" } });
    expect(wattsField()).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps 0 W valid in PPF mode, with the optional help copy", () => {
    render(<Harness initial={inputsFor("ppf", 0)} />);

    expect(wattsField()).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText(/Optional for PPF math/)).toBeInTheDocument();
  });
});
