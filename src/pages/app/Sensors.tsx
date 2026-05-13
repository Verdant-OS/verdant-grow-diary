import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useVerdant, DataSource } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Activity, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourceBadge, ConfidenceBadge } from "@/components/SourceBadge";
import { format } from "date-fns";

export default function Sensors() {
  const v = useVerdant();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  useEffect(() => { if (params.get("new") === "1") setOpen(true); }, [params]);

  return (
    <>
      <PageHeader title="Sensors & Snapshots" subtitle="Manual environment capture · structured for future Home Assistant integration" icon={Activity}
        actions={<Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground gap-1.5"><Plus className="h-4 w-4" />New snapshot</Button>} />

      {v.snapshots.length === 0 ? (
        <EmptyState title="No snapshots yet" icon={Activity}
          action={<Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground">Capture snapshot</Button>} />
      ) : (
        <div className="space-y-2">
          {v.snapshots.map(s => (
            <div key={s.id} className="glass rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <SourceBadge source={s.source} />
                <ConfidenceBadge c={s.confidence} />
                <span className="text-xs text-muted-foreground ml-auto">{format(new Date(s.timestamp), "PPp")}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
                <Cell l="Temp" v={s.tempF && s.tempF + "°F"} />
                <Cell l="RH" v={s.humidity && s.humidity + "%"} />
                <Cell l="VPD" v={s.vpd && s.vpd + " kPa"} />
                <Cell l="Soil moist" v={s.soilMoisture && s.soilMoisture + "%"} />
                <Cell l="Soil EC" v={s.soilEC} />
                <Cell l="PPFD" v={s.ppfd} />
                <Cell l="Res EC" v={s.resEC} />
                <Cell l="Res pH" v={s.resPH} />
              </div>
              {s.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-warning">
                  {s.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{w}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <NewSnap open={open} onOpenChange={(o) => { setOpen(o); if (!o) setParams({}); }} />
    </>
  );
}

function Cell({ l, v }: any) {
  return <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</div><div className="font-mono">{v ?? "—"}</div></div>;
}

function NewSnap({ open, onOpenChange }: any) {
  const v = useVerdant();
  const [s, setS] = useState({ source: "manual" as DataSource, plantId: "", tempF: "", humidity: "", vpd: "", soilMoisture: "", soilEC: "", ppfd: "", resEC: "", resPH: "" });
  function num(v: string) { return v === "" ? undefined : +v; }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    v.addSnapshot({
      timestamp: new Date().toISOString(), source: s.source,
      plantId: s.plantId || undefined,
      tempF: num(s.tempF), humidity: num(s.humidity), vpd: num(s.vpd),
      soilMoisture: num(s.soilMoisture), soilEC: num(s.soilEC), ppfd: num(s.ppfd),
      resEC: num(s.resEC), resPH: num(s.resPH),
    });
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-lg">
        <DialogHeader><DialogTitle className="font-display">New environment snapshot</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Source</Label>
              <Select value={s.source} onValueChange={(x: DataSource) => setS({ ...s, source: x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(["manual","demo","live","stale"] as DataSource[]).map(x =>
                  <SelectItem key={x} value={x} className="capitalize">{x}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Plant (optional)</Label>
              <Select value={s.plantId} onValueChange={(x) => setS({ ...s, plantId: x })}>
                <SelectTrigger><SelectValue placeholder="Tent-wide" /></SelectTrigger>
                <SelectContent>{v.plants.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["tempF", "Temp °F"], ["humidity", "RH %"], ["vpd", "VPD"],
              ["soilMoisture", "Soil moist %"], ["soilEC", "Soil EC"], ["ppfd", "PPFD"],
              ["resEC", "Res EC"], ["resPH", "Res pH"],
            ].map(([k, l]) => (
              <div key={k}><Label className="text-xs">{l}</Label>
                <Input value={(s as any)[k]} onChange={e => setS({ ...s, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <Button type="submit" className="gradient-leaf text-primary-foreground">Save snapshot</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
