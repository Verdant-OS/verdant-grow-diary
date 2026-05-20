import { useState } from "react";
import { Link } from "react-router-dom";

import { Activity, AlertTriangle, Box, Sprout, ListChecks, Sparkles, ArrowRight } from "lucide-react";
import type { Stage, SensorReading } from "@/mock";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import MetricChip from "@/components/MetricChip";
import SeverityBadge from "@/components/SeverityBadge";
import StageBadge from "@/components/StageBadge";
import SensorChart from "@/components/SensorChart";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import { useAlerts, useTasks, useAIInsights } from "@/hooks/useMockData";
import { useGrowPlants, useGrowTents } from "@/hooks/useGrowData";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
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
  SOURCE_LABEL,
  formatValue,
  isStale,
} from "@/lib/sensorSnapshot";
import { evaluateSensorQuality } from "@/lib/sensorQuality";


import type { SensorReadingRow } from "@/lib/db";
import { Button } from "@/components/ui/button";
import GrowTargetsEditor from "@/components/GrowTargetsEditor";

import { Badge } from "@/components/ui/badge";
import { actionDetailPath, actionsPath, dashboardPath, logsPath } from "@/lib/routes";
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
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();
  const scopedGrowId = isValidScopedGrow ? urlGrowId ?? undefined : undefined;
  const { data: tents = [] } = useGrowTents(scopedGrowId);
  const { data: plants = [] } = useGrowPlants(undefined, scopedGrowId);
  const { data: tasks = [] } = useTasks();
  const { data: alerts = [] } = useAlerts();
  const { data: rawReadings = [] } = useSensorReadings();
  const readings = groupReadings(rawReadings);
  const { data: insights = [] } = useAIInsights();
  const { recent, pending } = useDashboardScopedData(scopedGrowId ?? null);
  const sensorState = useLatestSensorSnapshot(
    scopedGrowId ?? null,
    tents.map((t) => t.id),
  );
  const trendsState = useEnvironmentTrends(
    scopedGrowId ?? null,
    tents.map((t) => t.id),
  );
  const targetsState = useGrowTargets(scopedGrowId ?? null);
  const [targetsEditorOpen, setTargetsEditorOpen] = useState(false);






  const dueToday = tasks.filter((t) => t.status === "today").length;
  const openAlerts = alerts.filter((a) => !a.acknowledged).length;

  // Latest reading per tent for the strip
  const latestPerTent = tents.map((t) => {
    const rs = readings.filter((r) => r.tentId === t.id);
    return { tent: t, last: rs[rs.length - 1] };
  });

  const recentAlerts = alerts.slice(0, 3);

  return (
    <div>
      <GrowBreadcrumbs
        growId={urlGrowId}
        growName={scopedGrowName}
        current="Dashboard"
        section="dashboard"
      />
      <PageHeader
        title="Dashboard"
        description="Live status across every tent, plant, and sensor."
        icon={<Sparkles className="h-5 w-5" />}
        actions={<Button asChild className="gradient-leaf text-primary-foreground"><Link to="/tents">Open tents</Link></Button>}
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Active tents" value={tents.length} icon={<Box className="h-3.5 w-3.5" />} />
        <KpiCard label="Plants" value={plants.length} icon={<Sprout className="h-3.5 w-3.5" />} hint={`${plants.filter((p) => p.health === "healthy").length} healthy`} accent="success" />
        <KpiCard label="Open alerts" value={openAlerts} icon={<AlertTriangle className="h-3.5 w-3.5" />} accent={openAlerts > 0 ? "destructive" : "success"} />
        <KpiCard label="Due today" value={dueToday} icon={<ListChecks className="h-3.5 w-3.5" />} accent={dueToday > 0 ? "warning" : "success"} />
      </div>

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
          <h2 className="font-display font-semibold mb-3">Environment strip</h2>
          <div className="space-y-2.5">
            {latestPerTent.map(({ tent, last }) => (
              <Link key={tent.id} to={`/tents/${tent.id}`} className="block rounded-xl border border-border/40 p-3 hover:bg-secondary/30 transition">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{tent.name}</span>
                    <StageBadge stage={tent.stage as Stage} />
                  </div>
                  { /* alertCount removed — not available in Supabase schema */ }
                </div>
                {last && (
                  <div className="flex flex-wrap gap-1.5">
                    <MetricChip label="T" value={last.temp ?? "—"} unit="°C" status={last.temp != null && (last.temp > 28 || last.temp < 19) ? "warn" : "ok"} />
                    <MetricChip label="RH" value={last.rh ?? "—"} unit="%" status={last.rh != null && (last.rh > 65 || last.rh < 35) ? "warn" : "ok"} />
                    <MetricChip label="VPD" value={last.vpd ?? "—"} unit=" kPa" status={last.vpd != null && (last.vpd > 1.6 || last.vpd < 0.6) ? "warn" : "ok"} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold">Needs attention</h2>
            <Button asChild size="sm" variant="ghost"><Link to="/alerts">All alerts <ArrowRight className="h-3 w-3" /></Link></Button>
          </div>
          {recentAlerts.length === 0 && <p className="text-sm text-muted-foreground">All systems nominal.</p>}
          <ul className="space-y-2">
            {recentAlerts.map((a) => (
              <li key={a.id} className="rounded-xl border border-border/40 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={a.severity} />
                  <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
                </div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.detail}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold">AI insights</h2>
            <Button asChild size="sm" variant="ghost"><Link to="/doctor">Open Doctor <ArrowRight className="h-3 w-3" /></Link></Button>
          </div>
          <ul className="space-y-2">
            {insights.slice(0, 3).map((i) => (
              <li key={i.id} className="rounded-xl border border-border/40 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-medium">{i.title}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">{Math.round(i.confidence * 100)}% conf</span>
                </div>
                <p className="text-xs text-muted-foreground">{i.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {scopedGrowId ? (
        <>
        <section
          className="glass rounded-2xl p-4 mt-4"
          aria-label="Latest environment"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display font-semibold">Latest Environment</h2>
              <p className="text-xs text-muted-foreground">
                Most recent reading for this grow. Not live device control.
              </p>
            </div>
            <Link
              to={logsPath(scopedGrowId)}
              className="text-xs text-primary hover:underline"
            >
              Open Timeline →
            </Link>
          </div>
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
                  {SOURCE_LABEL[sensorState.snapshot.source]}
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
                  { label: "Temperature", value: formatValue(sensorState.snapshot.temp, "°C") },
                  { label: "Humidity", value: formatValue(sensorState.snapshot.rh, "%") },
                  { label: "VPD", value: formatValue(sensorState.snapshot.vpd, " kPa", 2) },
                  { label: "Soil water", value: formatValue(sensorState.snapshot.soil, "%") },
                  { label: "Soil EC", value: formatValue(sensorState.snapshot.soil_ec, " mS/cm", 2) },
                  { label: "Soil temp", value: formatValue(sensorState.snapshot.soil_temp, "°C") },
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
                    avg: formatValue(trendsState.trends.temp.avg, "°C"),
                    range: `${formatValue(trendsState.trends.temp.min, "°C")} – ${formatValue(trendsState.trends.temp.max, "°C")}`,
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
              // Reload by toggling the URL? Simpler: force a soft refresh
              // by replacing the current location with the same path.
              window.location.assign(window.location.pathname + window.location.search);
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

