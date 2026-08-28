import { describe, expect, it, vi } from "vitest";

import {
  buildGrowHelpToolkitCsv,
  buildGrowHelpToolkitPrintHtml,
  createGrowHelpExportSnapshot,
  downloadGrowHelpToolkitCsv,
  openGrowHelpToolkitPrintWindow,
  type GrowHelpExportRow,
  type GrowHelpExportSnapshot,
} from "@/lib/growHelpToolkitExport";
import {
  createDefaultGrowHelpToolkitState,
  type GrowHelpToolkitState,
} from "@/lib/growHelpToolkitState";

function createCompleteExportState(includeDriedWeight = true): GrowHelpToolkitState {
  const state = createDefaultGrowHelpToolkitState();
  state.cycle = {
    name: "East room cycle",
    vegDays: 30,
    flowerDays: 60,
    vegPhotoperiodHours: 18,
    flowerPhotoperiodHours: 12,
    electricityRate: 0.16,
    currency: "USD",
  };
  state.nutrient = {
    ...state.nutrient,
    mode: "label",
    reservoirValue: 20,
    reservoirUnit: "gal",
    changesPerWeek: 1,
    labelParts: [{ id: "part-a", name: "Part A", dose: 2.5, unit: "ml/gal" }],
  };
  state.light = {
    ...state.light,
    stage: "flower",
    canopyLength: 4,
    canopyWidth: 4,
    ppfMode: "ppf",
    fixtureCount: 2,
    ppfPerFixture: 800,
    actualWattsPerFixture: 300,
    canopyEfficiencyPercent: 85,
    targetMode: "ppfd",
    targetPpfd: 800,
    chartPpfd: 200,
    chartHeight: 12,
    newHeight: 24,
    heightUnit: "in",
    fivePoint: {
      center: 800,
      frontLeft: 700,
      frontRight: 720,
      backLeft: 680,
      backRight: 710,
    },
  };
  state.expense = {
    devices: [
      {
        id: "device-fan",
        name: "Circulation fan",
        actualWatts: 50,
        quantity: 1,
        vegHoursPerDay: null,
        flowerHoursPerDay: null,
        vegDaysOverride: null,
        flowerDaysOverride: null,
      },
    ],
    nutrients: [
      {
        id: "nutrient-base",
        name: "Base nutrient",
        pricingMode: "package",
        packagePrice: 40,
        usableAmount: 1_000,
        unit: "ml",
        usagePerWeek: 50,
        manualWeeklyCost: null,
      },
    ],
    waterPricePerGallon: 0.01,
    waterGallonsPerChange: 20,
    waterChangesPerWeek: 1,
    setup: [{ id: "setup-tent", name: "Tent", amount: 100 }],
    recurring: [{ id: "rec-filter", name: "Filter", amount: 15, basis: "cycle" }],
    driedSaleableGrams: includeDriedWeight ? 200 : null,
    amortizationCycles: 4,
    compareAtPricePerGram: null,
  };
  return state;
}

