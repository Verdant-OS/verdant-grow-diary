import { useParams, Link } from "react-router-dom";
import { useVerdant, dayOfPlant, weekOfPlant } from "@/store/verdant";
import { PageHeader } from "@/components/ui-bits";
import { Sprout, ChevronLeft, BookOpen, Droplets, FlaskConical, Scissors, Image as ImageIcon, Activity, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const mediumGuidance: Record<string, string> = {
  soil: "Soil: avoid overfeeding & overwatering. Let top inch dry between waterings.",
  coco: "Coco: emphasize runoff, watch pH and EC, fertigate frequently.",
  peat: "Peat: warn about moisture retention and slow pH drift downward.",
  hydro: "Hydro: watch reservoir pH, EC, water temp; correct fast.",
};

export default function PlantDetail() {
  const { id } = useParams();
  const v = useVerdant();
  const p = v.plants.find(x => x.id === id);
  if (!p) return <div>Plant not found. <Link to="/app/plants" className="text-primary">Back</Link></div>;

  const diary = v.diary.filter(d => d.plantId === p.id);
  const watering = v.watering.filter(d => d.plantId === p.id);
  const feeding = v.feeding.filter(d => d.plantId === p.id);
  const training = v.training.filter(d => d.plantId === p.id);
  const photos = v.photos.filter(d => d.plantId === p.id);
  const harvest = v.harvests.find(d => d.plantId === p.id);
  const snaps = v.snapshots.filter(d => !d.plantId || d.plantId === p.id);

  const auto = p.seedType === "autoflower";
  const warnings: string[] = [];
  if (auto) {
    if (weekOfPlant(p) > 4) warnings.push("Autoflower past wk 4 — avoid topping & heavy defoliation.");
    if (p.medium === "coco" && watering.length === 0) warnings.push("Coco grow with no watering log — capture runoff data.");
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/app/plants"><ChevronLeft className="h-4 w-4" /> All plants</Link></Button>
      <PageHeader title={p.name} subtitle={`${p.strain} · ${p.seedType} · started ${new Date(p.startDate).toLocaleDateString()}`} icon={Sprout} />

      <div className="grid md:grid-cols-4 gap-3 mb-6">
        {[
          { l: "Day", v: dayOfPlant(p) },
          { l: "Week", v: weekOfPlant(p) },
          { l: "Stage", v: <span className="capitalize">{p.stage.replace("-", " ")}</span> },
          { l: "Light", v: p.lightSchedule },
        ].map(s => (
          <div key={s.l} className="glass rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.l}</div>
            <div className="font-display text-xl mt-1">{s.v}</div>
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="glass border-warning/40 rounded-xl p-4 mb-4">
          <div className="text-warning font-semibold mb-1">Autoflower warnings</div>
          <ul className="text-sm space-y-1">{warnings.map((w, i) => <li key={i}>· {w}</li>)}</ul>
        </div>
      )}

      <div className="glass rounded-xl p-4 mb-4">
        <div className="text-sm font-semibold mb-1">Medium guidance</div>
        <p className="text-sm text-muted-foreground">{mediumGuidance[p.medium]}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Diary" icon={BookOpen} count={diary.length} link="/app/diary">
          {diary.slice(0, 5).map(d => (
            <div key={d.id} className="text-sm py-2 border-b border-border/40 last:border-0">
              <Badge variant="outline" className="mr-2 capitalize">{d.type}</Badge>{d.note}
            </div>
          ))}
          {diary.length === 0 && <p className="text-sm text-muted-foreground">No entries.</p>}
        </Section>
        <Section title="Watering" icon={Droplets} count={watering.length} />
        <Section title="Feeding" icon={FlaskConical} count={feeding.length} />
        <Section title="Training" icon={Scissors} count={training.length} />
        <Section title="Photos" icon={ImageIcon} count={photos.length} />
        <Section title="Snapshots" icon={Activity} count={snaps.length} />
        <Section title="Harvest" icon={Award} count={harvest ? 1 : 0}>
          {harvest ? (
            <div className="text-sm">Wet {harvest.wetWeight ?? "?"}g · Dry {harvest.dryWeight ?? "?"}g · Score {harvest.growAgainScore ?? "—"}/10</div>
          ) : <p className="text-sm text-muted-foreground">No harvest logged yet.</p>}
        </Section>
      </div>

      {p.notes && <div className="glass rounded-xl p-4 mt-4"><div className="text-xs uppercase text-muted-foreground mb-1">Notes</div>{p.notes}</div>}
    </>
  );
}

function Section({ title, icon: Icon, count, link, children }: any) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{title}</h3>
        <Badge variant="secondary">{count}</Badge>
      </div>
      {children}
    </div>
  );
}
