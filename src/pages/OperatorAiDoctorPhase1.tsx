/**
 * Operator Mode — AI Doctor Phase 1 read-only review page.
 *
 * Read-only. Renders a plant picker and, when a plant has a precomputed
 * result + context payload, the Phase 1 result panel. No diary/timeline,
 * Action Queue, or alert writes. No Supabase mutations. No model calls.
 * No device control.
 *
 * Two surfaces:
 *   - `OperatorAiDoctorPhase1` (default export) — pure, injection-friendly
 *     view used by tests. Receives plants + a synchronous result selector.
 *   - `OperatorAiDoctorPhase1Page` (named) — smart wrapper used by the
 *     route. Reads plants + tents from existing safe read-only hooks
 *     (no mutations) and maps them to picker options.
 */
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AiDoctorPhase1PlantPicker,
  type AiDoctorPhase1PlantOption,
} from "@/components/AiDoctorPhase1PlantPicker";
import { AiDoctorPhase1ResultPanel } from "@/components/AiDoctorPhase1ResultPanel";
import { AiDoctorPhase1InternalLink } from "@/components/AiDoctorPhase1InternalLink";
import { AiDoctorPhase1EmptyStateActions } from "@/components/AiDoctorPhase1EmptyStateActions";
import { usePlants } from "@/hooks/use-plants";
import { useTents } from "@/hooks/use-tents";
import type {
  AiDoctorContextPayload,
  AiDoctorDiagnosisResult,
} from "@/lib/aiDoctorEnginePhase1Foundation";

export const OPERATOR_AI_DOCTOR_PHASE1_ROUTE = "/operator/ai-doctor-phase1";

export interface OperatorAiDoctorPhase1Props {
  /** Plants the operator can pick from. Defaults to []. */
  plants?: ReadonlyArray<AiDoctorPhase1PlantOption>;
  /**
   * Pure selector returning a precomputed context+result for a given
   * plant id, or null when no result is available. No I/O.
   */
  getResultForPlant?: (
    plantId: string,
  ) => { context: AiDoctorContextPayload; result: AiDoctorDiagnosisResult } | null;
}

