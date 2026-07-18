import VpdStageMissingBadge from "@/components/VpdStageMissingBadge";
import { Link } from "react-router-dom";
import { AlertTriangle, Box, Lightbulb, LoaderCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import MetricChip from "@/components/MetricChip";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/EmptyState";
import CreateTentDialog from "@/components/CreateTentDialog";
import TentCardActionsMenu from "@/components/TentCardActionsMenu";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import { useGrowPlants } from "@/hooks/useGrowData";
import { useGrowTents, getGrowDataMeta } from "@/hooks/useGrowData";
import { useSensorReadingsByTents } from "@/hooks/use-sensor-readings";
import { useNowTick } from "@/hooks/useNowTick";
import { useAuth } from "@/store/auth";

import { useScopedGrow } from "@/hooks/useScopedGrow";
import { useGrows } from "@/store/grows";
import { tentDetailPath, tentsPath } from "@/lib/routes";
import { isUuid } from "@/lib/isUuid";
import { loadTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import { formatTentLightStatus } from "@/lib/lightScheduleFormat";
import { resolveVerifiedAssignedPlantCount } from "@/lib/tentManagementRules";
import { normalizeVpdStage } from "@/lib/vpdStageTargetRules";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { classifyRequestedGrowScopeState } from "@/lib/growScopeAsyncStateRules";
import {
  classifyTentsPageAsyncState,
  selectCurrentTentsQueryData,
  snapshotTentsQuery,
} from "@/lib/tentsPageAsyncStateRules";

const EMPTY_QUERY_ROWS: never[] = [];

function formatPlantCount(count: number): string {
  return `${count} ${count === 1 ? "plant" : "plants"}`;
}

export default function Tents() {
  const { user } = useAuth();
  // Shared URL `?growId=` resolution against RLS-loaded grows.
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();
  const {
    loading: growsLoading = false,
    error: growsError = null,
    refresh: refreshGrows,
  } = useGrows();
  const validGrowId = isValidScopedGrow ? (urlGrowId ?? undefined) : undefined;
  const scopeState = classifyRequestedGrowScopeState({
    hasRequestedGrow: !!urlGrowId,
    isLoading: growsLoading,
    hasError: !!growsError,
    isValid: isValidScopedGrow,
  });
  const tentsQuery = useGrowTents(urlGrowId ?? undefined);
  const tents = selectCurrentTentsQueryData(tentsQuery) ?? EMPTY_QUERY_ROWS;
  // SENSOR TRUTH: per-tent raw reading windows (same hook as the Dashboard
  // Environment Snapshot strip) instead of the legacy grouped shape, which
  // fabricated 0 for missing metrics and could not carry per-metric truth.
  // statusByTent distinguishes "no rows" from "not loaded"/"failed" so a
  // pending or failed read is never presented as established absence.
  // Mock-fallback tent ids ("t1"…) would 400 against the uuid tent_id
  // column and mislabel every demo card "unavailable" — only query real
  // UUIDs; a non-UUID id cannot have rows, so its absence is established.
  const {
    byTent: readingsByTent,
    statusByTent: sensorStatusByTent,
    retryTent: retrySensorTent,
  } = useSensorReadingsByTents(tents.map((t) => t.id).filter((id) => isUuid(id)));
  const temperatureUnit = loadTemperatureUnitPreference();
  // Freshness is time-relative: re-evaluate the presenter's clock every
  // minute so an open tab cannot keep a fresh label past the stale boundary.
  const nowTick = useNowTick();
  // AUD-001 fix: use real plants (Supabase, RLS-scoped) instead of mock
  // so plant counts match the assigned-tent reality. Mock plants reference
  // mock tent ids ("t1"..) which never match real tent UUIDs.
  const plantsQuery = useGrowPlants(undefined, urlGrowId ?? undefined);
  const plants = selectCurrentTentsQueryData(plantsQuery) ?? EMPTY_QUERY_ROWS;
  // Destructive Tent actions need a separate, current assignment proof that
  // includes archived/merged plants. The active roster remains display-only.
  const assignmentPlantsQuery = useGrowPlants(undefined, urlGrowId ?? undefined, {
    includeArchived: true,
  });
  const tentsMeta = getGrowDataMeta(["grow", "tents", urlGrowId ?? "all"], user?.id);
  const tentsAsyncState = classifyTentsPageAsyncState({
    primary: snapshotTentsQuery(tentsQuery),
    primaryRowCount: tents.length,
    plants: snapshotTentsQuery(plantsQuery),
    assignments: snapshotTentsQuery(assignmentPlantsQuery),
    sensorStatusByTent: sensorStatusByTent,
    primaryTentIds: tents.map((tent) => tent.id).filter((id) => isUuid(id)),
  });
  const canCreateTent =
    (scopeState === "unscoped" || scopeState === "valid") &&
    tentsAsyncState.kind !== "loading" &&
    tentsAsyncState.kind !== "error" &&
    !tentsAsyncState.primaryRefreshFailed &&
    !tentsAsyncState.primaryRefreshing;

  const pageLead = (
    <>
      <GrowBreadcrumbs
        growId={scopeState === "valid" ? urlGrowId : null}
        growName={scopeState === "valid" ? scopedGrowName : null}
        current="Tents"
        section="tents"
      />
      <PageHeader
        title="Tents"
        description="Your grow tents — environment, lighting, and assigned plants."
        icon={<Box className="h-5 w-5" />}
        actions={canCreateTent ? <CreateTentDialog defaultGrowId={validGrowId} /> : null}
      />
    </>
  );

  const renderLoading = (reason: "scope" | "tents") => (
    <div className="min-w-0" data-testid="tents-root">
      {pageLead}
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-testid="tents-loading"
        data-loading-reason={reason}
        className="glass rounded-2xl min-h-48 p-6 flex items-center justify-center text-center"
      >
        <div className="space-y-2" data-testid="tents-grow-data-loading">
          <LoaderCircle className="h-6 w-6 animate-spin text-primary mx-auto" aria-hidden="true" />
          <p className="font-medium">Loading tent data…</p>
          <p className="text-sm text-muted-foreground">
            {reason === "scope"
              ? "Confirming the selected grow before enabling tent actions."
              : "Confirming tent records before showing an empty workspace."}
          </p>
        </div>
      </div>
    </div>
  );

  if (scopeState === "loading") return renderLoading("scope");

  if (scopeState === "error") {
    return (
      <div>
        {pageLead}
        <div role="alert" aria-live="assertive">
          <EmptyState
            icon={<AlertTriangle className="h-6 w-6" />}
            title="Grow scope unavailable"
            description="We couldn't verify the selected grow. Tent actions stay disabled until that grow is confirmed."
            action={
              typeof refreshGrows === "function" ? (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="tents-retry-scope"
                  onClick={() => void refreshGrows()}
                >
                  Retry grow scope
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>
    );
  }

  if (scopeState === "invalid") {
    return (
      <div>
        {pageLead}
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Grow unavailable"
          description="This grow could not be found in your account. No other grow was selected in its place."
          action={
            <Button asChild variant="outline">
              <Link to={tentsPath()}>View all tents</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (tentsAsyncState.kind === "loading") return renderLoading("tents");

  if (tentsAsyncState.kind === "error") {
    return (
      <div>
        {pageLead}
        <div role="alert" aria-live="assertive" data-testid="tents-grow-data-error">
          <EmptyState
            icon={<AlertTriangle className="h-6 w-6" />}
            title="Tents unavailable"
            description="We couldn't confirm your tent records. This is not an empty grow. Nothing has been changed; try this tent-list request again."
            action={
              <Button
                type="button"
                variant="outline"
                data-testid="tents-retry-primary"
                aria-label="Retry tent list"
                onClick={() => void tentsQuery.refetch()}
              >
                Retry tent list
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0" data-testid="tents-root">
      {pageLead}

      {urlGrowId && (
        <ScopedGrowBanner
          growId={urlGrowId}
          growName={scopedGrowName}
          label="tents"
          clearHref={tentsPath()}
          backHref={backHref}
        />
      )}

      <GrowDataSourceDisclosure
        resource="tents"
        hasAnyData={tents.length > 0}
        metas={[tentsMeta]}
        testId="tents-data-source-disclosure"
      />

      {tentsAsyncState.kind === "limited" && tents.length > 0 && (
        <section
          role="status"
          data-testid="tents-limited-data"
          className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium">Some tent details are limited</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Confirmed tent cards stay visible. Missing plant assignments or sensor readings are
                not inferred.
              </p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {tentsAsyncState.primaryRefreshFailed && (
                  <li
                    data-testid="tents-primary-refresh-error"
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>Tent list refresh unavailable; showing last loaded tents.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Retry tent list refresh"
                      onClick={() => void tentsQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </li>
                )}
                {tentsAsyncState.primaryRefreshing && (
                  <li data-testid="tents-primary-refreshing" className="text-muted-foreground">
                    Tent list is refreshing; showing last loaded tents. Create waits for the current
                    result.
                  </li>
                )}
                {tentsAsyncState.plantsStatus === "loading" && (
                  <li data-testid="tents-plants-pending" className="text-muted-foreground">
                    Active plant assignments still loading. Display counts stay unavailable.
                  </li>
                )}
                {tentsAsyncState.plantsStatus === "error" && (
                  <li
                    data-testid="tents-plants-error"
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      Active plant assignments unavailable. Display counts stay unavailable.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Retry plant assignments"
                      onClick={() => void plantsQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </li>
                )}
                {tentsAsyncState.plantsStatus === "stale" && (
                  <li
                    data-testid="tents-plants-stale"
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      Active plant assignment refresh failed; showing last loaded display data.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Retry plant assignments"
                      onClick={() => void plantsQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </li>
                )}
                {tentsAsyncState.plantsStatus === "refreshing" && (
                  <li data-testid="tents-plants-refreshing" className="text-muted-foreground">
                    Active plant assignments are refreshing; showing last loaded display counts.
                  </li>
                )}
                {tentsAsyncState.assignmentPlantsStatus === "loading" && (
                  <li
                    data-testid="tents-assignment-guard-loading"
                    className="text-muted-foreground"
                  >
                    Tent management checks still loading. Archive and delete stay disabled.
                  </li>
                )}
                {tentsAsyncState.assignmentPlantsStatus === "error" && (
                  <li
                    data-testid="tents-assignment-guard-error"
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      Tent management checks unavailable. Archive and delete stay disabled.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Retry tent management checks"
                      onClick={() => void assignmentPlantsQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </li>
                )}
                {tentsAsyncState.assignmentPlantsStatus === "stale" && (
                  <li
                    data-testid="tents-assignment-guard-stale"
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      Tent management check refresh failed. Archive and delete stay disabled.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Retry tent management checks"
                      onClick={() => void assignmentPlantsQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </li>
                )}
                {tentsAsyncState.assignmentPlantsStatus === "refreshing" && (
                  <li
                    data-testid="tents-assignment-guard-refreshing"
                    className="text-muted-foreground"
                  >
                    Tent management checks are refreshing. Archive and delete stay disabled.
                  </li>
                )}
                {tentsAsyncState.sensorLoadingTentIds.length > 0 && (
                  <li data-testid="tents-sensors-pending" className="text-muted-foreground">
                    Sensor readings still loading for {tentsAsyncState.sensorLoadingTentIds.length}{" "}
                    {tentsAsyncState.sensorLoadingTentIds.length === 1 ? "tent" : "tents"}.
                  </li>
                )}
                {tentsAsyncState.sensorErrorTentIds.map((tentId) => {
                  const tentName = tents.find((tent) => tent.id === tentId)?.name ?? "Tent";
                  return (
                    <li
                      key={tentId}
                      data-testid={`tents-sensor-error-${tentId}`}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>{tentName} sensor readings unavailable.</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Retry ${tentName} sensor readings`}
                        onClick={() => void retrySensorTent?.(tentId)}
                      >
                        Retry
                      </Button>
                    </li>
                  );
                })}
                {tentsAsyncState.sensorRefreshFailedTentIds.map((tentId) => {
                  const tentName = tents.find((tent) => tent.id === tentId)?.name ?? "Tent";
                  const hasLastLoadedReadings = (readingsByTent[tentId]?.length ?? 0) > 0;
                  return (
                    <li
                      key={tentId}
                      data-testid={`tents-sensor-refresh-error-${tentId}`}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        {hasLastLoadedReadings
                          ? `${tentName} sensor refresh unavailable; showing last loaded readings.`
                          : `${tentName} sensor refresh unavailable; last loaded result had no readings.`}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Retry ${tentName} sensor readings`}
                        onClick={() => void retrySensorTent?.(tentId)}
                      >
                        Retry
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      )}
      {tents.length === 0 ? (
        <EmptyState
          icon={<Box className="h-6 w-6" />}
          title="No tents yet"
          description="Set up your first tent to start tracking."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tents.map((t) => {
            // Same presenter as the Dashboard Environment Snapshot strip:
            // newest reading only, missing metrics stay "—" (never a
            // fabricated 0, which C→F conversion would render as a fake
            // 32.0°F), stale/invalid labeled per metric.
            const snapView = buildTentSnapshotView(
              (readingsByTent[t.id] ?? []) as BuildTentSnapshotInput[],
              t.stage,
              nowTick,
              { temperatureUnit },
            );
            // Pending/failed reads must not masquerade as established
            // absence ("No sensor data yet") or as data. Non-UUID ids
            // (mock-fallback tents) are never queried — a uuid column
            // cannot hold them, so their absence is established.
            const sensorReadStatus = isUuid(t.id)
              ? (sensorStatusByTent[t.id] ?? "loading")
              : "success";
            const vpdMetric = snapView.metrics.find((m) => m.key === "vpd");
            const hasVpdValue = !!vpdMetric && vpdMetric.status !== "unknown";
            const plantCount = plants.filter((p) => p.tentId === t.id).length;
            const plantCountCopy =
              tentsAsyncState.plantsStatus === "ready"
                ? formatPlantCount(plantCount)
                : tentsAsyncState.plantsStatus === "stale"
                  ? `${formatPlantCount(plantCount)} (last loaded)`
                  : tentsAsyncState.plantsStatus === "refreshing"
                    ? `${formatPlantCount(plantCount)} (refreshing)`
                    : tentsAsyncState.plantsStatus === "loading"
                      ? "Plant count loading"
                      : "Plant count unavailable";
            const assignedPlantCount = resolveVerifiedAssignedPlantCount(
              assignmentPlantsQuery,
              (plant) => plant.tentId === t.id,
            );
            return (
              <div
                key={t.id}
                data-testid={`tents-card-${t.id}`}
                className="relative min-w-0 animate-fade-in"
              >
                <Link
                  to={tentDetailPath(t.id)}
                  className="glass min-w-0 rounded-2xl p-5 hover:border-primary/50 transition group flex flex-col gap-3"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2 pr-8">
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words [overflow-wrap:anywhere] font-display text-lg font-semibold group-hover:text-primary transition">
                        {t.name}
                      </h2>
                      <p className="break-words [overflow-wrap:anywhere] text-xs text-muted-foreground">
                        {t.brand} · {t.size}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <StageBadge stage={t.stage} />
                    </div>
                  </div>

                  {sensorReadStatus === "loading" ? (
                    <p
                      className="text-xs text-muted-foreground animate-pulse"
                      data-testid={`tents-list-sensor-loading-${t.id}`}
                    >
                      Loading sensor data…
                    </p>
                  ) : sensorReadStatus === "error" ? (
                    <p
                      className="text-xs text-muted-foreground"
                      data-testid={`tents-list-sensor-unavailable-${t.id}`}
                    >
                      Sensor data unavailable — readings couldn't be loaded.
                    </p>
                  ) : snapView.hasReading ? (
                    <>
                      {sensorReadStatus === "refresh_error" && (
                        <p
                          className="text-xs text-amber-600"
                          data-testid={`tents-list-sensor-refresh-stale-${t.id}`}
                        >
                          Refresh unavailable — last loaded readings shown.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {snapView.metrics.map((m) => (
                          <div
                            key={m.key}
                            data-testid={`tents-list-metric-${t.id}-${m.key}`}
                            data-status={m.status}
                            className="inline-flex items-center gap-1"
                          >
                            <MetricChip
                              label={m.key === "temp" ? "T" : m.key === "rh" ? "RH" : "VPD"}
                              value={m.display}
                              unit={m.unit}
                              status={m.chipStatus}
                            />
                            {m.statusLabel && (
                              <span
                                data-testid={`tents-list-metric-status-${t.id}-${m.key}`}
                                className={
                                  m.status === "invalid"
                                    ? "text-[10px] uppercase tracking-wide text-destructive"
                                    : m.status === "stale"
                                      ? "text-[10px] uppercase tracking-wide text-amber-600"
                                      : "text-[10px] uppercase tracking-wide text-muted-foreground"
                                }
                              >
                                {m.statusLabel}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                        <span
                          data-testid={`tents-list-sensor-source-${t.id}`}
                          data-source-label={snapView.sourceLabel}
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide border-border/50 bg-secondary/40"
                        >
                          {snapView.sourceLabel}
                        </span>
                        <span data-testid={`tents-list-sensor-last-updated-${t.id}`}>
                          Last updated {snapView.lastUpdatedDisplay}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p
                      className="text-xs text-muted-foreground"
                      data-testid={`tents-list-sensor-empty-${t.id}`}
                    >
                      {sensorReadStatus === "refresh_error"
                        ? "Last loaded result had no readings; refresh unavailable."
                        : "No sensor data yet"}
                    </p>
                  )}

                  {hasVpdValue &&
                    snapView.canAssessStage &&
                    normalizeVpdStage(t.stage) === "unknown" && (
                      <VpdStageMissingBadge testId="tents-list-vpd-stage-missing-badge" />
                    )}

                  <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
                    <span data-testid={`tent-plant-count-status-${t.id}`}>{plantCountCopy}</span>
                    <span className="ml-auto inline-flex min-w-0 items-center gap-1 break-words [overflow-wrap:anywhere]">
                      <Lightbulb
                        className={`h-3 w-3 shrink-0 ${t.light.on ? "text-[hsl(var(--warning))]" : "text-muted-foreground"}`}
                      />
                      {formatTentLightStatus({ on: t.light.on, schedule: t.light.schedule })}
                    </span>
                    <span
                      className="basis-full min-w-0"
                      data-testid={`tent-card-plant-health-status-${t.id}`}
                      aria-label="Plant health not assessed. Sensor status is shown separately."
                      title="No alert assessment is loaded for this card. Sensor status is shown separately."
                    >
                      {tentsAsyncState.plantsStatus === "ready"
                        ? "Plant health not assessed"
                        : "Plant health unavailable"}
                    </span>
                  </div>
                </Link>
                <div className="absolute top-3 right-3 z-10">
                  <TentCardActionsMenu
                    tent={{
                      id: t.id,
                      name: t.name,
                      brand: t.brand,
                      size: t.size,
                      stage: t.stage,
                      light: t.light,
                    }}
                    assignedPlantCount={assignedPlantCount}
                    onRetryAssignments={() => void assignmentPlantsQuery.refetch()}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
