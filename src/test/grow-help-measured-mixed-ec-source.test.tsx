import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";

import NutrientCalculatorTab from "@/components/grow-help/NutrientCalculatorTab";
import { createDefaultGrowHelpToolkitState, type NutrientInputs } from "@/lib/growHelpToolkitState";
import { MEASURED_MIXED_EC_SOURCE_LABEL } from "@/lib/growHelpToolkitReadiness";

function NutrientHarness({ initial }: { initial: NutrientInputs }) {
  const [inputs, setInputs] = useState(initial);
  return (
    <NutrientCalculatorTab
      inputs={inputs}
      unitSystem="us"
      onChange={setInputs}
      onPushRecipe={() => undefined}
    />
  );
}

describe("Nutrient measured mixed EC source labeling", () => {
  it("labels measured mixed EC as grower-entered manual, never live sensor", () => {
    const inputs: NutrientInputs = {
      ...createDefaultGrowHelpToolkitState().nutrient,
      mode: "ec_target",
      reservoirValue: 4,
      reservoirUnit: "gal",
      sourceWaterEc: 0.2,
      targetEc: 1.6,
      measuredMixedEc: 1.4,
      ecParts: [{ id: "ec-a", name: "Part A", ecPerMlPerL: 0.2, ratio: 1 }],
    };

    render(<NutrientHarness initial={inputs} />);

    const badge = screen.getByTestId("measured-mixed-ec-source");
    expect(badge).toHaveAttribute("data-source", "manual");
    expect(badge).toHaveTextContent(/grower-entered manual/i);
    expect(badge).toHaveTextContent(/not live sensor/i);
    expect(screen.getByLabelText("Measured mixed EC")).toHaveAccessibleDescription(
      /not a live sensor or telemetry/i,
    );
    expect(MEASURED_MIXED_EC_SOURCE_LABEL.toLowerCase()).not.toMatch(/\blive sensor data\b/);
  });
});