export default function OperatorAiDoctorPhase1(
  props: OperatorAiDoctorPhase1Props = {},
): JSX.Element {
  const plants = props.plants ?? [];
  const getResultForPlant = props.getResultForPlant ?? (() => null);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPlantId = searchParams.get("plantId");
  const selectedPlant = plants.find((p) => p.id === rawPlantId) ?? null;
  const unknownPlantId = rawPlantId !== null && selectedPlant === null;

  const onSelect = React.useCallback(
    (plantId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("plantId", plantId);
      const plant = plants.find((p) => p.id === plantId);
      if (plant?.grow_id) next.set("growId", plant.grow_id);
      if (plant?.tent_id) next.set("tentId", plant.tent_id);
      setSearchParams(next, { replace: false });
    },
    [plants, searchParams, setSearchParams],
  );

  const resultBundle =
    selectedPlant && getResultForPlant
      ? getResultForPlant(selectedPlant.id)
      : null;

  const ctaContext = {
    plantId: selectedPlant?.id ?? null,
    growId: selectedPlant?.grow_id ?? null,
    tentId: selectedPlant?.tent_id ?? null,
  };

  return (
    <main
      data-testid="operator-ai-doctor-phase1-page"
      className="mx-auto max-w-4xl space-y-4 p-4"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">
          AI Doctor Phase 1
        </h1>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li data-testid="ai-doctor-phase1-page-safety-1">
            Cautious context review only.
          </li>
          <li data-testid="ai-doctor-phase1-page-safety-2">
            No diagnosis is saved from this screen.
          </li>
          <li data-testid="ai-doctor-phase1-page-safety-3">
            No Action Queue item is created from this screen.
          </li>
        </ul>
      </header>

      {plants.length === 0 && (
        <section
          data-testid="ai-doctor-phase1-no-plants-state"
          className="rounded-md border border-border bg-muted p-4 text-sm"
        >
          <h2 className="text-base font-semibold text-foreground">
            No plants available
          </h2>
          <p className="text-muted-foreground">
            Create a plant before reviewing AI Doctor context.
          </p>
          <Link
            to="/plants"
            data-testid="ai-doctor-phase1-no-plants-cta"
            className="mt-2 inline-block rounded-md border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground"
          >
            Create plant
          </Link>
        </section>
      )}

      {plants.length > 0 && (
        <AiDoctorPhase1PlantPicker
          plants={plants}
          selectedPlantId={selectedPlant?.id ?? null}
          onSelect={onSelect}
        />
      )}

      {plants.length > 0 && unknownPlantId && (
        <section
          data-testid="ai-doctor-phase1-unknown-plant-state"
          className="rounded-md border border-border bg-muted p-4 text-sm"
        >
          <h2 className="text-base font-semibold text-foreground">
            Plant not found
          </h2>
          <p className="text-muted-foreground">
            The selected plant id is not available. Choose a plant from the
            list above.
          </p>
        </section>
      )}

      {plants.length > 0 && !selectedPlant && !unknownPlantId && (
        <section
          data-testid="ai-doctor-phase1-choose-plant-state"
          className="rounded-md border border-border bg-muted p-4 text-sm"
        >
          <h2 className="text-base font-semibold text-foreground">
            Choose a plant
          </h2>
          <p className="text-muted-foreground">
            Select a plant to review its AI Doctor Phase 1 context.
          </p>
        </section>
      )}

      {selectedPlant && (
        <AiDoctorPhase1InternalLink
          plantId={selectedPlant.id}
          growId={selectedPlant.grow_id ?? null}
          tentId={selectedPlant.tent_id ?? null}
        />
      )}

      {selectedPlant && !resultBundle && (
        <section
          data-testid="ai-doctor-phase1-no-result-state"
          className="rounded-md border border-border bg-muted p-4 text-sm"
        >
          <h2 className="text-base font-semibold text-foreground">
            No AI Doctor result available
          </h2>
          <p className="text-muted-foreground">Next steps:</p>
          <ul className="ml-4 list-disc text-muted-foreground">
            <li>Add a Quick Log</li>
            <li>Add or attach a plant photo</li>
            <li>Add a manual or live sensor snapshot</li>
            <li>Then run AI Doctor when the context is ready</li>
          </ul>
          <AiDoctorPhase1EmptyStateActions kind="no-result" context={ctaContext} />
        </section>
      )}

      {selectedPlant && resultBundle && (
        <>
          {resultBundle.result.missing_information.length > 0 && (
            <section
              data-testid="ai-doctor-phase1-missing-context-guidance"
              className="rounded-md border border-border bg-muted p-4 text-sm"
            >
              <h2 className="text-base font-semibold text-foreground">
                Missing context
              </h2>
              <ul className="ml-4 list-disc text-muted-foreground">
                {resultBundle.result.missing_information.map((m, i) => (
                  <li key={`${i}-${m}`}>{m}</li>
                ))}
              </ul>
              <p className="mt-2 text-muted-foreground">
                Evidence-first next steps:
              </p>
              <ul className="ml-4 list-disc text-muted-foreground">
                <li>Add a recent photo</li>
                <li>Add watering or feeding log if relevant</li>
                <li>Add a fresh manual or live sensor snapshot</li>
                <li>Confirm stage, medium, and pot size</li>
              </ul>
              <AiDoctorPhase1EmptyStateActions
                kind="missing-context"
                missing={resultBundle.result.missing_information}
                context={ctaContext}
              />
            </section>
          )}
          <AiDoctorPhase1ResultPanel
            context={resultBundle.context}
            result={resultBundle.result}
          />
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Smart wrapper used by the route — reads real plant/tent rows via the
// existing read-only hooks and adapts them to picker options. No mutations.
// ---------------------------------------------------------------------------

interface RawPlantRow {
  id: string;
  name?: string | null;
  strain?: string | null;
  stage?: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
}

interface RawTentRow {
  id: string;
  name?: string | null;
}

export function mapPlantsToPickerOptions(
  plants: ReadonlyArray<RawPlantRow>,
  tents: ReadonlyArray<RawTentRow>,
): AiDoctorPhase1PlantOption[] {
  const tentNameById = new Map<string, string>();
  for (const t of tents) {
    if (t?.id && typeof t.name === "string") tentNameById.set(t.id, t.name);
  }
  return plants
    .filter((p): p is RawPlantRow => !!p && typeof p.id === "string" && p.id.length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
      strain: p.strain ?? null,
      stage: p.stage ?? null,
      tent_name: p.tent_id ? tentNameById.get(p.tent_id) ?? null : null,
      tent_id: p.tent_id ?? null,
      grow_id: p.grow_id ?? null,
    }));
}

export function OperatorAiDoctorPhase1Page(): JSX.Element {
  const { data: plants } = usePlants();
  const { data: tents } = useTents();
  const options = React.useMemo(
    () =>
      mapPlantsToPickerOptions(
        (plants ?? []) as RawPlantRow[],
        (tents ?? []) as RawTentRow[],
      ),
    [plants, tents],
  );
  return <OperatorAiDoctorPhase1 plants={options} />;
}
