import { Link } from "react-router-dom";
import { Activity, AlertTriangle, Box, Sprout, ListChecks, Sparkles, ArrowRight } from "lucide-react";
import type { Stage } from "@/mock";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import MetricChip from "@/components/MetricChip";
import SeverityBadge from "@/components/SeverityBadge";
import StageBadge from "@/components/StageBadge";
import SensorChart from "@/components/SensorChart";
import { useAlerts, useSensorReadings, useTasks, useAIInsights } from "@/hooks/useMockData";
import { usePlants } from "@/hooks/use-plants";
import { useTents } from "@/hooks/use-tents";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: tents = [] } = useTents();
  const { data: plants = [] } = usePlants();
  const { data: tasks = [] } = useTasks();
  const { data: alerts = [] } = useAlerts();
  const { data: readings = [] } = useSensorReadings();
  const { data: insights = [] } = useAIInsights();

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
      <PageHeader
        title="Dashboard"
        description="Live status across every tent, plant, and sensor."
        icon={<Sparkles className="h-5 w-5" />}
        actions={<Button asChild className="gradient-leaf text-primary-foreground"><Link to="/tents">Open tents</Link></Button>}
      />

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
          <SensorChart data={readings.filter((r) => r.tentId === "t1")} metric="temp" height={200} />
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
                    <MetricChip label="T" value={last.temp} unit="°C" status={last.temp > 28 || last.temp < 19 ? "warn" : "ok"} />
                    <MetricChip label="RH" value={last.rh} unit="%" status={last.rh > 65 || last.rh < 35 ? "warn" : "ok"} />
                    <MetricChip label="VPD" value={last.vpd} unit=" kPa" status={last.vpd > 1.6 || last.vpd < 0.6 ? "warn" : "ok"} />
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
    </div>
  );
}
