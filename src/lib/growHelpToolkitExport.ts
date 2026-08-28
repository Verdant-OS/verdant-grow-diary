import {
  EXPENSE_COMPARISON_FORMULAS,
  calculateExpenseSummary,
  type ExpenseUnitCosts,
} from "./expenseCalc";
import type { GrowHelpToolkitState } from "./growHelpToolkitState";
import {
  calculateDliFromPlanningPpfd,
  calculateEnergyCostPerMol,
  calculateLightCycleEnergy,
  calculateUniformity,
  fixturesNeeded,
  inverseSquarePpfd,
  planningAveragePpfd,
  ppfdForTargetDli,
  resolveFixturePpf,
  solveInverseSquareHeight,
} from "./lightCalc";
import {
  calculateC1V1,
  calculateEcTargetRecipe,
  calculateInjectorPlan,
  calculateLabelRateRecipe,
  convertNutrientStrength,
  scaleDrySaltRecipe,
} from "./nutrientCalc";
import { M2_PER_FT2, areaM2, areaM2FromFeet } from "./unitsCalc";

export interface GrowHelpExportRow {
  section: "Cycle" | "Nutrient recipe" | "Light plan" | "Cost sheet" | "Notes";
  item: string;
  value: string | number;
  unit: string;
  formula: string;
}

export interface GrowHelpExportSnapshot {
  cycleName: string;
  generatedLabel: string;
  rows: ReadonlyArray<GrowHelpExportRow>;
}

