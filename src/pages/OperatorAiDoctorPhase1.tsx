/**
 * Operator Mode — AI Doctor Phase 1 read-only review page.
 *
 * Read-only. Renders a plant picker and, when a plant has a precomputed
 * result + context payload, the Phase 1 result panel. No diary/timeline,
 * Action Queue, or alert writes. No Supabase mutations. No model calls.
 * No device control.
 *
 * Data inputs are injected via props so tests, demos, and future wiring
 * can supply deterministic plant/result data without this page reaching
 * out to any service in this slice.
 */
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  AiDoctorPhase1PlantPicker,
  type AiDoctorPhase1PlantOption,
} from "@/components/AiDoctorPhase1PlantPicker";
import { AiDoctorPhase1ResultPanel } from "@/components/AiDoctorPhase1ResultPanel";
import type {
  AiDoctorContextPayload,
  AiDoctorDiagnosisResult,
} from "@/lib/aiDoctorEnginePhase1Foundation";

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

export const OPERATOR_AI_DOCTOR_PHASE1_ROUTE = "/operator/ai-doctor-phase1";

function buildDeepLink(plantId: string, search: URLSearchParams): string {
  const next = new URLSearchParams(search);
  next.set("plantId", plantId);
  return `${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?${next.toString()}`;
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
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const resultBundle =
    selectedPlant && getResultForPlant
      ? getResultForPlant(selectedPlant.id)
      : null;

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
          <a
            href="/plants"
            className="mt-2 inline-block text-sm text-primary underline"
            data-testid="ai-doctor-phase1-no-plants-cta"
          >
            Go to Plants
          </a>
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
        <section
          data-testid="ai-doctor-phase1-deep-link"
          className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground"
        >
          <div className="font-medium text-foreground">Internal link</div>
          <div>Read-only result view</div>
          <code
            data-testid="ai-doctor-phase1-deep-link-href"
            className="mt-1 block break-all rounded bg-muted px-2 py-1"
          >
            {buildDeepLink(selectedPlant.id, searchParams)}
          </code>
        </section>
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
