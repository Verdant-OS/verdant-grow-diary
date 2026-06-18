import VpdStageMissingBadge from "@/components/VpdStageMissingBadge";
import EcowittLatestSnapshotCard from "@/components/EcowittLatestSnapshotCard";
import EnvironmentStabilityCard from "@/components/EnvironmentStabilityCard";
import TentAiDoctorSessionsPanel from "@/components/TentAiDoctorSessionsPanel";
import { computeEnvironmentStability } from "@/lib/environmentStabilityRules";
import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import MetricChip from "@/components/MetricChip";
import SensorChart from "@/components/SensorChart";
import EmptyState from "@/components/EmptyState";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import QuickLogV2Fab from "@/components/QuickLogV2Fab";
import QuickLogModal from "@/components/QuickLogModal";
import { ArrowLeft, Box, Lightbulb, Plus, Archive, GitMerge, NotebookPen } from "lucide-react";
import CreatePlantDialog from "@/components/CreatePlantDialog";
import AddExistingPlantDialog from "@/components/AddExistingPlantDialog";
import PlantCardActionsMenu from "@/components/PlantCardActionsMenu";
import TentCardActionsMenu from "@/components/TentCardActionsMenu";
import PlantPhoto from "@/components/PlantPhoto";
import TentManualSnapshotChangeContext from "@/components/TentManualSnapshotChangeContext";
import TentManualSnapshotHistoryList from "@/components/TentManualSnapshotHistoryList";
import ManualSnapshotTimelineSection from "@/components/ManualSnapshotTimelineSection";
import TimelineMemorySection from "@/components/TimelineMemorySection";
import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";

import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";
import TentSensorWebhookSettingsCard from "@/components/TentSensorWebhookSettingsCard";
import TentBridgeTokensCard from "@/components/TentBridgeTokensCard";
import TentSensorSourceHealthCard from "@/components/TentSensorSourceHealthCard";
import SensorSnapshotTruthStrip from "@/components/SensorSnapshotTruthStrip";
import { buildSensorSnapshotReadModel } from "@/lib/sensors/sensorSnapshotReadModel";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useGrowTent, useGrowPlants, getGrowDataMeta } from "@/hooks/useGrowData";
import {
  buildTentSensorChartSeries,
  buildTentSensorHeaderView,
} from "@/lib/tentSensorChartRules";
import { tempFFromC } from "@/lib/temperatureUnits";
import { formatSensorValue } from "@/lib/sensorFormat";
import {
  filterVisiblePlants,
  getActivePlantCount,
  getArchivedPlantLabel,
  shouldShowArchivedToggle,
} from "@/lib/archivedPlantVisibilityRules";
import {
  classifyVpdAgainstStage,
  normalizeVpdStage,
  vpdMetricChipStatus,
  VPD_STAGE_HELPER_TEXT,
} from "@/lib/vpdStageTargetRules";
import {
  classifyTempAgainstStage,
  classifyRhAgainstStage,
  environmentMetricChipStatus,
} from "@/lib/environmentStageTargetRules";
import { cn } from "@/lib/utils";
import FirstPlantMemoryCta from "@/components/FirstPlantMemoryCta";
import { buildPlantQuickLogPrefill } from "@/lib/plantQuickLogPrefillRules";

import { plantDetailPath, tentsPath } from "@/lib/routes";

