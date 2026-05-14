import { useParams, Link, useNavigate } from "react-router-dom";
import { useVerdant, EventType } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { BookOpen, ChevronLeft, Activity, AlertTriangle, ExternalLink, Camera, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SourceBadge, ConfidenceBadge } from "@/components/SourceBadge";
import { format } from "date-fns";

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

export default function DiaryEntryDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const v = useVerdant();
  const entry = v.diary.find(d => d.id === id);

  if (!entry) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => nav(-1)} className="mb-3"><ChevronLeft className="h-4 w-4" /> Back</Button>
        <EmptyState title="Diary entry not found" description="It may have been deleted." icon={BookOpen}
          action={<Button asChild className="gradient-leaf text-primary-foreground"><Link to="/app/diary">Open diary</Link></Button>} />
      </>
    );
  }

  const plant = v.plants.find(p => p.id === entry.plantId);
  const snap = entry.snapshotId ? v.snapshots.find(s => s.id === entry.snapshotId) : undefined;
  const photos = (entry.photoIds || []).map(pid => v.photos.find(p => p.id === pid)).filter(Boolean) as NonNullable<ReturnType<typeof v.photos.find>>[];

  // Resolve source record via refId + type
  const sourceRecord = (() => {
    if (!entry.refId) return null;
    switch (entry.type) {
      case "watering": {
        const w = v.watering.find(x => x.id === entry.refId);
        return w ? { kind: "Watering log", to: `/app/plants/${entry.plantId}`, summary: `Amount ${w.amount ?? "?"} · pH ${w.ph ?? "?"} · EC ${w.ec ?? "?"}${w.runoffAmount ? ` · runoff ${w.runoffAmount}` : ""}` } : null;
      }
      case "feeding": {
        const f = v.feeding.find(x => x.id === entry.refId);
        return f ? { kind: "Feeding log", to: `/app/plants/${entry.plantId}`, summary: `${f.brand || "—"} · EC ${f.finalEc ?? "?"} · pH ${f.phAfterMix ?? "?"}` } : null;
      }
      case "training": {
        const t = v.training.find(x => x.id === entry.refId);
        return t ? { kind: "Training log", to: `/app/plants/${entry.plantId}`, summary: `${t.trainingType} · ${t.areas || "—"}` } : null;
      }
      case "diagnosis": {
        const d = v.diagnoses.find(x => x.id === entry.refId);
        return d ? { kind: "Diagnosis", to: `/app/diagnosis?plant=${entry.plantId}`, summary: d.placeholder ? "Awaiting AI provider" : (d.result?.likelyIssue || "Saved") } : null;
      }
      case "harvest": {
        const h = v.harvests.find(x => x.id === entry.refId);
        return h ? { kind: "Harvest", to: `/app/plants/${entry.plantId}`, summary: `Wet ${h.wetWeight ?? "?"}g · Dry ${h.dryWeight ?? "?"}g` } : null;
      }
      case "photo": {
        const p = v.photos.find(x => x.id === entry.refId);
        return p ? { kind: "Photo", to: `/app/photos`, summary: `${p.angle || "photo"}${p.symptoms ? ` · ${p.symptoms}` : ""}` } : null;
      }
      case "environment": {
        const s = v.snapshots.find(x => x.id === entry.refId);
        return s ? { kind: "Environment snapshot", to: `/app/sensors`, summary: `${s.tempF ?? "—"}°F · ${s.humidity ?? "—"}% RH · VPD ${s.vpd ?? "—"}` } : null;
      }
      default: return null;
    }
  })();

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => nav(-1)} className="mb-3"><ChevronLeft className="h-4 w-4" /> Back</Button>
      <PageHeader title="Diary entry" subtitle={format(new Date(entry.timestamp), "PPPp")} icon={BookOpen} />

      <div className="glass rounded-xl p-5 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant="outline" className={"capitalize " + typeColor[entry.type]}>{entry.type}</Badge>
          {plant && (
            <Link to={`/app/plants/${plant.id}`}>
              <Badge variant="secondary" className="hover:bg-secondary/80 gap-1"><Sprout className="h-3 w-3" />{plant.name}</Badge>
            </Link>
          )}
          {entry.stage && <Badge variant="outline" className="capitalize">{entry.stage}</Badge>}
        </div>
        <p className="text-sm leading-relaxed">{entry.note}</p>
        {entry.symptoms && (
          <p className="mt-2 text-sm text-warning flex gap-1.5"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />Symptoms: {entry.symptoms}</p>
        )}
        {entry.actions && <p className="mt-2 text-sm text-muted-foreground">Actions: {entry.actions}</p>}
        {entry.envNotes && <p className="mt-2 text-sm text-muted-foreground">Env notes: {entry.envNotes}</p>}
      </div>

      {sourceRecord && (
        <div className="glass rounded-xl p-4 mb-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Source record</div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-medium">{sourceRecord.kind}</div>
              <div className="text-sm text-muted-foreground">{sourceRecord.summary}</div>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to={sourceRecord.to}><ExternalLink className="h-3.5 w-3.5" />View source record</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="font-display font-semibold">Sensor snapshot</h3>
            {snap && (
              <span className="ml-auto inline-flex items-center gap-1.5">
                <SourceBadge source={snap.source} />
                <ConfidenceBadge c={snap.confidence} />
              </span>
            )}
          </div>
          {snap ? (
            <>
              <div className="text-xs text-muted-foreground mb-3">{format(new Date(snap.timestamp), "PPp")}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <Cell l="Temp" v={snap.tempF !== undefined ? `${snap.tempF}°F` : null} />
                <Cell l="RH" v={snap.humidity !== undefined ? `${snap.humidity}%` : null} />
                <Cell l="VPD" v={snap.vpd !== undefined ? `${snap.vpd} kPa` : null} />
                <Cell l="Soil moist" v={snap.soilMoisture !== undefined ? `${snap.soilMoisture}%` : null} />
                <Cell l="Soil EC" v={snap.soilEC} />
                <Cell l="PPFD" v={snap.ppfd} />
                <Cell l="Res EC" v={snap.resEC} />
                <Cell l="Res pH" v={snap.resPH} />
                <Cell l="Soil temp" v={snap.soilTempF !== undefined ? `${snap.soilTempF}°F` : null} />
              </div>
              {snap.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-warning">
                  {snap.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{w}</li>)}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No sensor snapshot attached to this entry.</p>
          )}
        </div>

        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="h-4 w-4 text-primary" />
            <h3 className="font-display font-semibold">Photos</h3>
            <span className="ml-auto text-xs text-muted-foreground">{photos.length}</span>
          </div>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos attached.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map(p => (
                <Link key={p.id} to="/app/photos" className="block rounded-lg overflow-hidden border border-border/40 hover:border-primary/60">
                  <img src={p.dataUrl} alt={p.notes || ""} className="w-full aspect-square object-cover" />
                  <div className="p-1.5 text-[10px] flex justify-between text-muted-foreground">
                    <span>{p.angle || "photo"}</span>
                    <span>{format(new Date(p.timestamp), "MMM d")}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Cell({ l, v }: { l: string; v: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</div>
      <div className="font-mono">{v ?? "—"}</div>
    </div>
  );
}
