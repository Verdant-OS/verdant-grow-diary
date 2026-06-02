import VpdStageMissingBadge from "@/components/VpdStageMissingBadge";
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
// Mock side-panel hooks intentionally removed — the Dashboard renders
// honest empty states for Tasks and AI Insights until backed by real data.
// See docs/qa/v0-demo-loop-checklist.md and docs/safety/static-safety-scans.md.
import { useGrowPlants, useGrowTents } from "@/hooks/useGrowData";
import { useGrows } from "@/store/grows";
import OnboardingChecklistCard from "@/components/OnboardingChecklistCard";
import OnboardingProgressPill from "@/components/OnboardingProgressPill";
import DashboardZeroTentEmptyState from "@/components/DashboardZeroTentEmptyState";
import FirstPlantMemoryCta from "@/components/FirstPlantMemoryCta";
import DashboardPendingOutcomeReviewsCard from "@/components/DashboardPendingOutcomeReviewsCard";
import { buildOnboardingChecklistViewModel } from "@/lib/onboardingChecklistViewModel";
import { useSensorReadings, useSensorReadingsByTents } from "@/hooks/use-sensor-readings";
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
import {
  resolveSelectedTentIds,
  type TentSelection,
} from "@/lib/dashboardLatestEnvironmentRules";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";


import {
  SOURCE_LABEL,
  formatValue,
  isStale,
} from "@/lib/sensorSnapshot";
import { formatSensorSourceLabel } from "@/lib/manualSensorSourceLabel";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import { tempFFromC, formatTempFFromC } from "@/lib/temperatureUnits";


import type { SensorReadingRow } from "@/lib/db";
import { Button } from "@/components/ui/button";
import GrowTargetsEditor from "@/components/GrowTargetsEditor";
import DailyGrowCheckStatusCard from "@/components/DailyGrowCheckStatusCard";
import DailyGrowCheckOnboardingCard from "@/components/DailyGrowCheckOnboardingCard";
import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";

import { Badge } from "@/components/ui/badge";
import SensorSourceBadge from "@/components/SensorSourceBadge";
import { actionDetailPath, actionsPath, alertDetailPath, alertsPath, dashboardPath, logsPath, tentDetailPath, tentsPath } from "@/lib/routes";
import { formatDistanceToNow } from "date-fns";


type DashReading = {
  ts: string;
  tentId: string;
  temp: number | null;
  rh: number | null;
  vpd: number | null;
  co2: number | null;
  soil: number | null;
};

const METRIC_KEY: Record<string, keyof Omit<DashReading, "ts" | "tentId">> = {
  temperature_c: "temp",
  humidity_pct: "rh",
  vpd_kpa: "vpd",
  co2_ppm: "co2",
  soil_moisture_pct: "soil",
};