describe("Grow Help Toolkit export snapshot", () => {
  it("builds all populated sections with visible values, units, and formulas", () => {
    const snapshot = createGrowHelpExportSnapshot(
      createCompleteExportState(),
      "Generated locally · 2026-08-26",
    );

    expect(new Set(snapshot.rows.map((row) => row.section))).toEqual(
      new Set(["Cycle", "Nutrient recipe", "Light plan", "Cost sheet", "Notes"]),
    );
    expect(snapshot.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "Nutrient recipe",
          item: "1. Part A",
          value: 50,
          unit: "ml",
          formula: "mL = dose (mL/gal) × working gallons",
        }),
        expect.objectContaining({
          section: "Light plan",
          item: "Planning DLI",
          unit: "mol/m²/day",
          formula: "DLI = PPFD × hours × 0.0036",
        }),
        expect.objectContaining({
          section: "Cost sheet",
          item: "First-cycle cost per gram",
          unit: "USD/dried saleable g",
          formula: "cost/g = total cost ÷ dried saleable grams",
        }),
        expect.objectContaining({
          section: "Notes",
          item: "Light verification",
          value: "Planning estimate only",
          formula: "verify with a PAR meter; inverse-square is approximate",
        }),
      ]),
    );
  });

  it("exports auditable nutrient, water, setup, and recurring cost line items", () => {
    const state = createCompleteExportState();
    state.expense.nutrients.push({
      id: "nutrient-manual",
      name: "Manual supplement",
      pricingMode: "manual_weekly",
      packagePrice: null,
      usableAmount: null,
      unit: "ml",
      usagePerWeek: null,
      manualWeeklyCost: 7,
    });
    state.expense.setup.push({ id: "setup-pump", name: "Pump", amount: 50 });
    state.expense.recurring.push({
      id: "rec-monthly",
      name: "Monthly service",
      amount: 30,
      basis: "month",
    });

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(snapshot.rows).toEqual(
      expect.arrayContaining([
        {
          section: "Cost sheet",
          item: "Nutrient · Base nutrient",
          value: 25.71,
          unit: "USD/cycle",
          formula: "cost = (package price ÷ usable amount) × recipe use per week × cycle weeks",
        },
        {
          section: "Cost sheet",
          item: "Nutrient · Manual supplement",
          value: 90,
          unit: "USD/cycle",
          formula: "cycle cost = user-entered weekly cost × cycle days ÷ 7",
        },
        {
          section: "Cost sheet",
          item: "Water · reservoir changes",
          value: 2.57,
          unit: "USD/cycle",
          formula: "water cost = USD/gal × gal/change × changes/week × cycle weeks",
        },
        {
          section: "Cost sheet",
          item: "Setup · Tent",
          value: 100,
          unit: "USD",
          formula: "one-time setup cost = grower-entered item amount",
        },
        {
          section: "Cost sheet",
          item: "Setup · Pump",
          value: 50,
          unit: "USD",
          formula: "one-time setup cost = grower-entered item amount",
        },
        {
          section: "Cost sheet",
          item: "Recurring · Filter (per cycle)",
          value: 15,
          unit: "USD/cycle",
          formula: "normalized cycle cost = grower-entered cost/cycle",
        },
        {
          section: "Cost sheet",
          item: "Recurring · Monthly service (per month)",
          value: 90,
          unit: "USD/cycle",
          formula: "normalized cycle cost = grower-entered cost/month × cycle days ÷ 30",
        },
      ]),
    );

    const csv = buildGrowHelpToolkitCsv(snapshot);
    const html = buildGrowHelpToolkitPrintHtml(snapshot);
    expect(csv).toContain(
      "Cost sheet,Nutrient · Base nutrient,25.71,USD/cycle,cost = (package price ÷ usable amount) × recipe use per week × cycle weeks",
    );
    expect(csv).toContain(
      "Cost sheet,Water · reservoir changes,2.57,USD/cycle,water cost = USD/gal × gal/change × changes/week × cycle weeks",
    );
    expect(csv).toContain(
      "Cost sheet,Recurring · Monthly service (per month),90,USD/cycle,normalized cycle cost = grower-entered cost/month × cycle days ÷ 30",
    );
    expect(html).toContain("Nutrient · Manual supplement</th><td>90</td><td>USD/cycle</td>");
    expect(html).toContain("Setup · Pump</th><td>50</td><td>USD</td>");
    expect(html).toContain(
      "Recurring · Monthly service (per month)</th><td>90</td><td>USD/cycle</td>",
    );
  });

  it("exports elemental targets only as planning notes and preserves EC part ratios", () => {
    const state = createCompleteExportState();
    state.nutrient = {
      ...state.nutrient,
      mode: "ec_target",
      reservoirValue: 1,
      reservoirUnit: "L",
      sourceWaterEc: 0.2,
      targetEc: 1.6,
      ecParts: [
        { id: "a", name: "Part A", ecPerMlPerL: 0.2, ratio: 2 },
        { id: "b", name: "Part B", ecPerMlPerL: 0.1, ratio: 1 },
      ],
      elementalTargetsPpm: { nitrogen: 150, phosphorus: 50, potassium: 200 },
    };

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(snapshot.rows).toEqual(
      expect.arrayContaining([
        {
          section: "Nutrient recipe",
          item: "Elemental N target · planning note",
          value: 150,
          unit: "ppm",
          formula:
            "user-entered planning note; excluded from EC dose math; achieved ppm requires product analysis",
        },
        {
          section: "Nutrient recipe",
          item: "Elemental P target · planning note",
          value: 50,
          unit: "ppm",
          formula:
            "user-entered planning note; excluded from EC dose math; achieved ppm requires product analysis",
        },
        {
          section: "Nutrient recipe",
          item: "Elemental K target · planning note",
          value: 200,
          unit: "ppm",
          formula:
            "user-entered planning note; excluded from EC dose math; achieved ppm requires product analysis",
        },
        {
          section: "Nutrient recipe",
          item: "1. Part A · ratio 2:1",
          value: 5.6,
          unit: "mL",
          formula: "part mL/L = base mL/L × ratio (2:1)",
        },
        {
          section: "Nutrient recipe",
          item: "2. Part B · ratio 1:1",
          value: 2.8,
          unit: "mL",
          formula: "part mL/L = base mL/L × ratio (1:1)",
        },
      ]),
    );

    const csv = buildGrowHelpToolkitCsv(snapshot);
    const html = buildGrowHelpToolkitPrintHtml(snapshot);
    expect(csv).toContain(
      "Nutrient recipe,Elemental N target · planning note,150,ppm,user-entered planning note; excluded from EC dose math; achieved ppm requires product analysis",
    );
    expect(csv).toContain(
      "Nutrient recipe,1. Part A · ratio 2:1,5.6,mL,part mL/L = base mL/L × ratio (2:1)",
    );
    expect(html).toContain("Elemental K target · planning note</th><td>200</td><td>ppm</td>");
    expect(html).toContain("1. Part A · ratio 2:1</th><td>5.6</td><td>mL</td>");
  });

  it("exports fixture-output photon moles and electricity cost per mole", () => {
    const state = createCompleteExportState();
    const direct = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(direct.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "Light plan",
          item: "Fixture-output photons",
          value: 7257.6,
          unit: "mol/cycle",
        }),
        expect.objectContaining({
          section: "Light plan",
          item: "Electricity cost per fixture-output mol",
          value: 0.016667,
          unit: "USD/mol",
        }),
      ]),
    );

    state.light = {
      ...state.light,
      ppfMode: "watts",
      ppfPerFixture: null,
      efficacy: 2.5,
    };
    const estimated = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(estimated.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "Light plan",
          item: "Estimated fixture-output photons",
          value: 6804,
          unit: "mol/cycle",
        }),
        expect.objectContaining({
          section: "Light plan",
          item: "Estimated electricity cost per fixture-output mol",
          value: 0.017778,
          unit: "USD/mol",
        }),
      ]),
    );

    const csv = buildGrowHelpToolkitCsv(direct);
    const html = buildGrowHelpToolkitPrintHtml(direct);
    expect(csv).toContain("Light plan,Fixture-output photons,7257.6,mol/cycle");
    expect(csv).toContain("Light plan,Electricity cost per fixture-output mol,0.016667,USD/mol");
    expect(html).toContain("Fixture-output photons</th><td>7257.6</td><td>mol/cycle</td>");
    expect(html).toContain(
      "Electricity cost per fixture-output mol</th><td>0.016667</td><td>USD/mol</td>",
    );
  });

  it("is deterministic for the same state and does not mutate the input", () => {
    const state = createCompleteExportState();
    const before = JSON.stringify(state);

    const first = createGrowHelpExportSnapshot(state, "Fixed label");
    const second = createGrowHelpExportSnapshot(state, "Fixed label");

    expect(second).toEqual(first);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("does not invent unit-cost or comparison rows when yield and price are absent", () => {
    const state = createCompleteExportState(false);
    state.expense.compareAtPricePerGram = null;

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");
    const costItems = snapshot.rows
      .filter((row) => row.section === "Cost sheet")
      .map((row) => row.item);

    expect(costItems).toContain("First cycle including setup");
    expect(costItems).not.toContain("First-cycle cost per gram");
    expect(costItems).not.toContain("First-cycle cost per ounce");
    expect(costItems).not.toContain("First-cycle cost per pound");
    expect(costItems).not.toContain("First-cycle cost per kilogram");
    expect(
      costItems.some((item) => /compar|yield|harvest value|savings|ROI|payback/i.test(item)),
    ).toBe(false);
  });

  it("fails the cost-sheet export closed when a started water row is incomplete", () => {
    const state = createCompleteExportState();
    state.expense.waterGallonsPerChange = null;

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");

    expect(snapshot.rows.filter((row) => row.section === "Cost sheet")).toEqual([]);
    expect(snapshot.rows).toContainEqual({
      section: "Notes",
      item: "Cost sheet",
      value: "Incomplete — not exported",
      unit: "",
      formula: "complete water price, volume per change, and changes per week",
    });
  });

  it("exports first-cycle, operating-only, and setup-amortized dry unit costs", () => {
    const snapshot = createGrowHelpExportSnapshot(createCompleteExportState(), "Fixed label");
    const unitRows = snapshot.rows.filter(
      (row) =>
        row.section === "Cost sheet" && /cost per (gram|ounce|pound|kilogram)$/.test(row.item),
    );

    expect(unitRows).toHaveLength(12);
    expect(unitRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item: "First-cycle cost per gram", value: 0.77 }),
        expect.objectContaining({ item: "First-cycle cost per ounce", value: 21.74 }),
        expect.objectContaining({ item: "First-cycle cost per pound", value: 347.83 }),
        expect.objectContaining({ item: "First-cycle cost per kilogram", value: 766.83 }),
        expect.objectContaining({ item: "Operating-only cost per gram", value: 0.27 }),
        expect.objectContaining({ item: "Operating-only cost per ounce", value: 7.56 }),
        expect.objectContaining({ item: "Operating-only cost per pound", value: 121.03 }),
        expect.objectContaining({ item: "Operating-only cost per kilogram", value: 266.83 }),
        expect.objectContaining({ item: "Setup-amortized cost per gram", value: 0.39 }),
        expect.objectContaining({ item: "Setup-amortized cost per ounce", value: 11.11 }),
        expect.objectContaining({ item: "Setup-amortized cost per pound", value: 177.73 }),
        expect.objectContaining({ item: "Setup-amortized cost per kilogram", value: 391.83 }),
      ]),
    );

    const csv = buildGrowHelpToolkitCsv(snapshot);
    const html = buildGrowHelpToolkitPrintHtml(snapshot);
    expect(csv).toContain(
      "Cost sheet,Operating-only cost per gram,0.27,USD/dried saleable g,cost/g = total cost ÷ dried saleable grams",
    );
    expect(csv).toContain(
      'Cost sheet,Setup-amortized cost per kilogram,391.83,USD/kg,"cost/g × 1,000"',
    );
    expect(html).toContain("Operating-only cost per gram</th><td>0.27</td>");
    expect(html).toContain("Setup-amortized cost per kilogram</th><td>391.83</td>");
  });

  it("includes grower-entered comparison savings, ROI, and payback in CSV and print", () => {
    const state = createCompleteExportState();
    state.expense = {
      devices: [],
      nutrients: [],
      waterPricePerGallon: null,
      waterGallonsPerChange: null,
      waterChangesPerWeek: null,
      setup: [{ id: "setup", name: "Setup", amount: 800 }],
      recurring: [{ id: "operating", name: "Operating", amount: 200, basis: "cycle" }],
      driedSaleableGrams: 200,
      amortizationCycles: 4,
      compareAtPricePerGram: 3,
    };

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(snapshot.rows).toEqual(
      expect.arrayContaining([
        {
          section: "Cost sheet",
          item: "User-entered comparison value",
          value: 600,
          unit: "USD",
          formula: "comparison value = user-entered price/g × user-entered dried saleable grams",
        },
        {
          section: "Cost sheet",
          item: "Operating-cycle savings",
          value: 400,
          unit: "USD/cycle",
          formula: "operating-cycle savings = comparison value − operating cycle cost",
        },
        {
          section: "Cost sheet",
          item: "Operating ROI",
          value: 200,
          unit: "%",
          formula:
            "operating ROI % = (comparison value − operating cycle cost) ÷ operating cycle cost × 100",
        },
        {
          section: "Cost sheet",
          item: "Setup payback",
          value: 2,
          unit: "cycles",
          formula: "setup payback cycles = setup total ÷ positive operating-cycle savings",
        },
      ]),
    );

    const csv = buildGrowHelpToolkitCsv(snapshot);
    const html = buildGrowHelpToolkitPrintHtml(snapshot);
    expect(csv).toContain(
      "Cost sheet,Operating-cycle savings,400,USD/cycle,operating-cycle savings = comparison value − operating cycle cost",
    );
    expect(csv).toContain(
      "Cost sheet,Operating ROI,200,%,operating ROI % = (comparison value − operating cycle cost) ÷ operating cycle cost × 100",
    );
    expect(csv).toContain(
      "Cost sheet,Setup payback,2,cycles,setup payback cycles = setup total ÷ positive operating-cycle savings",
    );
    expect(html).toContain("Operating-cycle savings</th><td>400</td><td>USD/cycle</td>");
    expect(html).toContain("Operating ROI</th><td>200</td><td>%</td>");
    expect(html).toContain("Setup payback</th><td>2</td><td>cycles</td>");
  });
});

