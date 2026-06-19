/**
 * Operator Mode — AI Doctor Phase 1 read-only review page.
 *
 * Read-only. Renders a plant picker and, when a plant has a precomputed
 * (or locally-derived) result + context payload, the Phase 1 result panel.
 * No diary/timeline, Action Queue, or alert writes. No Supabase mutations.
 * No live model calls. No device control.
 *
 * Two surfaces:
 *   - `OperatorAiDoctorPhase1` (default export) — pure, injection-friendly
 *     view used by tests. Receives plants + a synchronous result selector.
 *   - `OperatorAiDoctorPhase1Page` (named) — smart wrapper used by the
 *     route. Reads plants/tents + (for the selected plant) recent diary
 *     and sensor rows via existing safe read-only hooks, then derives a
 *     read-only Phase 1 result locally with the pure foundation engine.
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
import { AiDoctorPhase1LoadingState } from "@/components/AiDoctorPhase1LoadingState";
import {
  AiDoctorPhase1EvidenceShortcuts,
  type AiDoctorPhase1RecentActivityRow,
} from "@/components/AiDoctorPhase1EvidenceShortcuts";
import { AiDoctorPhase1MissingContextChecklist } from "@/components/AiDoctorPhase1MissingContextChecklist";
import { usePlants } from "@/hooks/use-plants";
import { useTents } from "@/hooks/use-tents";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import {
  compileAiDoctorContextPayloadFromRows,
  executeAiDoctorEngine,
  type AiDoctorContextPayload,
  type AiDoctorDiagnosisResult,
} from "@/lib/aiDoctorEnginePhase1Foundation";

export const OPERATOR_AI_DOCTOR_PHASE1_ROUTE = "/operator/ai-doctor-phase1";
export const AI_DOCTOR_PHASE1_SENSOR_ANCHOR_ID = "ai-doctor-phase1-sensor-summary";

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

/**
 * Build a read-only navigation href to the plant context/detail page,
 * preserving growId/tentId as query params so downstream views can keep
 * the same plant/grow/tent scope. Navigation only — no writes.
 */
