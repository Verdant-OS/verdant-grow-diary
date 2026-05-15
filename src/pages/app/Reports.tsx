import { useVerdant, dayOfPlant, weekOfPlant } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { BarChart3, Sprout } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LineChart, Line, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { format, subDays, startOfWeek, isSameWeek } from "date-fns";

export default function Reports() {
  const v = useVerdant();
  if (v.plants.length === 0) return (
    <>
      <PageHeader title="Reports" subtitle="Weekly summaries per plant" icon={BarChart3} />
      <EmptyState title="No plants" description="Create a plant to start generating reports." icon={Sprout}
        action={<Button asChild className="gradient-leaf text-primary-foreground"><Link to="/app/plants">Add plant</Link></Button>} />
    </>
  );

  return (
    <>
      <PageHeader title="Reports" subtitle="Real activity from your diary, watering, feeding, training, photos, snapshots, diagnoses & harvests" icon={BarChart3} />
      <div className="space-y-6">
        {v.plants.map(p => {
          const isDemo = p.id.startsWith("demo-");
          const w = v.watering.filter(x => x.plantId === p.id);
          const f = v.feeding.filter(x => x.plantId === p.id);
          const tr = v.training.filter(x => x.plantId === p.id);
          const photos = v.photos.filter(x => x.plantId === p.id);
          const diags = v.diagnoses.filter(x => x.plantId === p.id);
          const harvests = v.harvests.filter(x => x.plantId === p.id);
          const snaps = v.snapshots.filter(x => !x.plantId || x.plantId === p.id);

          // last 4 weeks of activity
          const weeks = Array.from({ length: 4 }).map((_, i) => {
            const ref = subDays(new Date(), (3 - i) * 7);
            const label = format(startOfWeek(ref), "MMM d");
            const inWeek = (ts: string) => isSameWeek(new Date(ts), ref);
            return {
              week: label,
              water: w.filter(x => inWeek(x.timestamp)).length,
              feed: f.filter(x => inWeek(x.timestamp)).length,
              train: tr.filter(x => inWeek(x.timestamp)).length,
              photos: photos.filter(x => inWeek(x.timestamp)).length,
            };
          });
          const activityHasData = weeks.some(wk => wk.water + wk.feed + wk.train + wk.photos > 0);

          const envData = [...snaps].slice(0, 14).reverse().map(s => ({
            time: format(new Date(s.timestamp), "MM/dd"),
            temp: s.tempF, rh: s.humidity, vpd: s.vpd,
          }));

          // Medium- + autoflower-aware risks
          const risks: string[] = [];
          const now = Date.now();
          const hoursSince = (ts?: string) => ts ? (now - new Date(ts).getTime()) / 36e5 : Infinity;
          if (p.medium === "soil" && weeks[3].water > 4) risks.push("Soil: more than 4 waterings in last week — risk of overwatering.");
          if (p.medium === "coco" && hoursSince(f[0]?.timestamp) > 72) risks.push("Coco: no feeding logged in last 3 days — fertigate often.");
          if (p.medium === "peat" && !w.some(x => x.runoffEc !== undefined && hoursSince(x.timestamp) < 168)) risks.push("Peat: no runoff EC logged in last week.");
          if (p.medium === "hydro" && !snaps.some(s => (s.resEC !== undefined || s.resPH !== undefined) && hoursSince(s.timestamp) < 48)) risks.push("Hydro: no reservoir EC/pH snapshot in last 48h.");
          if (p.seedType === "autoflower" && tr.some(t => ["topping","HST","defoliation","transplant"].includes(t.trainingType) && hoursSince(t.timestamp) < 168)) {
            risks.push("Autoflower: heavy training event in last 7 days — monitor for stall.");
          }
          if (snaps.length === 0) risks.push("No environment snapshots — capture one to enable trend tracking.");
          if (diags.length > 0 && !diags[0].result) risks.push("Open diagnosis request awaiting AI provider.");

          return (
            <div key={p.id} className="glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div>
                  <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                    {p.name}
                    <Badge variant="outline" className={isDemo ? "border-info/40 text-info text-[10px]" : "border-border text-muted-foreground text-[10px]"}>
                      {isDemo ? "demo" : "manual"}
                    </Badge>
                  </h3>
                  <div className="text-xs text-muted-foreground capitalize">{p.strain} · day {dayOfPlant(p)} · week {weekOfPlant(p)} · {p.stage.replace("-", " ")} · {p.medium}</div>
                </div>
                <Button asChild variant="outline" size="sm"><Link to={`/app/plants/${p.id}`}>Open plant</Link></Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <Stat label="Waterings" v={w.length} />
                <Stat label="Feedings" v={f.length} />
                <Stat label="Training" v={tr.length} />
                <Stat label="Photos" v={photos.length} />
                <Stat label="Diagnoses" v={diags.length} />
                <Stat label="Harvests" v={harvests.length} />
              </div>

              <div className="grid lg:grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Activity · last 4 weeks</div>
                  {activityHasData ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeks}>
                          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                          <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="water" stackId="a" fill="hsl(var(--info))" />
                          <Bar dataKey="feed" stackId="a" fill="hsl(var(--primary))" />
                          <Bar dataKey="train" stackId="a" fill="hsl(var(--warning))" />
                          <Bar dataKey="photos" stackId="a" fill="hsl(var(--accent))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState title="No activity logged" description="Log a watering or feeding to populate this chart." icon={BarChart3}
                      action={<Button asChild size="sm" className="gradient-leaf text-primary-foreground"><Link to="/app/diary?new=watering">Log watering</Link></Button>} />
                  )}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Environment trend</div>
                  {envData.length > 1 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={envData}>
                          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                          <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="temp" stroke="hsl(var(--warning))" name="Temp °F" />
                          <Line type="monotone" dataKey="rh" stroke="hsl(var(--info))" name="RH %" />
                          <Line type="monotone" dataKey="vpd" stroke="hsl(var(--primary))" name="VPD" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState title="No snapshots" description="Capture sensor snapshots to chart temp / RH / VPD trends." icon={BarChart3}
                      action={<Button asChild size="sm" className="gradient-leaf text-primary-foreground"><Link to={`/app/sensors?plant=${p.id}`}>Capture snapshot</Link></Button>} />
                  )}
                </div>
              </div>

              {risks.length > 0 && (
                <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
                  <div className="font-semibold text-warning mb-1">Current risks & next checks</div>
                  <ul className="space-y-0.5">{risks.map((r, i) => <li key={i}>· {r}</li>)}</ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Stat({ label, v }: any) {
  return <div className="rounded-lg bg-card/50 border border-border/40 p-3">
    <div className="text-xs uppercase text-muted-foreground">{label}</div>
    <div className="font-display text-xl mt-1">{v}</div>
  </div>;
}
