import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useVerdant, Stage } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Image as ImageIcon, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function Photos() {
  const v = useVerdant();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("upload") === "1");
  const [plantFilter, setPlantFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");

  useEffect(() => { if (params.get("upload") === "1") setOpen(true); }, [params]);

  const photos = v.photos.filter(p =>
    (plantFilter === "all" || p.plantId === plantFilter) &&
    (stageFilter === "all" || p.stage === stageFilter)
  );

  return (
    <>
      <PageHeader title="Photo Gallery" subtitle="Visual record across every stage" icon={ImageIcon}
        actions={<Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground gap-1.5"><Plus className="h-4 w-4" />Add photo</Button>} />

      <div className="flex gap-2 mb-4">
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
      </div>

      {photos.length === 0 ? (
        <EmptyState title="No photos yet" description="Document your grow with photos at every stage." icon={ImageIcon}
          action={<Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground"><Upload className="h-4 w-4 mr-1.5" />Upload</Button>} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map(p => {
            const plant = v.plants.find(x => x.id === p.plantId);
            return (
              <div key={p.id} className="glass rounded-xl overflow-hidden">
                <img src={p.dataUrl} alt={p.notes || plant?.name} className="w-full aspect-square object-cover" />
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate">{plant?.name}</span>
                    {p.stage && <Badge variant="secondary" className="capitalize text-[10px]">{p.stage}</Badge>}
                  </div>
                  {p.angle && <div className="text-xs text-muted-foreground">{p.angle}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <UploadDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setParams({}); }} />
    </>
  );
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const v = useVerdant();
  const [plantId, setPlantId] = useState(v.plants[0]?.id || "");
  const [angle, setAngle] = useState("canopy");
  const [notes, setNotes] = useState("");
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
    v.addPhoto({ plantId, timestamp: new Date().toISOString(), stage: plant?.stage, angle, notes, dataUrl });
    onOpenChange(false); setDataUrl(null); setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md">
        <DialogHeader><DialogTitle className="font-display">Add photo</DialogTitle></DialogHeader>
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
          <Button type="submit" className="gradient-leaf text-primary-foreground" disabled={!dataUrl}>Save photo</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