export default function TentDetail() {
  const { id } = useParams();
  const [showArchived, setShowArchived] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const { data: tent, isLoading, isError, refetch } = useGrowTent(id);
  const { data: activePlants = [] } = useGrowPlants(id);
  const { data: allPlants = [] } = useGrowPlants(id, undefined, { includeArchived: true });
  const { data: readings = [] } = useSensorReadings(id);
  const series = buildTentSensorChartSeries(readings);
  const header = buildTentSensorHeaderView(readings);
  const snap = header.snapshot;
  const tentMeta = getGrowDataMeta(["grow", "tent", id ?? null]);
  const activeCount = getActivePlantCount(activePlants);
  const hasArchived = shouldShowArchivedToggle(allPlants);
  const visiblePlants = filterVisiblePlants(allPlants, { showArchived });

  if (isLoading) {
    return (
      <div
        className="glass rounded-2xl h-64 animate-pulse"
        role="status"
        aria-busy="true"
        aria-label="Loading tent"
        data-testid="tent-detail-loading"
      />
    );
  }
  if (isError) {
    return (
      <div data-testid="tent-detail-error" role="alert">
        <GrowDataSourceDisclosure
          resource="tents"
          hasAnyData={false}
          metas={[tentMeta]}
          testId="tent-detail-data-source-disclosure"
        />
        <EmptyState
          icon={<Box className="h-6 w-6" />}
          title="Couldn't load this tent"
          description="Something went wrong while loading this tent. Check your connection and try again."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => { void refetch(); }}
                data-testid="tent-detail-error-retry"
                className="min-h-11"
              >
                Retry
              </Button>
              <Button asChild variant="ghost" className="min-h-11">
                <Link to={tentsPath()}>
                  <ArrowLeft className="h-4 w-4" /> Back to tents
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }
  if (!tent) {
    return (
      <div>
        <GrowDataSourceDisclosure
          resource="tents"
          hasAnyData={false}
          metas={[tentMeta]}
          testId="tent-detail-data-source-disclosure"
        />
        <EmptyState
          icon={<Box className="h-6 w-6" />}
          title="Tent not found"
          description="This tent isn't in your tracked tents yet."
          action={
            <Button asChild variant="outline">
              <Link to={tentsPath()}>
                <ArrowLeft className="h-4 w-4" /> Back to tents
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <QuickLogV2Fab defaultTargetKey={tent?.id ? `tent:${tent.id}` : null} />
      <Button
        type="button"
        onClick={() => setQuickLogOpen(true)}
        className="fixed bottom-20 left-4 md:bottom-6 md:left-6 z-40 shadow-lg pb-[env(safe-area-inset-bottom)] md:pb-0 gradient-leaf text-primary-foreground"
        size="lg"
        aria-label="Open Quick Log"
        data-testid="tent-detail-quick-log-fab"
      >
        <NotebookPen className="mr-2 h-5 w-5" />
        Quick Log
      </Button>
      {tent && id && (
        <QuickLogModal
          open={quickLogOpen}
          onOpenChange={setQuickLogOpen}
          tentId={id}
          growId={tent.growId ?? ""}
          tentName={tent.name}
          plants={visiblePlants.map((p) => ({ id: p.id, name: p.name }))}
        />
      )}
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link to={tentsPath()}><ArrowLeft className="h-4 w-4" /> Tents</Link></Button>
      <PageHeader
        title={tent.name}
        description={`${tent.brand} · ${tent.size}`}
        icon={<Box className="h-5 w-5" />}
        actions={<StageBadge stage={tent.stage} />}
      />

      <GrowDataSourceDisclosure
        resource="tent"
        hasAnyData
        metas={[tentMeta]}
        testId="tent-detail-data-source-disclosure"
      />

      <div className="mb-3">
        <TentCardActionsMenu
          tent={{
            id: tent.id,
            name: tent.name,
            brand: tent.brand,
            size: tent.size,
            stage: tent.stage,
            light: tent.light,
          }}
          assignedPlantCount={activeCount}
          variant="row"
          hideView
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-5" data-testid="tent-detail-metric-chips">
        {snap?.temp !== null && snap?.temp !== undefined && (
          <MetricChip label="T" value={(tempFFromC(snap.temp) ?? 0).toFixed(1)} unit="°F" status={environmentMetricChipStatus(classifyTempAgainstStage(snap.temp, { stage: tent.stage, stale: header.stale }))} />
        )}
        {snap?.rh !== null && snap?.rh !== undefined && (
          <MetricChip label="RH" value={snap.rh} unit="%" status={environmentMetricChipStatus(classifyRhAgainstStage(snap.rh, { stage: tent.stage, stale: header.stale }))} />
        )}
        {snap?.vpd !== null && snap?.vpd !== undefined && (() => {
          const vpd = classifyVpdAgainstStage({
            value: snap.vpd,
            stage: tent.stage,
            stale: header.stale,
          });
          // #21: route VPD chip through the canonical sensor formatter so
          // header precision matches Recent manual snapshots (2-decimal cap).
          return (
            <MetricChip
              label="VPD"
              value={formatSensorValue("vpd_kpa", snap.vpd).replace(/\s*kPa$/, "")}
              unit=" kPa"
              status={vpdMetricChipStatus(vpd)}
            />
          );
        })()}
        {snap?.co2 !== null && snap?.co2 !== undefined && (
          <MetricChip label="CO₂" value={snap.co2} unit=" ppm" />
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Lightbulb className={`h-3.5 w-3.5 ${tent.light.on ? "text-[hsl(var(--warning))]" : ""}`} />
          {tent.light.schedule} · {tent.light.wattage}W
        </span>
      </div>
      {snap?.vpd !== null && snap?.vpd !== undefined && (() => {
        const vpd = classifyVpdAgainstStage({
          value: snap.vpd,
          stage: tent.stage,
          stale: header.stale,
        });
        return (
          <p
            className="text-[11px] text-muted-foreground -mt-3 mb-4"
            data-testid="tent-detail-vpd-stage-hint"
          >
            {vpd.label}. {VPD_STAGE_HELPER_TEXT}
          </p>
        );
      })()}
      {snap?.vpd !== null && snap?.vpd !== undefined && normalizeVpdStage(tent.stage) === "unknown" && (
        <VpdStageMissingBadge
          testId="tent-detail-vpd-stage-missing-badge"
          className="mb-4"
        />
      )}

      <EnvironmentStabilityCard
        testId="tent-detail-environment-stability"
        className="mb-4"
        result={computeEnvironmentStability(series, { stage: tent.stage })}
      />




      <div className="glass rounded-2xl p-4 mb-6">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="font-display font-semibold">Environment</h2>
          {header.hasReadings && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {header.capturedAt && (
                <span data-testid="tent-detail-sensor-captured">
                  Captured {formatDistanceToNow(new Date(header.capturedAt), { addSuffix: true })}
                </span>
              )}
              {header.sourceLabel && (
                <span
                  className="rounded-md border px-1.5 py-0.5"
                  data-testid="tent-detail-sensor-source"
                >
                  {header.sourceLabel}
                </span>
              )}
              {header.stale && (
                <span
                  className="rounded-md border border-[hsl(var(--warning))] px-1.5 py-0.5 text-[hsl(var(--warning))]"
                  data-testid="tent-detail-sensor-stale"
                >
                  Stale
                </span>
              )}
            </div>
          )}
        </div>
        <SensorSnapshotTruthStrip
          model={buildSensorSnapshotReadModel({
            snapshot: header.snapshot,
            truth: header.truth,
          })}
          className="mb-3"
          testId="tent-detail-sensor-snapshot-truth"
        />
        <TentManualSnapshotChangeContext tentId={id ?? null} readings={readings} />
        {series.length === 0 ? (
          <p
            className="text-sm text-muted-foreground py-6 text-center"
            data-testid="tent-detail-sensor-empty"
          >
            No sensor readings yet.
          </p>
        ) : (
          <SensorChart data={series as unknown as Parameters<typeof SensorChart>[0]["data"]} metric="temp" height={200} />
        )}
      </div>

      <section
        className="glass rounded-2xl p-4 mb-6"
        aria-label="Latest EcoWitt Snapshot"
        data-testid="tent-detail-ecowitt-section"
      >
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="font-display font-semibold">
              Latest EcoWitt Snapshot
            </h2>
            <p className="text-xs text-muted-foreground">
              Most recent EcoWitt reading for this tent. Not live device control.
            </p>
          </div>
        </div>
        <EcowittLatestSnapshotCard
          tentId={id ?? null}
          tentName={tent?.name}
          title="Latest EcoWitt Snapshot"
        />
      </section>

      <TentManualSnapshotHistoryList tentId={id ?? null} readings={readings} />

      <ManualSnapshotTimelineSection scope="tent" tentId={id ?? null} />

      <QuickLogGroupedTimelineSection scope="tent" tentId={id ?? null} />

      <TimelineMemorySection scope="tent" tentId={id ?? null} />


      <ImportedSensorHistoryPanel tentId={id ?? null} readings={readings} />

      {id && <TentSensorWebhookSettingsCard tentId={id} />}
      {id && <TentBridgeTokensCard tentId={id} />}
      {id && <TentSensorSourceHealthCard tentId={id} />}

      <TentAiDoctorSessionsPanel tentId={id ?? null} />




      {activeCount > 0 && id && (() => {
        const primary = activePlants[0];
        const prefill = buildPlantQuickLogPrefill({
          plantId: primary?.id ?? null,
          plantName: primary?.name ?? null,
          growId: tent.growId ?? null,
          tentId: id,
          tentName: tent.name ?? null,
        });
        return <FirstPlantMemoryCta prefill={prefill} testId="tent-detail-first-plant-memory-cta" />;
      })()}

      <TentPlantRosterPanel
        viewModel={buildTentPlantRosterViewModel({
          tentId: id ?? null,
          plants: visiblePlants.map((p) => ({
            id: p.id,
            name: p.name,
            strain: p.strain,
            stage: p.stage,
            tentId: p.tentId,
            isArchived: p.isArchived,
          })),
          tentSensorContextLabel: header.sourceLabel ?? null,
        })}
      />

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="font-display font-semibold">
            Plants in this tent ({activeCount}
            {hasArchived && allPlants.length > activeCount
              ? ` active · ${allPlants.length - activeCount} archived`
              : ""}
            )
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {hasArchived && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                data-testid="tent-detail-show-archived-toggle"
                aria-pressed={showArchived}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition inline-flex items-center gap-1",
                  showArchived
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 border-border/50 hover:bg-secondary",
                )}
              >
                <Archive className="h-3 w-3" />
                {showArchived ? "Hide archived plants" : "Show archived plants"}
              </button>
            )}
            <AddExistingPlantDialog
              tentId={id ?? ""}
              growId={tent.growId ?? null}
            />
            <CreatePlantDialog
              defaultTentId={id}
              defaultGrowId={tent.growId ?? undefined}
              trigger={
                <Button size="sm" className="gradient-leaf text-primary-foreground gap-1">
                  <Plus className="h-4 w-4" /> Add Plant to This Tent
                </Button>
              }
            />
          </div>
        </div>
        {visiblePlants.length === 0 ? (
          <div
            className="flex flex-col items-start gap-3 py-4"
            data-testid="tent-detail-plants-empty"
          >
            <p className="text-sm text-muted-foreground">
              {activeCount === 0 && hasArchived
                ? "No active plants in this tent."
                : "No plants in this tent yet."}
            </p>
            <div className="flex flex-wrap gap-2">
              <AddExistingPlantDialog
                tentId={id ?? ""}
                growId={tent.growId ?? null}
                trigger={
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    data-testid="tent-detail-empty-add-existing-plant"
                  >
                    Add Existing Plant
                  </Button>
                }
              />
              <CreatePlantDialog
                defaultTentId={id}
                defaultGrowId={tent.growId ?? undefined}
                trigger={
                  <Button
                    size="sm"
                    className="gradient-leaf text-primary-foreground gap-1"
                    data-testid="tent-detail-empty-add-plant"
                  >
                    <Plus className="h-4 w-4" /> Add Plant to This Tent
                  </Button>
                }
              />
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="tent-detail-plants-grid">
            {visiblePlants.map((p) => {
              const archivedLabel = getArchivedPlantLabel(p);
              const isInactive = archivedLabel.kind !== "active";
              return (
                <div
                  key={p.id}
                  className={cn(
                    "rounded-xl border border-border/40 overflow-hidden hover:border-primary/50 transition relative",
                    isInactive && "opacity-70",
                  )}
                  data-testid="tent-detail-plant-card"
                  data-archived={isInactive ? "true" : "false"}
                  data-archived-kind={archivedLabel.kind}
                >
                  <Link to={plantDetailPath(p.id, { tentId: id ?? null })} className="block">
                    <PlantPhoto src={p.photo} alt={p.name} className="aspect-video" caption="No plant photo yet" />
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2 pr-8">
                        <span className="font-medium text-sm" data-testid="tent-detail-plant-name">{p.name}</span>
                        <StageBadge stage={p.stage} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5" data-testid="tent-detail-plant-strain">{p.strain}</p>
                      {isInactive && (
                        <Badge
                          variant="outline"
                          data-testid="tent-detail-plant-archived-badge"
                          data-archived-kind={archivedLabel.kind}
                          className="mt-1 text-[10px] gap-1 border-amber-500/40 text-amber-300"
                        >
                          {archivedLabel.kind === "merged" ? (
                            <GitMerge className="h-3 w-3" />
                          ) : (
                            <Archive className="h-3 w-3" />
                          )}
                          {archivedLabel.kind === "merged" ? "Merged / Archived" : "Archived"}
                        </Badge>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1 capitalize">{p.health}</p>
                    </div>
                  </Link>
                  <div className="absolute top-2 right-2">
                    <PlantCardActionsMenu
                      plant={{
                        id: p.id,
                        name: p.name,
                        strain: p.strain,
                        stage: p.stage,
                        health: p.health,
                        startedAt: p.startedAt,
                        tentId: p.tentId ?? tent.id,
                        growId: p.growId ?? tent.growId ?? null,
                        lastNote: p.lastNote,
                        isArchived: p.isArchived ?? false,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
