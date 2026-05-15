import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useVerdant, dayOfPlant, weekOfPlant, EventType, Photo } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Sprout, ChevronLeft, BookOpen, Droplets, FlaskConical, Scissors, Image as ImageIcon, Activity, Award, Stethoscope, AlertTriangle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { SourceBadge, ConfidenceBadge } from "@/components/SourceBadge";

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
  const [viewPhoto, setViewPhoto] = useState<Photo | null>(null);
  if (!p) return <div>Plant not found. <Link to="/app/plants" className="text-primary">Back</Link></div>;

  const isDemo = p.id.startsWith("demo-");
  const diary = v.diary.filter(d => d.plantId === p.id);
  const watering = v.watering.filter(d => d.plantId === p.id);
  const feeding = v.feeding.filter(d => d.plantId === p.id);
  const training = v.training.filter(d => d.plantId === p.id);
  const photos = v.photos.filter(d => d.plantId === p.id);
  const harvests = v.harvests.filter(d => d.plantId === p.id);
  const diagnoses = v.diagnoses.filter(d => d.plantId === p.id);
  const snaps = v.snapshots.filter(d => !d.plantId || d.plantId === p.id);

  const diaryFor = (refId: string, type: EventType) => diary.find(d => d.refId === refId && d.type === type);
  const DiaryLink = ({ refId, type }: { refId: string; type: EventType }) => {
    const d = diaryFor(refId, type);
    if (!d) return null;
    return (
      <Link to={`/app/diary/${d.id}`} className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
        <ExternalLink className="h-3 w-3" />Diary
      </Link>
    );
  };

  const auto = p.seedType === "autoflower";
  const warnings: string[] = [];
  if (auto) {
    if (weekOfPlant(p) > 4) warnings.push("Autoflower past wk 4 — avoid topping & heavy defoliation.");
    if (p.medium === "coco" && watering.length === 0) warnings.push("Coco grow with no watering log — capture runoff data.");
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/app/plants"><ChevronLeft className="h-4 w-4" /> All plants</Link></Button>
      <PageHeader
        title={p.name}
        subtitle={`${p.strain} · ${p.seedType} · started ${new Date(p.startDate).toLocaleDateString()}`}
        icon={Sprout}
        actions={isDemo ? <Badge variant="outline" className="border-info/40 text-info">demo</Badge> : undefined}
      />

      <div className="grid md:grid-cols-4 gap-3 mb-4">
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
          <div className="text-warning font-semibold mb-1 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />Autoflower & medium warnings</div>
          <ul className="text-sm space-y-1">{warnings.map((w, i) => <li key={i}>· {w}</li>)}</ul>
        </div>
      )}

      <div className="glass rounded-xl p-4 mb-4">
        <div className="text-sm font-semibold mb-1">Medium guidance · {p.medium}</div>
        <p className="text-sm text-muted-foreground">{mediumGuidance[p.medium]}</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="diary">Diary <Cnt n={diary.length} /></TabsTrigger>
          <TabsTrigger value="watering">Watering <Cnt n={watering.length} /></TabsTrigger>
          <TabsTrigger value="feeding">Feeding <Cnt n={feeding.length} /></TabsTrigger>
          <TabsTrigger value="training">Training <Cnt n={training.length} /></TabsTrigger>
          <TabsTrigger value="photos">Photos <Cnt n={photos.length} /></TabsTrigger>
          <TabsTrigger value="snapshots">Snapshots <Cnt n={snaps.length} /></TabsTrigger>
          <TabsTrigger value="diagnosis">Diagnosis <Cnt n={diagnoses.length} /></TabsTrigger>
          <TabsTrigger value="harvest">Harvest <Cnt n={harvests.length} /></TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3">
          <div className="glass rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
            <p className="text-sm">{p.notes || "No notes yet."}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Mini label="Latest diary" value={diary[0]?.note || "—"} />
            <Mini label="Last watering" value={watering[0] ? format(new Date(watering[0].timestamp), "MMM d") : "—"} />
            <Mini label="Last feeding" value={feeding[0] ? format(new Date(feeding[0].timestamp), "MMM d") : "—"} />
          </div>
          {photos.length > 0 && (
            <div className="glass rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Latest photos</div>
              <div className="flex gap-2 overflow-x-auto scrollbar-thin">
                {photos.slice(0, 8).map(ph => (
                  <Link key={ph.id} to="/app/photos" className="shrink-0">
                    <img src={ph.dataUrl} className="h-20 w-20 rounded-md object-cover border border-border/40" alt="" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="diary" className="mt-4">
          {diary.length === 0 ? <Empty kind="diary" /> : (
            <div className="space-y-2">
              {diary.map(d => (
                <div key={d.id} className="glass rounded-xl p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="capitalize">{d.type}</Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(d.timestamp), "PPp")}</span>
                  </div>
                  {d.note}
                  {(d.photoIds?.length ?? 0) > 0 && <div className="mt-2 text-xs text-muted-foreground">{d.photoIds.length} photo(s) attached</div>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="watering" className="mt-4">
          {watering.length === 0 ? <Empty kind="watering" link="/app/diary?new=watering" /> : (
            <div className="space-y-2">
              {watering.map(w => (
                <div key={w.id} className="glass rounded-xl p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Droplets className="h-4 w-4 text-info" />
                    <span className="text-xs text-muted-foreground">{format(new Date(w.timestamp), "PPp")}</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs font-mono">
                    <Cell l="Amt" v={w.amount} /><Cell l="pH in" v={w.ph} /><Cell l="EC in" v={w.ec} />
                    <Cell l="Runoff" v={w.runoffAmount} /><Cell l="R-pH" v={w.runoffPh} /><Cell l="R-EC" v={w.runoffEc} />
                  </div>
                  {w.notes && <div className="mt-1 text-xs">{w.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="feeding" className="mt-4">
          {feeding.length === 0 ? <Empty kind="feeding" link="/app/diary?new=feeding" /> : (
            <div className="space-y-2">
              {feeding.map(f => (
                <div key={f.id} className="glass rounded-xl p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <FlaskConical className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">{format(new Date(f.timestamp), "PPp")}</span>
                  </div>
                  <div>{f.brand || "—"} · EC {f.finalEc ?? "?"} · pH {f.phAfterMix ?? "?"}</div>
                  {f.response && <div className="text-xs text-muted-foreground mt-1">{f.response}</div>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="training" className="mt-4">
          {training.length === 0 ? <Empty kind="training" link="/app/diary?new=training" /> : (
            <div className="space-y-2">
              {training.map(t => (
                <div key={t.id} className="glass rounded-xl p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Scissors className="h-4 w-4 text-warning" />
                    <span className="text-xs text-muted-foreground">{format(new Date(t.timestamp), "PPp")}</span>
                  </div>
                  <div className="capitalize">{t.trainingType} · {t.areas || "—"}</div>
                  {t.recoveryNotes && <div className="text-xs text-muted-foreground mt-1">{t.recoveryNotes}</div>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          {photos.length === 0 ? <Empty kind="photos" link="/app/photos?upload=1" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {photos.map(ph => (
                <Link key={ph.id} to="/app/photos" className="glass rounded-lg overflow-hidden">
                  <img src={ph.dataUrl} className="w-full aspect-square object-cover" alt="" />
                  <div className="p-2 text-xs flex justify-between">
                    <span>{ph.angle}</span>
                    <span className="text-muted-foreground">{format(new Date(ph.timestamp), "MMM d")}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="snapshots" className="mt-4">
          {snaps.length === 0 ? <Empty kind="snapshots" link="/app/sensors?new=1" /> : (
            <div className="space-y-2">
              {snaps.map(s => (
                <div key={s.id} className="glass rounded-xl p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-4 w-4 text-success" />
                    <SourceBadge source={s.source} /><ConfidenceBadge c={s.confidence} />
                    <span className="text-xs text-muted-foreground ml-auto">{format(new Date(s.timestamp), "PPp")}</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs font-mono">
                    <Cell l="Temp" v={s.tempF && s.tempF + "°F"} />
                    <Cell l="RH" v={s.humidity && s.humidity + "%"} />
                    <Cell l="VPD" v={s.vpd} />
                    <Cell l="PPFD" v={s.ppfd} />
                    <Cell l="Soil EC" v={s.soilEC} />
                    <Cell l="pH" v={s.resPH} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="diagnosis" className="mt-4">
          {diagnoses.length === 0 ? <Empty kind="diagnosis" link={`/app/diagnosis?plant=${p.id}`} /> : (
            <div className="space-y-2">
              {diagnoses.map(d => (
                <div key={d.id} className="glass rounded-xl p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Stethoscope className="h-4 w-4 text-destructive" />
                    <span className="text-xs text-muted-foreground">{format(new Date(d.timestamp), "PPp")}</span>
                    {d.placeholder && <Badge variant="outline" className="text-[10px]">awaiting AI</Badge>}
                  </div>
                  <div>{d.result?.likelyIssue || "Diagnosis request saved · AI provider not connected"}</div>
                  {d.symptoms && <div className="text-xs text-muted-foreground mt-1">Symptoms: {d.symptoms}</div>}
                  <div className="text-xs text-muted-foreground mt-1">{d.photoIds.length} photo(s)</div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="harvest" className="mt-4">
          {harvests.length === 0 ? <Empty kind="harvest" link="/app/diary?new=harvest" /> : (
            <div className="space-y-2">
              {harvests.map(h => (
                <div key={h.id} className="glass rounded-xl p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="h-4 w-4 text-leaf" />
                    <span className="text-xs text-muted-foreground">{format(new Date(h.date), "PP")}</span>
                  </div>
                  Wet {h.wetWeight ?? "?"}g · Dry {h.dryWeight ?? "?"}g · Score {h.growAgainScore ?? "—"}/10
                  {h.finalNotes && <div className="text-xs text-muted-foreground mt-1">{h.finalNotes}</div>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function Cnt({ n }: { n: number }) { return <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px]">{n}</span>; }
function Cell({ l, v }: any) { return <div><div className="text-[10px] uppercase text-muted-foreground">{l}</div>{v ?? "—"}</div>; }
function Mini({ label, value }: { label: string; value: any }) {
  return <div className="glass rounded-xl p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-sm truncate">{value}</div></div>;
}

const emptyMap: Record<string, { title: string; desc: string; cta: string; icon: any }> = {
  diary: { title: "No diary entries yet", desc: "Every action you log appears here.", cta: "Add diary entry", icon: BookOpen },
  watering: { title: "No watering logs yet", desc: "Capture amount, pH, EC and runoff for trend tracking.", cta: "Log watering", icon: Droplets },
  feeding: { title: "No feeding logs yet", desc: "Track brand, EC and pH so reports stay accurate.", cta: "Log feeding", icon: FlaskConical },
  training: { title: "No training logs yet", desc: "Record LST, defoliation, topping or transplant work.", cta: "Log training", icon: Scissors },
  photos: { title: "No photos yet", desc: "Each upload also creates a linked diary entry.", cta: "Add photo", icon: ImageIcon },
  snapshots: { title: "No environment snapshots", desc: "Capture temp, RH, VPD and EC.", cta: "Capture snapshot", icon: Activity },
  diagnosis: { title: "No diagnosis requests", desc: "Upload photos with grow context to start.", cta: "Open diagnosis", icon: Stethoscope },
  harvest: { title: "No harvest yet", desc: "Log wet/dry weights, aroma, and lessons learned.", cta: "Log harvest", icon: Award },
};

function Empty({ kind, link }: { kind: keyof typeof emptyMap; link?: string }) {
  const m = emptyMap[kind];
  return <EmptyState title={m.title} description={m.desc} icon={m.icon}
    action={link ? <Button asChild className="gradient-leaf text-primary-foreground"><Link to={link}>{m.cta}</Link></Button> : undefined} />;
}