function groupReadings(rows: SensorReadingRow[]): DashReading[] {
  const byKey = new Map<string, DashReading>();
  for (const row of rows) {
    const key = `${row.tent_id}|${row.ts}`;
    let r = byKey.get(key);
    if (!r) {
      r = { ts: row.ts, tentId: row.tent_id, temp: null, rh: null, vpd: null, co2: null, soil: null };
      byKey.set(key, r);
    }
    const k = METRIC_KEY[row.metric];
    const v = Number(row.value);
    if (k && Number.isFinite(v)) r[k] = v;
  }
  // Ascending by ts for chart readability
  return Array.from(byKey.values()).sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

export default function Dashboard() {
  // Shared URL `?growId=` resolution against RLS-loaded grows. When growId is
  // absent or invalid, hooks fetch the user's full set (legacy behavior).
  const { urlGrowId, scopedGrow, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();
  const scopedGrowId = isValidScopedGrow ? urlGrowId ?? undefined : undefined;
  const { data: tents = [] } = useGrowTents(scopedGrowId);
  const { data: plants = [] } = useGrowPlants(undefined, scopedGrowId);
  // Tasks: no real-data hook yet — render an honest empty state below.
  const tasks: { status: string }[] = [];
  const { data: rawReadings = [] } = useSensorReadings();
  const readings = groupReadings(rawReadings);
  // Per-tent sensor windows for the stability summary. Each tent gets its
  // own 200-row window so a busy tent cannot push another tent's VPD rows
  // out of a shared global cap. Read-only; no writes.
  const tentIds = tents.map((t) => t.id);
  const { byTent: readingsByTent } = useSensorReadingsByTents(tentIds);
  // AI Insights: no real-data hook yet — render an honest empty state below.
  const { recent, pending } = useDashboardScopedData(scopedGrowId ?? null);
  // Multi-tent selector for the Latest Environment card. Defaults to "all"
  // (matches prior behavior); when a specific tent is chosen the snapshot
  // hook only queries that tent so the displayed reading matches context.
  const [tentSelection, setTentSelection] = useState<TentSelection>("all");
  const selectableTents = tents.map((t) => ({ id: t.id, name: t.name }));
  const selectedTentIds = resolveSelectedTentIds(selectableTents, tentSelection);
  const sensorState = useLatestSensorSnapshot(
    scopedGrowId ?? null,
    selectedTentIds,
  );
  const trendsState = useEnvironmentTrends(
    scopedGrowId ?? null,
    tents.map((t) => t.id),
  );
  const targetsState = useGrowTargets(scopedGrowId ?? null);
  const [targetsEditorOpen, setTargetsEditorOpen] = useState(false);

  // First-run onboarding checklist — derived from data the Dashboard
  // already loads. No extra Supabase queries, no writes.
  const { grows } = useGrows();
  const diaryRecentCount =
    recent.status === "ok"
      ? recent.items.filter((i) => i.kind === "diary").length
      : 0;
  const onboardingVm = buildOnboardingChecklistViewModel({
    growCount: grows.length,
    tentCount: tents.length,
    plantCount: plants.length,
    diaryEntryCount: diaryRecentCount,
    sensorReadingCount: rawReadings.length,
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
    snapshot: sensorState.status === "ok" ? sensorState.snapshot : null,
    quality: evaluateSensorQuality(
      sensorState.status === "ok" ? sensorState.snapshot : null,
    ),
    targets: compareSnapshotToTargets(
      sensorState.status === "ok" ? sensorState.snapshot : null,
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
    const tentRows = readingsByTent[t.id] ?? [];
    const rs = groupReadings(tentRows);
    const stability = computeEnvironmentStability(rs, { stage: t.stage });
    return { tent: t, last: rs[rs.length - 1], stability };
  });


  const recentAlerts = persistedAlertsState.alerts.slice(0, 3);

  return (
    <div>
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
              <Link to="/daily-check">Daily Grow Check</Link>
            </Button>
            <Button asChild className="gradient-leaf text-primary-foreground"><Link to={tentsPath()}>Open tents</Link></Button>
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
        <OnboardingChecklistCard vm={onboardingVm} />
      </div>

      {plants.length > 0 && <FirstPlantMemoryCta />}

      <DashboardPendingOutcomeReviewsCard scopedGrowId={scopedGrowId ?? null} />



      <DashboardDataSourceDisclosure
        scopedGrowId={scopedGrowId}
        hasAnyData={tents.length > 0 || plants.length > 0}
        snapshotSource={
          sensorState.status === "ok" ? sensorState.snapshot.source : undefined
        }
      />

      <DailyGrowCheckOnboardingCard
        compact
        hideWhenReady
        tentIds={tents.map((t) => t.id)}
        className="mb-3"
      />

      <DailyGrowCheckStatusCard
        className="mb-6"
        tentIds={tents.map((t) => t.id)}
      />

      <DashboardDailyGrowCheckPanel
        scopedGrowId={scopedGrowId ?? null}
        className="mb-6"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">

        <KpiCard label="Active tents" value={tents.length} icon={<Box className="h-3.5 w-3.5" />} />
        <KpiCard label="Plants" value={plants.length} icon={<Sprout className="h-3.5 w-3.5" />} hint={`${plants.filter((p) => p.health === "healthy").length} healthy`} accent="success" />
        <KpiCard label="Open alerts" value={openAlerts} icon={<AlertTriangle className="h-3.5 w-3.5" />} accent={openAlerts > 0 ? "destructive" : "success"} />
        <KpiCard label="Due today" value={dueToday} hint={dueToday === 0 ? "No tasks yet" : undefined} icon={<ListChecks className="h-3.5 w-3.5" />} accent={dueToday > 0 ? "warning" : "success"} />
      </div>

      {tents.length === 0 ? (
        <DashboardZeroTentEmptyState />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2 glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-display font-semibold">Tent A · 7-day environment</h2>
                <p className="text-xs text-muted-foreground">Temperature, humidity, VPD</p>
              </div>
              <Button asChild size="sm" variant="ghost"><Link to="/sensors">Sensor data <ArrowRight className="h-3 w-3" /></Link></Button>
            </div>
            <SensorChart data={readings.filter((r) => r.tentId === (tents[0]?.id ?? "")) as unknown as SensorReading[]} metric="temp" height={200} />
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h2 className="font-display font-semibold">Environment strip</h2>
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
              {latestPerTent.map(({ tent, last, stability }) => {
                const stabilityView = formatStabilityChipView(stability);
                return (
                  <Link key={tent.id} to={tentDetailPath(tent.id)} className="block rounded-xl border border-border/40 p-3 hover:bg-secondary/30 transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{tent.name}</span>
                        <StageBadge stage={tent.stage as Stage} />
                      </div>
                      { /* alertCount removed — not available in Supabase schema */ }
                    </div>
                    {last && (
                      <div className="flex flex-wrap gap-1.5">
                        <MetricChip label="T" value={last.temp != null ? (tempFFromC(last.temp) ?? 0).toFixed(1) : "—"} unit="°F" status={environmentMetricChipStatus(classifyTempAgainstStage(last.temp ?? null, { stage: tent.stage }))} />
                        <MetricChip label="RH" value={last.rh ?? "—"} unit="%" status={environmentMetricChipStatus(classifyRhAgainstStage(last.rh ?? null, { stage: tent.stage }))} />
                        <MetricChip label="VPD" value={last.vpd ?? "—"} unit=" kPa" status={vpdMetricChipStatus(classifyVpdAgainstStage({ value: last.vpd ?? null, stage: tent.stage }))} />
                      </div>
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
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold">Needs attention</h2>
            <Button asChild size="sm" variant="ghost"><Link to={alertsPath()}>All alerts <ArrowRight className="h-3 w-3" /></Link></Button>
          </div>
          {recentAlerts.length === 0 && <p className="text-sm text-muted-foreground">All systems nominal.</p>}
          <ul className="space-y-2">
            {recentAlerts.map((a) => (
              <li key={a.id} className="rounded-xl border border-border/40 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={a.severity === "watch" ? "warning" : a.severity} />
                  <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
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
            <Button asChild size="sm" variant="ghost"><Link to="/doctor">Open Doctor <ArrowRight className="h-3 w-3" /></Link></Button>
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
        <section
          className="glass rounded-2xl p-4 mt-4"
          aria-label="Latest environment"
        >
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2 className="font-display font-semibold">Latest Environment</h2>
              <p className="text-xs text-muted-foreground">
                Most recent reading for this grow. Not live device control.
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
                to={logsPath(scopedGrowId)}
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
            <p className="text-sm text-muted-foreground">
              Sensor data unavailable.
            </p>
          ) : sensorState.snapshot.source === "unavailable" ? (
            <p className="text-sm text-muted-foreground">No sensor data yet.</p>
          ) : (
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Badge variant="outline" className="text-[10px] uppercase">
                  {formatSensorSourceLabel({
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
                  { label: "Temperature", value: formatTempFFromC(sensorState.snapshot.temp) },
                  { label: "Humidity", value: formatValue(sensorState.snapshot.rh, "%") },
                  { label: "VPD", value: formatValue(sensorState.snapshot.vpd, " kPa", 2) },
                  { label: "Soil water", value: formatValue(sensorState.snapshot.soil, "%") },
                  { label: "Soil EC", value: formatValue(sensorState.snapshot.soil_ec, " mS/cm", 2) },
                  { label: "Soil temp", value: formatTempFFromC(sensorState.snapshot.soil_temp) },
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
        {sensorState.status === "ok" && (
          <section
            className="glass rounded-2xl p-4 mt-4"
            aria-label="Sensor Data Quality"
          >
            {(() => {
              const q = evaluateSensorQuality(sensorState.snapshot);
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
                      <h2 className="font-display font-semibold">
                        Sensor Data Quality
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Heuristic check of the latest snapshot. Not a plant-health
                        diagnosis.
                      </p>
                    </div>
                    <Link
                      to={logsPath(scopedGrowId)}
                      className="text-xs text-primary hover:underline"
                    >
                      Inspect history →
                    </Link>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase ${tone}`}
                    >
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
        <section
          className="glass rounded-2xl p-4 mt-4"
          aria-label="Environment Trends"
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-display font-semibold">Environment Trends</h2>
              <p className="text-xs text-muted-foreground">
                Recent readings summary. Not a plant-health diagnosis.
              </p>
            </div>
            <Link
              to={logsPath(scopedGrowId)}
              className="text-xs text-primary hover:underline"
            >
              Open Timeline →
            </Link>
          </div>
          {trendsState.status === "loading" || trendsState.status === "idle" ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : trendsState.status === "unavailable" ? (
            <p className="text-sm text-muted-foreground">
              Trend data unavailable.
            </p>
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
                    avg: formatTempFFromC(trendsState.trends.temp.avg),
                    range: `${formatTempFFromC(trendsState.trends.temp.min)} – ${formatTempFFromC(trendsState.trends.temp.max)}`,
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
                    <dd className="text-[11px] text-muted-foreground">
                      range {m.range}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>
        <section
          className="glass rounded-2xl p-4 mt-4"
          aria-label="Target Comparison"
        >
          {(() => {
            const snap =
              sensorState.status === "ok" ? sensorState.snapshot : null;
            const targets =
              targetsState.status === "ok" ? targetsState.targets : null;
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
                    <h2 className="font-display font-semibold">
                      Target Comparison
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Latest snapshot vs configured grow targets. Not a
                      plant-health diagnosis.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      to={logsPath(scopedGrowId)}
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
                      const valueText =
                        m.value === null ? "Unknown" : String(m.value);
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
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${toneCls}`}
                        >
                          Stage VPD · {vpd.band.stage.replace("_", " ")}
                        </Badge>
                        <span className="text-xs">
                          {vpd.value === null ? "—" : `${vpd.value.toFixed(2)} kPa`}{" "}
                          <span className="text-muted-foreground">
                            (target {rangeText})
                          </span>
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
        <section
          className="glass rounded-2xl p-4 mt-4"
          aria-label="Environment Alerts"
        >
          {(() => {
            const snap =
              sensorState.status === "ok" ? sensorState.snapshot : null;
            const quality = evaluateSensorQuality(snap);
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
                    <h2 className="font-display font-semibold">
                      Environment Alerts
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Read-only summary of data quality and target status. Not a
                      plant-health diagnosis. Not device control.
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
                  <p className="text-sm text-muted-foreground">
                    {EMPTY_ALERTS_MESSAGE}
                  </p>

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
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase ${tone}`}
                            >
                              {a.severity}
                            </Badge>
                            <span className="font-medium text-sm">
                              {a.title}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {a.reason}
                          </p>
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
                                      metric:
                                        typeof a.metric === "string"
                                          ? a.metric
                                          : null,
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
                                          onClick: () => window.location.assign(alertDetailPath(saved.id)),
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
        <div className="grid lg:grid-cols-2 gap-4 mt-4">





          <section
            className="glass rounded-2xl p-4"
            aria-label="Recent activity"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold">Recent Activity</h2>
              <Link
                to={logsPath(scopedGrowId)}
                className="text-xs text-primary hover:underline"
              >
                View full Timeline →
              </Link>
            </div>
            {recent.status === "loading" || recent.status === "idle" ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : recent.status === "unavailable" ? (
              <p className="text-sm text-muted-foreground">
                Recent activity unavailable.
              </p>
            ) : recent.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recent activity yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {recent.items.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-border/40 bg-secondary/20 p-2 text-sm"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {item.kind === "diary"
                          ? "Diary Entry"
                          : "Action Queue Event"}
                      </Badge>
                      <span className="text-xs truncate">{item.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.ts), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    {item.detail && (
                      <p className="text-xs mt-1 italic text-muted-foreground">
                        {item.detail}
                      </p>
                    )}
                    {item.href && (
                      <Link
                        to={item.href}
                        className="text-xs text-primary hover:underline"
                      >
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
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold">Pending Actions</h2>
              <Link
                to={actionsPath(scopedGrowId)}
                className="text-xs text-primary hover:underline"
              >
                View all actions →
              </Link>
            </div>
            {pending.status === "loading" || pending.status === "idle" ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : pending.status === "unavailable" ? (
              <p className="text-sm text-muted-foreground">
                Pending actions unavailable.
              </p>
            ) : pending.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending actions.
              </p>
            ) : (
              <ul className="space-y-2">
                {pending.items.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-border/40 bg-secondary/20 p-2 text-sm"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {a.risk_level} risk
                      </Badge>
                      <span className="text-xs font-medium truncate">
                        {a.suggested_change}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    {a.reason && (
                      <p className="text-xs mt-1 italic text-muted-foreground">
                        {a.reason}
                      </p>
                    )}
                    <Link
                      to={actionDetailPath(a.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      View action →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        </>
      ) : (

        <p className="text-sm text-muted-foreground mt-4">
          Select a grow to see scoped activity.
        </p>
      )}
    </div>
  );
}

