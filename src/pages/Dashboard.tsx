import VpdStageMissingBadge from "@/components/VpdStageMissingBadge";
import EcowittLatestSnapshotCard from "@/components/EcowittLatestSnapshotCard";
import { stripBackPointerTokens } from "@/lib/actionQueueProvenanceRules";
import { computeEnvironmentStability } from "@/lib/environmentStabilityRules";
import { formatStabilityChipView } from "@/lib/dashboardStabilityChipCopyRules";
import StabilityChipDrilldown from "@/components/StabilityChipDrilldown";
import {
  computeStabilityRollup,
  STABILITY_ROLLUP_TONE_CLASS,
} from "@/lib/dashboardStabilityRollupRules";
import { useState } from "react";
import { Link } from "react-router-dom";

import { AlertTriangle, Box, Sprout, ListChecks, Sparkles, ArrowRight } from "lucide-react";
import type { Stage, SensorReading } from "@/mock";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import QuickLogV2Fab from "@/components/QuickLogV2Fab";
import MetricChip from "@/components/MetricChip";
import SeverityBadge from "@/components/SeverityBadge";
import StageBadge from "@/components/StageBadge";
import SensorChart from "@/components/SensorChart";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import DashboardDataSourceDisclosure from "@/components/DashboardDataSourceDisclosure";
import GrowDataLoadError, { GrowDataLoadingState } from "@/components/GrowDataLoadError";
// Mock side-panel hooks intentionally removed — the Dashboard renders
// honest empty states for Tasks and AI Insights until backed by real data.
// See docs/qa/v0-demo-loop-checklist.md and docs/safety/static-safety-scans.md.
import { useGrowPlants, useGrowTents } from "@/hooks/useGrowData";
import { useGrows } from "@/store/grows";
import OnboardingChecklistCard from "@/components/OnboardingChecklistCard";
import PublicQuickLogHandoffCard from "@/components/PublicQuickLogHandoffCard";
import FirstRunChecklist from "@/components/FirstRunChecklist";
import OnboardingProgressPill from "@/components/OnboardingProgressPill";
import DashboardZeroTentEmptyState from "@/components/DashboardZeroTentEmptyState";
import OperatorModeCallout from "@/components/OperatorModeCallout";
import { usePageSeo } from "@/hooks/usePageSeo";
import ReleaseReadinessOperatorCard from "@/components/ReleaseReadinessOperatorCard";
import LineageRepairCta from "@/components/LineageRepairCta";

import DashboardPendingOutcomeReviewsCard from "@/components/DashboardPendingOutcomeReviewsCard";
import SafeByDesignNotice from "@/components/SafeByDesignNotice";
import DashboardSensorHealthSummary from "@/components/DashboardSensorHealthSummary";
import { buildDashboardSensorHealthSummary } from "@/lib/dashboardSensorHealthViewModel";
import { sanitizeActionCopy } from "@/lib/actionQueueRowView";
import { APPROVAL_QUEUE_EMPTY_COPY, mapRiskToSeverity } from "@/lib/dashboardActionQueueViewModel";
import { buildOnboardingChecklistViewModel } from "@/lib/onboardingChecklistViewModel";
import { useSensorReadings, useSensorReadingsByTents } from "@/hooks/use-sensor-readings";
import { useNowTick } from "@/hooks/useNowTick";
import { isUuid } from "@/lib/isUuid";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { useDashboardScopedData } from "@/hooks/useDashboardScopedData";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { useEnvironmentTrends } from "@/hooks/useEnvironmentTrends";
import { useGrowTargets } from "@/hooks/useGrowTargets";
import {
  compareSnapshotToTargets,
  STATUS_HEADLINE as TARGET_STATUS_HEADLINE,
} from "@/lib/environmentTargetComparison";
import {
  classifyVpdAgainstStage,
  normalizeVpdStage,
  vpdMetricChipStatus,
  VPD_STAGE_HELPER_TEXT,
} from "@/lib/stageAwareVpdTargets";
import {
  classifyTempAgainstStage,
  classifyRhAgainstStage,
  environmentMetricChipStatus,
} from "@/lib/environmentStageTargetRules";
import {
  buildEnvironmentAlerts,
  EMPTY_ALERTS_MESSAGE,
  type EnvironmentAlert,
} from "@/lib/environmentAlerts";
import { saveAlert, logAlertEvent } from "@/lib/alerts";
import { usePersistEnvironmentAlerts } from "@/hooks/usePersistEnvironmentAlerts";
import { useAlertsList } from "@/hooks/useAlertsList";
import { resolveSelectedTentIds, type TentSelection } from "@/lib/dashboardLatestEnvironmentRules";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { SOURCE_LABEL, formatValue, isStale } from "@/lib/sensorSnapshot";
import { buildSensorSourceDisplayLabel } from "@/lib/sensorSourceDisplayLabel";
import { formatSensorSourceLabel } from "@/lib/manualSensorSourceLabel";
import { formatTemperatureDisplay } from "@/lib/temperatureUnitPreference";

import { Button } from "@/components/ui/button";
import GrowTargetsEditor from "@/components/GrowTargetsEditor";
import DailyGrowCheckStatusCard from "@/components/DailyGrowCheckStatusCard";
import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";

import { Badge } from "@/components/ui/badge";
import SensorSourceBadge from "@/components/SensorSourceBadge";
import {
  actionDetailPath,
  actionsPath,
  alertDetailPath,
  alertsPath,
  dashboardPath,
  timelinePath,
  tentDetailPath,
  tentsPath,
} from "@/lib/routes";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { formatDistanceToNow } from "date-fns";
import {
  buildDashboardStabilityReadings,
  dashboardSnapshotForHealthyCues,
  evaluateDashboardSensorQuality,
  groupDashboardSensorReadings,
  selectDashboardSensorEvidenceRows,
} from "@/lib/dashboardSensorEvidenceRules";

