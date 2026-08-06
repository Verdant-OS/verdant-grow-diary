/**
 * GeneticDriftSimulator.tsx
 *
 * Standalone educational component — Wright-Fisher genetic drift visualizer.
 *
 * ISOLATION GUARANTEE: This component is intentionally disconnected from:
 *   - The V0 operating loop
 *   - AI recommendations or AI Doctor
 *   - Action Queue or alerts
 *   - Plant database reads or writes
 *   - Any automation pipeline
 *
 * It is a pure educational tool. Do not wire it into any of the above systems.
 */

import { useState } from "react";
import {
  simulateGeneticDrift,
  DriftSimulationResult,
  DRIFT_PARAM_LIMITS,
  EDUCATIONAL_DISCLAIMER,
} from "@/lib/genetics/geneticDriftSimulator";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ParamRow({
  label,
  id,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">
          ({min}–{max})
        </span>
      </div>
    </div>
  );
}

function ResultsTable({ result }: { result: DriftSimulationResult }) {
  const { fixedCount, lostCount, polymorphicCount, totalRuns, averageFinalFrequency } = result;
  const toPercent = (n: number) => ((n / totalRuns) * 100).toFixed(1) + "%";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground">Outcome</th>
            <th className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground">Runs</th>
            <th className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground">Frequency</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/50">
            <td className="py-2 px-3 font-medium">Fixed (freq = 1.0)</td>
            <td className="py-2 px-3 text-right">{fixedCount}</td>
            <td className="py-2 px-3 text-right">{toPercent(fixedCount)}</td>
          </tr>
          <tr className="border-b border-border/50">
            <td className="py-2 px-3 font-medium">Lost (freq = 0.0)</td>
            <td className="py-2 px-3 text-right">{lostCount}</td>
            <td className="py-2 px-3 text-right">{toPercent(lostCount)}</td>
          </tr>
          <tr className="border-b border-border/50">
            <td className="py-2 px-3 font-medium">Polymorphic (0 &lt; freq &lt; 1)</td>
            <td className="py-2 px-3 text-right">{polymorphicCount}</td>
            <td className="py-2 px-3 text-right">{toPercent(polymorphicCount)}</td>
          </tr>
          <tr>
            <td className="py-2 px-3 font-medium text-muted-foreground">Mean final frequency</td>
            <td className="py-2 px-3 text-right text-muted-foreground">—</td>
            <td className="py-2 px-3 text-right text-muted-foreground">
              {averageFinalFrequency.toFixed(4)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FrequencyHistogram({ result }: { result: DriftSimulationResult }) {
  const BINS = 10;
  const bins = Array.from({ length: BINS }, () => 0);
  for (const r of result.runs) {
    const bin = Math.min(Math.floor(r.finalFrequency * BINS), BINS - 1);
    bins[bin]++;
  }
  const maxBin = Math.max(...bins, 1);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">Final allele frequency distribution</p>
      <div className="flex items-end gap-1 h-24" aria-label="Histogram of final allele frequencies">
        {bins.map((count, i) => {
          const pct = (count / maxBin) * 100;
          const rangeLabel = `${(i / BINS).toFixed(1)}–${((i + 1) / BINS).toFixed(1)}`;
          return (
            <div
              key={i}
              title={`Freq ${rangeLabel}: ${count} run${count !== 1 ? "s" : ""}`}
              className="flex-1 bg-emerald-600/70 rounded-t transition-all"
              style={{ height: `${pct}%` }}
              aria-label={`Frequency range ${rangeLabel}: ${count} runs`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>0.0</span>
        <span>0.5</span>
        <span>1.0</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const LIM = DRIFT_PARAM_LIMITS;

/** Test-stable ID for the disclaimer element. */
export const DISCLAIMER_TEST_ID = "genetic-drift-educational-disclaimer";

/**
 * GeneticDriftSimulator
 *
 * Standalone educational component — safe to render in any context.
 * Has no external dependencies beyond its own simulation library.
 * Must NOT be imported by AI Doctor, Action Queue, alert systems, or automation.
 */
export function GeneticDriftSimulator() {
  const [populationSize, setPopulationSize] = useState(20);
  const [initialFrequency, setInitialFrequency] = useState(0.5);
  const [generations, setGenerations] = useState(20);
  const [runs, setRuns] = useState(50);
  const [result, setResult] = useState<DriftSimulationResult | null>(null);

  function handleSimulate() {
    const r = simulateGeneticDrift({
      populationSize,
      initialFrequency,
      generations,
      runs,
      // No seed provided in the UI — each click produces a fresh stochastic run
    });
    setResult(r);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-6 max-w-2xl">
      {/* ------------------------------------------------------------------ */}
      {/* Educational header — must remain visible at all times               */}
      {/* ------------------------------------------------------------------ */}
      <div
        data-testid={DISCLAIMER_TEST_ID}
        className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed"
        role="note"
        aria-label="educational simulation disclaimer — not a prediction of real plant outcomes, for learning purposes only"
      >
        <strong>Educational simulation only.</strong> {EDUCATIONAL_DISCLAIMER}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Title                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h2 className="text-lg font-semibold">Genetic Drift Simulator</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Explore how random allele frequency changes accumulate across generations in a finite
          population. Adjust the parameters and run the simulation to observe drift patterns.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Parameter controls                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-4">
        <ParamRow
          label="Population size (N)"
          id="drift-pop-size"
          value={populationSize}
          min={LIM.populationSize.min}
          max={LIM.populationSize.max}
          step={1}
          onChange={setPopulationSize}
        />
        <ParamRow
          label="Starting allele frequency"
          id="drift-init-freq"
          value={initialFrequency}
          min={LIM.initialFrequency.min}
          max={LIM.initialFrequency.max}
          step={0.05}
          onChange={setInitialFrequency}
        />
        <ParamRow
          label="Generations"
          id="drift-generations"
          value={generations}
          min={LIM.generations.min}
          max={LIM.generations.max}
          step={1}
          onChange={setGenerations}
        />
        <ParamRow
          label="Simulation runs"
          id="drift-runs"
          value={runs}
          min={LIM.runs.min}
          max={LIM.runs.max}
          step={1}
          onChange={setRuns}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Run button                                                          */}
      {/* ------------------------------------------------------------------ */}
      <button
        type="button"
        onClick={handleSimulate}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Run simulation
      </button>

      {/* ------------------------------------------------------------------ */}
      {/* Results                                                             */}
      {/* ------------------------------------------------------------------ */}
      {result && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Simulation results</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Based on {result.totalRuns} runs with population size N={result.clampedParams.populationSize},{" "}
              starting frequency p₀={result.clampedParams.initialFrequency.toFixed(2)},{" "}
              over {result.clampedParams.generations} generations.
            </p>
            <ResultsTable result={result} />
          </div>
          <FrequencyHistogram result={result} />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Educational footer — reinforces non-predictive nature               */}
      {/* ------------------------------------------------------------------ */}
      <div className="text-xs text-muted-foreground border-t border-border pt-4 space-y-1">
        <p>
          <strong>How to interpret:</strong> Each run models an independent idealized population.
          Fixation and loss rates increase with smaller population sizes and more generations —
          this illustrates the concept of genetic drift, not the behavior of any real plant.
        </p>
        <p>
          This tool has no connection to plant records, cultivation recommendations, or automated
          actions. It is provided for educational exploration of population genetics concepts only.
        </p>
      </div>
    </div>
  );
}
