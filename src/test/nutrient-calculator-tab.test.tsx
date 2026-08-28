import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NutrientCalculatorTab from "@/components/grow-help/NutrientCalculatorTab";
import { createDefaultGrowHelpToolkitState, type NutrientInputs } from "@/lib/growHelpToolkitState";
import { L_PER_GAL } from "@/lib/unitsCalc";

function createInputs(overrides: Partial<NutrientInputs> = {}): NutrientInputs {
  return {
    ...createDefaultGrowHelpToolkitState().nutrient,
    ...overrides,
  };
}

function NutrientHarness({ initialInputs }: { initialInputs: NutrientInputs }) {
  const [inputs, setInputs] = useState(initialInputs);
  return (
    <NutrientCalculatorTab
      inputs={inputs}
      unitSystem="us"
      onChange={setInputs}
      onPushRecipe={() => undefined}
    />
  );
}

const INVALID_EC_CASES: ReadonlyArray<{
  label: string;
  targetEc: number;
  measuredMixedEc: number;
  expectedError: string;
}> = [
  {
    label: "negative target EC",
    targetEc: -0.1,
    measuredMixedEc: 1.4,
    expectedError: "Target EC must be between 0.01 and 10.",
  },
  {
    label: "target EC above the input maximum",
    targetEc: 10.1,
    measuredMixedEc: 1.4,
    expectedError: "Target EC must be between 0.01 and 10.",
  },
  {
    label: "negative measured EC",
    targetEc: 1.6,
    measuredMixedEc: -0.1,
    expectedError: "Measured mixed EC must be between 0 and 10.",
  },
  {
    label: "measured EC above the input maximum",
    targetEc: 1.6,
    measuredMixedEc: 10.1,
    expectedError: "Measured mixed EC must be between 0 and 10.",
  },
];