export default function Dashboard() {
  usePageSeo({
    title: "Grow Room Dashboard | Verdant Grow Diary",
    description:
      "Track tents, plants, sensor snapshots, environment stability, and grow activity in one grower-controlled dashboard.",
    path: "/",
  });
  // Shared URL `?growId=` resolution against RLS-loaded grows. When growId is
  // absent or invalid, hooks fetch the user's full set (legacy behavior).
  const { urlGrowId, scopedGrow, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();
  const scopedGrowId = isValidScopedGrow ? (urlGrowId ?? undefined) : undefined;
  const tentsQuery = useGrowTents(scopedGrowId);
  const plantsQuery = useGrowPlants(undefined, scopedGrowId);
  const { data: tents = [] } = tentsQuery;
  const { data: plants = [] } = plantsQuery;
  // Tasks: no real-data hook yet — render an honest empty state below.
  const tasks: { status: string }[] = [];
  const dashboardReadingsQuery = useSensorReadings();
  const { data: rawReadings = [] } = dashboardReadingsQuery;
  // Diagnostic packets may be stored with a canonical `live` source. Keep
  // raw provenance only through this shared fence; charts/counts receive the
  // evidence-only rows and the grouped projection contains no raw payload.
  const dashboardSensorRows = selectDashboardSensorEvidenceRows(rawReadings);
  const readings = groupDashboardSensorReadings(dashboardSensorRows);
  // Per-tent sensor windows for the stability summary. Each tent gets its
  // own 200-row window so a busy tent cannot push another tent's VPD rows
  // out of a shared global cap. Read-only; no writes.
  // Mock-fallback tent ids ("t1"…) would 400 against the uuid tent_id
  // column — only query real UUIDs; a non-UUID id cannot have rows, so its
  // absence is established (same guard as the Tents list).
  const tentIds = tents.map((t) => t.id).filter((id) => isUuid(id));
  const { byTent: readingsByTent, statusByTent: sensorStatusByTent } =
    useSensorReadingsByTents(tentIds);
  // Freshness is time-relative: re-evaluate the snapshot strip's clock every
  // minute so an open tab cannot keep a fresh label past the stale boundary.
  const nowTick = useNowTick();
  // AI Insights: no real-data hook yet — render an honest empty state below.
  const { recent, pending } = useDashboardScopedData(scopedGrowId ?? null);
  // Multi-tent selector for the Latest Environment card. Defaults to "all"
  // (matches prior behavior); when a specific tent is chosen the snapshot
  // hook only queries that tent so the displayed reading matches context.
  const [tentSelection, setTentSelection] = useState<TentSelection>("all");
  const selectableTents = tents.map((t) => ({ id: t.id, name: t.name }));
  const selectedTentIds = resolveSelectedTentIds(selectableTents, tentSelection);
  const sensorState = useLatestSensorSnapshot(scopedGrowId ?? null, selectedTentIds);
  const trendsState = useEnvironmentTrends(
    scopedGrowId ?? null,
    tents.map((t) => t.id),
  );
  const targetsState = useGrowTargets(scopedGrowId ?? null);
  const [targetsEditorOpen, setTargetsEditorOpen] = useState(false);
  const currentSensorSnapshot = sensorState.status === "ok" ? sensorState.snapshot : null;
  // Unverified/simulated snapshots remain visible with their honest source
  // label, but they cannot drive green quality, target, stage, alert, or
  // persistence semantics.
  const dashboardHealthSnapshot = dashboardSnapshotForHealthyCues(currentSensorSnapshot);
  const dashboardSensorQuality = evaluateDashboardSensorQuality(currentSensorSnapshot, nowTick);

  // First-run onboarding checklist — derived from data the Dashboard
  // already loads. No extra Supabase queries, no writes.
  const { grows } = useGrows();
  const diaryRecentCount =
    recent.status === "ok" ? recent.items.filter((i) => i.kind === "diary").length : 0;
  const onboardingVm = buildOnboardingChecklistViewModel({
    growCount: grows.length,
    tentCount: tents.length,
    plantCount: plants.length,
    diaryEntryCount: diaryRecentCount,
    sensorReadingCount: dashboardSensorRows.length,
  });
  // Real persisted alerts for this grow (open only). Read-only display so
  // growers can see the loop close: manual reading → derived alert → persisted.
  const persistedAlertsState = useAlertsList(
    scopedGrowId ? { growId: scopedGrowId, status: "open" } : { status: "open" },
  );
  const persistedOpenCount = scopedGrowId ? persistedAlertsState.alerts.length : 0;

  // Persist derived Environment Alerts into public.alerts when (and only
  // when) they are backed by real, valid sensor readings. Idempotent and
  // user-scoped via RLS. Not automation; not device control.
  usePersistEnvironmentAlerts({
    growId: scopedGrowId ?? null,
    snapshot: dashboardHealthSnapshot,
    quality: dashboardSensorQuality,
    targets: compareSnapshotToTargets(
      dashboardHealthSnapshot,
      targetsState.status === "ok" ? targetsState.targets : null,
    ),
    enabled: !!scopedGrowId,
    stage: scopedGrow?.stage ?? null,
  });

  const dueToday = tasks.filter((t) => t.status === "today").length;
  // Open alert count and recent alerts come from real persisted alerts (RLS).
  const openAlerts = persistedAlertsState.alerts.filter((a) => a.status === "open").length;

  // Latest reading per tent for the strip + a read-only stability summary
  // computed from the same tent-scoped readings (no extra fetches, no writes).
  const latestPerTent = tents.map((t) => {
    const tentRows = selectDashboardSensorEvidenceRows(readingsByTent[t.id] ?? []);
    const chartRows = groupDashboardSensorReadings(tentRows);
    const rs = buildDashboardStabilityReadings(tentRows);
    const stability = computeEnvironmentStability(rs, { stage: t.stage });
    return {
      tent: t,
      last: chartRows[chartRows.length - 1],
      stability,
      tentRows,
    };
  });

  const recentAlerts = persistedAlertsState.alerts.slice(0, 3);

  if (tentsQuery.isError || plantsQuery.isError) {
    return (
      <div className="space-y-4 md:space-y-6" data-testid="dashboard-root">
        <GrowBreadcrumbs
          growId={urlGrowId}
          growName={scopedGrowName}
          current="Dashboard"
          section="dashboard"
        />
        <PageHeader
          title="Dashboard"
          description="Track your tents, plants, sensors, and grow activity in one place."
          icon={<Sparkles className="h-5 w-5" />}
        />
        <GrowDataLoadError
          resource="Dashboard grow data"
          testId="dashboard-grow-data-error"
          onRetry={() => {
            void Promise.all([tentsQuery.refetch(), plantsQuery.refetch()]);
          }}
        />
      </div>
    );
  }

  if (tentsQuery.isLoading || plantsQuery.isLoading) {
    return (
      <div className="space-y-4 md:space-y-6" data-testid="dashboard-root">
        <GrowBreadcrumbs
          growId={urlGrowId}
          growName={scopedGrowName}
          current="Dashboard"
          section="dashboard"
        />
        <PageHeader
          title="Dashboard"
          description="Track your tents, plants, sensors, and grow activity in one place."
          icon={<Sparkles className="h-5 w-5" />}
        />
        <GrowDataLoadingState resource="Dashboard grow data" testId="dashboard-grow-data-loading" />
      </div>
    );
  }

  // Non-landmark container: AppShell already owns the <main> landmark around
  // the route Outlet, so the page root must not nest another.
  return (
    <div className="space-y-4 md:space-y-6" data-testid="dashboard-root">
      <QuickLogV2Fab />
      <GrowBreadcrumbs
        growId={urlGrowId}
        growName={scopedGrowName}
        current="Dashboard"
        section="dashboard"
      />
      <PageHeader
        title="Dashboard"
        description="Track your tents, plants, sensors, and grow activity in one place."
        icon={<Sparkles className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <OnboardingProgressPill vm={onboardingVm} />
            <Button asChild variant="outline" data-testid="dashboard-daily-grow-check-entry">
              {/* Route still targets /daily-check (the underlying Quick Log
                  surface). Label unified to "Quick Log" so the Dashboard
                  presents a single grower-facing logging concept. */}
              <Link to="/daily-check">Quick Log</Link>
            </Button>
            <Button asChild className="gradient-leaf text-primary-foreground">
              <Link to={tentsPath()}>Open tents</Link>
            </Button>
          </div>
        }
      />
      {urlGrowId && (
        <ScopedGrowBanner
          growId={urlGrowId}
          growName={scopedGrowName}
          label="dashboard"
          clearHref={dashboardPath()}
          backHref={backHref}
        />
      )}

      <div className="my-3">
        <PublicQuickLogHandoffCard className="mb-3" />
        <OnboardingChecklistCard vm={onboardingVm} />
      </div>

      <div className="my-3">
        <OperatorModeCallout />
      </div>

      <div className="my-3">
        <ReleaseReadinessOperatorCard />
      </div>

      {/* Lineage Repair + First-Run Checklist intentionally moved below the
          core Quick Log + Environment loop so they don't compete visually on
          mobile. See Today Trust + Route Polish v1. */}

      {/* Dashboard intentionally has a single Quick Log entry point (QuickLogV2Fab).
          The "Log your first plant memory" CTA was a duplicate entry point and was removed.
          The same CTA remains on TentDetail where it is contextually unique. */}

      <DashboardPendingOutcomeReviewsCard scopedGrowId={scopedGrowId ?? null} />

      <DashboardDataSourceDisclosure
        scopedGrowId={scopedGrowId}
        hasAnyData={tents.length > 0 || plants.length > 0}
        snapshotSource={sensorState.status === "ok" ? sensorState.snapshot.source : undefined}
      />

      <DailyGrowCheckStatusCard className="mb-6" tentIds={tents.map((t) => t.id)} />

      <DashboardDailyGrowCheckPanel scopedGrowId={scopedGrowId ?? null} className="mb-6" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Active tents" value={tents.length} icon={<Box className="h-3.5 w-3.5" />} />
        <KpiCard
          label="Plants"
          value={plants.length}
          icon={<Sprout className="h-3.5 w-3.5" />}
          hint={`${plants.filter((p) => p.health === "healthy").length} marked healthy · user-assigned, not sensor-derived`}
          accent="success"
        />
        <KpiCard
          label="Open alerts"
          value={openAlerts}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          accent={openAlerts > 0 ? "destructive" : "success"}
        />
        <KpiCard
          label="Due today"
          value={dueToday}
          hint={dueToday === 0 ? "No tasks yet" : undefined}
          icon={<ListChecks className="h-3.5 w-3.5" />}
          accent={dueToday > 0 ? "warning" : "success"}
        />
      </div>

      {tents.length === 0 ? (
        <DashboardZeroTentEmptyState />
      ) : (
        <>
          <h2
            data-testid="dashboard-section-heading-environment"
            className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-2 mb-1 md:mt-4"
          >
            Environment
          </h2>
          <section
            aria-labelledby="dashboard-environment-snapshot-heading"
            data-testid="dashboard-environment-snapshot"
            className="mb-6"
          >
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div>
                <h2
                  id="dashboard-environment-snapshot-heading"
                  className="font-display font-semibold text-base"
                >
                  Environment Snapshot
                </h2>
                <p className="text-xs text-muted-foreground">
                  Latest reading per tent with honest source labels.
                </p>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link to="/sensors">
                  Open sensors <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
            {(() => {
              const anyReading = latestPerTent.some((x) => !!x.last);
              const hasPendingTentRead = tentIds.some(
                (tentId) => sensorStatusByTent[tentId] === "loading",
              );
              const hasFailedTentRead = tentIds.some(
                (tentId) =>
                  sensorStatusByTent[tentId] === "error" ||
                  sensorStatusByTent[tentId] === "refresh_error",
              );
              const snapshotQuality = sensorState.status === "ok" ? dashboardSensorQuality : null;
              const isStaleSnap =
                sensorState.status === "ok" &&
                !!sensorState.snapshot.ts &&
                isStale(sensorState.snapshot.ts);
              const isInvalidSnap =
                !!snapshotQuality && snapshotQuality.suspiciousFields.length > 0;
              const isUnverifiedSnap =
                sensorState.status === "ok" &&
                sensorState.snapshot.source !== "unavailable" &&
                dashboardHealthSnapshot === null;
              if (dashboardReadingsQuery.isLoading || (!anyReading && hasPendingTentRead)) {
                return (
                  <GrowDataLoadingState
                    resource="Environment snapshots"
                    testId="dashboard-environment-snapshot-loading"
                  />
                );
              }
              if (dashboardReadingsQuery.isError) {
                return (
                  <GrowDataLoadError
                    resource="Dashboard sensor history"
                    testId="dashboard-sensor-history-error"
                    message="Sensor history couldn't be loaded. No empty-state or environment conclusion is shown until that read succeeds."
                    onRetry={() => {
                      void dashboardReadingsQuery.refetch();
                    }}
                  />
                );
              }
              if (!anyReading && hasFailedTentRead) {
                return (
                  <GrowDataLoadError
                    resource="Environment snapshots"
                    testId="dashboard-environment-snapshot-error"
                    message="One or more tent reads failed. We can't confirm that sensor history is empty."
                  />
                );
              }
              if (!anyReading) {
                return (
                  <div
                    data-testid="dashboard-environment-snapshot-empty"
                    className="glass rounded-2xl p-6 text-center"
                  >
                    <h3 className="font-display font-semibold text-base mb-1">
                      No sensor snapshot yet
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Add a manual reading or{" "}
                      <Link
                        to="/sensors"
                        data-testid="dashboard-environment-snapshot-empty-sensors-link"
                        className="underline text-primary hover:opacity-80"
                      >
                        connect Ecowitt
                      </Link>{" "}
                      to see your environment here.
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                      {/* Sensors entry-point dedupe: a single primary "Go to
                      Sensors" CTA. Manual reading + Import sensor data
                      remain available as secondary anchors into the same
                      Sensors page (no new routes). */}
                      <Button asChild size="sm" className="gradient-leaf text-primary-foreground">
                        <Link
                          to="/sensors"
                          data-testid="dashboard-environment-snapshot-go-to-sensors"
                          aria-label="Go to Sensors page"
                        >
                          Go to Sensors
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to="/sensors#manual-reading"
                          data-testid="dashboard-environment-snapshot-add-manual-reading"
                          aria-label="Add manual sensor reading"
                        >
                          Add manual reading
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to="/sensors#import-sensor-data"
                          data-testid="dashboard-environment-snapshot-import-sensor-data"
                          aria-label="Import sensor data"
                        >
                          Import sensor data
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              }
              return (
                <>
                  {(isStaleSnap || isInvalidSnap || isUnverifiedSnap) && (
                    <div
                      data-testid="dashboard-environment-snapshot-status-banner"
                      data-state={
                        isUnverifiedSnap ? "unverified" : isInvalidSnap ? "invalid" : "stale"
                      }
                      className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"
                    >
                      {isUnverifiedSnap
                        ? "Latest reading has unverified or simulated provenance — shown as context only, never as healthy sensor evidence."
                        : isInvalidSnap
                          ? "Latest reading looks invalid — not shown as current. Check the sensor source on the Sensors page."
                          : "Latest reading is stale (older than 30 minutes) — not shown as current."}
                    </div>
                  )}
                  <div className="grid lg:grid-cols-3 gap-4">
                    {(() => {
                      // Pick the first tent that actually has readings so the chart
                      // isn't blank when tents[0] has none but other tents do.
                      // Falls back to tents[0] (or null) so the label + empty state
                      // still make sense.
                      const chartTent =
                        tents.find((t) =>
                          (readings as unknown as SensorReading[]).some((r) => r.tentId === t.id),
                        ) ??
                        tents[0] ??
                        null;
                      const chartTentName = chartTent?.name ?? "Tent";
                      const chartReadings = chartTent
                        ? (readings as unknown as SensorReading[]).filter(
                            (r) => r.tentId === chartTent.id,
                          )
                        : [];
                      const latest = chartReadings.slice(-1)[0];
                      return (
                        <div className="lg:col-span-2 glass rounded-2xl p-4">
                          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div>
                                <h2 className="font-display font-semibold">
                                  {chartTentName} · 7-day environment
                                </h2>
                                <p className="text-xs text-muted-foreground">
                                  Temperature, humidity, VPD
                                </p>
                              </div>
                              {latest && (
                                <SensorSourceBadge
                                  source={latest.source}
                                  status={latest.status}
                                  testId="dashboard-tent-chart-source-badge"
                                />
                              )}
                            </div>
                            <Button asChild size="sm" variant="ghost">
                              <Link to="/sensors">
                                Sensor data <ArrowRight className="h-3 w-3" />
                              </Link>
                            </Button>
                          </div>
                          {chartReadings.length === 0 ? (
                            <div
                              data-testid="dashboard-tent-chart-empty"
                              className="rounded-xl border border-border/40 bg-secondary/20 p-4 text-center text-sm text-muted-foreground"
                            >
                              No readings yet for {chartTentName}. Add a manual reading or connect a
                              sensor to see the 7-day environment here.
                            </div>
                          ) : (
                            <SensorChart data={chartReadings} metric="temp" height={200} />
                          )}
                        </div>
                      );
                    })()}

                    <div className="glass rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-display font-semibold">Environment strip</h2>
                          {(() => {
                            const latest = (readings as unknown as SensorReading[]).slice(-1)[0];
                            if (!latest) return null;
                            return (
                              <SensorSourceBadge
                                source={latest.source}
                                status={latest.status}
                                testId="dashboard-env-strip-source-badge"
                              />
                            );
                          })()}
                        </div>
                        {(() => {
                          const rollup = computeStabilityRollup(
                            latestPerTent.map((x) => x.stability),
                          );
                          return (
                            <div
                              data-testid="dashboard-stability-rollup"
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${STABILITY_ROLLUP_TONE_CLASS[rollup.tone]}`}
                            >
                              {rollup.copy}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="space-y-2.5">
                        {latestPerTent.map(({ tent, stability, tentRows }) => {
                          const stabilityView = formatStabilityChipView(stability);
                          const snapView = buildTentSnapshotView(
                            tentRows as BuildTentSnapshotInput[],
                            tent.stage,
                            nowTick,
                          );
                          // Pending/failed reads must not masquerade as established
                          // absence or as data. Non-UUID ids (mock-fallback tents)
                          // are never queried — a uuid column cannot hold them, so
                          // their absence is established (parity with the Tents list).
                          const sensorReadStatus = isUuid(tent.id)
                            ? (sensorStatusByTent[tent.id] ?? "loading")
                            : "success";
                          const sensorReadStatusLabel =
                            sensorReadStatus === "loading"
                              ? "sensor data loading"
                              : sensorReadStatus === "error"
                                ? "sensor data unavailable"
                                : sensorReadStatus === "refresh_error"
                                  ? snapView.hasReading
                                    ? "sensor refresh unavailable, last loaded readings shown"
                                    : "sensor refresh unavailable, no last loaded readings"
                                  : null;
                          const ariaParts = [
                            tent.name,
                            sensorReadStatusLabel,
                            snapView.hasReading ? `source ${snapView.sourceLabel}` : null,
                            snapView.hasReading
                              ? `last updated ${snapView.lastUpdatedDisplay}`
                              : null,
                            ...snapView.metrics.map(
                              (m) =>
                                `${m.label} ${m.display}${m.unit}${m.statusLabel ? ` (${m.statusLabel})` : ""}`,
                            ),
                          ].filter(Boolean);
                          return (
                            <Link
                              key={tent.id}
                              to={tentDetailPath(tent.id)}
                              aria-label={ariaParts.join(", ")}
                              data-testid={`dashboard-env-snapshot-tent-${tent.id}`}
                              className="block rounded-xl border border-border/40 p-3 hover:bg-secondary/30 transition"
                            >
                              <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{tent.name}</span>
                                  <StageBadge stage={tent.stage as Stage} />
                                  {snapView.hasReading && (
                                    <span
                                      data-testid={`dashboard-env-snapshot-source-${tent.id}`}
                                      data-source-label={snapView.sourceLabel}
                                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide border-border/50 bg-secondary/40 text-muted-foreground"
                                    >
                                      {snapView.sourceLabel}
                                    </span>
                                  )}
                                </div>
                                {snapView.hasReading && (
                                  <span
                                    data-testid={`dashboard-env-snapshot-last-updated-${tent.id}`}
                                    className="text-[11px] text-muted-foreground"
                                  >
                                    Last updated {snapView.lastUpdatedDisplay}
                                  </span>
                                )}
                              </div>
                              {sensorReadStatus === "loading" ? (
                                <p
                                  className="text-xs text-muted-foreground animate-pulse"
                                  data-testid={`dashboard-env-snapshot-loading-${tent.id}`}
                                >
                                  Loading sensor data…
                                </p>
                              ) : sensorReadStatus === "error" ? (
                                <p
                                  className="text-xs text-muted-foreground"
                                  data-testid={`dashboard-env-snapshot-unavailable-${tent.id}`}
                                >
                                  Sensor data unavailable — readings couldn't be loaded.
                                </p>
                              ) : sensorReadStatus === "refresh_error" && !snapView.hasReading ? (
                                <p
                                  className="text-xs text-muted-foreground"
                                  data-testid={`dashboard-env-snapshot-refresh-unavailable-${tent.id}`}
                                >
                                  Sensor refresh unavailable — no last loaded readings are
                                  available.
                                </p>
                              ) : snapView.hasReading ? (
                                <div className="space-y-2">
                                  {sensorReadStatus === "refresh_error" && (
                                    <p
                                      className="text-xs text-amber-700 dark:text-amber-300"
                                      data-testid={`dashboard-env-snapshot-refresh-error-${tent.id}`}
                                    >
                                      Sensor refresh unavailable — last loaded readings shown.
                                    </p>
                                  )}
                                  <div className="flex flex-wrap gap-1.5">
                                    {snapView.metrics.map((m) => (
                                      <div
                                        key={m.key}
                                        data-testid={`dashboard-env-snapshot-metric-${tent.id}-${m.key}`}
                                        data-status={m.status}
                                        className="inline-flex items-center gap-1"
                                      >
                                        <MetricChip
                                          label={
                                            m.key === "temp" ? "T" : m.key === "rh" ? "RH" : "VPD"
                                          }
                                          value={m.display}
                                          unit={m.unit}
                                          status={m.chipStatus}
                                        />
                                        {m.statusLabel && (
                                          <span
                                            data-testid={`dashboard-env-snapshot-metric-status-${tent.id}-${m.key}`}
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
                                </div>
                              ) : (
                                <p
                                  className="text-xs text-muted-foreground"
                                  data-testid={`dashboard-env-snapshot-no-data-${tent.id}`}
                                >
                                  No sensor data yet
                                </p>
                              )}
                              <div className="mt-1.5">
                                <StabilityChipDrilldown
                                  tentId={tent.id}
                                  tentName={tent.name}
                                  stability={stability}
                                  view={stabilityView}
                                />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </section>
        </>
      )}

      <h2
        data-testid="dashboard-section-heading-needs-attention"
        className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-1"
      >
        Needs attention
      </h2>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            {/* h3: nested under the "Needs attention" section H2 above —
                keeping both as H2 rendered two identical visible H2s. */}
            <h3 className="font-display font-semibold">Needs attention</h3>
            <Button asChild size="sm" variant="ghost">
              <Link to={alertsPath()}>
                All alerts <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          {recentAlerts.length === 0 && (
            <div
              className="rounded-xl border border-dashed border-border/50 p-3"
              role="status"
              aria-label="No active alerts"
              data-testid="dashboard-active-alerts-empty"
            >
              <p className="text-sm font-medium">No active alerts right now.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Log a manual reading or review your sensor setup to keep this grow's signal strong.
              </p>
            </div>
          )}
          <ul className="space-y-2">
            {recentAlerts.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-border/40 p-3"
                data-testid="dashboard-active-alert-item"
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <SeverityBadge severity={a.severity === "watch" ? "warning" : a.severity} />
                  {a.metric && (
                    <span className="inline-flex items-center rounded-full border border-border/40 bg-secondary/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.metric}
                    </span>
                  )}
                  {a.source && (
                    <span className="inline-flex items-center rounded-full border border-border/40 bg-secondary/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.source}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.reason}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold">AI insights</h2>
            <Button asChild size="sm" variant="ghost">
              <Link to="/doctor">
                Open Doctor <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          <div
            className="rounded-xl border border-dashed border-border/50 p-4 text-center"
            role="status"
            aria-label="AI insights empty state"
          >
            <p className="text-sm font-medium">No AI insights yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              AI insights will appear after enough grow context is available.
            </p>
          </div>
        </div>
      </div>
      {scopedGrowId ? (
        <>
          <DashboardSensorHealthSummary
            summary={buildDashboardSensorHealthSummary(sensorState)}
            activeAlertCount={openAlerts}
            growId={scopedGrowId}
            className="mt-4"
          />
          <section className="glass rounded-2xl p-4 mt-4" aria-label="Latest environment">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div>
                <h2 className="font-display font-semibold">Latest Environment</h2>
                <p className="text-xs text-muted-foreground">
                  Grow-scoped detail with per-tent filter and persisted alerts. Not live device
                  control.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {selectableTents.length > 1 && (
                  <Select
                    value={tentSelection}
                    onValueChange={(v) => setTentSelection(v as TentSelection)}
                  >
                    <SelectTrigger
                      className="h-7 text-xs w-[140px]"
                      aria-label="Tent filter"
                      data-testid="latest-env-tent-select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tents</SelectItem>
                      {selectableTents.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Link
                  to={timelinePath(scopedGrowId)}
                  className="text-xs text-primary hover:underline"
                >
                  Open Timeline →
                </Link>
              </div>
            </div>
            {persistedAlertsState.status === "ok" && (
              <div
                className="mb-3 text-xs text-muted-foreground"
                data-testid="latest-env-persisted-count"
              >
                {persistedOpenCount > 0 ? (
                  <>
                    <Link to={alertsPath()} className="text-primary hover:underline">
                      {persistedOpenCount} persisted open alert
                      {persistedOpenCount === 1 ? "" : "s"}
                    </Link>{" "}
                    for this grow.
                  </>
                ) : (
                  "No persisted open alerts for this grow."
                )}
              </div>
            )}
            {sensorState.status === "loading" || sensorState.status === "idle" ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : sensorState.status === "unavailable" ? (
              <p className="text-sm text-muted-foreground">Sensor data unavailable.</p>
            ) : sensorState.snapshot.source === "unavailable" ? (
              <p className="text-sm text-muted-foreground">No sensor data yet.</p>
            ) : (
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {sensorState.snapshot.source === "csv"
                      ? buildSensorSourceDisplayLabel({
                          source: "csv",
                          csvVendor: sensorState.snapshot.csvVendor,
                        })
                      : formatSensorSourceLabel({
                          source: sensorState.snapshot.source,
                          deviceId: sensorState.snapshot.device_id ?? null,
                        })}
                  </Badge>
                  {sensorState.snapshot.ts && (
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(sensorState.snapshot.ts), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                  {isStale(sensorState.snapshot.ts) && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase border-amber-500 text-amber-600"
                    >
                      Stale reading
                    </Badge>
                  )}
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  {[
                    {
                      label: "Temperature",
                      value: formatTemperatureDisplay(sensorState.snapshot.temp, { digits: 1 }),
                    },
                    { label: "Humidity", value: formatValue(sensorState.snapshot.rh, "%") },
                    { label: "VPD", value: formatValue(sensorState.snapshot.vpd, " kPa", 2) },
                    { label: "Soil water", value: formatValue(sensorState.snapshot.soil, "%") },
                    {
                      label: "Soil EC",
                      value: formatValue(sensorState.snapshot.soil_ec, " mS/cm", 2),
                    },
                    {
                      label: "Soil temp",
                      value: formatTemperatureDisplay(sensorState.snapshot.soil_temp, {
                        digits: 1,
                      }),
                    },
                    { label: "PPFD", value: formatValue(sensorState.snapshot.ppfd, " µmol", 0) },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-lg border border-border/40 bg-secondary/20 p-2"
                    >
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {m.label}
                      </dt>
                      <dd className="text-sm font-medium">{m.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>

          <section
            className="glass rounded-2xl p-4 mt-4"
            aria-label="Latest EcoWitt Snapshot"
            data-testid="dashboard-ecowitt-section"
          >
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div>
                <h2 className="font-display font-semibold">Latest EcoWitt Snapshot</h2>
                <p className="text-xs text-muted-foreground">
                  Most recent EcoWitt reading for the selected tent. Not live device control.
                </p>
              </div>
            </div>
            {tentSelection === "all" ? (
              <p
                data-testid="dashboard-ecowitt-select-tent"
                className="text-sm text-muted-foreground"
              >
                Select a tent to view EcoWitt readings.
              </p>
            ) : (
              <EcowittLatestSnapshotCard
                tentId={tentSelection}
                tentName={selectableTents.find((t) => t.id === tentSelection)?.name}
                title="Latest EcoWitt Snapshot"
              />
            )}
          </section>
          {sensorState.status === "ok" && (
            <section className="glass rounded-2xl p-4 mt-4" aria-label="Sensor Data Quality">
              {(() => {
                const q = dashboardSensorQuality;
                const tone =
                  q.quality === "good"
                    ? "border-emerald-500 text-emerald-600"
                    : q.quality === "watch"
                      ? "border-amber-500 text-amber-600"
                      : "border-muted-foreground text-muted-foreground";
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h2 className="font-display font-semibold">Sensor Data Quality</h2>
                        <p className="text-xs text-muted-foreground">
                          Heuristic check of the latest snapshot. Not a plant-health diagnosis.
                        </p>
                      </div>
                      <Link
                        to={timelinePath(scopedGrowId)}
                        className="text-xs text-primary hover:underline"
                      >
                        Inspect history →
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge variant="outline" className={`text-[10px] uppercase ${tone}`}>
                        {q.headline}
                      </Badge>
                      {q.suspiciousFields.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Suspicious: {q.suspiciousFields.join(", ")}
                        </span>
                      )}
                    </div>
                    {q.reasons.length > 0 && (
                      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                        {q.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </section>
          )}
          <div className="my-3">
            <LineageRepairCta />
          </div>
          <div className="my-3">
            <FirstRunChecklist
              growCount={grows.length}
              tentCount={tents.length}
              plantCount={plants.length}
              quickLogCount={diaryRecentCount}
              sensorSnapshotCount={dashboardSensorRows.length}
            />
          </div>
          <h2
            data-testid="dashboard-section-heading-advanced"
            className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-6 mb-1"
          >
            Advanced
          </h2>
          <section className="glass rounded-2xl p-4 mt-2" aria-label="Environment Trends">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="font-display font-semibold">Environment Trends</h2>
                <p className="text-xs text-muted-foreground">
                  Recent readings summary. Not a plant-health diagnosis.
                </p>
              </div>
              <Link
                to={timelinePath(scopedGrowId)}
                className="text-xs text-primary hover:underline"
              >
                Open Timeline →
              </Link>
            </div>
            {trendsState.status === "loading" || trendsState.status === "idle" ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : trendsState.status === "unavailable" ? (
              <p className="text-sm text-muted-foreground">Trend data unavailable.</p>
            ) : trendsState.trends.status === "empty" ? (
              <p className="text-sm text-muted-foreground">No trend data yet.</p>
            ) : (
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {trendsState.trends.headline}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {trendsState.trends.count} reading
                    {trendsState.trends.count === 1 ? "" : "s"}
                  </span>
                  {trendsState.trends.latestTs && (
                    <span className="text-xs text-muted-foreground">
                      · latest{" "}
                      {formatDistanceToNow(new Date(trendsState.trends.latestTs), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {SOURCE_LABEL[trendsState.trends.source]}
                  </Badge>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  {[
                    {
                      label: "Temperature",
                      avg: formatTemperatureDisplay(trendsState.trends.temp.avg, { digits: 1 }),
                      range: `${formatTemperatureDisplay(trendsState.trends.temp.min, { digits: 1 })} – ${formatTemperatureDisplay(trendsState.trends.temp.max, { digits: 1 })}`,
                    },
                    {
                      label: "Humidity",
                      avg: formatValue(trendsState.trends.rh.avg, "%"),
                      range: `${formatValue(trendsState.trends.rh.min, "%")} – ${formatValue(trendsState.trends.rh.max, "%")}`,
                    },
                    {
                      label: "VPD",
                      avg: formatValue(trendsState.trends.vpd.avg, " kPa", 2),
                      range: `${formatValue(trendsState.trends.vpd.min, " kPa", 2)} – ${formatValue(trendsState.trends.vpd.max, " kPa", 2)}`,
                    },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-lg border border-border/40 bg-secondary/20 p-2"
                    >
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {m.label} · avg
                      </dt>
                      <dd className="text-sm font-medium">{m.avg}</dd>
                      <dd className="text-[11px] text-muted-foreground">range {m.range}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>
          <section className="glass rounded-2xl p-4 mt-4" aria-label="Target Comparison">
            {(() => {
              const snap = dashboardHealthSnapshot;
              const targets = targetsState.status === "ok" ? targetsState.targets : null;
              const result = compareSnapshotToTargets(snap, targets);
              const tone =
                result.status === "in_range"
                  ? "border-emerald-500 text-emerald-600"
                  : result.status === "out_of_range"
                    ? "border-amber-500 text-amber-600"
                    : "border-muted-foreground text-muted-foreground";
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h2 className="font-display font-semibold">Target Comparison</h2>
                      <p className="text-xs text-muted-foreground">
                        Latest snapshot vs configured grow targets. Not a plant-health diagnosis.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        to={timelinePath(scopedGrowId)}
                        className="text-xs text-primary hover:underline"
                      >
                        Inspect history →
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTargetsEditorOpen(true)}
                      >
                        Edit targets
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <Badge variant="outline" className={`text-[10px] uppercase ${tone}`}>
                      {result.headline}
                    </Badge>
                    {result.status === "missing_targets" && (
                      <span className="text-xs text-muted-foreground">
                        No grow targets configured.
                      </span>
                    )}
                  </div>
                  {result.metrics.length > 0 && (
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {result.metrics.map((m) => {
                        const valueText = m.value === null ? "Unknown" : String(m.value);
                        const rangeText =
                          m.min === null && m.max === null
                            ? "No target set"
                            : `${m.min ?? "—"} – ${m.max ?? "—"}`;
                        const stateTone =
                          m.state === "low" || m.state === "high"
                            ? "text-amber-600"
                            : m.state === "in_range"
                              ? "text-emerald-600"
                              : "text-muted-foreground";
                        return (
                          <div
                            key={m.metric}
                            className="rounded-lg border border-border/40 bg-secondary/20 p-2"
                          >
                            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {m.label}
                            </dt>
                            <dd className="text-sm font-medium">
                              {valueText}{" "}
                              <span className={`text-xs ${stateTone}`}>
                                ({m.state.replace("_", " ")})
                              </span>
                            </dd>
                            <dd className="text-[11px] text-muted-foreground">
                              target {rangeText}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                  {result.reasons.length > 0 && (
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5 mt-2">
                      {result.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                  {(() => {
                    const vpdValue = snap?.vpd ?? null;
                    const stale = snap ? isStale(snap.ts) : false;
                    const vpd = classifyVpdAgainstStage({
                      value: vpdValue,
                      stage: scopedGrow?.stage ?? null,
                      stale,
                    });
                    const toneCls =
                      vpd.classification === "in_target"
                        ? "border-emerald-500 text-emerald-600"
                        : vpd.classification === "below_target" ||
                            vpd.classification === "above_target"
                          ? "border-amber-500 text-amber-600"
                          : "border-muted-foreground text-muted-foreground";
                    const rangeText =
                      vpd.band.min === null && vpd.band.max === null
                        ? "no active VPD target"
                        : `${vpd.band.min ?? "—"}–${vpd.band.max ?? "—"} kPa`;
                    return (
                      <div
                        className="mt-3 rounded-lg border border-border/40 bg-secondary/10 p-2"
                        aria-label="Stage-aware VPD"
                        data-testid="dashboard-stage-aware-vpd"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] uppercase ${toneCls}`}>
                            Stage VPD · {vpd.band.stage.replace("_", " ")}
                          </Badge>
                          <span className="text-xs">
                            {vpd.value === null ? "—" : `${vpd.value.toFixed(2)} kPa`}{" "}
                            <span className="text-muted-foreground">(target {rangeText})</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {vpd.label}. {vpd.band.helper}
                        </p>
                        {vpd.classification === "stage_unknown" && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {VPD_STAGE_HELPER_TEXT}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </section>
          <section className="glass rounded-2xl p-4 mt-4" aria-label="Environment Alerts">
            {(() => {
              const snap = dashboardHealthSnapshot;
              const quality = dashboardSensorQuality;
              const targetsCmp = compareSnapshotToTargets(
                snap,
                targetsState.status === "ok" ? targetsState.targets : null,
              );
              const alerts = buildEnvironmentAlerts({
                snapshot: snap,
                quality,
                targets: targetsCmp,
                stage: scopedGrow?.stage ?? null,
              });
              const vpdStageMissing =
                snap?.vpd != null && normalizeVpdStage(scopedGrow?.stage) === "unknown";
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h2 className="font-display font-semibold">Environment Alerts</h2>
                      <p className="text-xs text-muted-foreground">
                        Read-only summary of data quality and target status. Not a plant-health
                        diagnosis. Not device control.
                      </p>
                    </div>
                  </div>
                  {vpdStageMissing && (
                    <VpdStageMissingBadge
                      testId="dashboard-vpd-stage-missing-badge"
                      className="mb-2"
                    />
                  )}
                  {alerts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{EMPTY_ALERTS_MESSAGE}</p>
                  ) : (
                    <ul className="space-y-2">
                      {alerts.map((a) => {
                        const tone =
                          a.severity === "critical"
                            ? "border-destructive text-destructive"
                            : a.severity === "warning"
                              ? "border-amber-500 text-amber-600"
                              : a.severity === "watch"
                                ? "border-amber-400 text-amber-500"
                                : "border-muted-foreground text-muted-foreground";
                        return (
                          <li
                            key={a.id}
                            className="rounded-lg border border-border/40 bg-secondary/20 p-2 text-sm"
                          >
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant="outline" className={`text-[10px] uppercase ${tone}`}>
                                {a.severity}
                              </Badge>
                              <span className="font-medium text-sm">{a.title}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{a.reason}</p>
                            {scopedGrowId && (
                              <div className="mt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      const saved = await saveAlert({
                                        grow_id: scopedGrowId,
                                        severity: a.severity,
                                        title: a.title,
                                        reason: a.reason,
                                        metric: typeof a.metric === "string" ? a.metric : null,
                                      });
                                      try {
                                        await logAlertEvent({
                                          alert_id: saved.id,
                                          grow_id: scopedGrowId,
                                          event_type: "created",
                                          new_status: "open",
                                        });
                                        toast.success("Alert saved", {
                                          action: {
                                            label: "View",
                                            onClick: () =>
                                              window.location.assign(alertDetailPath(saved.id)),
                                          },
                                        });
                                      } catch (logErr) {
                                        toast.warning(
                                          `Alert saved, but audit log failed: ${(logErr as Error).message}`,
                                        );
                                      }
                                    } catch (err) {
                                      toast.error(
                                        `Failed to save alert: ${(err as Error).message}`,
                                      );
                                    }
                                  }}
                                >
                                  Save alert
                                </Button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })()}
          </section>
          {scopedGrowId && (
            <GrowTargetsEditor
              open={targetsEditorOpen}
              onOpenChange={setTargetsEditorOpen}
              growId={scopedGrowId}
              growName={scopedGrowName ?? undefined}
              onSaved={() => {
                targetsState.reload();
              }}
            />
          )}
          <h2
            data-testid="dashboard-section-heading-recent-activity"
            className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-6 mb-1"
          >
            Recent activity
          </h2>
          <div className="grid lg:grid-cols-2 gap-4 mt-2">
            <section className="glass rounded-2xl p-4" aria-label="Recent activity">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-semibold">Recent Activity</h2>
                <Link
                  to={timelinePath(scopedGrowId)}
                  className="text-xs text-primary hover:underline"
                >
                  View full Timeline →
                </Link>
              </div>
              {recent.status === "loading" || recent.status === "idle" ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : recent.status === "unavailable" ? (
                <p className="text-sm text-muted-foreground">Recent activity unavailable.</p>
              ) : recent.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recent.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-border/40 bg-secondary/20 p-2 text-sm"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {item.kind === "diary" ? "Diary Entry" : "Action Queue Event"}
                        </Badge>
                        <span className="text-xs truncate">{item.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.ts), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      {item.detail && (
                        <p className="text-xs mt-1 italic text-muted-foreground">{item.detail}</p>
                      )}
                      {item.href && (
                        <Link to={item.href} className="text-xs text-primary hover:underline">
                          View details →
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              className="glass rounded-2xl p-4"
              aria-label="Pending actions"
              data-testid="dashboard-approval-queue-section"
            >
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div>
                  <h2 className="font-display font-semibold">Pending Actions</h2>
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="dashboard-approval-queue-subtitle"
                  >
                    Approval-Required Action Queue · Verdant suggests, you approve.
                  </p>
                </div>
                <Link
                  to={actionsPath(scopedGrowId)}
                  className="text-xs text-primary hover:underline"
                >
                  View all actions →
                </Link>
              </div>
              <SafeByDesignNotice
                variant="compact"
                className="mb-3"
                testId="dashboard-approval-queue-safe-by-design"
              />
              {pending.status === "loading" || pending.status === "idle" ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : pending.status === "unavailable" ? (
                <p className="text-sm text-muted-foreground">Pending actions unavailable.</p>
              ) : pending.items.length === 0 ? (
                <div
                  data-testid="dashboard-approval-queue-empty"
                  className="rounded-lg border border-dashed border-border/60 bg-secondary/10 p-3 text-sm"
                >
                  <p className="font-medium">{APPROVAL_QUEUE_EMPTY_COPY.title}</p>
                  <span className="sr-only">No pending actions.</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {APPROVAL_QUEUE_EMPTY_COPY.hint}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {pending.items.map((a) => {
                    const severity = mapRiskToSeverity(a.risk_level);
                    const tentName = a.tent_id && tents.find((t) => t.id === a.tent_id)?.name;
                    return (
                      <li
                        key={a.id}
                        data-testid="dashboard-approval-queue-item"
                        className="rounded-lg border border-border/40 bg-secondary/20 p-3 text-sm"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <SeverityBadge severity={severity} />
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {a.risk_level} risk
                          </Badge>
                          <span className="text-xs font-medium truncate">
                            {sanitizeActionCopy(a.suggested_change)}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(a.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px]">
                          {tentName ? (
                            <Badge
                              variant="outline"
                              className="font-normal"
                              data-testid="dashboard-approval-queue-item-tent"
                            >
                              Tent: {tentName}
                            </Badge>
                          ) : null}
                          {a.source ? (
                            <Badge
                              variant="outline"
                              className="font-normal"
                              data-testid="dashboard-approval-queue-item-source"
                            >
                              Source: {a.source}
                            </Badge>
                          ) : null}
                          <Badge
                            variant="outline"
                            className="font-normal"
                            data-testid="dashboard-approval-queue-item-status"
                          >
                            Status: {a.status}
                          </Badge>
                        </div>
                        {a.reason && (
                          <p className="text-xs mt-2 italic text-muted-foreground">
                            {sanitizeActionCopy(stripBackPointerTokens(a.reason))}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <Button
                            asChild
                            size="sm"
                            className="gradient-leaf text-primary-foreground"
                            data-testid="dashboard-approval-queue-item-approve"
                          >
                            <Link
                              to={actionDetailPath(a.id)}
                              aria-label={`Review and approve: ${sanitizeActionCopy(a.suggested_change)}`}
                              title="Approval-only — no device control is executed"
                            >
                              Review &amp; Approve
                            </Link>
                          </Button>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            data-testid="dashboard-approval-queue-item-dismiss"
                          >
                            <Link
                              to={actionDetailPath(a.id)}
                              aria-label={`Dismiss: ${sanitizeActionCopy(a.suggested_change)}`}
                              title="Opens the action detail to record a dismissal"
                            >
                              Dismiss
                            </Link>
                          </Button>
                          <span className="text-[10px] text-muted-foreground">
                            Approving here records your decision. It never sends a command to fans,
                            lights, pumps, or any equipment.
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground mt-4">Select a grow to see scoped activity.</p>
      )}
    </div>
  );
}
