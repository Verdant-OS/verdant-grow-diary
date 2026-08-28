import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ExpenseCalculatorTab from "@/components/grow-help/ExpenseCalculatorTab";
import GrowHelpToolkit from "@/pages/GrowHelpToolkit";
import {
  convertGrowHelpUnitSystem,
  mergeLinkedLight,
  mergeLinkedNutrients,
} from "@/lib/growHelpToolkitCoordination";
import { createDefaultGrowHelpToolkitState } from "@/lib/growHelpToolkitState";
import { MemoryRouter } from "@/lib/react-router-compat";
import { L_PER_GAL } from "@/lib/unitsCalc";

describe("Grow Help Toolkit page coordination", () => {
  it("converts existing visible values when switching unit systems", () => {
    const state = createDefaultGrowHelpToolkitState();
    state.nutrient.reservoirValue = 4;
    state.light.canopyLength = 4;
    state.light.canopyWidth = 2;
    state.light.chartHeight = 12;
    state.light.newHeight = 24;
    state.expense.waterPricePerGallon = 0.1;
    state.expense.waterGallonsPerChange = 4;

    const metric = convertGrowHelpUnitSystem(state, "metric");
    expect(metric.nutrient.reservoirValue).toBeCloseTo(4 * L_PER_GAL, 6);
    expect(metric.nutrient.reservoirUnit).toBe("L");
    expect(metric.light.canopyLength).toBeCloseTo(1.2192, 6);
    expect(metric.light.canopyWidth).toBeCloseTo(0.6096, 6);
    expect(metric.light.chartHeight).toBeCloseTo(30.48, 6);
    expect(metric.light.heightUnit).toBe("cm");
    expect(metric.expense.waterPricePerGallon).toBeCloseTo(0.1 / L_PER_GAL, 6);
    expect(metric.expense.waterGallonsPerChange).toBeCloseTo(4 * L_PER_GAL, 6);
    expect(
      (metric.expense.waterPricePerGallon as number) *
        (metric.expense.waterGallonsPerChange as number),
    ).toBeCloseTo(0.4, 5);

    const usAgain = convertGrowHelpUnitSystem(metric, "us");
    expect(usAgain.nutrient.reservoirValue).toBeCloseTo(4, 5);
    expect(usAgain.light.canopyLength).toBeCloseTo(4, 5);
    expect(usAgain.light.chartHeight).toBeCloseTo(12, 5);
    expect(usAgain.expense.waterPricePerGallon).toBeCloseTo(0.1, 5);
    expect(usAgain.expense.waterGallonsPerChange).toBeCloseTo(4, 5);
  });

  it("keeps a linked light row live on shared cycle defaults until explicitly overridden", () => {
    const state = createDefaultGrowHelpToolkitState();
    const linked = mergeLinkedLight(state, {
      id: "linked-light-plan",
      name: "Grow lights (from Light plan)",
      actualWatts: 300,
      quantity: 2,
      vegHoursPerDay: null,
      flowerHoursPerDay: null,
      vegDaysOverride: null,
      flowerDaysOverride: null,
      linkedFromLight: true,
    });
    expect(linked.expense.devices).toHaveLength(1);
    expect(linked.expense.devices[0]).toMatchObject({
      actualWatts: 300,
      quantity: 2,
      vegHoursPerDay: null,
      flowerHoursPerDay: null,
    });

    linked.expense.devices[0]!.vegHoursPerDay = 20;
    const refreshed = mergeLinkedLight(linked, {
      ...linked.expense.devices[0]!,
      actualWatts: 320,
      vegHoursPerDay: null,
    });
    expect(refreshed.expense.devices[0]?.actualWatts).toBe(320);
    expect(refreshed.expense.devices[0]?.vegHoursPerDay).toBe(20);
  });

  it("refreshes linked recipe use without losing prices or unrelated manual rows", () => {
    const state = createDefaultGrowHelpToolkitState();
    state.expense.nutrients = [
      {
        id: "recipe-label-1",
        name: "Part A",
        pricingMode: "package",
        packagePrice: 24,
        usableAmount: 1000,
        unit: "ml",
        usagePerWeek: 10,
        manualWeeklyCost: null,
        linkedFromRecipe: true,
      },
      {
        id: "nutrient-cost-2",
        name: "Manual supplement",
        pricingMode: "manual_weekly",
        packagePrice: null,
        usableAmount: null,
        unit: "ml",
        usagePerWeek: null,
        manualWeeklyCost: 3,
      },
    ];

    const next = mergeLinkedNutrients(state, [
      {
        id: "recipe-label-1",
        name: "Part A",
        pricingMode: "package",
        packagePrice: null,
        usableAmount: null,
        unit: "ml",
        usagePerWeek: 50,
        manualWeeklyCost: null,
        linkedFromRecipe: true,
      },
    ]);
    expect(next.expense.nutrients).toHaveLength(2);
    expect(next.expense.nutrients[0]).toMatchObject({
      packagePrice: 24,
      usableAmount: 1000,
      usagePerWeek: 50,
    });
    expect(next.expense.nutrients[1]?.name).toBe("Manual supplement");
  });

  it("renders all three calculators and the exact label-rate result with its formula and unit", () => {
    render(
      <MemoryRouter initialEntries={["/tools/grow-help-toolkit"]}>
        <GrowHelpToolkit />
      </MemoryRouter>,
    );

    expect(screen.getByRole("tab", { name: "Nutrient" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Expense" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Working reservoir volume"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Label dose"), {
      target: { value: "2.5" },
    });

    const result = screen.getByTestId("nutrient-primary-result");
    expect(within(result).getAllByText(/50 mL/i).length).toBeGreaterThan(0);
    expect(
      within(result).getByText("amount = label dose × actual working reservoir volume"),
    ).toBeInTheDocument();
    expect(within(result).getByText(/mL = dose \(mL\/gal\) × working gallons/)).toBeInTheDocument();
  });

  it("updates the rendered reservoir number and unit instead of reinterpreting it", () => {
    render(
      <MemoryRouter initialEntries={["/tools/grow-help-toolkit"]}>
        <GrowHelpToolkit />
      </MemoryRouter>,
    );
    const reservoir = screen.getByLabelText("Working reservoir volume") as HTMLInputElement;
    fireEvent.change(reservoir, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Metric · L \/ m/i }));
    expect(reservoir.valueAsNumber).toBeCloseTo(4 * L_PER_GAL, 5);
    expect(screen.getByLabelText("Reservoir unit")).toHaveValue("L");
  });

  it("updates Expense water labels to the converted global unit basis", () => {
    const state = createDefaultGrowHelpToolkitState();
    const view = render(
      <ExpenseCalculatorTab
        inputs={state.expense}
        cycle={state.cycle}
        unitSystem="us"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Water price (USD/gal)")).toBeInTheDocument();

    view.rerender(
      <ExpenseCalculatorTab
        inputs={state.expense}
        cycle={state.cycle}
        unitSystem="metric"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByLabelText("Water price (USD/L)")).toBeInTheDocument();
    expect(screen.getByText(/water cost = USD\/L × L\/change/i)).toBeInTheDocument();
  });

  it("renders comparison savings, operating ROI, and positive setup payback with formulas", () => {
    const state = createDefaultGrowHelpToolkitState();
    state.cycle = {
      ...state.cycle,
      vegDays: 30,
      flowerDays: 60,
      electricityRate: 0.16,
    };
    state.expense = {
      ...state.expense,
      setup: [{ id: "setup", name: "Setup", amount: 800 }],
      recurring: [{ id: "operating", name: "Operating", amount: 200, basis: "cycle" }],
      driedSaleableGrams: 200,
      compareAtPricePerGram: 3,
    };

    render(
      <ExpenseCalculatorTab
        inputs={state.expense}
        cycle={state.cycle}
        unitSystem="us"
        onChange={() => undefined}
      />,
    );

    expect(
      within(screen.getByText("Comparison harvest value").parentElement as HTMLElement).getByText(
        "$600.00",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Operating-cycle savings").parentElement as HTMLElement).getByText(
        "$400.00 / cycle",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Operating ROI").parentElement as HTMLElement).getByText("200%"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Setup payback").parentElement as HTMLElement).getByText("2 cycles"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "operating ROI % = (comparison value − operating cycle cost) ÷ operating cycle cost × 100",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("setup payback cycles = setup total ÷ positive operating-cycle savings"),
    ).toBeInTheDocument();
  });
});