describe("Grow Help Toolkit CSV and print formats", () => {
  it("writes deterministic CSV headers and escapes commas, quotes, and newlines", () => {
    const snapshot: GrowHelpExportSnapshot = {
      cycleName: 'Cycle, "A"',
      generatedLabel: "2026-08-26, local",
      rows: [
        {
          section: "Nutrient recipe",
          item: 'Part "A", line 1\nline 2',
          value: 50,
          unit: "mL",
          formula: 'dose = "2.5", working volume',
        },
      ],
    };

    expect(buildGrowHelpToolkitCsv(snapshot)).toBe(
      [
        'Grow Help Toolkit,"Cycle, ""A""",,,',
        'Generated,"2026-08-26, local",,,',
        "Section,Item,Value,Unit,Formula",
        'Nutrient recipe,"Part ""A"", line 1\nline 2",50,mL,"dose = ""2.5"", working volume"',
        "",
      ].join("\r\n"),
    );
  });

  it("renders each print section and HTML-escapes all user-controlled fields", () => {
    const sections: GrowHelpExportRow["section"][] = [
      "Cycle",
      "Nutrient recipe",
      "Light plan",
      "Cost sheet",
      "Notes",
    ];
    const snapshot: GrowHelpExportSnapshot = {
      cycleName: '<img src=x onerror="alert(1)">',
      generatedLabel: "<b>Today</b> & now",
      rows: sections.map((section) => ({
        section,
        item: '<script>alert("item")</script>',
        value: "5 < 10 & 10 > 5",
        unit: 'u&"n',
        formula: "x < y & 'z'",
      })),
    };

    const html = buildGrowHelpToolkitPrintHtml(snapshot);

    for (const section of sections) {
      expect(html).toContain(`<h2>${section}</h2>`);
    }
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;script&gt;alert(&quot;item&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;Today&lt;/b&gt; &amp; now");
    expect(html).toContain("5 &lt; 10 &amp; 10 &gt; 5");
    expect(html).toContain("x &lt; y &amp; &#39;z&#39;");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("Planning estimates only");
    expect(html).toContain("dried saleable harvest weight");
  });

  it("returns unavailable instead of throwing when browser export capabilities are absent", () => {
    expect(downloadGrowHelpToolkitCsv("a,b\r\n", "recipe.csv", null, null)).toBe("unavailable");
    expect(openGrowHelpToolkitPrintWindow("<html></html>", null)).toBe("unavailable");

    const revokeObjectURL = vi.fn();
    const unavailableUrlApi = {
      createObjectURL: vi.fn(() => {
        throw new Error("Object URLs unavailable");
      }),
      revokeObjectURL,
    };
    expect(downloadGrowHelpToolkitCsv("a,b\r\n", "recipe.csv", document, unavailableUrlApi)).toBe(
      "unavailable",
    );
    expect(revokeObjectURL).not.toHaveBeenCalled();

    const blockedWindow = { open: vi.fn(() => null) } as unknown as Window;
    expect(openGrowHelpToolkitPrintWindow("<html></html>", blockedWindow)).toBe("unavailable");
  });
});
