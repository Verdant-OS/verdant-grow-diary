import { useMemo } from "react";
import { AlertTriangle, ArrowDown, Beaker, Plus, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ExpenseNutrientInputState,
  NutrientInputs,
  UnitSystem,
} from "@/lib/growHelpToolkitState";
import {
  JACKS_321_STYLE_PRESET,
  STAGE_EC_REFERENCES,
  calculateC1V1,
  calculateEcTargetRecipe,
  calculateInjectorPlan,
  calculateLabelRateRecipe,
  convertReservoirVolumeValue,
  convertNutrientStrength,
  remainingEcToTarget,
  scaleDrySaltRecipe,
  stageReferenceMidpoint,
  type DrySaltResultRow,
  type EcTargetRecipeResult,
  type LabelRateRecipeResult,
} from "@/lib/nutrientCalc";
import {
  MEASURED_MIXED_EC_SOURCE,
  MEASURED_MIXED_EC_SOURCE_LABEL,
  nutrientInjectorReadiness,
  isValidMeasuredMixedEc,
} from "@/lib/growHelpToolkitReadiness";
import { ppm500, ppm700 } from "@/lib/unitsCalc";
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
    return { value: null, error: error instanceof Error ? error.message : "Check the inputs." };
  }
}

function requireRange(label: string, value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be between ${min} and ${max}.`);
  }
  return value;
}

function fmt(value: number, digits = 2): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function nextId(prefix: string, existing: ReadonlyArray<{ id: string }>): string {
  let index = existing.length + 1;
  while (existing.some((row) => row.id === `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

const MODE_OPTIONS: ReadonlyArray<{ value: NutrientInputs["mode"]; label: string }> = [
  { value: "label", label: "Label rate" },
  { value: "ec_target", label: "EC target" },
  { value: "c1v1", label: "C1V1 dilution" },
  { value: "dry_salt", label: "Dry salt / 321" },
  { value: "converter", label: "EC / PPM converter" },
];

const EMPTY_STATE_INPUTS: Record<NutrientInputs["mode"], readonly [string, string, string]> = {
  label: ["Working reservoir volume", "Dose printed on your product", "Dose unit for each part"],
  ec_target: [
    "Working reservoir volume",
    "Source-water and target EC",
    "Each part's EC calibration and ratio",
  ],
  c1v1: [
    "Stock concentration (C1)",
    "Target concentration (C2)",
    "Final volume (V2) and its matching unit",
  ],
  dry_salt: [
    "Working reservoir volume",
    "Recipe rate in g/gal for each salt",
    "The order each salt will be mixed",
  ],
  converter: [
    "Reading shown on the meter",
    "Input scale shown by the meter",
    "Known 500 or 700 scale when the reading is PPM",
  ],
};

export interface NutrientCalculatorTabProps {
  inputs: NutrientInputs;
  unitSystem: UnitSystem;
  onChange: (inputs: NutrientInputs) => void;
  onPushRecipe: (rows: ExpenseNutrientInputState[]) => void;
}

export default function NutrientCalculatorTab({
  inputs,
  unitSystem,
  onChange,
  onPushRecipe,
}: NutrientCalculatorTabProps) {
  const volumeReady = inputs.reservoirValue !== null && inputs.reservoirValue > 0;
  const volume = useMemo(
    () => ({ value: inputs.reservoirValue ?? 0, unit: inputs.reservoirUnit }) as const,
    [inputs.reservoirUnit, inputs.reservoirValue],
  );

  const label = useMemo(
    () =>
      attempt<LabelRateRecipeResult>(
        volumeReady && inputs.labelParts.every((row) => row.dose !== null && row.dose >= 0),
        () =>
          calculateLabelRateRecipe(
            inputs.labelParts.map((row) => ({ ...row, dose: row.dose as number })),
            volume,
          ),
      ),
    [inputs.labelParts, volume, volumeReady],
  );

  const targetStrength = useMemo(
    () =>
      attempt(inputs.targetEc !== null, () =>
        convertNutrientStrength(
          requireRange("Target EC", inputs.targetEc as number, 0.01, 10),
          "ec",
        ),
      ),
    [inputs.targetEc],
  );

  const measuredMixedEc = useMemo(
    () =>
      attempt(inputs.measuredMixedEc !== null, () =>
        requireRange("Measured mixed EC", inputs.measuredMixedEc as number, 0, 10),
      ),
    [inputs.measuredMixedEc],
  );

  const ecTarget = useMemo(
    () =>
      attempt<EcTargetRecipeResult>(
        volumeReady &&
          inputs.sourceWaterEc !== null &&
          targetStrength.value !== null &&
          inputs.ecParts.every(
            (row) => row.ecPerMlPerL !== null && (row.ratio === undefined || row.ratio !== null),
          ),
        () =>
          calculateEcTargetRecipe(
            requireRange("Source-water EC", inputs.sourceWaterEc as number, 0, 10),
            targetStrength.value?.ecMsCm as number,
            inputs.ecParts.map((row) => ({
              ...row,
              ecPerMlPerL: requireRange(
                `${row.name || "Nutrient"} EC calibration`,
                row.ecPerMlPerL as number,
                0.0001,
                10,
              ),
              ratio: requireRange(
                `${row.name || "Nutrient"} ratio`,
                row.ratio === undefined ? 1 : (row.ratio as number),
                0.0001,
                1000,
              ),
            })),
            volume,
          ),
      ),
    [inputs.ecParts, inputs.sourceWaterEc, targetStrength.value, volume, volumeReady],
  );

  const c1v1Unit = inputs.c1v1Unit.trim();
  const dilution = useMemo(
    () =>
      attempt(
        inputs.c1 !== null && inputs.c2 !== null && inputs.v2 !== null && c1v1Unit.length > 0,
        () => calculateC1V1(inputs.c1 as number, inputs.c2 as number, inputs.v2 as number),
      ),
    [c1v1Unit, inputs.c1, inputs.c2, inputs.v2],
  );

  const drySalt = useMemo(
    () =>
      attempt<DrySaltResultRow[]>(
        volumeReady &&
          inputs.drySaltRows.every((row) => row.gramsPerGallon !== null && row.gramsPerGallon >= 0),
        () =>
          scaleDrySaltRecipe(
            inputs.drySaltRows.map((row) => ({
              id: row.id,
              name: row.name,
              gramsPerGallon: row.gramsPerGallon as number,
              mixOrder: row.mixOrder,
            })),
            volume,
          ),
      ),
    [inputs.drySaltRows, volume, volumeReady],
  );

  const injector = useMemo(
    () =>
      attempt(volumeReady && nutrientInjectorReadiness(inputs).ready, () =>
        calculateInjectorPlan(
          inputs.stockGramsPerGallon as number,
          inputs.injectorRatio as number,
          volume,
        ),
      ),
    [inputs, volume, volumeReady],
  );

  const conversion = useMemo(
    () =>
      attempt(inputs.converterValue !== null, () =>
        convertNutrientStrength(inputs.converterValue as number, inputs.converterKind),
      ),
    [inputs.converterKind, inputs.converterValue],
  );

  const remainingEc = useMemo(
    () =>
      attempt(targetStrength.value !== null && measuredMixedEc.value !== null, () =>
        remainingEcToTarget(
          targetStrength.value?.ecMsCm as number,
          measuredMixedEc.value as number,
        ),
      ),
    [measuredMixedEc.value, targetStrength.value],
  );

  function buildCostRows(): ExpenseNutrientInputState[] {
    const changes = inputs.changesPerWeek ?? 0;
    if (changes <= 0) return [];
    if (inputs.mode === "label" && label.value) {
      return label.value.rows.map((row) => ({
        id: `recipe-${row.id}`,
        name: row.name,
        pricingMode: "package",
        packagePrice: null,
        usableAmount: null,
        unit: row.amountUnit,
        usagePerWeek: row.amount * changes,
        manualWeeklyCost: null,
        linkedFromRecipe: true,
      }));
    }
    if (inputs.mode === "ec_target" && ecTarget.value) {
      return ecTarget.value.rows.map((row) => ({
        id: `recipe-${row.id}`,
        name: row.name,
        pricingMode: "package",
        packagePrice: null,
        usableAmount: null,
        unit: "ml",
        usagePerWeek: row.reservoirMl * changes,
        manualWeeklyCost: null,
        linkedFromRecipe: true,
      }));
    }
    if (inputs.mode === "dry_salt" && drySalt.value) {
      return drySalt.value.map((row) => {
        const source = inputs.drySaltRows.find((candidate) => candidate.id === row.id);
        return {
          id: `recipe-${row.id}`,
          name: row.name,
          pricingMode: "package" as const,
          packagePrice: null,
          usableAmount: source?.bagSizeGrams ?? null,
          unit: "g" as const,
          usagePerWeek: row.reservoirGrams * changes,
          manualWeeklyCost: null,
          linkedFromRecipe: true,
        };
      });
    }
    return [];
  }

  const costRows = buildCostRows();
  const hasRecipeResult = costRows.length > 0;
  const hasPrimaryResult =
    (inputs.mode === "label" && label.value !== null) ||
    (inputs.mode === "ec_target" && ecTarget.value !== null && targetStrength.value !== null) ||
    (inputs.mode === "c1v1" && dilution.value !== null) ||
    (inputs.mode === "dry_salt" && drySalt.value !== null) ||
    (inputs.mode === "converter" && conversion.value !== null);

  return (
    <div className="space-y-6" data-testid="nutrient-calculator-tab">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Beaker aria-hidden="true" className="h-5 w-5 text-primary" />
              Nutrient recipe inputs
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <NumberField
              id="nutrient-working-volume"
              label="Working reservoir volume"
              value={inputs.reservoirValue}
              onChange={(reservoirValue) => onChange({ ...inputs, reservoirValue })}
              min={0.1}
              max={100000}
              step={0.1}
              unit={inputs.reservoirUnit}
              required={inputs.mode !== "converter" && inputs.mode !== "c1v1"}
              help="Use the water you will actually mix, not the bucket or tank maximum."
            />
            <div className="space-y-1.5">
              <Label htmlFor="nutrient-volume-unit">Reservoir unit</Label>
              <select
                id="nutrient-volume-unit"
                value={inputs.reservoirUnit}
                onChange={(event) => {
                  const reservoirUnit = event.target.value === "L" ? "L" : "gal";
                  onChange({
                    ...inputs,
                    reservoirValue: convertReservoirVolumeValue(
                      inputs.reservoirValue,
                      inputs.reservoirUnit,
                      reservoirUnit,
                    ),
                    reservoirUnit,
                  });
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="gal">US gallons</option>
                <option value="L">Liters</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Global preference: {unitSystem === "us" ? "US" : "metric"}.
              </p>
            </div>
            <NumberField
              id="nutrient-changes-per-week"
              label="Reservoir mixes per week"
              value={inputs.changesPerWeek}
              onChange={(changesPerWeek) => onChange({ ...inputs, changesPerWeek })}
              min={0}
              max={28}
              step={0.25}
              unit="/ week"
              help="Needed only when pushing recipe use into Expense."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Calculation mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {MODE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={inputs.mode === option.value ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => onChange({ ...inputs, mode: option.value })}
                aria-pressed={inputs.mode === option.value}
              >
                {option.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {inputs.mode === "label" ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Label rate · N parts</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the rate printed on your own product. No feed chart is copied or locked in.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange({
                  ...inputs,
                  labelParts: [
                    ...inputs.labelParts,
                    {
                      id: nextId("label", inputs.labelParts),
                      name: `Part ${inputs.labelParts.length + 1}`,
                      dose: null,
                      unit: inputs.reservoirUnit === "L" ? "ml/L" : "ml/gal",
                    },
                  ],
                })
              }
              disabled={inputs.labelParts.length >= 12}
            >
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> Add part
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {inputs.labelParts.map((part, index) => (
              <div
                key={part.id}
                className="grid gap-3 rounded-xl border border-border/60 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_auto]"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`label-name-${part.id}`}>Part name</Label>
                  <Input
                    id={`label-name-${part.id}`}
                    value={part.name}
                    maxLength={80}
                    onChange={(event) =>
                      onChange({
                        ...inputs,
                        labelParts: inputs.labelParts.map((row) =>
                          row.id === part.id ? { ...row, name: event.target.value } : row,
                        ),
                      })
                    }
                  />
                </div>
                <NumberField
                  id={`label-dose-${part.id}`}
                  label="Label dose"
                  value={part.dose}
                  onChange={(dose) =>
                    onChange({
                      ...inputs,
                      labelParts: inputs.labelParts.map((row) =>
                        row.id === part.id ? { ...row, dose } : row,
                      ),
                    })
                  }
                  min={0}
                  max={100000}
                  step={0.01}
                  unit={part.unit}
                  required
                />
                <div className="space-y-1.5">
                  <Label htmlFor={`label-unit-${part.id}`}>Dose unit</Label>
                  <select
                    id={`label-unit-${part.id}`}
                    value={part.unit}
                    onChange={(event) =>
                      onChange({
                        ...inputs,
                        labelParts: inputs.labelParts.map((row) =>
                          row.id === part.id
                            ? { ...row, unit: event.target.value as typeof part.unit }
                            : row,
                        ),
                      })
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="ml/L">mL/L</option>
                    <option value="ml/gal">mL/gal</option>
                    <option value="g/gal">g/gal</option>
                    <option value="tsp/gal">tsp/gal</option>
                  </select>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="self-end"
                  onClick={() =>
                    onChange({
                      ...inputs,
                      labelParts: inputs.labelParts.filter((row) => row.id !== part.id),
                    })
                  }
                  disabled={inputs.labelParts.length === 1}
                  aria-label={`Remove ${part.name || `part ${index + 1}`}`}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {inputs.mode === "ec_target" ? (
        <Card>
          <CardHeader>
            <CardTitle>EC target · ratio-weighted 1–3 parts</CardTitle>
            <p className="text-sm text-muted-foreground">
              EC (mS/cm) is the direct strength. PPM below is always derived and scale-labeled.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                id="nutrient-water-ec"
                label="Source-water EC"
                value={inputs.sourceWaterEc}
                onChange={(sourceWaterEc) => onChange({ ...inputs, sourceWaterEc })}
                min={0}
                max={10}
                step={0.01}
                unit="mS/cm"
                required
              />
              <NumberField
                id="nutrient-target-ec"
                label="Target EC"
                value={inputs.targetEc}
                onChange={(targetEc) => onChange({ ...inputs, targetEc })}
                min={0.01}
                max={10}
                step={0.01}
                unit="mS/cm"
                required
              />
              <NumberField
                id="nutrient-measured-ec"
                label="Measured mixed EC"
                value={inputs.measuredMixedEc}
                onChange={(measuredMixedEc) => onChange({ ...inputs, measuredMixedEc })}
                min={0}
                max={10}
                step={0.01}
                unit="mS/cm"
                help="Optional grower-entered reading stored only in this browser. Manual data — not a live sensor or telemetry feed. Shows remaining or overshoot versus target."
              />
            </div>
            <div>
              <p className="text-sm font-medium">
                Typical starting references · click to fill midpoint
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {STAGE_EC_REFERENCES.map((reference) => (
                  <Button
                    key={reference.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto whitespace-normal py-2"
                    onClick={() =>
                      onChange({ ...inputs, targetEc: stageReferenceMidpoint(reference) })
                    }
                  >
                    <span className="text-left">
                      <span className="block">
                        {reference.label} {reference.minEc}–{reference.maxEc} mS/cm EC
                      </span>
                      <span className="block text-[11px] font-normal opacity-80">
                        Derived PPM500 {fmt(ppm500(reference.minEc), 0)}–
                        {fmt(ppm500(reference.maxEc), 0)} ppm · PPM700{" "}
                        {fmt(ppm700(reference.minEc), 0)}–{fmt(ppm700(reference.maxEc), 0)} ppm
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                These are starting ranges, not guarantees. The filled midpoint is editable.
              </p>
            </div>
            <section
              aria-labelledby="elemental-targets-heading"
              className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"
            >
              <div>
                <h3 id="elemental-targets-heading" className="text-sm font-medium">
                  Optional elemental planning notes
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Grower-entered N, P, and K targets are not included in EC dose math, do not
                  calculate a dose, and do not confirm achieved elemental ppm without product
                  analysis.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <NumberField
                  id="elemental-target-n"
                  label="Target N"
                  value={inputs.elementalTargetsPpm.nitrogen}
                  onChange={(nitrogen) =>
                    onChange({
                      ...inputs,
                      elementalTargetsPpm: { ...inputs.elementalTargetsPpm, nitrogen },
                    })
                  }
                  min={0}
                  max={10000}
                  step={1}
                  unit="ppm"
                />
                <NumberField
                  id="elemental-target-p"
                  label="Target P"
                  value={inputs.elementalTargetsPpm.phosphorus}
                  onChange={(phosphorus) =>
                    onChange({
                      ...inputs,
                      elementalTargetsPpm: { ...inputs.elementalTargetsPpm, phosphorus },
                    })
                  }
                  min={0}
                  max={10000}
                  step={1}
                  unit="ppm"
                />
                <NumberField
                  id="elemental-target-k"
                  label="Target K"
                  value={inputs.elementalTargetsPpm.potassium}
                  onChange={(potassium) =>
                    onChange({
                      ...inputs,
                      elementalTargetsPpm: { ...inputs.elementalTargetsPpm, potassium },
                    })
                  }
                  min={0}
                  max={10000}
                  step={1}
                  unit="ppm"
                />
              </div>
            </section>
            <div className="space-y-3">
              {inputs.ecParts.map((part, index) => (
                <div
                  key={part.id}
                  className="grid gap-3 rounded-xl border border-border/60 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(8rem,0.6fr)_auto]"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor={`ec-part-name-${part.id}`}>Part name</Label>
                    <Input
                      id={`ec-part-name-${part.id}`}
                      value={part.name}
                      maxLength={80}
                      onChange={(event) =>
                        onChange({
                          ...inputs,
                          ecParts: inputs.ecParts.map((row) =>
                            row.id === part.id ? { ...row, name: event.target.value } : row,
                          ),
                        })
                      }
                    />
                  </div>
                  <NumberField
                    id={`ec-calibration-${part.id}`}
                    label="EC raised by 1.00 mL in 1.00 L RO"
                    value={part.ecPerMlPerL}
                    onChange={(ecPerMlPerL) =>
                      onChange({
                        ...inputs,
                        ecParts: inputs.ecParts.map((row) =>
                          row.id === part.id ? { ...row, ecPerMlPerL } : row,
                        ),
                      })
                    }
                    min={0.0001}
                    max={10}
                    step={0.0001}
                    unit="mS/cm"
                    required
                    help="Strength calibration helper: subtract the starting RO EC first."
                  />
                  <NumberField
                    id={`ec-ratio-${part.id}`}
                    label={`Ratio for ${part.name || `Part ${index + 1}`}`}
                    value={part.ratio === undefined ? 1 : part.ratio}
                    onChange={(ratio) =>
                      onChange({
                        ...inputs,
                        ecParts: inputs.ecParts.map((row) =>
                          row.id === part.id ? { ...row, ratio } : row,
                        ),
                      })
                    }
                    min={0.0001}
                    max={1000}
                    step={0.01}
                    unit="× base"
                    required
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="self-end"
                    onClick={() =>
                      onChange({
                        ...inputs,
                        ecParts: inputs.ecParts.filter((row) => row.id !== part.id),
                      })
                    }
                    disabled={inputs.ecParts.length === 1}
                    aria-label={`Remove ${part.name || `part ${index + 1}`}`}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onChange({
                    ...inputs,
                    ecParts: [
                      ...inputs.ecParts,
                      {
                        id: nextId("ec", inputs.ecParts),
                        name: `Part ${inputs.ecParts.length + 1}`,
                        ecPerMlPerL: null,
                        ratio: 1,
                      },
                    ],
                  })
                }
                disabled={inputs.ecParts.length >= 3}
              >
                <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> Add EC-calibrated part
              </Button>
            </div>
            {inputs.sourceWaterEc !== null &&
            inputs.targetEc !== null &&
            inputs.sourceWaterEc >= inputs.targetEc ? (
              <p className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                Source-water EC is at or above target. Do not add a calculated concentrate dose;
                verify the water and meter first.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {inputs.mode === "c1v1" ? (
        <Card>
          <CardHeader>
            <CardTitle>C1V1 dilution</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <NumberField
              id="c1v1-c1"
              label="Stock concentration (C1)"
              value={inputs.c1}
              onChange={(c1) => onChange({ ...inputs, c1 })}
              min={0.0001}
              max={1000000}
              step={0.01}
              required
            />
            <NumberField
              id="c1v1-c2"
              label="Target concentration (C2)"
              value={inputs.c2}
              onChange={(c2) => onChange({ ...inputs, c2 })}
              min={0.0001}
              max={1000000}
              step={0.01}
              required
            />
            <NumberField
              id="c1v1-v2"
              label="Final volume (V2)"
              value={inputs.v2}
              onChange={(v2) => onChange({ ...inputs, v2 })}
              min={0.0001}
              max={1000000}
              step={0.01}
              unit={inputs.c1v1Unit}
              required
            />
            <div className="space-y-1.5">
              <Label htmlFor="c1v1-unit">Matching volume unit</Label>
              <Input
                id="c1v1-unit"
                value={inputs.c1v1Unit}
                maxLength={30}
                onChange={(event) => onChange({ ...inputs, c1v1Unit: event.target.value })}
                placeholder="mL, L, gal"
                required
                aria-invalid={c1v1Unit.length === 0}
                aria-describedby={
                  c1v1Unit.length === 0 ? "c1v1-unit-help c1v1-unit-error" : "c1v1-unit-help"
                }
              />
              <p id="c1v1-unit-help" className="text-xs text-muted-foreground">
                C1 and C2 must use the same concentration unit.
              </p>
              {c1v1Unit.length === 0 ? (
                <p id="c1v1-unit-error" role="alert" className="text-xs text-destructive">
                  Enter the matching volume unit used by V2.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {inputs.mode === "dry_salt" ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Dry salt recipe</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Generic rows are editable. The 321-style button loads one cited starting recipe.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  onChange({
                    ...inputs,
                    drySaltRows: JACKS_321_STYLE_PRESET.map((row) => ({
                      ...row,
                      bagSizeGrams: null,
                      mixOrder: row.mixOrder ?? 1,
                    })),
                  })
                }
              >
                Load cited 321-style preset
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onChange({
                    ...inputs,
                    drySaltRows: [
                      ...inputs.drySaltRows,
                      {
                        id: nextId("salt", inputs.drySaltRows),
                        name: `Dry salt ${inputs.drySaltRows.length + 1}`,
                        gramsPerGallon: null,
                        bagSizeGrams: null,
                        mixOrder: inputs.drySaltRows.length + 1,
                      },
                    ],
                  })
                }
                disabled={inputs.drySaltRows.length >= 12}
              >
                <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> Add row
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {inputs.drySaltRows.map((row, index) => (
              <div
                key={row.id}
                className="grid gap-3 rounded-xl border border-border/60 p-4 sm:grid-cols-[minmax(0,1fr)_1fr_1fr_7rem_auto]"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`salt-name-${row.id}`}>Salt name</Label>
                  <Input
                    id={`salt-name-${row.id}`}
                    value={row.name}
                    maxLength={80}
                    onChange={(event) =>
                      onChange({
                        ...inputs,
                        drySaltRows: inputs.drySaltRows.map((candidate) =>
                          candidate.id === row.id
                            ? { ...candidate, name: event.target.value }
                            : candidate,
                        ),
                      })
                    }
                  />
                </div>
                <NumberField
                  id={`salt-rate-${row.id}`}
                  label="Recipe rate"
                  value={row.gramsPerGallon}
                  onChange={(gramsPerGallon) =>
                    onChange({
                      ...inputs,
                      drySaltRows: inputs.drySaltRows.map((candidate) =>
                        candidate.id === row.id ? { ...candidate, gramsPerGallon } : candidate,
                      ),
                    })
                  }
                  min={0}
                  max={100000}
                  step={0.01}
                  unit="g/gal"
                  required
                />
                <NumberField
                  id={`salt-bag-${row.id}`}
                  label="Bag usable mass"
                  value={row.bagSizeGrams}
                  onChange={(bagSizeGrams) =>
                    onChange({
                      ...inputs,
                      drySaltRows: inputs.drySaltRows.map((candidate) =>
                        candidate.id === row.id ? { ...candidate, bagSizeGrams } : candidate,
                      ),
                    })
                  }
                  min={0.01}
                  max={10000000}
                  step={0.1}
                  unit="g"
                  help="Optional; carries into Expense."
                />
                <NumberField
                  id={`salt-order-${row.id}`}
                  label="Mix order"
                  value={row.mixOrder}
                  onChange={(mixOrder) =>
                    onChange({
                      ...inputs,
                      drySaltRows: inputs.drySaltRows.map((candidate) =>
                        candidate.id === row.id
                          ? { ...candidate, mixOrder: mixOrder ?? index + 1 }
                          : candidate,
                      ),
                    })
                  }
                  min={1}
                  max={99}
                  step={1}
                  required
                  integer
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="self-end"
                  onClick={() =>
                    onChange({
                      ...inputs,
                      drySaltRows: inputs.drySaltRows.filter(
                        (candidate) => candidate.id !== row.id,
                      ),
                    })
                  }
                  disabled={inputs.drySaltRows.length === 1}
                  aria-label={`Remove ${row.name}`}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm" htmlFor="injector-enabled">
              <input
                id="injector-enabled"
                type="checkbox"
                checked={inputs.injectorEnabled}
                onChange={(event) => onChange({ ...inputs, injectorEnabled: event.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              Include a stock-concentrate injector plan
            </label>
            {inputs.injectorEnabled ? (
              <div className="grid gap-4 rounded-xl border border-border/60 p-4 sm:grid-cols-2">
                <NumberField
                  id="injector-stock-strength"
                  label="Stock dry salt"
                  value={inputs.stockGramsPerGallon}
                  onChange={(stockGramsPerGallon) => onChange({ ...inputs, stockGramsPerGallon })}
                  min={0.0001}
                  max={1000000}
                  step={0.1}
                  unit="g/stock gal"
                  required
                />
                <NumberField
                  id="injector-ratio"
                  label="Injector ratio 1 :"
                  value={inputs.injectorRatio}
                  onChange={(injectorRatio) => onChange({ ...inputs, injectorRatio })}
                  min={1}
                  max={10000}
                  step={1}
                  integer
                  required
                />
              </div>
            ) : null}
            <p className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <ArrowDown aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              Dissolve each dry salt fully before the next part. For the cited preset: Part A, then
              Epsom, then calcium nitrate.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {inputs.mode === "converter" ? (
        <Card>
          <CardHeader>
            <CardTitle>EC-first converter</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="converter-kind">Input scale</Label>
              <select
                id="converter-kind"
                value={inputs.converterKind}
                onChange={(event) =>
                  onChange({
                    ...inputs,
                    converterKind: event.target.value as typeof inputs.converterKind,
                  })
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="ec">EC (mS/cm)</option>
                <option value="ppm500">PPM 500 scale</option>
                <option value="ppm700">PPM 700 scale</option>
                <option value="cf">CF</option>
              </select>
            </div>
            <NumberField
              id="converter-value"
              label="Nutrient strength"
              value={inputs.converterValue}
              onChange={(converterValue) => onChange({ ...inputs, converterValue })}
              min={0}
              max={100000}
              step={0.01}
              unit={
                inputs.converterKind === "ec"
                  ? "mS/cm"
                  : inputs.converterKind === "cf"
                    ? "CF"
                    : "ppm"
              }
              required
            />
            <p className="sm:col-span-2 flex gap-2 rounded-lg bg-muted/50 p-3 text-sm">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />A PPM number
              is ambiguous without its 500 or 700 meter scale. Confirm the meter setting; EC is the
              direct value.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!hasPrimaryResult ? (
        <section
          role="status"
          aria-label="Inputs needed for a nutrient result"
          className="rounded-xl border border-dashed border-border bg-muted/20 p-4"
          data-testid="nutrient-empty-state"
        >
          <p className="font-medium text-foreground">Three inputs that matter most</p>
          <ol className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            {EMPTY_STATE_INPUTS[inputs.mode].map((item, index) => (
              <li key={item} className="rounded-lg bg-background/70 px-3 py-2">
                <span className="mr-1 font-semibold text-foreground">{index + 1}.</span> {item}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {inputs.mode === "label" && label.value ? (
        <ResultBlock
          eyebrow="Recipe total"
          value={`${fmt(label.value.totalVolumeMl)} mL`}
          unit={label.value.totalMassG > 0 ? `+ ${fmt(label.value.totalMassG)} g` : undefined}
          formula="amount = label dose × actual working reservoir volume"
          testId="nutrient-primary-result"
        >
          <RecipeTable
            rows={label.value.rows.map((row) => ({
              id: row.id,
              name: row.name,
              amount: row.amount,
              unit: row.amountUnit,
              rate: `${fmt(row.perGallon)} ${row.amountUnit}/gal · ${fmt(row.perLiter)} ${row.amountUnit}/L`,
              formula: row.formula,
            }))}
          />
        </ResultBlock>
      ) : null}

      {inputs.mode === "ec_target" && ecTarget.value && targetStrength.value ? (
        <ResultBlock
          eyebrow="Ratio-weighted EC recipe"
          value={`${fmt(ecTarget.value.baseMlPerLiter)} base mL/L`}
          unit={`${fmt(ecTarget.value.totalVolumeMl)} mL total`}
          formula={ecTarget.value.formula}
          testId="nutrient-primary-result"
        >
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Target {fmt(targetStrength.value.ecMsCm)} mS/cm</Badge>
            <Badge variant="outline">PPM500 {fmt(targetStrength.value.ppm500, 0)}</Badge>
            <Badge variant="outline">PPM700 {fmt(targetStrength.value.ppm700, 0)}</Badge>
            {remainingEc.value !== null ? (
              <Badge variant="outline">
                {remainingEc.value >= 0
                  ? `${fmt(remainingEc.value)} mS/cm remaining`
                  : `${fmt(Math.abs(remainingEc.value))} mS/cm over target`}
              </Badge>
            ) : null}
            {isValidMeasuredMixedEc(inputs.measuredMixedEc) ? (
              <Badge
                variant="outline"
                data-testid="measured-mixed-ec-source"
                data-source={MEASURED_MIXED_EC_SOURCE}
              >
                Measured EC · {MEASURED_MIXED_EC_SOURCE_LABEL}
              </Badge>
            ) : null}
          </div>
          <RecipeTable
            rows={ecTarget.value.rows.map((row) => ({
              id: row.id,
              name: row.name,
              amount: row.reservoirMl,
              unit: "mL",
              rate: `${fmt(row.mlPerLiter)} mL/L · ratio ${fmt(row.ratio)}:1`,
              formula: row.formula,
            }))}
          />
        </ResultBlock>
      ) : null}

      {inputs.mode === "c1v1" && dilution.value !== null ? (
        <ResultBlock
          eyebrow="Stock volume V1"
          value={fmt(dilution.value)}
          unit={c1v1Unit}
          formula="V1 = (C2 × V2) ÷ C1"
          testId="nutrient-primary-result"
        />
      ) : null}

      {inputs.mode === "dry_salt" && drySalt.value ? (
        <ResultBlock
          eyebrow="Dry recipe total"
          value={`${fmt(drySalt.value.reduce((sum, row) => sum + row.reservoirGrams, 0))} g`}
          unit="for this working reservoir"
          formula="grams = g/gal × working gallons"
          testId="nutrient-primary-result"
        >
          <RecipeTable
            rows={drySalt.value.map((row) => ({
              id: row.id,
              name: row.name,
              amount: row.reservoirGrams,
              unit: "g",
              rate: `${fmt(row.gramsPerGallon)} g/gal · ${fmt(row.gramsPerLiter)} g/L`,
              formula: row.formula,
            }))}
          />
          {injector.value ? (
            <p className="text-sm">
              1:{injector.value.ratio} injector:{" "}
              <strong>{fmt(injector.value.stockMlPerFinalGallon)} mL stock/final gal</strong> ·{" "}
              {fmt(injector.value.stockMlForReservoir)} mL for this reservoir. Formula:{" "}
              {injector.value.formula}.
            </p>
          ) : null}
        </ResultBlock>
      ) : null}

      {inputs.mode === "converter" && conversion.value ? (
        <ResultBlock
          eyebrow="Direct strength"
          value={fmt(conversion.value.ecMsCm)}
          unit="mS/cm EC"
          formula="PPM = EC × selected scale; CF = EC × 10"
          testId="nutrient-primary-result"
        >
          <dl className="grid gap-3 sm:grid-cols-4">
            <Metric label="PPM500" value={fmt(conversion.value.ppm500, 0)} />
            <Metric label="PPM700" value={fmt(conversion.value.ppm700, 0)} />
            <Metric label="PPM640 (optional scale)" value={fmt(conversion.value.ppm640, 0)} />
            <Metric label="CF" value={fmt(conversion.value.cf)} />
          </dl>
        </ResultBlock>
      ) : null}

      {[
        label.error,
        ecTarget.error,
        targetStrength.error,
        measuredMixedEc.error,
        remainingEc.error,
        dilution.error,
        drySalt.error,
        injector.error,
        conversion.error,
      ]
        .filter(Boolean)
        .slice(0, 1)
        .map((error) => (
          <p
            key={error}
            role="alert"
            data-testid="nutrient-formula-error"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ))}

      {inputs.mode !== "converter" && inputs.mode !== "c1v1" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            Pushes weekly use only. Add package prices in Expense; nothing is purchased or uploaded.
          </p>
          <Button
            type="button"
            onClick={() => onPushRecipe(costRows)}
            disabled={!hasRecipeResult || (inputs.changesPerWeek ?? 0) <= 0}
          >
            <Send aria-hidden="true" className="mr-2 h-4 w-4" /> Push recipe to Expense
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface RecipeDisplayRow {
  id: string;
  name: string;
  amount: number;
  unit: string;
  rate: string;
  formula: string;
}

function RecipeTable({ rows }: { rows: RecipeDisplayRow[] }) {
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border/60"
      tabIndex={0}
      aria-label="Calculated recipe table"
    >
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Mix order</th>
            <th className="px-3 py-2">Part</th>
            <th className="px-3 py-2">Reservoir amount</th>
            <th className="px-3 py-2">Normalized rate</th>
            <th className="px-3 py-2">Formula</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="border-t border-border/60">
              <td className="px-3 py-2">{index + 1}</td>
              <td className="px-3 py-2 font-medium">{row.name || `Part ${index + 1}`}</td>
              <td className="px-3 py-2 tabular-nums">
                {fmt(row.amount)} {row.unit}
              </td>
              <td className="px-3 py-2">{row.rate}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{row.formula}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
