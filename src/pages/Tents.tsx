import VpdStageMissingBadge from "@/components/VpdStageMissingBadge";
import { Link } from "react-router-dom";
import { Box, Lightbulb } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import MetricChip from "@/components/MetricChip";
import { Badge } from "@/components/ui/badge";
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

import { useScopedGrow } from "@/hooks/useScopedGrow";
import { tentDetailPath, tentsPath } from "@/lib/routes";
import { isUuid } from "@/lib/growRepo";
import { loadTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import { formatTentLightStatus } from "@/lib/lightScheduleFormat";
import { deriveTentHealthChip } from "@/lib/tentHealthChip";
import { normalizeVpdStage } from "@/lib/vpdStageTargetRules";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";

function formatTentPlantHealthCopy(copy: string): string {
  return copy.replace(/^●\s*/, "");
}

export default function Tents() {
  // Shared URL `?growId=` resolution against RLS-loaded grows.
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();
  const validGrowId = isValidScopedGrow ? (urlGrowId ?? undefined) : undefined;
  const { data: tents = [], isLoading } = useGrowTents(urlGrowId ?? undefined);
  // SENSOR TRUTH: per-tent raw reading windows (same hook as the Dashboard
  // Environment Snapshot strip) instead of the legacy grouped shape, which
  // fabricated 0 for missing metrics and could not carry per-metric truth.
  // statusByTent distinguishes "no rows" from "not loaded"/"failed" so a
  // pending or failed read is never presented as established absence.
  // Mock-fallback tent ids ("t1"…) would 400 against the uuid tent_id
  // column and mislabel every demo card "unavailable" — only query real
  // UUIDs; a non-UUID id cannot have rows, so its absence is established.
  const { byTent: readingsByTent, statusByTent: sensorStatusByTent } = useSensorReadingsByTents(
    tents.map((t) => t.id).filter((id) => isUuid(id)),
  );
  const temperatureUnit = loadTemperatureUnitPreference();
  // Freshness is time-relative: re-evaluate the presenter's clock every
  // minute so an open tab cannot keep a fresh label past the stale boundary.
  const nowTick = useNowTick();
  // AUD-001 fix: use real plants (Supabase, RLS-scoped) instead of mock
  // so plant counts match the assigned-tent reality. Mock plants reference
  // mock tent ids ("t1"..) which never match real tent UUIDs.
  const { data: plants = [] } = useGrowPlants(undefined, urlGrowId ?? undefined);
  const tentsMeta = getGrowDataMeta(["grow", "tents", urlGrowId ?? "all"]);

  return (
    <div>
      <GrowBreadcrumbs
        growId={urlGrowId}
        growName={scopedGrowName}
        current="Tents"
        section="tents"
      />
      <PageHeader
        title="Tents"
        description="Your grow tents — environment, lighting, and assigned plants."
        icon={<Box className="h-5 w-5" />}
        actions={<CreateTentDialog defaultGrowId={validGrowId} />}
      />

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

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass rounded-2xl h-48 animate-pulse" />
          ))}
        </div>
      ) : tents.length === 0 ? (
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
            return (
              <div key={t.id} className="relative animate-fade-in">
                <Link
                  to={tentDetailPath(t.id)}
                  className="glass rounded-2xl p-5 hover:border-primary/50 transition group flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between pr-8">
                    <div>
                      <h2 className="font-display text-lg font-semibold group-hover:text-primary transition">
                        {t.name}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {t.brand} · {t.size}
                      </p>
                    </div>
                    <StageBadge stage={t.stage} />
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
                      No sensor data yet
                    </p>
                  )}

                  {hasVpdValue &&
                    snapView.canAssessStage &&
                    normalizeVpdStage(t.stage) === "unknown" && (
                      <VpdStageMissingBadge testId="tents-list-vpd-stage-missing-badge" />
                    )}

                  {(() => {
                    const health = deriveTentHealthChip({
                      plantCount,
                      alertCount: t.alertCount,
                    });
                    const healthCls =
                      health.variant === "alerts"
                        ? "text-destructive"
                        : health.variant === "healthy"
                          ? "text-[hsl(var(--success))]"
                          : "text-muted-foreground";
                    const plantHealthCopy = formatTentPlantHealthCopy(health.copy);
                    return (
                      <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40">
                        <span>{plantCount} plants</span>
                        <span className="inline-flex items-center gap-1">
                          <Lightbulb
                            className={`h-3 w-3 ${t.light.on ? "text-[hsl(var(--warning))]" : "text-muted-foreground"}`}
                          />
                          {formatTentLightStatus({ on: t.light.on, schedule: t.light.schedule })}
                        </span>
                        <span
                          className={healthCls}
                          data-testid="tent-card-health-chip"
                          data-variant={health.variant}
                          aria-label={`Plant health status: ${plantHealthCopy}. Sensor status is shown separately.`}
                          title="Plant health only — sensor status is shown separately."
                        >
                          Plant health: {plantHealthCopy}
                        </span>
                      </div>
                    );
                  })()}
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
                    assignedPlantCount={plantCount}
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
