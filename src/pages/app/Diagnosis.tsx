import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useVerdant, Stage, Medium } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Stethoscope, Upload, Sparkles, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const angles = ["canopy", "leaf closeup", "soil", "whole plant", "stem", "bud", "roots", "problem area"];

export default function Diagnosis() {
  const v = useVerdant();
  const [params, setParams] = useSearchParams();
  const initialPlant = params.get("plant") || v.plants[0]?.id || "";

  const [plantId, setPlantId] = useState(initialPlant);
  const [angle, setAngle] = useState("problem area");
  const [imgs, setImgs] = useState<{ id: string; dataUrl: string }[]>([]);
  const [ctx, setCtx] = useState({
    day: "", stage: "" as Stage | "", medium: "" as Medium | "",
    recentWatering: "", recentFeeding: "",
    ph: "", ec: "", tempF: "", humidity: "", vpd: "",
    symptoms: "",
  });
  const [submitted, setSubmitted] = useState<string | null>(null);

  const plant = v.plants.find(p => p.id === plantId);

  // Pre-fill stage + medium from plant
  useEffect(() => {
    if (plant) setCtx(c => ({ ...c, stage: c.stage || plant.stage, medium: c.medium || plant.medium }));
  }, [plantId]);

  // Pre-fill latest snapshot
  useEffect(() => {
    const s = v.snapshots[0];
    if (s) setCtx(c => ({
      ...c,
      tempF: c.tempF || (s.tempF?.toString() ?? ""),
      humidity: c.humidity || (s.humidity?.toString() ?? ""),
      vpd: c.vpd || (s.vpd?.toString() ?? ""),
    }));
  }, []);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      const r = new FileReader();
      r.onload = () => setImgs(prev => [...prev, { id: Math.random().toString(36).slice(2, 10), dataUrl: r.result as string }]);
      r.readAsDataURL(f);
    });
    e.target.value = "";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!plantId) return;
    const ts = new Date().toISOString();
    // 1. Save each image as a Photo (linked to plant + symptoms + angle)
    const photoIds = imgs.map(img => v.addPhoto({
      plantId, timestamp: ts, stage: ctx.stage || plant?.stage, angle,
      symptoms: ctx.symptoms, notes: `Diagnosis upload`, dataUrl: img.dataUrl,
    }).id);
    // 2. Save diagnosis (creates a diary entry automatically)
    const diag = v.addDiagnosis({
      plantId, timestamp: ts, photoIds,
      symptoms: ctx.symptoms,
      context: {
        day: ctx.day, stage: ctx.stage || "", medium: ctx.medium || "",
        recentWatering: ctx.recentWatering, recentFeeding: ctx.recentFeeding,
        ph: ctx.ph, ec: ctx.ec, tempF: ctx.tempF, humidity: ctx.humidity, vpd: ctx.vpd,
      },
      placeholder: true,
      // No result — AI provider not connected
    });
    setSubmitted(diag.id);
    if (params.get("diag")) setParams({});
  }

  const lastDiag = submitted ? v.diagnoses.find(d => d.id === submitted) : null;

  return (
    <>
      <PageHeader title="AI Photo Diagnosis" subtitle="Upload photos + context · cautious shell when no AI provider is connected" icon={Stethoscope} />

      <div className="rounded-lg border border-info/40 bg-info/5 text-info text-xs p-3 mb-4 flex gap-2">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span><strong>Diagnosis shell · AI provider not connected.</strong> Verdant will save your photos, context, and a diary entry locally. When an AI provider is connected, this exact bundle will be analyzed — Verdant never pretends fake AI is real.</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <form onSubmit={submit} className="lg:col-span-2 glass rounded-xl p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Plant</Label>
              <Select value={plantId} onValueChange={setPlantId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{v.plants.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Photo type</Label>
              <Select value={angle} onValueChange={setAngle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{angles.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Photos</Label>
            <label className="mt-1 block border-2 border-dashed border-border/60 rounded-lg p-6 text-center cursor-pointer hover:border-primary/60 transition-colors">
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
              <div className="text-sm">Click to upload one or more photos</div>
              <input type="file" accept="image/*" multiple className="hidden" onChange={onFile} />
            </label>
            {imgs.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {imgs.map(img => (
                  <div key={img.id} className="relative">
                    <img src={img.dataUrl} className="w-full aspect-square object-cover rounded-lg" alt="upload" />
                    <button type="button" onClick={() => setImgs(p => p.filter(x => x.id !== img.id))}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">Grow context</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div><Label className="text-xs">Day #</Label><Input value={ctx.day} onChange={e => setCtx({ ...ctx, day: e.target.value })} /></div>
              <div><Label className="text-xs">Stage</Label>
                <Select value={ctx.stage} onValueChange={(x: Stage) => setCtx({ ...ctx, stage: x })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(["seedling","veg","preflower","flower","late-flower","harvest"] as Stage[]).map(s =>
                    <SelectItem key={s} value={s} className="capitalize">{s.replace("-", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Medium</Label>
                <Select value={ctx.medium} onValueChange={(x: Medium) => setCtx({ ...ctx, medium: x })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(["soil","coco","peat","hydro"] as Medium[]).map(s =>
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Recent watering</Label><Input placeholder="2 days ago" value={ctx.recentWatering} onChange={e => setCtx({ ...ctx, recentWatering: e.target.value })} /></div>
              <div><Label className="text-xs">Recent feeding</Label><Input placeholder="3 days ago" value={ctx.recentFeeding} onChange={e => setCtx({ ...ctx, recentFeeding: e.target.value })} /></div>
              <div><Label className="text-xs">pH</Label><Input value={ctx.ph} onChange={e => setCtx({ ...ctx, ph: e.target.value })} /></div>
              <div><Label className="text-xs">EC / TDS</Label><Input value={ctx.ec} onChange={e => setCtx({ ...ctx, ec: e.target.value })} /></div>
              <div><Label className="text-xs">Temp °F</Label><Input value={ctx.tempF} onChange={e => setCtx({ ...ctx, tempF: e.target.value })} /></div>
              <div><Label className="text-xs">RH %</Label><Input value={ctx.humidity} onChange={e => setCtx({ ...ctx, humidity: e.target.value })} /></div>
              <div><Label className="text-xs">VPD</Label><Input value={ctx.vpd} onChange={e => setCtx({ ...ctx, vpd: e.target.value })} /></div>
            </div>
          </div>

          <div>
            <Label>Observed symptoms</Label>
            <Textarea rows={3} placeholder="Yellowing lower leaves, claw on tops, brown leaf tips..." value={ctx.symptoms} onChange={e => setCtx({ ...ctx, symptoms: e.target.value })} />
          </div>

          <Button type="submit" className="gradient-leaf text-primary-foreground gap-1.5" disabled={!plantId || imgs.length === 0}>
            <Stethoscope className="h-4 w-4" />Save diagnosis request
          </Button>
        </form>

        <div className="space-y-3">
          <div className="glass rounded-xl p-5">
            <h3 className="font-display font-semibold flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-primary" />Result</h3>
            {!submitted && (
              <p className="text-sm text-muted-foreground">When AI is connected, the result will include likely issue, confidence, visual clues, possible causes, immediate action, what NOT to do, 24-hour follow-up, 3-day recovery plan, and category.</p>
            )}
            {lastDiag && (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-success"><CheckCircle2 className="h-4 w-4" /> Diagnosis request saved & added to diary timeline.</div>
                <ResultRow label="Likely issue" value="Awaiting AI provider" />
                <ResultRow label="Confidence" value={<Badge variant="outline">N/A — placeholder</Badge>} />
                <ResultRow label="Visual clues found" value={`${lastDiag.photoIds.length} photo(s) captured`} />
                <ResultRow label="Possible causes" value="Will be inferred from your context bundle" />
                <ResultRow label="Immediate action" value="Verdant does not recommend actions without AI." />
                <ResultRow label="What NOT to do" value="Do not assume the worst from photos alone." />
                <ResultRow label="24h follow-up" value="Re-photo same angle in 24h to track change." />
                <ResultRow label="3-day recovery plan" value="Will be generated when AI connects." />
                <ResultRow label="Category" value={<Badge variant="outline">unclassified</Badge>} />
                <Button asChild variant="outline" size="sm" className="w-full"><Link to="/app/diary">Open diary entry</Link></Button>
              </div>
            )}
          </div>

          <DiagnosisHistory />
        </div>
      </div>
    </>
  );
}

function ResultRow({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function DiagnosisHistory() {
  const v = useVerdant();
  if (v.diagnoses.length === 0) {
    return <EmptyState title="No diagnosis history" description="Saved diagnosis requests appear here." icon={Stethoscope} />;
  }
  return (
    <div className="glass rounded-xl p-5">
      <h3 className="font-display font-semibold mb-3">History</h3>
      <div className="space-y-2">
        {v.diagnoses.slice(0, 6).map(d => {
          const plant = v.plants.find(p => p.id === d.plantId);
          return (
            <div key={d.id} className="rounded-lg border border-border/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{plant?.name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(d.timestamp), "PP")}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                <span>{d.photoIds.length} photo(s)</span>
                {d.placeholder && <Badge variant="outline" className="text-[9px] gap-1"><AlertTriangle className="h-2.5 w-2.5" />awaiting AI</Badge>}
              </div>
              {d.symptoms && <p className="text-xs mt-1 line-clamp-2">{d.symptoms}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