describe("NutrientCalculatorTab render safety", () => {
  it.each(INVALID_EC_CASES)(
    "fails closed without crashing for $label",
    ({ targetEc, measuredMixedEc, expectedError }) => {
      const inputs = createInputs({
        mode: "ec_target",
        reservoirValue: 4,
        reservoirUnit: "gal",
        sourceWaterEc: 0.2,
        targetEc,
        measuredMixedEc,
        ecParts: [{ id: "ec-a", name: "Part A", ecPerMlPerL: 0.2 }],
      });

      expect(() => render(<NutrientHarness initialInputs={inputs} />)).not.toThrow();
      expect(screen.getByTestId("nutrient-formula-error")).toHaveTextContent(expectedError);
    },
  );

  it("converts the current working volume when the per-tool reservoir unit changes", () => {
    render(
      <NutrientHarness initialInputs={createInputs({ reservoirValue: 4, reservoirUnit: "gal" })} />,
    );
    const volume = screen.getByLabelText("Working reservoir volume") as HTMLInputElement;
    const unit = screen.getByLabelText("Reservoir unit") as HTMLSelectElement;

    fireEvent.change(unit, { target: { value: "L" } });
    expect(unit).toHaveValue("L");
    expect(volume.valueAsNumber).toBeCloseTo(4 * L_PER_GAL, 10);

    fireEvent.change(unit, { target: { value: "gal" } });
    expect(unit).toHaveValue("gal");
    expect(volume.valueAsNumber).toBeCloseTo(4, 10);
  });

  it("suppresses C1V1 output until a matching nonblank volume unit is entered", () => {
    render(
      <NutrientHarness
        initialInputs={createInputs({
          mode: "c1v1",
          c1: 10,
          c2: 2,
          v2: 5,
          c1v1Unit: "   ",
        })}
      />,
    );

    const unit = screen.getByLabelText("Matching volume unit");
    expect(unit).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter the matching volume unit used by V2.")).toBeInTheDocument();
    expect(screen.queryByTestId("nutrient-primary-result")).not.toBeInTheDocument();

    fireEvent.change(unit, { target: { value: "mL" } });

    const result = screen.getByTestId("nutrient-primary-result");
    expect(within(result).getByText("1")).toBeInTheDocument();
    expect(within(result).getByText("mL")).toBeInTheDocument();
    expect(screen.queryByTestId("nutrient-empty-state")).not.toBeInTheDocument();
  });

  it("edits ratio-weighted EC parts and shows each ratio in the result", () => {
    render(
      <NutrientHarness
        initialInputs={createInputs({
          mode: "ec_target",
          reservoirValue: 10,
          reservoirUnit: "L",
          sourceWaterEc: 0.2,
          targetEc: 1.6,
          ecParts: [
            { id: "ec-a", name: "Part A", ecPerMlPerL: 0.2, ratio: 2 },
            { id: "ec-b", name: "Part B", ecPerMlPerL: 0.1, ratio: 1 },
          ],
        })}
      />,
    );

    let result = screen.getByTestId("nutrient-primary-result");
    expect(within(result).getByText("2.8 base mL/L")).toBeInTheDocument();
    expect(within(result).getByText("5.6 mL/L · ratio 2:1")).toBeInTheDocument();
    expect(within(result).getByText("2.8 mL/L · ratio 1:1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Ratio for Part A"), { target: { value: "3" } });

    result = screen.getByTestId("nutrient-primary-result");
    expect(within(result).getByText("2 base mL/L")).toBeInTheDocument();
    expect(within(result).getByText("6 mL/L · ratio 3:1")).toBeInTheDocument();
  });

  it("labels typical stage EC chips with both derived PPM ranges and still fills the midpoint", () => {
    render(<NutrientHarness initialInputs={createInputs({ mode: "ec_target" })} />);

    const seedling = screen.getByRole("button", {
      name: /Seedling 0\.4–0\.8 mS\/cm EC Derived PPM500 200–400 ppm · PPM700 280–560 ppm/i,
    });
    fireEvent.click(seedling);

    expect((screen.getByLabelText("Target EC") as HTMLInputElement).valueAsNumber).toBeCloseTo(
      0.6,
      12,
    );
  });

  it("keeps grower-entered elemental targets as planning notes outside EC dose math", () => {
    render(
      <NutrientHarness
        initialInputs={createInputs({
          mode: "ec_target",
          reservoirValue: 10,
          reservoirUnit: "L",
          sourceWaterEc: 0.2,
          targetEc: 1.6,
          ecParts: [{ id: "ec-a", name: "Part A", ecPerMlPerL: 0.2, ratio: 1 }],
          elementalTargetsPpm: {
            nitrogen: 150,
            phosphorus: 50,
            potassium: 200,
          },
        })}
      />,
    );

    expect(screen.getByLabelText("Target N")).toHaveValue(150);
    expect(screen.getByLabelText("Target P")).toHaveValue(50);
    expect(screen.getByLabelText("Target K")).toHaveValue(200);
    expect(
      screen.getByText(/not included in EC dose math, do not calculate a dose/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/without product analysis/i)).toBeInTheDocument();
    expect(
      within(screen.getByTestId("nutrient-primary-result")).getByText("7 base mL/L"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Target N"), { target: { value: "275" } });

    expect(screen.getByLabelText("Target N")).toHaveValue(275);
    expect(
      within(screen.getByTestId("nutrient-primary-result")).getByText("7 base mL/L"),
    ).toBeInTheDocument();
  });

  it("requires enabled injector stock concentration to be greater than zero", () => {
    render(
      <NutrientHarness
        initialInputs={createInputs({
          mode: "dry_salt",
          reservoirValue: 4,
          reservoirUnit: "gal",
          drySaltRows: [
            {
              id: "salt-a",
              name: "Salt A",
              gramsPerGallon: 1,
              bagSizeGrams: null,
              mixOrder: 1,
            },
          ],
          injectorEnabled: true,
          stockGramsPerGallon: 0,
          injectorRatio: 100,
        })}
      />,
    );

    expect(screen.getByLabelText("Stock dry salt")).toHaveAttribute("min", "0.0001");
    expect(screen.getByTestId("nutrient-formula-error")).toHaveTextContent(
      "Stock concentration: must be greater than 0",
    );
  });

  it("marks a fractional dry-salt mix order invalid", () => {
    render(
      <NutrientHarness
        initialInputs={createInputs({
          mode: "dry_salt",
          reservoirValue: 4,
          reservoirUnit: "gal",
          drySaltRows: [
            {
              id: "salt-a",
              name: "Salt A",
              gramsPerGallon: 1,
              bagSizeGrams: null,
              mixOrder: 1.5,
            },
          ],
        })}
      />,
    );

    expect(screen.getByLabelText("Mix order")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Mix order must be a whole number.")).toBeInTheDocument();
  });
});

const EMPTY_STATE_CASES: ReadonlyArray<{
  mode: NutrientInputs["mode"];
  expected: readonly [string, string, string];
}> = [
  {
    mode: "label",
    expected: [
      "Working reservoir volume",
      "Dose printed on your product",
      "Dose unit for each part",
    ],
  },
  {
    mode: "ec_target",
    expected: [
      "Working reservoir volume",
      "Source-water and target EC",
      "Each part's EC calibration and ratio",
    ],
  },
  {
    mode: "c1v1",
    expected: [
      "Stock concentration (C1)",
      "Target concentration (C2)",
      "Final volume (V2) and its matching unit",
    ],
  },
  {
    mode: "dry_salt",
    expected: [
      "Working reservoir volume",
      "Recipe rate in g/gal for each salt",
      "The order each salt will be mixed",
    ],
  },
  {
    mode: "converter",
    expected: [
      "Reading shown on the meter",
      "Input scale shown by the meter",
      "Known 500 or 700 scale when the reading is PPM",
    ],
  },
];

describe("NutrientCalculatorTab empty guidance", () => {
  it.each(EMPTY_STATE_CASES)(
    "names the three inputs that matter for $mode mode",
    ({ mode, expected }) => {
      render(<NutrientHarness initialInputs={createInputs({ mode })} />);

      const emptyState = screen.getByTestId("nutrient-empty-state");
      expect(within(emptyState).getAllByRole("listitem")).toHaveLength(3);
      for (const item of expected) {
        expect(within(emptyState).getByText(item)).toBeInTheDocument();
      }
    },
  );
});
