import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useVerdant, Stage, Photo } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Image as ImageIcon, Plus, Upload, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { format } from "date-fns";

export default function Photos() {
  const v = useVerdant();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("upload") === "1");
  const [plantFilter, setPlantFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [symptomQuery, setSymptomQuery] = useState("");
  const [viewing, setViewing] = useState<Photo | null>(null);

  useEffect(() => { if (params.get("upload") === "1") setOpen(true); }, [params]);

  const photos = v.photos.filter(p =>
    (plantFilter === "all" || p.plantId === plantFilter) &&
    (stageFilter === "all" || p.stage === stageFilter) &&
    (!symptomQuery || (p.symptoms || "").toLowerCase().includes(symptomQuery.toLowerCase()))
  );

  return (
    <>
      <PageHeader title="Photo Gallery" subtitle="Every photo is linked to its plant and a diary entry" icon={ImageIcon}
        actions={<Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground gap-1.5"><Plus className="h-4 w-4" />Add photo</Button>} />

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={plantFilter} onValueChange={setPlantFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Plant" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All plants</SelectItem>{v.plants.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All stages</SelectItem>
            {(["seedling","veg","preflower","flower","late-flower","harvest"] as Stage[]).map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="w-52" placeholder="Filter by symptom…" value={symptomQuery} onChange={e => setSymptomQuery(e.target.value)} />
      </div>

      {photos.length === 0 ? (
        <EmptyState title="No photos yet" description="Document your grow with photos at every stage. Each photo also creates a diary entry." icon={ImageIcon}
          action={<Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground"><Upload className="h-4 w-4 mr-1.5" />Upload</Button>} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map(p => {
            const plant = v.plants.find(x => x.id === p.plantId);
            return (
              <button key={p.id} onClick={() => setViewing(p)}
                className="glass rounded-xl overflow-hidden text-left group">
                <img src={p.dataUrl} alt={p.notes || plant?.name} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform" />
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate">{plant?.name}</span>
                    {p.stage && <Badge variant="secondary" className="capitalize text-[10px]">{p.stage}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>{p.angle}</span>
                    <span>{format(new Date(p.timestamp), "MMM d")}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <UploadDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setParams({}); }} />
      <PhotoView photo={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const v = useVerdant();
  const [plantId, setPlantId] = useState(v.plants[0]?.id || "");
  const [angle, setAngle] = useState("canopy");
  const [notes, setNotes] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setDataUrl(reader.result as string);
    reader.readAsDataURL(f);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dataUrl || !plantId) return;
    const plant = v.plants.find(p => p.id === plantId);
    v.logPhoto(
      { plantId, timestamp: new Date().toISOString(), stage: plant?.stage, angle, notes, symptoms, dataUrl },
      { note: notes ? `Photo · ${angle} — ${notes}` : `Photo · ${angle}` }
    );
    onOpenChange(false);
    setDataUrl(null); setNotes(""); setSymptoms("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Add photo</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Each upload also creates a linked diary entry of type <span className="text-primary">photo</span>, with the latest sensor snapshot attached.</p>
        <form onSubmit={submit} className="grid gap-3">
          <Input type="file" accept="image/*" onChange={onFile} />
          {dataUrl && <img src={dataUrl} className="rounded-lg max-h-48 object-cover" alt="preview" />}
          <div><Label>Plant</Label>
            <Select value={plantId} onValueChange={setPlantId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{v.plants.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Angle/type</Label>
            <Select value={angle} onValueChange={setAngle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["canopy","leaf closeup","soil","whole plant","stem","bud","roots","problem area"].map(s =>
                <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div><Label>Symptoms (optional)</Label><Input placeholder="claw, brown tips, yellowing…" value={symptoms} onChange={e => setSymptoms(e.target.value)} /></div>
          <Button type="submit" className="gradient-leaf text-primary-foreground" disabled={!dataUrl}>Save photo + diary entry</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PhotoView({ photo, onClose }: { photo: Photo | null; onClose: () => void }) {
  const v = useVerdant();
  if (!photo) return null;
  const plant = v.plants.find(p => p.id === photo.plantId);
  const diary = v.diary.find(d => d.id === photo.diaryEntryId || d.photoIds.includes(photo.id));
  return (
    <Dialog open={!!photo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Photo detail</DialogTitle></DialogHeader>
        <img src={photo.dataUrl} alt="" className="w-full max-h-96 object-contain rounded-lg" />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Plant</div>{plant ? <Link to={`/app/plants/${plant.id}`} className="text-primary hover:underline">{plant.name}</Link> : "—"}</div>
          <div><div className="text-xs text-muted-foreground">Date</div>{format(new Date(photo.timestamp), "PPp")}</div>
          {photo.stage && <div><div className="text-xs text-muted-foreground">Stage</div><span className="capitalize">{photo.stage}</span></div>}
          {photo.angle && <div><div className="text-xs text-muted-foreground">Angle</div>{photo.angle}</div>}
          {photo.symptoms && <div className="col-span-2"><div className="text-xs text-muted-foreground">Symptoms</div>{photo.symptoms}</div>}
          {photo.notes && <div className="col-span-2"><div className="text-xs text-muted-foreground">Notes</div>{photo.notes}</div>}
        </div>
        {diary && (
          <Button asChild variant="outline" className="gap-1.5"><Link to="/app/diary"><BookOpen className="h-4 w-4" />Linked diary entry</Link></Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
