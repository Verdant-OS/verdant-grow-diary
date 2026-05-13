import { useVerdant, dayOfPlant, weekOfPlant } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { BarChart3, Sprout } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { format, subDays } from "date-fns";

export default function Reports() {
  const v = useVerdant();
  if (v.plants.length === 0) return (
    <>
      <PageHeader title="Reports" subtitle="Weekly summaries per plant" icon={BarChart3} />
      <EmptyState title="No plants" icon={Sprout} />
    </>
  );

  return (
    <>
      <PageHeader title="Reports" subtitle="Weekly grow report per plant" icon={BarChart3} />
      <div className="space-y-6">
        {v.plants.map(p => {
          const w = v.watering.filter(x => x.plantId === p.id);
          const f = v.feeding.filter(x => x.plantId === p.id);
          const photos = v.photos.filter(x => x.plantId === p.id);
          const diags = v.diagnoses.filter(x => x.plantId === p.id);
          const snaps = v.snapshots.filter(x => !x.plantId || x.plantId === p.id).slice(0, 14).reverse();
          const ecData = snaps.map(s => ({ time: format(new Date(s.timestamp), "MM/dd"), temp: s.tempF, rh: s.humidity, vpd: s.vpd }));

          const risks: string[] = [];
          if (w.length === 0) risks.push("No watering logs — capture next watering for runoff data.");
          if (p.medium === "coco" && f.length === 0) risks.push("Coco grow without feeding logs.");
          if (snaps.length === 0) risks.push("No environment snapshots.");

          return (
            <div key={p.id} className="glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-display font-semibold text-lg">{p.name}</h3>
                  <div className="text-xs text-muted-foreground capitalize">{p.strain} · day {dayOfPlant(p)} · week {weekOfPlant(p)} · {p.stage.replace("-", " ")}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <Stat label="Waterings" v={w.length} />
                <Stat label="Feedings" v={f.length} />
                <Stat label="Photos" v={photos.length} />
                <Stat label="Diagnoses" v={diags.length} />
                <Stat label="Snapshots" v={snaps.length} />
              </div>

              {ecData.length > 1 && (
                <div className="mt-4 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ecData}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                      <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Line type="monotone" dataKey="temp" stroke="hsl(var(--warning))" name="Temp °F" />
                      <Line type="monotone" dataKey="rh" stroke="hsl(var(--info))" name="RH %" />
                      <Line type="monotone" dataKey="vpd" stroke="hsl(var(--primary))" name="VPD" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

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
