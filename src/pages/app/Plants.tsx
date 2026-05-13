import { useState } from "react";
import { Link } from "react-router-dom";
import { useVerdant, dayOfPlant, weekOfPlant, Plant, Stage, SeedType, Medium } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Sprout, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

function PlantForm({ onSave }: { onSave: (p: Plant) => void }) {
  const [p, setP] = useState<Plant>({
    id: Math.random().toString(36).slice(2, 10),
    name: "", strain: "", seedType: "autoflower",
    startDate: new Date().toISOString().slice(0, 10), stage: "seedling",
    potSize: "3 gal", medium: "soil", lightSchedule: "18/6", notes: "",
  });
  return (
    <form onSubmit={e => { e.preventDefault(); onSave({ ...p, startDate: new Date(p.startDate).toISOString() }); }}
      className="grid gap-3">
      <div><Label>Plant name</Label><Input required value={p.name} onChange={e => setP({ ...p, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Strain</Label><Input required value={p.strain} onChange={e => setP({ ...p, strain: e.target.value })} /></div>
        <div><Label>Seed type</Label>
          <Select value={p.seedType} onValueChange={(v: SeedType) => setP({ ...p, seedType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="autoflower">Autoflower</SelectItem>
              <SelectItem value="feminized">Feminized</SelectItem>
              <SelectItem value="regular">Regular</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Start date</Label><Input type="date" value={p.startDate.slice(0, 10)} onChange={e => setP({ ...p, startDate: e.target.value })} /></div>
        <div><Label>Stage</Label>
          <Select value={p.stage} onValueChange={(v: Stage) => setP({ ...p, stage: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["seedling","veg","preflower","flower","late-flower","harvest"] as Stage[]).map(s =>
                <SelectItem key={s} value={s} className="capitalize">{s.replace("-", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Pot size</Label><Input value={p.potSize} onChange={e => setP({ ...p, potSize: e.target.value })} /></div>
        <div><Label>Medium</Label>
          <Select value={p.medium} onValueChange={(v: Medium) => setP({ ...p, medium: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["soil","coco","peat","hydro"] as Medium[]).map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Light schedule</Label><Input value={p.lightSchedule} onChange={e => setP({ ...p, lightSchedule: e.target.value })} /></div>
      </div>
      <div><Label>Notes</Label><Textarea value={p.notes} onChange={e => setP({ ...p, notes: e.target.value })} /></div>
      <Button type="submit" className="gradient-leaf text-primary-foreground">Save plant</Button>
    </form>
  );
}

export default function Plants() {
  const v = useVerdant();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Plants" subtitle="Every plant, every detail" icon={Sprout}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-leaf text-primary-foreground gap-1.5"><Plus className="h-4 w-4" />Add plant</Button></DialogTrigger>
            <DialogContent className="glass max-w-lg">
              <DialogHeader><DialogTitle className="font-display">New plant</DialogTitle></DialogHeader>
              <PlantForm onSave={p => { v.upsertPlant(p); setOpen(false); }} />
            </DialogContent>
          </Dialog>
        } />
      {v.plants.length === 0 ? (
        <EmptyState title="No plants yet" description="Add your first plant to start tracking." icon={Sprout}
          action={<Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground">Add plant</Button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {v.plants.map(p => (
            <Link key={p.id} to={`/app/plants/${p.id}`} className="glass rounded-xl p-4 hover:border-primary transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display font-semibold text-lg">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.strain}</div>
                </div>
                <Badge variant="secondary" className="capitalize">{p.stage.replace("-", " ")}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-muted-foreground">Day</div><div className="font-semibold">{dayOfPlant(p)}</div></div>
                <div><div className="text-muted-foreground">Week</div><div className="font-semibold">{weekOfPlant(p)}</div></div>
                <div><div className="text-muted-foreground">Medium</div><div className="font-semibold capitalize">{p.medium}</div></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
