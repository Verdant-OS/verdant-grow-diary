import { useMemo } from "react";
import { Grid3X3, Lightbulb, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type {
  CycleInputs,
  ExpenseDeviceInputState,
  LightInputs,
  UnitSystem,
} from "@/lib/growHelpToolkitState";
import {
  LIGHT_REFERENCE_BANDS,
  buildFivePointHeatmap,
  calculateDliFromPlanningPpfd,
  calculateEnergyCostPerMol,
  calculateLightCycleEnergy,
  calculateUniformity,
  compareToReferenceBand,
  convertLightHeightValue,
  fixturesNeeded,
  inverseSquarePpfd,
  planningAveragePpfd,
  ppfdForTargetDli,
  resolveFixturePpf,
  solveInverseSquareHeight,
  type FivePointPpfd,
} from "@/lib/lightCalc";
import {
  cyclePhotoperiodReadiness,
  lightCanopyDimensionsReadiness,
  lightFixtureCountReadiness,
  lightFixturePlanningReadiness,
  lightFixturePpfReadiness,
  stagePhotoperiodReadiness,
} from "@/lib/growHelpToolkitReadiness";
import { M2_PER_FT2, areaM2, areaM2FromFeet } from "@/lib/unitsCalc";
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

function fmt(value: number, digits = 2): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export interface LightCalculatorTabProps {
  inputs: LightInputs;
  cycle: CycleInputs;
  unitSystem: UnitSystem;
  onChange: (inputs: LightInputs) => void;
  onPushLight: (row: ExpenseDeviceInputState) => void;
}

export default function LightCalculatorTab({
  inputs,
  cycle,
  unitSystem,
  onChange,
  onPushLight,
}: LightCalculatorTabProps) {
  const dimensionsReady = lightCanopyDimensionsReadiness(inputs).ready;
  const fixtureCountReady = lightFixtureCountReadiness(inputs).ready;
  const fixturePlanningReady = lightFixturePlanningReadiness(inputs).ready;
  const fixturePpfReady = lightFixturePpfReadiness(inputs).ready;
  const bothPhotoperiodsReady = cyclePhotoperiodReadiness(cycle).ready;
  const stagePhotoperiodReady = stagePhotoperiodReadiness(cycle, inputs.stage).ready;
  const canopyAreaM2 = useMemo(
    () =>
      attempt(dimensionsReady, () =>
        unitSystem === "us"
          ? areaM2FromFeet(inputs.canopyLength as number, inputs.canopyWidth as number)
          : areaM2(inputs.canopyLength as number, inputs.canopyWidth as number),
      ),
    [dimensionsReady, inputs.canopyLength, inputs.canopyWidth, unitSystem],
  );

  const fixturePpf = useMemo(
    () =>
      attempt(fixturePpfReady, () =>
        resolveFixturePpf({
          mode: inputs.ppfMode,
          ppfMicromolesPerSecond: inputs.ppfPerFixture as number,
          actualWatts: inputs.actualWattsPerFixture as number,
          efficacyMicromolesPerJoule: inputs.efficacy as number,
        }),
      ),
    [
      fixturePpfReady,
      inputs.actualWattsPerFixture,
      inputs.efficacy,
      inputs.ppfMode,
      inputs.ppfPerFixture,
    ],
  );

  const planningPpfd = useMemo(
    () =>
      attempt(
        canopyAreaM2.value !== null && fixturePpf.value !== null && fixturePlanningReady,
        () =>
          planningAveragePpfd(
            fixturePpf.value!.ppf,
            inputs.fixtureCount as number,
            canopyAreaM2.value!,
            (inputs.canopyEfficiencyPercent as number) / 100,
          ),
      ),
    [
      canopyAreaM2.value,
      fixturePlanningReady,
      fixturePpf.value,
      inputs.canopyEfficiencyPercent,
      inputs.fixtureCount,
    ],
  );

  const photoperiod =
    inputs.stage === "veg" ? cycle.vegPhotoperiodHours : cycle.flowerPhotoperiodHours;
  const planningDli = useMemo(
    () =>
      attempt(planningPpfd.value !== null && stagePhotoperiodReady && photoperiod !== null, () =>
        calculateDliFromPlanningPpfd(planningPpfd.value!, photoperiod as number),
      ),
    [photoperiod, planningPpfd.value, stagePhotoperiodReady],
  );

  const targetPpfd = useMemo(
    () =>
      attempt(
        inputs.targetMode === "ppfd"
          ? inputs.targetPpfd !== null
          : inputs.targetDli !== null && stagePhotoperiodReady && photoperiod !== null,
        () =>
          inputs.targetMode === "ppfd"
            ? (inputs.targetPpfd as number)
            : ppfdForTargetDli(inputs.targetDli as number, photoperiod as number),
      ),
    [inputs.targetDli, inputs.targetMode, inputs.targetPpfd, photoperiod, stagePhotoperiodReady],
  );

  const fixturePlan = useMemo(
    () =>
      attempt(
        targetPpfd.value !== null &&
          canopyAreaM2.value !== null &&
          fixturePpf.value !== null &&
          fixturePlanningReady,
        () =>
          fixturesNeeded(
            targetPpfd.value!,
            canopyAreaM2.value!,
            fixturePpf.value!.ppf,
            (inputs.canopyEfficiencyPercent as number) / 100,
          ),
      ),
    [
      canopyAreaM2.value,
      fixturePlanningReady,
      fixturePpf.value,
      inputs.canopyEfficiencyPercent,
      targetPpfd.value,
    ],
  );

  const inverseSquare = useMemo(
    () =>
      attempt(
        inputs.chartPpfd !== null && inputs.chartHeight !== null && inputs.newHeight !== null,
        () =>
          inverseSquarePpfd(
            inputs.chartPpfd as number,
            inputs.chartHeight as number,
            inputs.newHeight as number,
          ),
      ),
    [inputs.chartHeight, inputs.chartPpfd, inputs.newHeight],
  );
  const solvedHeight = useMemo(
    () =>
      attempt(
        inputs.chartPpfd !== null && inputs.chartHeight !== null && targetPpfd.value !== null,
        () =>
          solveInverseSquareHeight(
            inputs.chartPpfd as number,
            inputs.chartHeight as number,
            targetPpfd.value!,
          ),
      ),
    [inputs.chartHeight, inputs.chartPpfd, targetPpfd.value],
  );

  const pointsReady = Object.values(inputs.fivePoint).every((value) => value !== null);
  const points: FivePointPpfd = useMemo(
    () => ({
      center: inputs.fivePoint.center as number,
      frontLeft: inputs.fivePoint.frontLeft as number,
      frontRight: inputs.fivePoint.frontRight as number,
      backLeft: inputs.fivePoint.backLeft as number,
      backRight: inputs.fivePoint.backRight as number,
    }),
    [inputs.fivePoint],
  );
  const uniformity = useMemo(
    () => attempt(pointsReady, () => calculateUniformity(points)),
    [points, pointsReady],
  );
  const heatmap = useMemo(
    () => attempt(pointsReady && inputs.showHeatmap, () => buildFivePointHeatmap(points)),
    [inputs.showHeatmap, points, pointsReady],
  );

  const energy = useMemo(
    () =>
      attempt(
        inputs.actualWattsPerFixture !== null &&
          fixtureCountReady &&
          bothPhotoperiodsReady &&
          cycle.vegDays !== null &&
          cycle.flowerDays !== null &&
          cycle.electricityRate !== null,
        () =>
          calculateLightCycleEnergy({
            actualWattsPerFixture: inputs.actualWattsPerFixture as number,
            fixtureCount: inputs.fixtureCount as number,
            vegHoursPerDay: cycle.vegPhotoperiodHours as number,
            vegDays: cycle.vegDays as number,
            flowerHoursPerDay: cycle.flowerPhotoperiodHours as number,
            flowerDays: cycle.flowerDays as number,
            ratePerKwh: cycle.electricityRate as number,
          }),
      ),
    [
      bothPhotoperiodsReady,
      cycle.electricityRate,
      cycle.flowerDays,
      cycle.flowerPhotoperiodHours,
      cycle.vegDays,
      cycle.vegPhotoperiodHours,
      fixtureCountReady,
      inputs.actualWattsPerFixture,
      inputs.fixtureCount,
    ],
  );

  const energyCostPerMol = useMemo(
    () =>
      attempt(
        fixturePpf.value !== null &&
          energy.value !== null &&
          fixtureCountReady &&
          bothPhotoperiodsReady &&
          cycle.vegDays !== null &&
          cycle.flowerDays !== null,
        () =>
          calculateEnergyCostPerMol({
            ppfPerFixture: fixturePpf.value!.ppf,
            fixtureCount: inputs.fixtureCount as number,
            vegHoursPerDay: cycle.vegPhotoperiodHours as number,
            vegDays: cycle.vegDays as number,
            flowerHoursPerDay: cycle.flowerPhotoperiodHours as number,
            flowerDays: cycle.flowerDays as number,
            cycleElectricityCost: energy.value!.cycleCost,
          }),
      ),
    [
      bothPhotoperiodsReady,
      cycle.flowerDays,
      cycle.flowerPhotoperiodHours,
      cycle.vegDays,
      cycle.vegPhotoperiodHours,
      energy.value,
      fixtureCountReady,
      fixturePpf.value,
      inputs.fixtureCount,
    ],
  );

  const flowerBand = LIGHT_REFERENCE_BANDS.find((band) => band.stage === "flower") ?? null;
  const bandStatus =
    inputs.stage === "flower" && flowerBand && planningPpfd.value !== null
      ? compareToReferenceBand(planningPpfd.value, flowerBand.minPpfd, flowerBand.maxPpfd)
      : null;
  const flowerDliReference =
    inputs.stage === "flower" &&
    flowerBand &&
    planningDli.value !== null &&
    photoperiod !== null &&
    photoperiod > 0 &&
    photoperiod <= 24
      ? {
          min: calculateDliFromPlanningPpfd(flowerBand.minPpfd, photoperiod),
          max: calculateDliFromPlanningPpfd(flowerBand.maxPpfd, photoperiod),
        }
      : null;
  const dliBandStatus =
    flowerDliReference && planningDli.value !== null
      ? compareToReferenceBand(planningDli.value, flowerDliReference.min, flowerDliReference.max)
      : null;

  const areaFt2 = canopyAreaM2.value === null ? null : canopyAreaM2.value / M2_PER_FT2;
  const canPush =
    inputs.actualWattsPerFixture !== null &&
    inputs.actualWattsPerFixture >= 0 &&
    inputs.fixtureCount !== null &&
    inputs.fixtureCount >= 1 &&
    Number.isInteger(inputs.fixtureCount) &&
    cycle.vegDays !== null &&
    cycle.flowerDays !== null;

  function pushLight() {
    if (!canPush) return;
    onPushLight({
      id: "linked-light-plan",
      name: "Grow lights (from Light plan)",
      actualWatts: inputs.actualWattsPerFixture,
      quantity: inputs.fixtureCount,
      // Null means "follow the shared Cycle bar" in Expense. A grower can
      // still override either phase after the row is copied.
      vegHoursPerDay: null,
      flowerHoursPerDay: null,
      vegDaysOverride: null,
      flowerDaysOverride: null,
      linkedFromLight: true,
    });
  }

  const firstError = [
    canopyAreaM2.error,
    fixturePpf.error,
    planningPpfd.error,
    planningDli.error,
    targetPpfd.error,
    fixturePlan.error,
    inverseSquare.error,
    solvedHeight.error,
    uniformity.error,
    heatmap.error,
    energy.error,
    energyCostPerMol.error,
  ].find(Boolean);

  return (
    <div className="space-y-6" data-testid="light-calculator-tab">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb aria-hidden="true" className="h-5 w-5 text-primary" />
              Canopy and fixture
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id="light-canopy-length"
                label="Canopy length (not tent walls)"
                value={inputs.canopyLength}
                onChange={(canopyLength) => onChange({ ...inputs, canopyLength })}
                min={0.1}
                max={unitSystem === "us" ? 100 : 30}
                step={0.01}
                unit={unitSystem === "us" ? "ft" : "m"}
                required
              />
              <NumberField
                id="light-canopy-width"
                label="Canopy width (not tent walls)"
                value={inputs.canopyWidth}
                onChange={(canopyWidth) => onChange({ ...inputs, canopyWidth })}
                min={0.1}
                max={unitSystem === "us" ? 100 : 30}
                step={0.01}
                unit={unitSystem === "us" ? "ft" : "m"}
                required
              />
              <NumberField
                id="light-fixture-count"
                label="Fixture count"
                value={inputs.fixtureCount}
                onChange={(fixtureCount) => onChange({ ...inputs, fixtureCount })}
                min={1}
                max={1000}
                step={1}
                unit="fixtures"
                integer
                required
              />
              <NumberField
                id="light-efficiency"
                label="Canopy efficiency"
                value={inputs.canopyEfficiencyPercent}
                onChange={(canopyEfficiencyPercent) =>
                  onChange({ ...inputs, canopyEfficiencyPercent })
                }
                min={50}
                max={100}
                step={1}
                unit="%"
                required
                help="Walls / reflectivity planning fudge. Starting reference 80%; use 50–100%."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="light-ppf-mode">Photon input</Label>
              <select
                id="light-ppf-mode"
                value={inputs.ppfMode}
                onChange={(event) =>
                  onChange({
                    ...inputs,
                    ppfMode: event.target.value === "watts" ? "watts" : "ppf",
                  })
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="ppf">Fixture PPF (preferred)</option>
                <option value="watts">Actual watts + efficacy (estimated PPF)</option>
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {inputs.ppfMode === "ppf" ? (
                <NumberField
                  id="light-ppf"
                  label="PPF per fixture"
                  value={inputs.ppfPerFixture}
                  onChange={(ppfPerFixture) => onChange({ ...inputs, ppfPerFixture })}
                  min={0.1}
                  max={100000}
                  step={1}
                  unit="µmol/s"
                  required
                />
              ) : (
                <NumberField
                  id="light-efficacy"
                  label="Fixture efficacy"
                  value={inputs.efficacy}
                  onChange={(efficacy) => onChange({ ...inputs, efficacy })}
                  min={0.01}
                  max={10}
                  step={0.01}
                  unit="µmol/J"
                  required
                />
              )}
              <NumberField
                id="light-actual-watts"
                label="Actual wall draw per fixture"
                value={inputs.actualWattsPerFixture}
                onChange={(actualWattsPerFixture) => onChange({ ...inputs, actualWattsPerFixture })}
                min={0}
                max={100000}
                step={1}
                unit="W"
                required={inputs.ppfMode === "watts"}
                help="Optional for PPF math; required for energy cost. Never use HID-equivalent watts."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Target and photoperiod</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="light-stage">Cycle phase</Label>
                <select
                  id="light-stage"
                  value={inputs.stage}
                  onChange={(event) =>
                    onChange({
                      ...inputs,
                      stage: event.target.value === "veg" ? "veg" : "flower",
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="veg">Vegetative</option>
                  <option value="flower">Flower</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  {photoperiod === null
                    ? `Enter the ${inputs.stage} photoperiod in the shared Cycle bar.`
                    : `Uses ${photoperiod} h/day from the shared Cycle bar.`}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="light-target-mode">Target input</Label>
                <select
                  id="light-target-mode"
                  value={inputs.targetMode}
                  onChange={(event) =>
                    onChange({
                      ...inputs,
                      targetMode: event.target.value === "dli" ? "dli" : "ppfd",
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="ppfd">Target PPFD</option>
                  <option value="dli">Target DLI</option>
                </select>
              </div>
              {inputs.targetMode === "ppfd" ? (
                <NumberField
                  id="light-target-ppfd"
                  label="Target PPFD"
                  value={inputs.targetPpfd}
                  onChange={(targetPpfdValue) =>
                    onChange({ ...inputs, targetPpfd: targetPpfdValue })
                  }
                  min={0.1}
                  max={10000}
                  step={1}
                  unit="µmol/m²/s"
                  required
                />
              ) : (
                <NumberField
                  id="light-target-dli"
                  label="Target DLI"
                  value={inputs.targetDli}
                  onChange={(targetDliValue) => onChange({ ...inputs, targetDli: targetDliValue })}
                  min={0.01}
                  max={100}
                  step={0.1}
                  unit="mol/m²/day"
                  required
                />
              )}
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
              {inputs.stage === "flower" && flowerBand ? (
                <p>
                  <strong>
                    {flowerBand.minPpfd}–{flowerBand.maxPpfd} µmol/m²/s
                  </strong>{" "}
                  is a typical flower starting reference, not a guarantee. Your target remains
                  editable.
                </p>
              ) : (
                <p>
                  No generic vegetative band is prefilled. Use your own target and verify canopy
                  response with measured context.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {planningPpfd.value !== null ? (
        <ResultBlock
          eyebrow={fixturePpf.value?.estimated ? "Estimated planning average" : "Planning average"}
          value={fmt(planningPpfd.value, 0)}
          unit="µmol/m²/s PPFD"
          formula="planning PPFD = (fixture PPF × count × efficiency) ÷ canopy area m²"
          testId="light-primary-result"
        >
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Area {fmt(canopyAreaM2.value ?? 0)} m²</Badge>
            <Badge variant="outline">{fmt(areaFt2 ?? 0)} ft²</Badge>
            {planningDli.value !== null ? (
              <Badge variant="outline">DLI {fmt(planningDli.value)} mol/m²/day</Badge>
            ) : null}
            {fixturePpf.value?.estimated ? (
              <Badge variant="outline">PPF estimated from watts × efficacy</Badge>
            ) : null}
            {bandStatus ? (
              <Badge variant="secondary">
                {bandStatus === "below"
                  ? "Below typical starting band"
                  : bandStatus === "above"
                    ? "Above typical starting band"
                    : "Within typical starting band"}
              </Badge>
            ) : null}
            {flowerDliReference && dliBandStatus ? (
              <Badge variant="secondary">
                DLI reference {fmt(flowerDliReference.min)}–{fmt(flowerDliReference.max)}
                {" mol/m²/day · "}
                {dliBandStatus === "below"
                  ? "below"
                  : dliBandStatus === "above"
                    ? "above"
                    : "in range"}
              </Badge>
            ) : null}
          </div>
          <div className="space-y-1 font-mono text-xs text-muted-foreground">
            <p>
              {unitSystem === "us"
                ? "area m² = canopy length ft × canopy width ft × 0.09290304"
                : "area m² = canopy length m × canopy width m"}
            </p>
            {planningDli.value !== null ? (
              <p>DLI (mol/m²/day) = PPFD (µmol/m²/s) × hours/day × 3,600 ÷ 1,000,000</p>
            ) : null}
            <p>{fixturePpf.value?.formula}</p>
            {inputs.targetMode === "dli" && targetPpfd.value !== null ? (
              <p>target PPFD = target DLI × 1,000,000 ÷ (hours/day × 3,600)</p>
            ) : null}
            {flowerDliReference ? (
              <p>typical DLI reference = sourced flower PPFD band × current photoperiod × 0.0036</p>
            ) : null}
          </div>
          {fixturePlan.value ? (
            <p className="text-sm">
              Target needs <strong>{fmt(fixturePlan.value.raw)} raw fixtures</strong>; round up to{" "}
              <strong>{fixturePlan.value.roundedUp}</strong>. Formula: {fixturePlan.value.formula}.
            </p>
          ) : null}
        </ResultBlock>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-6">
            <p className="font-medium">Three inputs matter most</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add canopy length × width, fixture PPF (or actual watts + efficacy), and a target or
              photoperiod. The planning average will appear here.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Manufacturer chart height · inverse-square approximation</CardTitle>
          <p className="text-sm text-muted-foreground">
            A simple geometry estimate. Real fixtures, lenses, walls, and multiple lights do not
            behave like a point source.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <NumberField
            id="light-chart-ppfd"
            label="Chart PPFD"
            value={inputs.chartPpfd}
            onChange={(chartPpfd) => onChange({ ...inputs, chartPpfd })}
            min={0.1}
            max={10000}
            step={1}
            unit="µmol/m²/s"
          />
          <NumberField
            id="light-chart-height"
            label="Chart height"
            value={inputs.chartHeight}
            onChange={(chartHeight) => onChange({ ...inputs, chartHeight })}
            min={0.1}
            max={10000}
            step={0.1}
            unit={inputs.heightUnit}
          />
          <NumberField
            id="light-new-height"
            label="New height"
            value={inputs.newHeight}
            onChange={(newHeight) => onChange({ ...inputs, newHeight })}
            min={0.1}
            max={10000}
            step={0.1}
            unit={inputs.heightUnit}
          />
          <div className="space-y-1.5">
            <Label htmlFor="light-height-unit">Height unit</Label>
            <select
              id="light-height-unit"
              value={inputs.heightUnit}
              onChange={(event) => {
                const heightUnit = event.target.value === "cm" ? "cm" : "in";
                onChange({
                  ...inputs,
                  chartHeight: convertLightHeightValue(
                    inputs.chartHeight,
                    inputs.heightUnit,
                    heightUnit,
                  ),
                  newHeight: convertLightHeightValue(
                    inputs.newHeight,
                    inputs.heightUnit,
                    heightUnit,
                  ),
                  heightUnit,
                });
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="in">inches</option>
              <option value="cm">centimeters</option>
            </select>
          </div>
          {inverseSquare.value !== null ? (
            <div className="rounded-lg border border-border/60 p-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">Estimated PPFD at new height</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {fmt(inverseSquare.value, 0)} µmol/m²/s
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                PPFDnew = PPFDchart × (hchart ÷ hnew)²
              </p>
            </div>
          ) : null}
          {solvedHeight.value !== null ? (
            <div className="rounded-lg border border-border/60 p-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">Height estimated for current target</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {fmt(solvedHeight.value)} {inputs.heightUnit}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                hnew = hchart × √(PPFDchart ÷ PPFDtarget)
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Optional five-point canopy check</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Center plus four corners. Enter measured PPFD; zero is a valid dark reading.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange({ ...inputs, showHeatmap: !inputs.showHeatmap })}
            disabled={!pointsReady}
          >
            <Grid3X3 aria-hidden="true" className="mr-2 h-4 w-4" />{" "}
            {inputs.showHeatmap ? "Hide" : "Show"} 3×3 model
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-5">
            {(
              [
                ["center", "Center"],
                ["frontLeft", "Front left"],
                ["frontRight", "Front right"],
                ["backLeft", "Back left"],
                ["backRight", "Back right"],
              ] as const
            ).map(([key, label]) => (
              <NumberField
                key={key}
                id={`light-point-${key}`}
                label={label}
                value={inputs.fivePoint[key]}
                onChange={(value) =>
                  onChange({ ...inputs, fivePoint: { ...inputs.fivePoint, [key]: value } })
                }
                min={0}
                max={10000}
                step={1}
                unit="µmol/m²/s"
              />
            ))}
          </div>
          {uniformity.value ? (
            <dl className="grid gap-3 sm:grid-cols-4">
              <Metric
                label="Five-point average"
                value={`${fmt(uniformity.value.average, 0)} µmol/m²/s`}
              />
              <Metric label="Minimum" value={`${fmt(uniformity.value.minimum, 0)} µmol/m²/s`} />
              <Metric
                label="Umin / Uavg (unitless)"
                value={
                  uniformity.value.uminOverUavg === null
                    ? "Not available"
                    : `${fmt(uniformity.value.uminOverUavg, 3)} unitless`
                }
              />
              <Metric
                label="Center − corner avg"
                value={`${fmt(uniformity.value.centerToCornerDelta, 0)} µmol/m²/s`}
              />
            </dl>
          ) : null}
          {uniformity.value ? (
            <div className="space-y-1 font-mono text-xs text-muted-foreground">
              <p>average PPFD = (center + four corners) ÷ 5</p>
              <p>{uniformity.value.formula}</p>
              <p>center − corner avg = center PPFD − (four corners ÷ 4)</p>
            </div>
          ) : null}
          {heatmap.value ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Interpolation model · not a PAR map
              </p>
              <div className="grid max-w-sm grid-cols-3 gap-2">
                {heatmap.value.flatMap((row, rowIndex) =>
                  row.map((value, columnIndex) => (
                    <div
                      key={`${rowIndex}-${columnIndex}`}
                      className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-center font-semibold tabular-nums"
                    >
                      <span className="block">{fmt(value, 0)}</span>
                      <span className="mt-1 block text-[0.65rem] font-normal text-muted-foreground">
                        µmol/m²/s
                      </span>
                    </div>
                  )),
                )}
              </div>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                edge midpoint PPFD = (adjacent measured corners) ÷ 2; center cell = measured center
                PPFD
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {energy.value ? (
        <Card>
          <CardHeader>
            <CardTitle>Cycle light energy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-3">
              <Metric
                label="Veg"
                value={`${fmt(energy.value.vegKwh)} kWh · ${formatMoney(energy.value.vegCost, cycle.currency)}`}
              />
              <Metric
                label="Flower"
                value={`${fmt(energy.value.flowerKwh)} kWh · ${formatMoney(energy.value.flowerCost, cycle.currency)}`}
              />
              <Metric
                label="Cycle"
                value={`${fmt(energy.value.cycleKwh)} kWh · ${formatMoney(energy.value.cycleCost, cycle.currency)}`}
              />
              {energyCostPerMol.value ? (
                <Metric
                  label={
                    fixturePpf.value?.estimated
                      ? "Estimated fixture-output cost"
                      : "Fixture-output cost"
                  }
                  value={`${formatMoney(energyCostPerMol.value.costPerMol, cycle.currency)}/mol`}
                />
              ) : null}
              {energyCostPerMol.value ? (
                <Metric
                  label={
                    fixturePpf.value?.estimated
                      ? "Estimated fixture-output photons"
                      : "Fixture-output photons"
                  }
                  value={`${fmt(energyCostPerMol.value.photonMoles)} mol/cycle`}
                />
              ) : null}
            </dl>
            <p className="font-mono text-xs text-muted-foreground">{energy.value.formula}</p>
            {energyCostPerMol.value ? (
              <p className="font-mono text-xs text-muted-foreground">
                {energyCostPerMol.value.formula}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {firstError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {firstError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">
          Planning estimate only. Verify at canopy with a PAR meter. Inverse-square is an
          approximation.
        </p>
        <Button type="button" onClick={pushLight} disabled={!canPush}>
          <Send aria-hidden="true" className="mr-2 h-4 w-4" /> Push light row to Expense
        </Button>
      </div>
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

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || "USD"} ${fmt(value)}`;
  }
}
