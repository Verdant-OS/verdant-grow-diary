import { useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, Droplets, PackageOpen, Plus, ReceiptText, Trash2, Zap } from "lucide-react";
import {
  EXPENSE_COMPARISON_FORMULAS,
  calculateExpenseSummary,
  type ExpenseSummary,
} from "@/lib/expenseCalc";
import { expenseSummaryReadiness } from "@/lib/growHelpToolkitReadiness";
import type {
  CycleInputs,
  ExpenseDeviceInputState,
  ExpenseInputs,
  ExpenseNutrientInputState,
  RecurringCostInputState,
  SimpleCostInputState,
  UnitSystem,
} from "@/lib/growHelpToolkitState";
import NumberField from "./NumberField";
import ResultBlock from "./ResultBlock";

interface SafeResult<T> {
  value: T | null;
  error: string | null;
}

function attempt<T>(ready: boolean, fn: () => T): SafeResult<T> {
  if (!ready) return { value: null, error: null };
  try {
    return { value: fn(), error: null };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : "Check the expense inputs.",
    };
  }
}

function fmt(value: number, digits = 2): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatMoney(value: number, currency: string, digits = 2): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${currency || "USD"} ${fmt(value, digits)}`;
  }
}

function nextId(prefix: string, existing: ReadonlyArray<{ id: string }>): string {
  let index = existing.length + 1;
  while (existing.some((row) => row.id === `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

export interface ExpenseCalculatorTabProps {
  inputs: ExpenseInputs;
  cycle: CycleInputs;
  unitSystem: UnitSystem;
  onChange: (inputs: ExpenseInputs) => void;
}