export function buildPlantContextHref(input: {
  plantId: string | null | undefined;
  growId?: string | null;
  tentId?: string | null;
  hash?: string | null;
}): string | null {
  if (!input.plantId) return null;
  const params = new URLSearchParams();
  if (input.growId) params.set("growId", input.growId);
  if (input.tentId) params.set("tentId", input.tentId);
  const qs = params.toString();
  const hash = input.hash ? `#${input.hash.replace(/^#/, "")}` : "";
  return `/plants/${encodeURIComponent(input.plantId)}${qs ? `?${qs}` : ""}${hash}`;
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
      else next.delete("growId");
      if (plant?.tent_id) next.set("tentId", plant.tent_id);
      else next.delete("tentId");
      setSearchParams(next, { replace: false });
    },
    [plants, searchParams, setSearchParams],
  );

  const onClearSelection = React.useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("plantId");
    next.delete("growId");
    next.delete("tentId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const resultBundle =
    selectedPlant ? getResultForPlant(selectedPlant.id) : null;

  const ctaContext = {
    plantId: selectedPlant?.id ?? null,
    growId: selectedPlant?.grow_id ?? null,
    tentId: selectedPlant?.tent_id ?? null,
  };

  const plantContextHref = buildPlantContextHref({
    plantId: selectedPlant?.id ?? null,
    growId: selectedPlant?.grow_id ?? null,
    tentId: selectedPlant?.tent_id ?? null,
  });
  const recentPhotoHref = buildPlantContextHref({
    plantId: selectedPlant?.id ?? null,
    growId: selectedPlant?.grow_id ?? null,
    tentId: selectedPlant?.tent_id ?? null,
    hash: "photos",
  });

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
            Choose a valid plant to review AI Doctor Phase 1 context.
          </p>
          <button
            type="button"
            data-testid="ai-doctor-phase1-unknown-clear-cta"
            onClick={onClearSelection}
            className="mt-2 inline-block rounded-md border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground"
          >
            Clear selection
          </button>
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
          data-testid="ai-doctor-phase1-selected-plant-header"
          aria-label="Selected plant"
          className="space-y-2 rounded-md border border-border bg-card p-4 text-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <h2
                data-testid="ai-doctor-phase1-selected-plant-name"
                className="text-base font-semibold text-foreground"
              >
                {selectedPlant.name}
              </h2>
              <p className="text-xs text-muted-foreground">
                {selectedPlant.strain ? (
                  <span data-testid="ai-doctor-phase1-selected-plant-strain">
                    {selectedPlant.strain}
                  </span>
                ) : null}
                {selectedPlant.stage ? (
                  <>
                    {selectedPlant.strain ? " · " : ""}
                    <span data-testid="ai-doctor-phase1-selected-plant-stage">
                      Stage: {selectedPlant.stage}
                    </span>
                  </>
                ) : null}
                {selectedPlant.tent_name ? (
                  <>
                    {selectedPlant.strain || selectedPlant.stage ? " · " : ""}
                    <span data-testid="ai-doctor-phase1-selected-plant-tent">
                      Tent: {selectedPlant.tent_name}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <span
              data-testid="ai-doctor-phase1-readonly-badge"
              className="rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              Read-only AI Doctor Phase 1
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            No result is saved from this screen.
          </p>
          <div className="flex flex-wrap gap-2">
            {plantContextHref && (
              <Link
                to={plantContextHref}
                data-testid="ai-doctor-phase1-view-plant-context"
                className="inline-block rounded-md border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground"
              >
                View plant context
              </Link>
            )}
            {plantContextHref && (
              <Link
                to={plantContextHref}
                data-testid="ai-doctor-phase1-back-to-plant"
                className="inline-block rounded-md border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground"
              >
                Back to plant
              </Link>
            )}
          </div>
          {!plantContextHref && (
            <p
              data-testid="ai-doctor-phase1-back-to-plant-unavailable"
              className="text-xs text-muted-foreground"
            >
              Plant context link unavailable — select a plant with a known id.
            </p>
          )}
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

          <section
            data-testid="ai-doctor-phase1-evidence-shortcuts"
            aria-label="Evidence shortcuts"
            className="flex flex-wrap gap-2 rounded-md border border-border bg-card p-3 text-xs"
          >
            <span className="text-muted-foreground">Evidence shortcuts:</span>
            {recentPhotoHref && (
              <Link
                to={recentPhotoHref}
                data-testid="ai-doctor-phase1-shortcut-view-recent-photo"
                className="rounded border border-border bg-secondary px-2 py-1 text-secondary-foreground"
              >
                View recent photo
              </Link>
            )}
            <a
              href={`#${AI_DOCTOR_PHASE1_SENSOR_ANCHOR_ID}`}
              data-testid="ai-doctor-phase1-shortcut-open-sensor-summary"
              className="rounded border border-border bg-secondary px-2 py-1 text-secondary-foreground"
            >
              Open sensor summary
            </a>
          </section>

          <div id={AI_DOCTOR_PHASE1_SENSOR_ANCHOR_ID}>
            <AiDoctorPhase1ResultPanel
              context={resultBundle.context}
              result={resultBundle.result}
            />
          </div>
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
  medium?: string | null;
  pot_size?: string | null;
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

/**
 * Read-only derivation: given the selected plant + any safely-readable
 * recent diary/sensor rows, compile the Phase 1 context payload and run
 * the local stubbed engine. Returns `null` when there isn't enough to
 * even compile a plant identity — callers should then render the
 * missing-context/no-result state instead of fabricated content.
 */
function useDerivedAiDoctorPhase1Bundle(
  plant: RawPlantRow | null,
): { context: AiDoctorContextPayload; result: AiDoctorDiagnosisResult } | null {
  const plantId = plant?.id ?? null;
  const tentId = plant?.tent_id ?? null;
  const { data: diaryRows } = usePlantRecentActivity(plantId);
  const { data: sensorRows } = useSensorReadings(tentId ?? undefined, 200);

  const context = React.useMemo<AiDoctorContextPayload | null>(() => {
    if (!plant) return null;
    const logs = (diaryRows ?? [])
      .map((row: Record<string, unknown>) => {
        const occurred_at =
          (row.entry_at as string | null) ?? (row.created_at as string | null);
        if (!occurred_at) return null;
        return {
          id: (row.id as string | null) ?? null,
          occurred_at,
          event_type: ((row.entry_type as string | null) ?? "log").toString(),
          source: "manual",
          note: (row.notes as string | null) ?? null,
        };
      })
      .filter(Boolean) as Array<{
        id: string | null;
        occurred_at: string;
        event_type: string;
        source: string;
        note: string | null;
      }>;

    const sensors = (sensorRows ?? [])
      .filter((r: Record<string, unknown>) =>
        plant.tent_id ? r.tent_id === plant.tent_id : true,
      )
      .map((r: Record<string, unknown>) => ({
        id: (r.id as string | null) ?? null,
        metric: String(r.metric ?? ""),
        value:
          typeof r.value === "number" && Number.isFinite(r.value as number)
            ? (r.value as number)
            : null,
        captured_at:
          (r.ts as string | null) ?? (r.created_at as string | null) ?? "",
        source: String(r.source ?? ""),
      }))
      .filter((r) => r.metric && r.captured_at);

    return compileAiDoctorContextPayloadFromRows({
      plant: {
        id: plant.id,
        name: plant.name ?? null,
        strain: plant.strain ?? null,
        stage: plant.stage ?? null,
        medium: plant.medium ?? null,
        pot_size: plant.pot_size ?? null,
        tent_id: plant.tent_id ?? null,
        grow_id: plant.grow_id ?? null,
      },
      grow: plant.grow_id ? { id: plant.grow_id } : null,
      tent: plant.tent_id ? { id: plant.tent_id } : null,
      logs,
      photos: [],
      sensorReadings: sensors,
    });
  }, [plant, diaryRows, sensorRows]);

  const [result, setResult] = React.useState<AiDoctorDiagnosisResult | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    if (!context) {
      setResult(null);
      return;
    }
    executeAiDoctorEngine({ context }).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [context]);

  if (!context || !result) return null;
  return { context, result };
}

function OperatorAiDoctorPhase1SmartView(props: {
  plants: ReadonlyArray<AiDoctorPhase1PlantOption>;
  rawPlants: ReadonlyArray<RawPlantRow>;
}): JSX.Element {
  const [searchParams] = useSearchParams();
  const plantId = searchParams.get("plantId");
  const selectedRaw =
    props.rawPlants.find((p) => p.id === plantId) ?? null;
  const bundle = useDerivedAiDoctorPhase1Bundle(selectedRaw);
  const getResultForPlant = React.useCallback(
    (id: string) => (selectedRaw && id === selectedRaw.id ? bundle : null),
    [selectedRaw, bundle],
  );
  return (
    <OperatorAiDoctorPhase1
      plants={props.plants}
      getResultForPlant={getResultForPlant}
    />
  );
}

export function OperatorAiDoctorPhase1Page(): JSX.Element {
  const { data: plants } = usePlants();
  const { data: tents } = useTents();
  const rawPlants = (plants ?? []) as RawPlantRow[];
  const options = React.useMemo(
    () => mapPlantsToPickerOptions(rawPlants, (tents ?? []) as RawTentRow[]),
    [rawPlants, tents],
  );
  return <OperatorAiDoctorPhase1SmartView plants={options} rawPlants={rawPlants} />;
}
