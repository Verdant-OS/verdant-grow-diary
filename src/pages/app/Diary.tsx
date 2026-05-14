import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useVerdant, EventType, TrainingType } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { BookOpen, Plus, AlertTriangle, Activity, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ConfidenceBadge, SourceBadge } from "@/components/SourceBadge";

const eventTypes: EventType[] = ["note", "watering", "feeding", "training", "photo", "diagnosis", "environment", "transplant", "harvest", "reminder"];

const typeColor: Record<EventType, string> = {
  note: "bg-muted text-muted-foreground",
  watering: "bg-info/20 text-info border-info/40",
  feeding: "bg-primary/20 text-primary border-primary/40",
  training: "bg-warning/20 text-warning border-warning/40",
  photo: "bg-accent/20 text-accent-foreground border-accent/40",
  diagnosis: "bg-destructive/20 text-destructive border-destructive/40",
  environment: "bg-success/20 text-success border-success/40",
  transplant: "bg-secondary text-secondary-foreground",
  harvest: "bg-leaf/20 text-leaf",
  reminder: "bg-muted text-muted-foreground",
};

export default function Diary() {
  const v = useVerdant();
  const [params, setParams] = useSearchParams();
  const initial = (params.get("new") as EventType) || null;
  const [open, setOpen] = useState(!!initial);
  const [filter, setFilter] = useState<EventType | "all">("all");
  const [plantFilter, setPlantFilter] = useState<string>("all");

  useEffect(() => { if (initial) setOpen(true); }, [initial]);

  const filtered = v.diary.filter(d =>
    (filter === "all" || d.type === filter) &&
    (plantFilter === "all" || d.plantId === plantFilter)
  );

  return (
    <>
      <PageHeader title="Grow Diary" subtitle="Every action, connected. The heart of Verdant." icon={BookOpen}
        actions={<Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground gap-1.5"><Plus className="h-4 w-4" />New entry</Button>} />

      <div className="flex flex-wrap gap-2 mb-4">
        <Tabs value={filter} onValueChange={(v: any) => setFilter(v)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            {eventTypes.map(t => <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Select value={plantFilter} onValueChange={setPlantFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plants</SelectItem>
            {v.plants.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No diary entries" description="Log a watering, feeding, or note to start your timeline." icon={BookOpen}
          action={<Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground">Add entry</Button>} />
      ) : (
        <div className="relative pl-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
          {filtered.map(d => {
            const plant = v.plants.find(p => p.id === d.plantId);
            const snap = v.snapshots.find(s => s.id === d.snapshotId);
            const photos = (d.photoIds || []).map(id => v.photos.find(p => p.id === id)).filter(Boolean) as any[];
            const linkedTo = d.refId
              ? d.type === "watering" ? "watering log"
                : d.type === "feeding" ? "feeding log"
                : d.type === "training" ? "training log"
                : d.type === "diagnosis" ? "diagnosis"
                : d.type === "harvest" ? "harvest"
                : d.type === "photo" ? "photo"
                : null
              : null;
            return (
              <div key={d.id} className="relative mb-4">
                <span className="absolute -left-[18px] top-3 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                <Link to={`/app/diary/${d.id}`} className="block glass rounded-xl p-4 hover:border-primary/40 transition-colors">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant="outline" className={"capitalize " + typeColor[d.type]}>{d.type}</Badge>
                    {plant && <Badge variant="secondary">{plant.name}</Badge>}
                    <span className="text-xs text-muted-foreground">{format(new Date(d.timestamp), "MMM d, yyyy · HH:mm")}</span>
                    {snap && (
                      <span className="ml-auto inline-flex items-center gap-1.5">
                        <Activity className="h-3 w-3 text-muted-foreground" />
                        <SourceBadge source={snap.source} />
                        <ConfidenceBadge c={snap.confidence} />
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{d.note}</p>
                  {d.symptoms && <p className="text-xs text-warning mt-1 flex gap-1.5"><AlertTriangle className="h-3 w-3 mt-0.5" />{d.symptoms}</p>}
                  {d.actions && <p className="text-xs text-muted-foreground mt-1">Actions: {d.actions}</p>}
                  {photos.length > 0 && (
                    <div className="mt-2 flex gap-1.5">
                      {photos.slice(0, 4).map(p => (
                        <img key={p.id} src={p.dataUrl} className="h-14 w-14 rounded-md object-cover border border-border/40" alt="" />
                      ))}
                      {photos.length > 4 && <div className="h-14 w-14 rounded-md border border-border/40 flex items-center justify-center text-xs text-muted-foreground">+{photos.length - 4}</div>}
                    </div>
                  )}
                  {snap && (snap.tempF || snap.humidity || snap.vpd) && (
                    <div className="mt-2 text-xs text-muted-foreground font-mono">
                      {snap.tempF ? `${snap.tempF}°F · ` : ""}{snap.humidity ? `${snap.humidity}% RH · ` : ""}{snap.vpd ? `VPD ${snap.vpd}` : ""}
                    </div>
                  )}
                  {linkedTo && <div className="mt-2 text-[11px] text-muted-foreground">Linked from {linkedTo} · click to open</div>}
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <NewEntry open={open} onOpenChange={(o) => { setOpen(o); if (!o) setParams({}); }} preset={initial} />
    </>
  );
}

function NewEntry({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (v: boolean) => void; preset?: EventType | null }) {
  const v = useVerdant();
  const [type, setType] = useState<EventType>(preset || "note");
  const [plantId, setPlantId] = useState(v.plants[0]?.id || "");
  const [note, setNote] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [actions, setActions] = useState("");
  const [attachSnap, setAttachSnap] = useState(true);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);

  const [w, setW] = useState({ amount: "", ph: "", ec: "", runoffAmount: "", runoffPh: "", runoffEc: "" });
  const [f, setF] = useState({ brand: "", finalEc: "", phAfterMix: "" });
  const [t, setT] = useState<{ trainingType: TrainingType; areas: string }>({ trainingType: "LST", areas: "" });
  const [h, setH] = useState({ wetWeight: "", dryWeight: "" });

  useEffect(() => { if (preset) setType(preset); }, [preset]);

  const plant = v.plants.find(p => p.id === plantId);
  const latestSnap = v.snapshots[0];
  const plantPhotos = v.photos.filter(p => p.plantId === plantId).slice(0, 12);

  const autoTrainWarn = plant?.seedType === "autoflower" && type === "training" && ["topping", "HST", "transplant", "defoliation"].includes(t.trainingType);
  const mediumHint =
    type === "watering" && plant?.medium === "coco" ? "Coco: capture runoff EC + pH for accurate readings."
    : type === "watering" && plant?.medium === "soil" ? "Soil: avoid frequent shallow waterings."
    : type === "watering" && plant?.medium === "hydro" ? "Hydro: log reservoir EC/pH on the snapshot."
    : type === "watering" && plant?.medium === "peat" ? "Peat: watch for slow pH drift downward."
    : type === "feeding" && plant?.medium === "coco" ? "Coco: feed often, low EC, always to runoff."
    : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!plantId) return;
    const ts = new Date().toISOString();
    const snapshotId = attachSnap ? latestSnap?.id : undefined;
    const photoIds = selectedPhotoIds;
    if (type === "watering") {
      v.addWatering({ plantId, timestamp: ts, amount: +w.amount || undefined, ph: +w.ph || undefined, ec: +w.ec || undefined,
        runoffAmount: +w.runoffAmount || undefined, runoffPh: +w.runoffPh || undefined, runoffEc: +w.runoffEc || undefined,
        notes: note, photoIds, snapshotId });
    } else if (type === "feeding") {
      v.addFeeding({ plantId, timestamp: ts, brand: f.brand, finalEc: +f.finalEc || undefined, phAfterMix: +f.phAfterMix || undefined,
        response: note, photoIds, snapshotId });
    } else if (type === "training") {
      v.addTraining({ plantId, timestamp: ts, trainingType: t.trainingType, areas: t.areas, recoveryNotes: note, photoIds, snapshotId });
    } else if (type === "harvest") {
      v.addHarvest({ plantId, date: ts, wetWeight: +h.wetWeight || undefined, dryWeight: +h.dryWeight || undefined, finalNotes: note, photoIds, snapshotId });
    } else {
      v.addDiary({ plantId, timestamp: ts, type, note, symptoms, actions, photoIds, snapshotId, stage: plant?.stage });
    }
    onOpenChange(false);
    setNote(""); setSymptoms(""); setActions(""); setSelectedPhotoIds([]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">New diary entry</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Plant</Label>
              <Select value={plantId} onValueChange={setPlantId}>
                <SelectTrigger><SelectValue placeholder="Select plant" /></SelectTrigger>
                <SelectContent>{v.plants.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{eventTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {autoTrainWarn && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 text-warning text-xs p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Autoflower warning: {t.trainingType} can stress this plant and slow recovery. Action allowed but proceed gently.
            </div>
          )}
          {mediumHint && (
            <div className="rounded-lg border border-info/40 bg-info/5 text-info text-xs p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />{mediumHint}
            </div>
          )}

          {type === "watering" && (
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Amount</Label><Input value={w.amount} onChange={e => setW({ ...w, amount: e.target.value })} /></div>
              <div><Label className="text-xs">pH in</Label><Input value={w.ph} onChange={e => setW({ ...w, ph: e.target.value })} /></div>
              <div><Label className="text-xs">EC in</Label><Input value={w.ec} onChange={e => setW({ ...w, ec: e.target.value })} /></div>
              <div><Label className="text-xs">Runoff</Label><Input value={w.runoffAmount} onChange={e => setW({ ...w, runoffAmount: e.target.value })} /></div>
              <div><Label className="text-xs">Runoff pH</Label><Input value={w.runoffPh} onChange={e => setW({ ...w, runoffPh: e.target.value })} /></div>
              <div><Label className="text-xs">Runoff EC</Label><Input value={w.runoffEc} onChange={e => setW({ ...w, runoffEc: e.target.value })} /></div>
            </div>
          )}
          {type === "feeding" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3"><Label className="text-xs">Brand / products</Label><Input value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} /></div>
              <div><Label className="text-xs">Final EC</Label><Input value={f.finalEc} onChange={e => setF({ ...f, finalEc: e.target.value })} /></div>
              <div><Label className="text-xs">pH after mix</Label><Input value={f.phAfterMix} onChange={e => setF({ ...f, phAfterMix: e.target.value })} /></div>
            </div>
          )}
          {type === "training" && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Training type</Label>
                <Select value={t.trainingType} onValueChange={(v: TrainingType) => setT({ ...t, trainingType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["topping","defoliation","LST","HST","pruning","leaf-tucking","transplant"] as TrainingType[]).map(s =>
                      <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Areas affected</Label><Input value={t.areas} onChange={e => setT({ ...t, areas: e.target.value })} /></div>
            </div>
          )}
          {type === "harvest" && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Wet weight (g)</Label><Input value={h.wetWeight} onChange={e => setH({ ...h, wetWeight: e.target.value })} /></div>
              <div><Label className="text-xs">Dry weight (g)</Label><Input value={h.dryWeight} onChange={e => setH({ ...h, dryWeight: e.target.value })} /></div>
            </div>
          )}

          <div><Label>Notes</Label><Textarea value={note} onChange={e => setNote(e.target.value)} /></div>
          {type === "note" && (
            <>
              <div><Label>Symptoms observed</Label><Input value={symptoms} onChange={e => setSymptoms(e.target.value)} /></div>
              <div><Label>Actions taken</Label><Input value={actions} onChange={e => setActions(e.target.value)} /></div>
            </>
          )}

          {/* Snapshot attach */}
          <div className="rounded-lg border border-border/60 p-3 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={attachSnap} onCheckedChange={(c) => setAttachSnap(!!c)} className="mt-0.5" disabled={!latestSnap} />
              <div>
                <div className="font-medium flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-primary" />Attach latest sensor snapshot</div>
                {latestSnap ? (
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {latestSnap.tempF ?? "—"}°F · {latestSnap.humidity ?? "—"}% RH · VPD {latestSnap.vpd ?? "—"} · <SourceBadge source={latestSnap.source} />
                  </div>
                ) : <div className="text-xs text-muted-foreground">No snapshots yet — <Link to="/app/sensors" className="text-primary">capture one</Link>.</div>}
              </div>
            </label>
          </div>

          {/* Photo attach */}
          {plantPhotos.length > 0 && (
            <div className="rounded-lg border border-border/60 p-3">
              <div className="text-sm font-medium flex items-center gap-1.5 mb-2"><Camera className="h-3.5 w-3.5 text-primary" />Attach photos</div>
              <div className="grid grid-cols-6 gap-1.5">
                {plantPhotos.map(p => {
                  const sel = selectedPhotoIds.includes(p.id);
                  return (
                    <button type="button" key={p.id}
                      onClick={() => setSelectedPhotoIds(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])}
                      className={`relative rounded-md overflow-hidden ${sel ? "ring-2 ring-primary" : "ring-1 ring-border/40"}`}>
                      <img src={p.dataUrl} className="aspect-square w-full object-cover" alt="" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Button type="submit" className="gradient-leaf text-primary-foreground">Save entry</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