export default function ExpenseCalculatorTab({
  inputs,
  cycle,
  unitSystem,
  onChange,
}: ExpenseCalculatorTabProps) {
  const currency = cycle.currency || "USD";
  const waterUnit = unitSystem === "metric" ? "L" : "gal";
  const cycleDays =
    cycle.vegDays !== null && cycle.flowerDays !== null ? cycle.vegDays + cycle.flowerDays : 0;
  const waterStarted =
    inputs.waterPricePerGallon !== null ||
    inputs.waterGallonsPerChange !== null ||
    inputs.waterChangesPerWeek !== null;
  const summaryGate = expenseSummaryReadiness(inputs, cycle);
  const summaryReady = summaryGate.ready;

  const summary = useMemo(
    () =>
      attempt<ExpenseSummary>(summaryReady, () =>
        calculateExpenseSummary({
          devices: inputs.devices.map((row) => ({
            id: row.id,
            name: row.name,
            actualWatts: row.actualWatts as number,
            quantity: row.quantity as number,
            vegHoursPerDay: row.vegHoursPerDay ?? (cycle.vegPhotoperiodHours as number),
            flowerHoursPerDay: row.flowerHoursPerDay ?? (cycle.flowerPhotoperiodHours as number),
            vegDays: row.vegDaysOverride ?? (cycle.vegDays as number),
            flowerDays: row.flowerDaysOverride ?? (cycle.flowerDays as number),
            linkedFromLight: row.linkedFromLight,
          })),
          nutrients: inputs.nutrients.map((row) => ({
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
          water: {
            pricePerGallon: inputs.waterPricePerGallon ?? 0,
            gallonsPerReservoirChange: inputs.waterGallonsPerChange ?? 0,
            changesPerWeek: inputs.waterChangesPerWeek ?? 0,
          },
          setup: inputs.setup.map((row) => ({
            id: row.id,
            name: row.name,
            amount: row.amount as number,
          })),
          recurring: inputs.recurring.map((row) => ({
            id: row.id,
            name: row.name,
            amount: row.amount as number,
            basis: row.basis,
          })),
          electricityRate: cycle.electricityRate as number,
          cycleDays,
          driedSaleableGrams: inputs.driedSaleableGrams,
          amortizationCycles: inputs.amortizationCycles as number,
          compareAtPricePerGram: inputs.compareAtPricePerGram,
        }),
      ),
    [cycle, cycleDays, inputs, summaryReady],
  );

  const amortizationError =
    inputs.amortizationCycles === null
      ? "Enter setup amortization."
      : Number.isInteger(inputs.amortizationCycles)
        ? null
        : "Amortization cycles must be a whole number.";
  const comparisonNeedsWeight =
    inputs.compareAtPricePerGram !== null && inputs.driedSaleableGrams === null;
  const firstError = summary.error ?? amortizationError;

  function updateDevice(index: number, patch: Partial<ExpenseDeviceInputState>) {
    onChange({
      ...inputs,
      devices: inputs.devices.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  }

  function updateNutrient(index: number, patch: Partial<ExpenseNutrientInputState>) {
    onChange({
      ...inputs,
      nutrients: inputs.nutrients.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  }

  function updateSetup(index: number, patch: Partial<SimpleCostInputState>) {
    onChange({
      ...inputs,
      setup: inputs.setup.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    });
  }

  function updateRecurring(index: number, patch: Partial<RecurringCostInputState>) {
    onChange({
      ...inputs,
      recurring: inputs.recurring.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  }

  function addDevice() {
    onChange({
      ...inputs,
      devices: [
        ...inputs.devices,
        {
          id: nextId("device", inputs.devices),
          name: `Device ${inputs.devices.length + 1}`,
          actualWatts: null,
          quantity: 1,
          vegHoursPerDay: null,
          flowerHoursPerDay: null,
          vegDaysOverride: null,
          flowerDaysOverride: null,
        },
      ],
    });
  }

  function addNutrient() {
    onChange({
      ...inputs,
      nutrients: [
        ...inputs.nutrients,
        {
          id: nextId("nutrient-cost", inputs.nutrients),
          name: `Nutrient ${inputs.nutrients.length + 1}`,
          pricingMode: "package",
          packagePrice: null,
          usableAmount: null,
          unit: "ml",
          usagePerWeek: null,
          manualWeeklyCost: null,
        },
      ],
    });
  }

  function addSetup() {
    onChange({
      ...inputs,
      setup: [
        ...inputs.setup,
        {
          id: nextId("setup", inputs.setup),
          name: `Setup item ${inputs.setup.length + 1}`,
          amount: null,
        },
      ],
    });
  }

  function addRecurring() {
    onChange({
      ...inputs,
      recurring: [
        ...inputs.recurring,
        {
          id: nextId("recurring", inputs.recurring),
          name: `Recurring item ${inputs.recurring.length + 1}`,
          amount: null,
          basis: "cycle",
        },
      ],
    });
  }

  const electricityThirtyDayCost =
    summary.value?.deviceResults.reduce((total, row) => total + row.thirtyDayCost, 0) ?? 0;
  const electricityYearlyCost =
    summary.value?.deviceResults.reduce((total, row) => total + row.yearlyCost, 0) ?? 0;
  const electricityDailyKwh =
    summary.value?.deviceResults.reduce((total, row) => total + row.dailyAverageKwh, 0) ?? 0;

  return (
    <div className="space-y-6" data-testid="expense-calculator-tab">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap aria-hidden="true" className="h-5 w-5 text-primary" />
              Electricity devices
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Use actual wall draw, not HID-equivalent or advertised replacement watts.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={addDevice}>
            <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> Add device
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {inputs.devices.length === 0 ? (
            <EmptyRow text="Add lights, fans, AC, dehumidifiers, pumps, or other devices. A light plan pushed from the Light tab will appear here and stay editable." />
          ) : null}
          {inputs.devices.map((row, index) => (
            <div key={`${row.id}-${index}`} className="rounded-xl border border-border/70 p-4">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={`expense-device-${index}-name`}>Device name</Label>
                    {row.linkedFromLight ? (
                      <Badge variant="secondary">From Light plan</Badge>
                    ) : null}
                  </div>
                  <Input
                    id={`expense-device-${index}-name`}
                    value={row.name}
                    maxLength={80}
                    onChange={(event) => updateDevice(index, { name: event.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${row.name || "electricity device"}`}
                  onClick={() =>
                    onChange({
                      ...inputs,
                      devices: inputs.devices.filter((_, rowIndex) => rowIndex !== index),
                    })
                  }
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <NumberField
                  id={`expense-device-${index}-watts`}
                  label="Actual draw"
                  value={row.actualWatts}
                  onChange={(actualWatts) => updateDevice(index, { actualWatts })}
                  min={0}
                  max={100000}
                  step={1}
                  unit="W"
                  required
                />
                <NumberField
                  id={`expense-device-${index}-quantity`}
                  label="Quantity"
                  value={row.quantity}
                  onChange={(quantity) => updateDevice(index, { quantity })}
                  min={1}
                  max={1000}
                  step={1}
                  unit="devices"
                  integer
                  required
                />
                <NumberField
                  id={`expense-device-${index}-veg-hours`}
                  label="Veg hours"
                  value={row.vegHoursPerDay}
                  onChange={(vegHoursPerDay) => updateDevice(index, { vegHoursPerDay })}
                  min={0.1}
                  max={24}
                  step={0.1}
                  unit="h/day"
                  placeholder={
                    cycle.vegPhotoperiodHours === null
                      ? "Shared veg light"
                      : String(cycle.vegPhotoperiodHours)
                  }
                  help={
                    cycle.vegPhotoperiodHours === null
                      ? "Blank uses shared veg light once it is entered on the Cycle bar."
                      : `Blank uses shared veg light: ${fmt(cycle.vegPhotoperiodHours, 1)} h/day.`
                  }
                />
                <NumberField
                  id={`expense-device-${index}-flower-hours`}
                  label="Flower hours"
                  value={row.flowerHoursPerDay}
                  onChange={(flowerHoursPerDay) => updateDevice(index, { flowerHoursPerDay })}
                  min={0.1}
                  max={24}
                  step={0.1}
                  unit="h/day"
                  placeholder={
                    cycle.flowerPhotoperiodHours === null
                      ? "Shared flower light"
                      : String(cycle.flowerPhotoperiodHours)
                  }
                  help={
                    cycle.flowerPhotoperiodHours === null
                      ? "Blank uses shared flower light once it is entered on the Cycle bar."
                      : `Blank uses shared flower light: ${fmt(cycle.flowerPhotoperiodHours, 1)} h/day.`
                  }
                />
                <NumberField
                  id={`expense-device-${index}-veg-days`}
                  label="Veg days override"
                  value={row.vegDaysOverride}
                  onChange={(vegDaysOverride) => updateDevice(index, { vegDaysOverride })}
                  min={0}
                  max={365}
                  step={1}
                  unit="days"
                  integer
                  placeholder={cycle.vegDays === null ? "Cycle" : String(cycle.vegDays)}
                  help="Blank follows the shared Cycle bar."
                />
                <NumberField
                  id={`expense-device-${index}-flower-days`}
                  label="Flower days override"
                  value={row.flowerDaysOverride}
                  onChange={(flowerDaysOverride) => updateDevice(index, { flowerDaysOverride })}
                  min={0}
                  max={365}
                  step={1}
                  unit="days"
                  integer
                  placeholder={cycle.flowerDays === null ? "Cycle" : String(cycle.flowerDays)}
                  help="Blank follows the shared Cycle bar."
                />
              </div>
            </div>
          ))}
          <p className="font-mono text-xs leading-5 text-muted-foreground">
            kWh = (actual watts × quantity ÷ 1,000) × hours/day × days; cost = kWh × {currency}/kWh
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PackageOpen aria-hidden="true" className="h-5 w-5 text-primary" />
                Nutrient cost
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Price a package and weekly recipe use, or enter a manual weekly cost.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={addNutrient}>
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> Add nutrient
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {inputs.nutrients.length === 0 ? (
              <EmptyRow text="Add a bottle or bag, or push the current nutrient recipe into this section." />
            ) : null}
            {inputs.nutrients.map((row, index) => (
              <div key={`${row.id}-${index}`} className="rounded-xl border border-border/70 p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor={`expense-nutrient-${index}-name`}>Nutrient name</Label>
                      {row.linkedFromRecipe ? (
                        <Badge variant="secondary">From nutrient recipe</Badge>
                      ) : null}
                    </div>
                    <Input
                      id={`expense-nutrient-${index}-name`}
                      value={row.name}
                      maxLength={80}
                      onChange={(event) => updateNutrient(index, { name: event.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${row.name || "nutrient cost"}`}
                    onClick={() =>
                      onChange({
                        ...inputs,
                        nutrients: inputs.nutrients.filter((_, rowIndex) => rowIndex !== index),
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`expense-nutrient-${index}-mode`}>Pricing method</Label>
                    <select
                      id={`expense-nutrient-${index}-mode`}
                      value={row.pricingMode}
                      onChange={(event) =>
                        updateNutrient(index, {
                          pricingMode:
                            event.target.value === "manual_weekly" ? "manual_weekly" : "package",
                        })
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="package">Package price + recipe use</option>
                      <option value="manual_weekly">Manual cost per week</option>
                    </select>
                  </div>
                  {row.pricingMode === "package" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`expense-nutrient-${index}-unit`}>Package unit</Label>
                      <select
                        id={`expense-nutrient-${index}-unit`}
                        value={row.unit}
                        onChange={(event) =>
                          updateNutrient(index, { unit: event.target.value === "g" ? "g" : "ml" })
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="ml">milliliters</option>
                        <option value="g">grams</option>
                      </select>
                    </div>
                  ) : null}
                </div>
                {row.pricingMode === "package" ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <NumberField
                      id={`expense-nutrient-${index}-price`}
                      label={`Package price (${currency})`}
                      value={row.packagePrice}
                      onChange={(packagePrice) => updateNutrient(index, { packagePrice })}
                      min={0}
                      max={10000000}
                      step={0.01}
                      unit={currency}
                      required
                    />
                    <NumberField
                      id={`expense-nutrient-${index}-usable`}
                      label="Usable package amount"
                      value={row.usableAmount}
                      onChange={(usableAmount) => updateNutrient(index, { usableAmount })}
                      min={0.001}
                      max={1000000000}
                      step={0.01}
                      unit={row.unit}
                      required
                    />
                    <NumberField
                      id={`expense-nutrient-${index}-weekly-use`}
                      label="Recipe use per week"
                      value={row.usagePerWeek}
                      onChange={(usagePerWeek) => updateNutrient(index, { usagePerWeek })}
                      min={0}
                      max={1000000000}
                      step={0.01}
                      unit={`${row.unit}/wk`}
                      required
                    />
                  </div>
                ) : (
                  <NumberField
                    id={`expense-nutrient-${index}-manual-weekly`}
                    label={`Manual nutrient cost (${currency}/week)`}
                    value={row.manualWeeklyCost}
                    onChange={(manualWeeklyCost) => updateNutrient(index, { manualWeeklyCost })}
                    min={0}
                    max={10000000}
                    step={0.01}
                    unit={`${currency}/wk`}
                    required
                  />
                )}
              </div>
            ))}
            <p className="font-mono text-xs leading-5 text-muted-foreground">
              package weekly cost = (package price ÷ usable amount) × recipe use/week; manual weekly
              cost = your entered {currency}/week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Droplets aria-hidden="true" className="h-5 w-5 text-primary" />
              Water
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Leave all three blank to exclude water. Starting the row makes all three required.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                id="expense-water-price"
                label={`Water price (${currency}/${waterUnit})`}
                value={inputs.waterPricePerGallon}
                onChange={(waterPricePerGallon) => onChange({ ...inputs, waterPricePerGallon })}
                min={0}
                max={100000}
                step={0.001}
                unit={`${currency}/${waterUnit}`}
                required={waterStarted}
              />
              <NumberField
                id="expense-water-gallons"
                label="Water per reservoir change"
                value={inputs.waterGallonsPerChange}
                onChange={(waterGallonsPerChange) => onChange({ ...inputs, waterGallonsPerChange })}
                min={0}
                max={1000000}
                step={0.01}
                unit={`${waterUnit}/change`}
                required={waterStarted}
              />
              <NumberField
                id="expense-water-changes"
                label="Reservoir changes"
                value={inputs.waterChangesPerWeek}
                onChange={(waterChangesPerWeek) => onChange({ ...inputs, waterChangesPerWeek })}
                min={0}
                max={1000}
                step={0.01}
                unit="changes/wk"
                required={waterStarted}
              />
            </div>
            <p className="font-mono text-xs leading-5 text-muted-foreground">
              water cost = {currency}/{waterUnit} × {waterUnit}/change × changes/week × cycle weeks
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <LineItemCard
          title="One-time setup"
          description="Equipment and setup paid once. Included in the first-cycle total and amortized view."
          icon={<Banknote aria-hidden="true" className="h-5 w-5 text-primary" />}
          addLabel="Add setup item"
          onAdd={addSetup}
          emptyText="No one-time setup cost entered."
          hasItems={inputs.setup.length > 0}
        >
          {inputs.setup.map((row, index) => (
            <SimpleCostRow
              key={`${row.id}-${index}`}
              idPrefix={`expense-setup-${index}`}
              name={row.name}
              amount={row.amount}
              amountLabel={`Amount (${currency})`}
              amountUnit={currency}
              onNameChange={(name) => updateSetup(index, { name })}
              onAmountChange={(amount) => updateSetup(index, { amount })}
              onRemove={() =>
                onChange({
                  ...inputs,
                  setup: inputs.setup.filter((_, rowIndex) => rowIndex !== index),
                })
              }
            />
          ))}
          <p className="font-mono text-xs leading-5 text-muted-foreground">
            setup total = sum of one-time item amounts
          </p>
        </LineItemCard>

        <LineItemCard
          title="Other recurring"
          description="Costs that repeat once per cycle or once per 30-day month."
          icon={<ReceiptText aria-hidden="true" className="h-5 w-5 text-primary" />}
          addLabel="Add recurring item"
          onAdd={addRecurring}
          emptyText="No other recurring cost entered."
          hasItems={inputs.recurring.length > 0}
        >
          {inputs.recurring.map((row, index) => (
            <div key={`${row.id}-${index}`} className="rounded-xl border border-border/70 p-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_9rem_auto] sm:items-end">
                <TextField
                  id={`expense-recurring-${index}-name`}
                  label="Item name"
                  value={row.name}
                  onChange={(name) => updateRecurring(index, { name })}
                />
                <NumberField
                  id={`expense-recurring-${index}-amount`}
                  label={`Amount (${currency})`}
                  value={row.amount}
                  onChange={(amount) => updateRecurring(index, { amount })}
                  min={0}
                  max={1000000000}
                  step={0.01}
                  unit={currency}
                  required
                />
                <div className="space-y-1.5">
                  <Label htmlFor={`expense-recurring-${index}-basis`}>Repeats</Label>
                  <select
                    id={`expense-recurring-${index}-basis`}
                    value={row.basis}
                    onChange={(event) =>
                      updateRecurring(index, {
                        basis: event.target.value === "month" ? "month" : "cycle",
                      })
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="cycle">per cycle</option>
                    <option value="month">per month</option>
                  </select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${row.name || "recurring cost"}`}
                  onClick={() =>
                    onChange({
                      ...inputs,
                      recurring: inputs.recurring.filter((_, rowIndex) => rowIndex !== index),
                    })
                  }
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <p className="font-mono text-xs leading-5 text-muted-foreground">
            cycle recurring = per-cycle amount + monthly amount × cycle days ÷ 30
          </p>
        </LineItemCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Harvest weight and comparison</CardTitle>
          <p className="text-sm text-muted-foreground">
            Unit costs use dried saleable harvest weight only—never wet weight. No yield or market
            price is prefilled.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="expense-dried-grams"
            label="Dried saleable harvest"
            value={inputs.driedSaleableGrams}
            onChange={(driedSaleableGrams) => onChange({ ...inputs, driedSaleableGrams })}
            min={0.01}
            max={1000000000}
            step={0.01}
            unit="dry g"
            help="Required only for cost per g, oz, lb, and kg. Do not enter wet harvest weight."
          />
          <div>
            <NumberField
              id="expense-amortization-cycles"
              label="Setup amortization"
              value={inputs.amortizationCycles}
              onChange={(amortizationCycles) => onChange({ ...inputs, amortizationCycles })}
              min={1}
              max={1000}
              step={1}
              unit="cycles"
              integer
              required
              help="Spreads one-time setup evenly across this many cycles."
            />
            {amortizationError ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {amortizationError}
              </p>
            ) : null}
          </div>
          <div>
            <NumberField
              id="expense-compare-price"
              label={`Optional compare-at (${currency}/g)`}
              value={inputs.compareAtPricePerGram}
              onChange={(compareAtPricePerGram) => onChange({ ...inputs, compareAtPricePerGram })}
              min={0}
              max={1000000}
              step={0.01}
              unit={`${currency}/g`}
              help="Your number only. This app does not supply a market, street, or dispensary price."
            />
            {comparisonNeedsWeight ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                Enter dried saleable grams to use your compare-at price.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {summary.value ? (
        <ResultBlock
          eyebrow="This cycle including one-time setup"
          value={formatMoney(summary.value.firstCycleCost, currency)}
          unit={currency}
          formula="first-cycle cost = electricity + nutrients + water + recurring costs + all one-time setup"
          testId="expense-primary-result"
        >
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              Operating {formatMoney(summary.value.operatingCycleCost, currency)} / cycle
            </Badge>
            <Badge variant="outline">
              Setup {formatMoney(summary.value.setupCost, currency)} once
            </Badge>
            <Badge variant="secondary">
              Amortized over {inputs.amortizationCycles} cycles:{" "}
              {formatMoney(summary.value.amortizedCycleCost, currency)} / cycle
            </Badge>
          </div>
        </ResultBlock>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-6">
            <p className="font-medium">Three inputs matter most</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add veg and flower days plus the electricity rate in the shared Cycle bar, then enter
              actual device watts. Complete any line item you start; dried saleable grams are needed
              only for unit costs.
            </p>
          </CardContent>
        </Card>
      )}

      {firstError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {firstError}
        </p>
      ) : null}

      {summary.value ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Electricity by phase and horizon</CardTitle>
              <p className="text-sm text-muted-foreground">
                Phase totals use each row’s overrides when entered; blanks follow the shared cycle.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Metric
                  label="Veg"
                  value={`${fmt(summary.value.electricityVegKwh)} kWh · ${formatMoney(summary.value.electricityVegCost, currency)}`}
                />
                <Metric
                  label="Flower"
                  value={`${fmt(summary.value.electricityFlowerKwh)} kWh · ${formatMoney(summary.value.electricityFlowerCost, currency)}`}
                />
                <Metric
                  label="Cycle"
                  value={`${fmt(summary.value.electricityCycleKwh)} kWh · ${formatMoney(summary.value.electricityCycleCost, currency)}`}
                />
                <Metric
                  label="Daily equivalent"
                  value={`${fmt(electricityDailyKwh)} kWh/day · ${formatMoney(electricityDailyKwh * (cycle.electricityRate ?? 0), currency)}/day`}
                />
                <Metric
                  label="30-day equivalent"
                  value={`${fmt(summary.value.electricityThirtyDayKwh)} kWh · ${formatMoney(electricityThirtyDayCost, currency)}`}
                />
                <Metric
                  label="365-day equivalent"
                  value={`${fmt(summary.value.electricityYearlyKwh)} kWh · ${formatMoney(electricityYearlyCost, currency)}`}
                />
              </dl>
              <p className="font-mono text-xs leading-5 text-muted-foreground">
                phase kWh = Σ device kWh for that phase; equivalent horizons = average cycle kWh/day
                × 30 or 365; cost = kWh × {currency}/kWh
              </p>

              {summary.value.deviceResults.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {summary.value.deviceResults.map((row, index) => (
                    <div
                      key={`${row.id}-${index}`}
                      className="rounded-xl border border-border/70 p-4"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{row.name || `Device ${index + 1}`}</p>
                        <Badge variant="outline">
                          {fmt(row.actualWatts * row.quantity, 0)} W total draw
                        </Badge>
                        {row.linkedFromLight ? <Badge variant="secondary">Light plan</Badge> : null}
                      </div>
                      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        <Metric
                          compact
                          label="Veg"
                          value={`${fmt(row.vegKwh)} kWh · ${formatMoney(row.vegCost, currency)}`}
                        />
                        <Metric
                          compact
                          label="Flower"
                          value={`${fmt(row.flowerKwh)} kWh · ${formatMoney(row.flowerCost, currency)}`}
                        />
                        <Metric
                          compact
                          label="Cycle"
                          value={`${fmt(row.cycleKwh)} kWh · ${formatMoney(row.cycleCost, currency)}`}
                        />
                        <Metric
                          compact
                          label="Daily average"
                          value={`${fmt(row.dailyAverageKwh)} kWh/day · ${formatMoney(row.dailyAverageKwh * (cycle.electricityRate ?? 0), currency)}/day`}
                        />
                        <Metric
                          compact
                          label="30-day equivalent"
                          value={`${fmt(row.thirtyDayKwh)} kWh · ${formatMoney(row.thirtyDayCost, currency)}`}
                        />
                        <Metric
                          compact
                          label="365-day equivalent"
                          value={`${fmt(row.yearlyKwh)} kWh · ${formatMoney(row.yearlyCost, currency)}`}
                        />
                      </dl>
                      <p className="mt-3 font-mono text-xs leading-5 text-muted-foreground">
                        {row.formula}; cost = kWh × {currency}/kWh
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyRow text="No electricity device rows are included yet; electricity totals are zero." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost sheet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Cycle categories
                </p>
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Metric
                    label="Electricity"
                    value={`${formatMoney(summary.value.electricityCycleCost, currency)} / cycle`}
                  />
                  <Metric
                    label="Nutrients"
                    value={`${formatMoney(summary.value.nutrientCycleCost, currency)} / cycle`}
                  />
                  <Metric
                    label="Water"
                    value={`${formatMoney(summary.value.waterCycleCost, currency)} / cycle`}
                  />
                  <Metric
                    label="Other recurring"
                    value={`${formatMoney(summary.value.recurringCycleCost, currency)} / cycle`}
                  />
                  <Metric
                    label="One-time setup"
                    value={`${formatMoney(summary.value.setupCost, currency)} once`}
                  />
                </dl>
                <p className="mt-3 font-mono text-xs leading-5 text-muted-foreground">
                  operating cycle = electricity + nutrients + water + cycle-adjusted recurring costs
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Operating horizons
                </p>
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Metric
                    label="Operating cycle"
                    value={`${formatMoney(summary.value.operatingCycleCost, currency)} / cycle`}
                  />
                  <Metric
                    label="First cycle"
                    value={`${formatMoney(summary.value.firstCycleCost, currency)} incl. setup`}
                  />
                  <Metric
                    label={`Amortized over ${inputs.amortizationCycles}`}
                    value={`${formatMoney(summary.value.amortizedCycleCost, currency)} / cycle`}
                  />
                  <Metric
                    label="30-day operating"
                    value={`${formatMoney(summary.value.thirtyDayOperatingCost, currency)} / 30 days`}
                  />
                  <Metric
                    label="365-day operating"
                    value={`${formatMoney(summary.value.yearlyOperatingCost, currency)} / 365 days`}
                  />
                </dl>
                <p className="mt-3 font-mono text-xs leading-5 text-muted-foreground">
                  amortized cycle = operating cycle + one-time setup ÷ {inputs.amortizationCycles}{" "}
                  cycles; 30/365-day views exclude one-time setup
                </p>
              </div>

              {summary.value.nutrientResults.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Nutrient line results
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {summary.value.nutrientResults.map((row, index) => (
                      <div
                        key={`${row.id}-${index}`}
                        className="rounded-lg border border-border/60 p-3"
                      >
                        <p className="font-medium">{row.name || `Nutrient ${index + 1}`}</p>
                        <p className="mt-1 text-sm tabular-nums">
                          {formatMoney(row.weeklyCost, currency)} / week ·{" "}
                          {formatMoney(row.cycleCost, currency)} / cycle ·{" "}
                          {formatMoney(row.thirtyDayCost, currency)} / 30 days ·{" "}
                          {formatMoney(row.yearlyCost, currency)} / 365 days
                        </p>
                        <p className="mt-2 font-mono text-xs leading-5 text-muted-foreground">
                          {row.pricingMode === "manual_weekly"
                            ? `cycle cost = user-entered ${currency}/week × cycle days ÷ 7`
                            : row.formula}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {waterStarted ? (
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="font-medium">Water result</p>
                  <p className="mt-1 text-sm tabular-nums">
                    {fmt(summary.value.waterResult.weeklyGallons)} {waterUnit}/week ·{" "}
                    {formatMoney(summary.value.waterResult.cycleCost, currency)} / cycle ·{" "}
                    {formatMoney(summary.value.waterResult.thirtyDayCost, currency)} / 30 days ·{" "}
                    {formatMoney(summary.value.waterResult.yearlyCost, currency)} / 365 days
                  </p>
                  <p className="mt-2 font-mono text-xs leading-5 text-muted-foreground">
                    water cost = {currency}/{waterUnit} × {waterUnit}/change × changes/week × cycle
                    weeks
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost per dried saleable unit</CardTitle>
              <p className="text-sm text-muted-foreground">
                All rows divide by your dried saleable grams. These are accounting results, not
                yield promises.
              </p>
            </CardHeader>
            <CardContent>
              {summary.value.firstCycleUnitCosts &&
              summary.value.operatingUnitCosts &&
              summary.value.amortizedUnitCosts ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="border-b border-border p-3 font-semibold">Cost view</th>
                        <th className="border-b border-border p-3 font-semibold">{currency}/g</th>
                        <th className="border-b border-border p-3 font-semibold">
                          {currency}/oz · 28.3495 g
                        </th>
                        <th className="border-b border-border p-3 font-semibold">{currency}/lb</th>
                        <th className="border-b border-border p-3 font-semibold">{currency}/kg</th>
                      </tr>
                    </thead>
                    <tbody>
                      <UnitCostRow
                        label="First cycle · includes all setup"
                        costs={summary.value.firstCycleUnitCosts}
                        currency={currency}
                      />
                      <UnitCostRow
                        label="Operating only"
                        costs={summary.value.operatingUnitCosts}
                        currency={currency}
                      />
                      <UnitCostRow
                        label={`Amortized · setup ÷ ${inputs.amortizationCycles}`}
                        costs={summary.value.amortizedUnitCosts}
                        currency={currency}
                      />
                    </tbody>
                    <caption className="caption-bottom pt-3 text-left font-mono text-xs leading-5 text-muted-foreground">
                      cost/g = selected total cost ÷ dried saleable grams; cost/oz = cost/g ×
                      28.3495; cost/lb = cost/g × 453.59237; cost/kg = cost/g × 1,000
                    </caption>
                  </table>
                </div>
              ) : (
                <EmptyRow text="Enter dried saleable harvest grams above to calculate cost per g, oz, lb, and kg. Wet weight is not accepted for these results." />
              )}
            </CardContent>
          </Card>

          {summary.value.compareAtHarvestValue !== null ? (
            <Card>
              <CardHeader>
                <CardTitle>Your optional comparison</CardTitle>
                <p className="text-sm text-muted-foreground">
                  User-entered numbers only. This arithmetic scenario is not supplied market data, a
                  yield promise, or a forecast of future returns.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Metric
                    label="Your compare-at input"
                    value={`${formatMoney(inputs.compareAtPricePerGram ?? 0, currency, 4)} / dry g`}
                  />
                  <Metric
                    label="Comparison harvest value"
                    value={formatMoney(summary.value.compareAtHarvestValue, currency)}
                  />
                  {summary.value.operatingCycleSavings !== null ? (
                    <Metric
                      label="Operating-cycle savings"
                      value={`${formatMoney(summary.value.operatingCycleSavings, currency)} / cycle`}
                    />
                  ) : null}
                  {summary.value.operatingRoiPercent !== null ? (
                    <Metric
                      label="Operating ROI"
                      value={`${fmt(summary.value.operatingRoiPercent, 2)}%`}
                    />
                  ) : null}
                  {summary.value.setupPaybackCycles !== null ? (
                    <Metric
                      label="Setup payback"
                      value={`${fmt(summary.value.setupPaybackCycles, 2)} cycles`}
                    />
                  ) : null}
                </dl>
                <div className="space-y-1 font-mono text-xs leading-5 text-muted-foreground">
                  <p>{EXPENSE_COMPARISON_FORMULAS.comparisonValue}</p>
                  {summary.value.operatingCycleSavings !== null ? (
                    <p>{EXPENSE_COMPARISON_FORMULAS.operatingSavings}</p>
                  ) : null}
                  {summary.value.operatingRoiPercent !== null ? (
                    <p>{EXPENSE_COMPARISON_FORMULAS.operatingRoi}</p>
                  ) : null}
                  {summary.value.setupPaybackCycles !== null ? (
                    <p>{EXPENSE_COMPARISON_FORMULAS.setupPayback}</p>
                  ) : null}
                </div>
                {summary.value.setupPaybackCycles === null ? (
                  <p className="text-xs text-muted-foreground">
                    Setup payback is shown only when setup cost and operating-cycle savings are both
                    positive.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function Metric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border/60 bg-background/60 ${compact ? "p-2.5" : "p-3"}`}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        maxLength={80}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function SimpleCostRow({
  idPrefix,
  name,
  amount,
  amountLabel,
  amountUnit,
  onNameChange,
  onAmountChange,
  onRemove,
}: {
  idPrefix: string;
  name: string;
  amount: number | null;
  amountLabel: string;
  amountUnit: string;
  onNameChange: (name: string) => void;
  onAmountChange: (amount: number | null) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] sm:items-end">
        <TextField id={`${idPrefix}-name`} label="Item name" value={name} onChange={onNameChange} />
        <NumberField
          id={`${idPrefix}-amount`}
          label={amountLabel}
          value={amount}
          onChange={onAmountChange}
          min={0}
          max={1000000000}
          step={0.01}
          unit={amountUnit}
          required
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${name || "cost item"}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function LineItemCard({
  title,
  description,
  icon,
  addLabel,
  onAdd,
  emptyText,
  hasItems,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  addLabel: string;
  onAdd: () => void;
  emptyText: string;
  hasItems: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" onClick={onAdd}>
          <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> {addLabel}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasItems ? <EmptyRow text={emptyText} /> : null}
        {children}
      </CardContent>
    </Card>
  );
}

function UnitCostRow({
  label,
  costs,
  currency,
}: {
  label: string;
  costs: NonNullable<ExpenseSummary["firstCycleUnitCosts"]>;
  currency: string;
}) {
  return (
    <tr>
      <th className="border-b border-border/60 p-3 font-medium">{label}</th>
      <td className="border-b border-border/60 p-3 tabular-nums">
        {formatMoney(costs.perGram, currency, 4)} / g
      </td>
      <td className="border-b border-border/60 p-3 tabular-nums">
        {formatMoney(costs.perOunce, currency)} / oz
      </td>
      <td className="border-b border-border/60 p-3 tabular-nums">
        {formatMoney(costs.perPound, currency)} / lb
      </td>
      <td className="border-b border-border/60 p-3 tabular-nums">
        {formatMoney(costs.perKilogram, currency)} / kg
      </td>
    </tr>
  );
}
