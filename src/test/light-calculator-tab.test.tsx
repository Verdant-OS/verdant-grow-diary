import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LightCalculatorTab from "@/components/grow-help/LightCalculatorTab";
import { createDefaultGrowHelpToolkitState, type LightInputs } from "@/lib/growHelpToolkitState";

function completeLightInputs(): LightInputs {
  return {
    ...createDefaultGrowHelpToolkitState().light,
    canopyLength: 4,
    canopyWidth: 4,
    fixtureCount: 1,
    ppfPerFixture: 800,
    actualWattsPerFixture: 300,
    targetPpfd: 800,
    chartPpfd: 200,
    chartHeight: 12,
    newHeight: 24,
    fivePoint: {
      center: 800,
      frontLeft: 600,
      frontRight: 620,
      backLeft: 580,
      backRight: 600,
    },
    showHeatmap: true,
  };
}

function LightHarness() {
  const defaults = createDefaultGrowHelpToolkitState();
  const [inputs, setInputs] = useState(completeLightInputs);
  return (
    <LightCalculatorTab
      inputs={inputs}
      cycle={{
        ...defaults.cycle,
        vegDays: 30,
        flowerDays: 60,
        electricityRate: 0.16,
      }}
      unitSystem="us"
      onChange={setInputs}
      onPushLight={vi.fn()}
    />
  );
}

describe("Light calculator result truth and units", () => {
  it("prints formulas and physical units beside planning, DLI, uniformity, heatmap, and energy results", () => {
    render(<LightHarness />);

    expect(screen.getByText(/area m² = canopy length ft/)).toBeInTheDocument();
    expect(screen.getByText(/DLI \(mol\/m²\/day\) = PPFD/)).toBeInTheDocument();
    expect(screen.getByText(/average PPFD = \(center \+ four corners\) ÷ 5/)).toBeInTheDocument();
    expect(
      screen.getByText(/uniformity = minimum PPFD ÷ five-point average PPFD/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/edge midpoint PPFD = \(adjacent measured corners\) ÷ 2/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("µmol/m²/s").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText(/fixture-output mol = PPF × fixture count/)).toBeInTheDocument();
    expect(screen.getByText(/\/mol$/)).toBeInTheDocument();
  });

  it("converts existing chart heights when the local height unit changes", () => {
    render(<LightHarness />);

    fireEvent.change(screen.getByLabelText("Height unit"), { target: { value: "cm" } });
    expect(screen.getByLabelText("Chart height")).toHaveValue(30.48);
    expect(screen.getByLabelText("New height")).toHaveValue(60.96);
    expect(screen.getByText("centimeters")).toBeInTheDocument();
    expect(screen.getByText("50 µmol/m²/s")).toBeInTheDocument();
  });
});