function fixed(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function tryValue<T>(calculate: () => T): T | null {
  try {
    return calculate();
  } catch {
    return null;
  }
}

/**
 * Build the common recipe / light / cost document from the same local state
 * rendered by the calculators. Incomplete or invalid sections are omitted;
 * the export never substitutes invented measurements, yield, or prices.
 */
export function createGrowHelpExportSnapshot(
  state: GrowHelpToolkitState,
  generatedLabel: string,
): GrowHelpExportSnapshot {
  const rows: GrowHelpExportRow[] = [];
  const add = (
    section: GrowHelpExportRow["section"],
    item: string,
    value: string | number,
    unit: string,
    formula: string,
  ) => rows.push({ section, item, value, unit, formula });
  const addUnitCosts = (label: string, costs: ExpenseUnitCosts) => {
    add(
      "Cost sheet",
      `${label} cost per gram`,
      fixed(costs.perGram),
      `${state.cycle.currency}/dried saleable g`,
      costs.formula,
    );
    add(
      "Cost sheet",
      `${label} cost per ounce`,
      fixed(costs.perOunce),
      `${state.cycle.currency}/28.3495 dried g`,
      "cost/g × 28.3495",
    );
    add(
      "Cost sheet",
      `${label} cost per pound`,
      fixed(costs.perPound),
      `${state.cycle.currency}/lb`,
      "cost/g × 453.59237",
    );
    add(
      "Cost sheet",
      `${label} cost per kilogram`,
      fixed(costs.perKilogram),
      `${state.cycle.currency}/kg`,
      "cost/g × 1,000",
    );
  };

  const { cycle, nutrient, light, expense } = state;
  const cycleDays = (cycle.vegDays ?? 0) + (cycle.flowerDays ?? 0);
  add("Cycle", "Vegetative phase", cycle.vegDays ?? "Not entered", "days", "grower-entered");
  add("Cycle", "Flower phase", cycle.flowerDays ?? "Not entered", "days", "grower-entered");
  add("Cycle", "Vegetative photoperiod", cycle.vegPhotoperiodHours, "h/day", "shared Cycle bar");
  add("Cycle", "Flower photoperiod", cycle.flowerPhotoperiodHours, "h/day", "shared Cycle bar");
  add(
    "Cycle",
    "Electricity rate",
    cycle.electricityRate ?? "Not entered",
    `${cycle.currency}/kWh`,
    "grower-entered",
  );

  const reservoir =
    nutrient.reservoirValue === null
      ? null
      : { value: nutrient.reservoirValue, unit: nutrient.reservoirUnit };
  if (reservoir) {
    add(
      "Nutrient recipe",
      "Working reservoir",
      reservoir.value,
      reservoir.unit,
      "working volume, not container maximum",
    );
  }

  const elementalPlanningNotes = [
    ["N", nutrient.elementalTargetsPpm.nitrogen],
    ["P", nutrient.elementalTargetsPpm.phosphorus],
    ["K", nutrient.elementalTargetsPpm.potassium],
  ] as const;
  elementalPlanningNotes.forEach(([element, value]) => {
    if (value === null || !Number.isFinite(value) || value < 0) return;
    add(
      "Nutrient recipe",
      `Elemental ${element} target · planning note`,
      fixed(value),
      "ppm",
      "user-entered planning note; excluded from EC dose math; achieved ppm requires product analysis",
    );
  });

  if (nutrient.mode === "label" && reservoir) {
    const recipe = tryValue(() =>
      calculateLabelRateRecipe(
        nutrient.labelParts.map((part) => ({ ...part, dose: part.dose as number })),
        reservoir,
      ),
    );
    recipe?.rows.forEach((part, index) =>
      add(
        "Nutrient recipe",
        `${index + 1}. ${part.name || `Part ${index + 1}`}`,
        fixed(part.amount),
        part.amountUnit,
        part.formula,
      ),
    );
  } else if (nutrient.mode === "ec_target" && reservoir) {
    const recipe = tryValue(() =>
      calculateEcTargetRecipe(
        nutrient.sourceWaterEc as number,
        nutrient.targetEc as number,
        nutrient.ecParts.map((part) => ({
          ...part,
          ecPerMlPerL: part.ecPerMlPerL as number,
          ratio: part.ratio,
        })),
        reservoir,
      ),
    );
    recipe?.rows.forEach((part, index) =>
      add(
        "Nutrient recipe",
        `${index + 1}. ${part.name || `Part ${index + 1}`} · ratio ${fixed(part.ratio)}:1`,
        fixed(part.reservoirMl),
        "mL",
        part.formula,
      ),
    );
    if (recipe && nutrient.targetEc !== null) {
      const converted = convertNutrientStrength(nutrient.targetEc, "ec");
      add(
        "Nutrient recipe",
        "Target strength",
        nutrient.targetEc,
        "mS/cm EC",
        "grower-entered target",
      );
      add(
        "Nutrient recipe",
        "Derived target PPM500",
        fixed(converted.ppm500, 0),
        "ppm (500 scale)",
        "PPM500 = EC × 500",
      );
      add(
        "Nutrient recipe",
        "Derived target PPM700",
        fixed(converted.ppm700, 0),
        "ppm (700 scale)",
        "PPM700 = EC × 700",
      );
    }
  } else if (nutrient.mode === "c1v1") {
    const v1 = tryValue(() =>
      calculateC1V1(nutrient.c1 as number, nutrient.c2 as number, nutrient.v2 as number),
    );
    if (v1 !== null) {
      add(
        "Nutrient recipe",
        "Stock volume V1",
        fixed(v1),
        nutrient.c1v1Unit,
        "V1 = (C2 × V2) ÷ C1",
      );
    }
  } else if (nutrient.mode === "dry_salt" && reservoir) {
    const recipe = tryValue(() =>
      scaleDrySaltRecipe(
        nutrient.drySaltRows.map((part) => ({
          id: part.id,
          name: part.name,
          gramsPerGallon: part.gramsPerGallon as number,
          mixOrder: part.mixOrder,
        })),
        reservoir,
      ),
    );
    recipe?.forEach((part, index) =>
      add(
        "Nutrient recipe",
        `${index + 1}. ${part.name || `Dry salt ${index + 1}`}`,
        fixed(part.reservoirGrams),
        "g",
        part.formula,
      ),
    );
    if (nutrient.injectorEnabled) {
      const injector = tryValue(() =>
        calculateInjectorPlan(
          nutrient.stockGramsPerGallon as number,
          nutrient.injectorRatio,
          reservoir,
        ),
      );
      if (injector) {
        add(
          "Nutrient recipe",
          `1:${injector.ratio} stock draw`,
          fixed(injector.stockMlForReservoir),
          "mL stock",
          injector.formula,
        );
      }
    }
  } else if (nutrient.mode === "converter" && nutrient.converterValue !== null) {
    const converted = tryValue(() =>
      convertNutrientStrength(nutrient.converterValue as number, nutrient.converterKind),
    );
    if (converted) {
      add("Nutrient recipe", "EC", fixed(converted.ecMsCm), "mS/cm", "EC is the direct strength");
      add(
        "Nutrient recipe",
        "PPM500",
        fixed(converted.ppm500, 0),
        "ppm (500 scale)",
        "PPM500 = EC × 500",
      );
      add(
        "Nutrient recipe",
        "PPM700",
        fixed(converted.ppm700, 0),
        "ppm (700 scale)",
        "PPM700 = EC × 700",
      );
      add("Nutrient recipe", "CF", fixed(converted.cf), "CF", "CF = EC × 10");
    }
  }

  const canopyArea = tryValue(() =>
    state.unitSystem === "us"
      ? areaM2FromFeet(light.canopyLength as number, light.canopyWidth as number)
      : areaM2(light.canopyLength as number, light.canopyWidth as number),
  );
  const fixturePpf = tryValue(() =>
    resolveFixturePpf({
      mode: light.ppfMode,
      ppfMicromolesPerSecond: light.ppfPerFixture as number,
      actualWatts: light.actualWattsPerFixture as number,
      efficacyMicromolesPerJoule: light.efficacy as number,
    }),
  );
  if (canopyArea !== null) {
    add("Light plan", "Canopy area", fixed(canopyArea), "m²", "area = length × width");
    add(
      "Light plan",
      "Canopy area",
      fixed(canopyArea / M2_PER_FT2),
      "ft²",
      "ft² = m² ÷ 0.09290304",
    );
  }
  if (fixturePpf) {
    add(
      "Light plan",
      fixturePpf.estimated ? "Estimated PPF per fixture" : "PPF per fixture",
      fixed(fixturePpf.ppf),
      "µmol/s",
      fixturePpf.formula,
    );
  }
  if (canopyArea !== null && fixturePpf) {
    const plannedPpfd = tryValue(() =>
      planningAveragePpfd(
        fixturePpf.ppf,
        light.fixtureCount,
        canopyArea,
        light.canopyEfficiencyPercent / 100,
      ),
    );
    if (plannedPpfd !== null) {
      const photoperiod =
        light.stage === "veg" ? cycle.vegPhotoperiodHours : cycle.flowerPhotoperiodHours;
      add(
        "Light plan",
        "Planning average PPFD",
        fixed(plannedPpfd, 0),
        "µmol/m²/s",
        "PPFD = (PPF × fixtures × efficiency) ÷ area m²",
      );
      add(
        "Light plan",
        "Planning DLI",
        fixed(calculateDliFromPlanningPpfd(plannedPpfd, photoperiod)),
        "mol/m²/day",
        "DLI = PPFD × hours × 0.0036",
      );
    }
    const targetPpfd = tryValue(() =>
      light.targetMode === "ppfd"
        ? (light.targetPpfd as number)
        : ppfdForTargetDli(
            light.targetDli as number,
            light.stage === "veg" ? cycle.vegPhotoperiodHours : cycle.flowerPhotoperiodHours,
          ),
    );
    const fixtureTarget =
      targetPpfd === null
        ? null
        : tryValue(() =>
            fixturesNeeded(
              targetPpfd,
              canopyArea,
              fixturePpf.ppf,
              light.canopyEfficiencyPercent / 100,
            ),
          );
    if (fixtureTarget) {
      add(
        "Light plan",
        "Fixtures needed (raw)",
        fixed(fixtureTarget.raw),
        "fixtures",
        fixtureTarget.formula,
      );
      add(
        "Light plan",
        "Fixtures needed (rounded up)",
        fixtureTarget.roundedUp,
        "fixtures",
        "ceil(raw fixtures)",
      );
    }
  }
  const inverse = tryValue(() =>
    inverseSquarePpfd(
      light.chartPpfd as number,
      light.chartHeight as number,
      light.newHeight as number,
    ),
  );
  if (inverse !== null) {
    add(
      "Light plan",
      "Inverse-square PPFD estimate",
      fixed(inverse, 0),
      "µmol/m²/s",
      "PPFDnew = PPFDchart × (hchart ÷ hnew)²",
    );
  }
  const targetForHeight = tryValue(() =>
    light.targetMode === "ppfd"
      ? (light.targetPpfd as number)
      : ppfdForTargetDli(
          light.targetDli as number,
          light.stage === "veg" ? cycle.vegPhotoperiodHours : cycle.flowerPhotoperiodHours,
        ),
  );
  const height =
    targetForHeight === null
      ? null
      : tryValue(() =>
          solveInverseSquareHeight(
            light.chartPpfd as number,
            light.chartHeight as number,
            targetForHeight,
          ),
        );
  if (height !== null) {
    add(
      "Light plan",
      "Estimated target height",
      fixed(height),
      light.heightUnit,
      "hnew = hchart × √(PPFDchart ÷ PPFDtarget)",
    );
  }
  const uniformity = tryValue(() =>
    calculateUniformity({
      center: light.fivePoint.center as number,
      frontLeft: light.fivePoint.frontLeft as number,
      frontRight: light.fivePoint.frontRight as number,
      backLeft: light.fivePoint.backLeft as number,
      backRight: light.fivePoint.backRight as number,
    }),
  );
  if (uniformity) {
    add(
      "Light plan",
      "Five-point average",
      fixed(uniformity.average, 0),
      "µmol/m²/s",
      "average = Σ five readings ÷ 5",
    );
    add(
      "Light plan",
      "Uniformity Umin/Uavg",
      uniformity.uminOverUavg === null ? "Not available" : fixed(uniformity.uminOverUavg, 3),
      "ratio",
      uniformity.formula,
    );
  }
  const lightEnergy = tryValue(() =>
    calculateLightCycleEnergy({
      actualWattsPerFixture: light.actualWattsPerFixture as number,
      fixtureCount: light.fixtureCount,
      vegHoursPerDay: cycle.vegPhotoperiodHours,
      vegDays: cycle.vegDays as number,
      flowerHoursPerDay: cycle.flowerPhotoperiodHours,
      flowerDays: cycle.flowerDays as number,
      ratePerKwh: cycle.electricityRate as number,
    }),
  );
  if (lightEnergy) {
    add(
      "Light plan",
      "Fixture cycle energy",
      fixed(lightEnergy.cycleKwh),
      "kWh",
      lightEnergy.formula,
    );
    add(
      "Light plan",
      "Fixture cycle electricity",
      fixed(lightEnergy.cycleCost),
      cycle.currency,
      "cost = kWh × rate",
    );
  }
  const lightEnergyCostPerMol =
    fixturePpf && lightEnergy
      ? tryValue(() =>
          calculateEnergyCostPerMol({
            ppfPerFixture: fixturePpf.ppf,
            fixtureCount: light.fixtureCount,
            vegHoursPerDay: cycle.vegPhotoperiodHours,
            vegDays: cycle.vegDays as number,
            flowerHoursPerDay: cycle.flowerPhotoperiodHours,
            flowerDays: cycle.flowerDays as number,
            cycleElectricityCost: lightEnergy.cycleCost,
          }),
        )
      : null;
  if (lightEnergyCostPerMol && fixturePpf) {
    add(
      "Light plan",
      fixturePpf.estimated ? "Estimated fixture-output photons" : "Fixture-output photons",
      fixed(lightEnergyCostPerMol.photonMoles),
      "mol/cycle",
      lightEnergyCostPerMol.formula,
    );
    add(
      "Light plan",
      fixturePpf.estimated
        ? "Estimated electricity cost per fixture-output mol"
        : "Electricity cost per fixture-output mol",
      fixed(lightEnergyCostPerMol.costPerMol, 6),
      `${cycle.currency}/mol`,
      lightEnergyCostPerMol.formula,
    );
  }

  const waterStarted =
    expense.waterPricePerGallon !== null ||
    expense.waterGallonsPerChange !== null ||
    expense.waterChangesPerWeek !== null;
  const completeWater =
    !waterStarted ||
    (expense.waterPricePerGallon !== null &&
      expense.waterGallonsPerChange !== null &&
      expense.waterChangesPerWeek !== null);
  const completeExpense =
    cycleDays > 0 &&
    cycle.electricityRate !== null &&
    completeWater &&
    expense.devices.every(
      (row) =>
        row.actualWatts !== null &&
        (row.vegHoursPerDay ?? cycle.vegPhotoperiodHours) > 0 &&
        (row.flowerHoursPerDay ?? cycle.flowerPhotoperiodHours) > 0,
    ) &&
    expense.nutrients.every((row) =>
      row.pricingMode === "manual_weekly"
        ? row.manualWeeklyCost !== null
        : row.packagePrice !== null && row.usableAmount !== null && row.usagePerWeek !== null,
    ) &&
    expense.setup.every((row) => row.amount !== null) &&
    expense.recurring.every((row) => row.amount !== null);
  const expenseSummary = completeExpense
    ? tryValue(() =>
        calculateExpenseSummary({
          devices: expense.devices.map((row) => ({
            id: row.id,
            name: row.name,
            actualWatts: row.actualWatts as number,
            quantity: row.quantity,
            vegHoursPerDay: row.vegHoursPerDay ?? cycle.vegPhotoperiodHours,
            flowerHoursPerDay: row.flowerHoursPerDay ?? cycle.flowerPhotoperiodHours,
            vegDays: row.vegDaysOverride ?? (cycle.vegDays as number),
            flowerDays: row.flowerDaysOverride ?? (cycle.flowerDays as number),
            linkedFromLight: row.linkedFromLight,
          })),
          nutrients: expense.nutrients.map((row) => ({
            id: row.id,
            name: row.name,
            pricingMode: row.pricingMode,
            packagePrice: row.packagePrice ?? 0,
            usableAmount: row.usableAmount ?? 1,
            unit: row.unit,
            usagePerWeek: row.usagePerWeek ?? 0,
            manualWeeklyCost: row.manualWeeklyCost ?? undefined,
            linkedFromRecipe: row.linkedFromRecipe,
          })),
          water: waterStarted
            ? {
                pricePerGallon: expense.waterPricePerGallon as number,
                gallonsPerReservoirChange: expense.waterGallonsPerChange as number,
                changesPerWeek: expense.waterChangesPerWeek as number,
              }
            : {
                pricePerGallon: 0,
                gallonsPerReservoirChange: 0,
                changesPerWeek: 0,
              },
          setup: expense.setup.map((row) => ({ ...row, amount: row.amount as number })),
          recurring: expense.recurring.map((row) => ({ ...row, amount: row.amount as number })),
          electricityRate: cycle.electricityRate as number,
          cycleDays,
          driedSaleableGrams: expense.driedSaleableGrams,
          amortizationCycles: expense.amortizationCycles,
          compareAtPricePerGram: expense.compareAtPricePerGram,
        }),
      )
    : null;
  expenseSummary?.deviceResults.forEach((device) => {
    add("Cost sheet", `${device.name} cycle energy`, fixed(device.cycleKwh), "kWh", device.formula);
    add(
      "Cost sheet",
      `${device.name} cycle cost`,
      fixed(device.cycleCost),
      cycle.currency,
      "cost = kWh × rate",
    );
  });
  if (expenseSummary) {
    expenseSummary.nutrientResults.forEach((nutrientCost, index) => {
      add(
        "Cost sheet",
        `Nutrient · ${nutrientCost.name || `Item ${index + 1}`}`,
        fixed(nutrientCost.cycleCost),
        `${cycle.currency}/cycle`,
        nutrientCost.pricingMode === "manual_weekly"
          ? "cycle cost = user-entered weekly cost × cycle days ÷ 7"
          : nutrientCost.formula,
      );
    });
    if (waterStarted) {
      const waterVolumeUnit = state.unitSystem === "metric" ? "L" : "gal";
      add(
        "Cost sheet",
        "Water · reservoir changes",
        fixed(expenseSummary.waterResult.cycleCost),
        `${cycle.currency}/cycle`,
        `water cost = ${cycle.currency}/${waterVolumeUnit} × ${waterVolumeUnit}/change × changes/week × cycle weeks`,
      );
    }
    expense.setup.forEach((setupItem, index) => {
      add(
        "Cost sheet",
        `Setup · ${setupItem.name || `Item ${index + 1}`}`,
        fixed(setupItem.amount as number),
        cycle.currency,
        "one-time setup cost = grower-entered item amount",
      );
    });
    expense.recurring.forEach((recurringItem, index) => {
      const amount = recurringItem.amount as number;
      const normalizedCycleCost =
        recurringItem.basis === "month" ? amount * (cycleDays / 30) : amount;
      add(
        "Cost sheet",
        `Recurring · ${recurringItem.name || `Item ${index + 1}`} (${recurringItem.basis === "month" ? "per month" : "per cycle"})`,
        fixed(normalizedCycleCost),
        `${cycle.currency}/cycle`,
        recurringItem.basis === "month"
          ? "normalized cycle cost = grower-entered cost/month × cycle days ÷ 30"
          : "normalized cycle cost = grower-entered cost/cycle",
      );
    });
    add(
      "Cost sheet",
      "Operating cycle",
      fixed(expenseSummary.operatingCycleCost),
      cycle.currency,
      "electricity + nutrients + water + recurring",
    );
    add(
      "Cost sheet",
      "First cycle including setup",
      fixed(expenseSummary.firstCycleCost),
      cycle.currency,
      "operating + one-time setup",
    );
    add(
      "Cost sheet",
      `Setup amortized over ${expense.amortizationCycles} cycles`,
      fixed(expenseSummary.amortizedCycleCost),
      cycle.currency,
      expenseSummary.formula,
    );
    add(
      "Cost sheet",
      "30-day operating",
      fixed(expenseSummary.thirtyDayOperatingCost),
      cycle.currency,
      "normalized operating costs over 30 days",
    );
    add(
      "Cost sheet",
      "365-day operating",
      fixed(expenseSummary.yearlyOperatingCost),
      cycle.currency,
      "normalized operating costs over 365 days",
    );
    if (expenseSummary.firstCycleUnitCosts) {
      addUnitCosts("First-cycle", expenseSummary.firstCycleUnitCosts);
    }
    if (expenseSummary.operatingUnitCosts) {
      addUnitCosts("Operating-only", expenseSummary.operatingUnitCosts);
    }
    if (expenseSummary.amortizedUnitCosts) {
      addUnitCosts("Setup-amortized", expenseSummary.amortizedUnitCosts);
    }
    if (expenseSummary.compareAtHarvestValue !== null) {
      add(
        "Cost sheet",
        "User-entered comparison value",
        fixed(expenseSummary.compareAtHarvestValue),
        cycle.currency,
        EXPENSE_COMPARISON_FORMULAS.comparisonValue,
      );
    }
    if (expenseSummary.operatingCycleSavings !== null) {
      add(
        "Cost sheet",
        "Operating-cycle savings",
        fixed(expenseSummary.operatingCycleSavings),
        `${cycle.currency}/cycle`,
        EXPENSE_COMPARISON_FORMULAS.operatingSavings,
      );
    }
    if (expenseSummary.operatingRoiPercent !== null) {
      add(
        "Cost sheet",
        "Operating ROI",
        fixed(expenseSummary.operatingRoiPercent),
        "%",
        EXPENSE_COMPARISON_FORMULAS.operatingRoi,
      );
    }
    if (expenseSummary.setupPaybackCycles !== null) {
      add(
        "Cost sheet",
        "Setup payback",
        fixed(expenseSummary.setupPaybackCycles),
        "cycles",
        EXPENSE_COMPARISON_FORMULAS.setupPayback,
      );
    }
  }

  if (waterStarted && !completeWater) {
    add(
      "Notes",
      "Cost sheet",
      "Incomplete — not exported",
      "",
      "complete water price, volume per change, and changes per week",
    );
  }

  add("Notes", "Privacy", "Local browser only", "", "calculator state is not uploaded");
  add(
    "Notes",
    "Light verification",
    "Planning estimate only",
    "",
    "verify with a PAR meter; inverse-square is approximate",
  );
  add("Notes", "Strength convention", "EC preferred", "mS/cm", "PPM is derived from a named scale");

  return {
    cycleName: cycle.name.trim() || "Grow cycle",
    generatedLabel,
    rows,
  };
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildGrowHelpToolkitCsv(snapshot: GrowHelpExportSnapshot): string {
  const rows: Array<Array<string | number>> = [
    ["Grow Help Toolkit", snapshot.cycleName, "", "", ""],
    ["Generated", snapshot.generatedLabel, "", "", ""],
    ["Section", "Item", "Value", "Unit", "Formula"],
    ...snapshot.rows.map((row) => [row.section, row.item, row.value, row.unit, row.formula]),
  ];
  return `${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
}

export function buildGrowHelpToolkitPrintHtml(snapshot: GrowHelpExportSnapshot): string {
  const sections: GrowHelpExportRow["section"][] = [
    "Cycle",
    "Nutrient recipe",
    "Light plan",
    "Cost sheet",
    "Notes",
  ];
  const body = sections
    .map((section) => {
      const rows = snapshot.rows.filter((row) => row.section === section);
      if (rows.length === 0) return "";
      return `<section><h2>${escapeHtml(section)}</h2><table><thead><tr><th>Item</th><th>Value</th><th>Unit</th><th>Formula</th></tr></thead><tbody>${rows
        .map(
          (row) =>
            `<tr><th scope="row">${escapeHtml(row.item)}</th><td>${escapeHtml(row.value)}</td><td>${escapeHtml(row.unit)}</td><td class="formula">${escapeHtml(row.formula)}</td></tr>`,
        )
        .join("")}</tbody></table></section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(snapshot.cycleName)} — Grow Help Toolkit</title>
<style>
  :root{font-family:Inter,system-ui,sans-serif;color:#172019;background:#fff}
  body{max-width:960px;margin:0 auto;padding:28px;font-size:13px;line-height:1.45}
  h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}
  .meta,.note{color:#566159}.note{border:1px solid #bdc8c0;border-radius:8px;padding:10px 12px}
  table{width:100%;border-collapse:collapse}th,td{border:1px solid #d5ddd7;padding:7px;text-align:left;vertical-align:top}
  thead th{background:#f1f5f2}.formula{font-size:11px;color:#566159}
  @media print{body{padding:0}section{break-inside:avoid}}
</style>
</head>
<body data-testid="grow-help-toolkit-print-document">
  <header><h1>${escapeHtml(snapshot.cycleName)}</h1><p class="meta">Grow Help Toolkit · ${escapeHtml(snapshot.generatedLabel)}</p></header>
  ${body}
  <p class="note">Planning estimates only. Verify light readings with a PAR meter, confirm nutrient strength with a calibrated EC meter, and use dried saleable harvest weight for unit costs. Calculator data stays in this browser and is not uploaded.</p>
</body>
</html>`;
}

export type BrowserExportResult = "downloaded" | "printed" | "unavailable";

export function downloadGrowHelpToolkitCsv(
  csv: string,
  filename: string,
  doc: Document | null = typeof document === "undefined" ? null : document,
  urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> | null = typeof URL ===
  "undefined"
    ? null
    : URL,
): BrowserExportResult {
  if (!doc || !urlApi) return "unavailable";
  let objectUrl: string | null = null;
  try {
    objectUrl = urlApi.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = doc.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;
    doc.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return "downloaded";
  } catch {
    return "unavailable";
  } finally {
    if (objectUrl) urlApi.revokeObjectURL(objectUrl);
  }
}

export function openGrowHelpToolkitPrintWindow(
  html: string,
  win: Window | null = typeof window === "undefined" ? null : window,
): BrowserExportResult {
  if (!win || typeof win.open !== "function") return "unavailable";
  try {
    const popup = win.open("", "_blank");
    if (!popup) return "unavailable";
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
    return "printed";
  } catch {
    return "unavailable";
  }
}
