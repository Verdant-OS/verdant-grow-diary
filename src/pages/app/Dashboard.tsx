import { Link } from "react-router-dom";
import { useVerdant, dayOfPlant, weekOfPlant } from "@/store/verdant";
import { PageHeader, StatCard } from "@/components/ui-bits";
import { Sprout, Activity, BookOpen, AlertTriangle, ArrowRight, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceBadge, ConfidenceBadge } from "@/components/SourceBadge";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const v = useVerdant();
  const active = v.plants.filter(p => !p.archived);
  const latestSnap = v.snapshots[0];
  const latestDiary = v.diary[0];
  const nextEvent = [...v.events].sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .find(e => +new Date(e.date) >= Date.now() - 86400000);
  const risks: string[] = [];
  if (!latestSnap || latestSnap.confidence === "stale") risks.push("Sensor snapshot is stale or missing.");
  active.forEach(p => {
    if (p.seedType === "autoflower" && weekOfPlant(p) >= 3 && p.stage === "seedling")
      risks.push(`${p.name} is on day ${dayOfPlant(p)} but still flagged seedling — update stage.`);
  });

  return (
    <>
      <PageHeader title="Command Dashboard" subtitle="Diary-first overview of every active grow"
        icon={Leaf}
        actions={<Button asChild variant="outline" className="border-border/60"><Link to="/app/diary">Open diary</Link></Button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active plants" value={active.length} sub={`${v.plants.length} total`} accent />
        <StatCard label="Diary entries" value={v.diary.length} sub="all-time" />
        <StatCard label="Snapshots" value={v.snapshots.length} sub={latestSnap ? <SourceBadge source={latestSnap.source} /> : "none"} />
        <StatCard label="Open risks" value={risks.length} sub={risks.length ? "Review below" : "All clear"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold flex items-center gap-2"><Sprout className="h-4 w-4 text-primary" /> Active Plants</h2>
            <Link to="/app/plants" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plants yet. <Link to="/app/plants" className="text-primary">Add one</Link>.</p>
          ) : (
            <div className="space-y-2">
              {active.map(p => (
                <Link to={`/app/plants/${p.id}`} key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-card/50 hover:bg-card border border-border/60 transition-colors">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.strain} · {p.medium} · {p.lightSchedule}</div>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="capitalize">{p.stage.replace("-", " ")}</Badge>
                    <div className="text-xs text-muted-foreground mt-1">Day {dayOfPlant(p)} · Wk {weekOfPlant(p)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-xl p-5">
          <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Environment</h2>
          {latestSnap ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <SourceBadge source={latestSnap.source} />
                <ConfidenceBadge c={latestSnap.confidence} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-muted-foreground text-xs">Temp</div>{latestSnap.tempF ?? "—"}°F</div>
                <div><div className="text-muted-foreground text-xs">RH</div>{latestSnap.humidity ?? "—"}%</div>
                <div><div className="text-muted-foreground text-xs">VPD</div>{latestSnap.vpd ?? "—"} kPa</div>
                <div><div className="text-muted-foreground text-xs">PPFD</div>{latestSnap.ppfd ?? "—"}</div>
              </div>
              {latestSnap.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-warning">
                  {latestSnap.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{w}</li>)}
                </ul>
              )}
            </>
          ) : <p className="text-sm text-muted-foreground">No environment data yet.</p>}
          <Button asChild variant="ghost" size="sm" className="mt-3 w-full justify-between">
            <Link to="/app/sensors">Open sensors <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </div>

        <div className="glass rounded-xl p-5 lg:col-span-2">
          <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> Latest diary entry</h2>
          {latestDiary ? (
            <Link to="/app/diary" className="block p-3 rounded-lg bg-card/50 border border-border/60 hover:bg-card">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{latestDiary.type}</Badge>
                <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(latestDiary.timestamp), { addSuffix: true })}</span>
              </div>
              <p className="mt-2 text-sm">{latestDiary.note}</p>
            </Link>
          ) : <p className="text-sm text-muted-foreground">No entries yet.</p>}
        </div>

        <div className="glass rounded-xl p-5">
          <h2 className="font-display font-semibold mb-3">Next task</h2>
          {nextEvent ? (
            <div>
              <Badge variant="outline" className="capitalize mb-2">{nextEvent.type}</Badge>
              <div className="font-medium">{nextEvent.title}</div>
              <div className="text-xs text-muted-foreground">{new Date(nextEvent.date).toLocaleString()}</div>
            </div>
          ) : <p className="text-sm text-muted-foreground">No upcoming tasks.</p>}
        </div>

        {risks.length > 0 && (
          <div className="glass rounded-xl p-5 lg:col-span-3 border-warning/40">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4" /> Risks & attention
            </h2>
            <ul className="space-y-1 text-sm">
              {risks.map((r, i) => <li key={i}>· {r}</li>)}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
