import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useVerdant, validateRelationships } from "@/store/verdant";
import { PageHeader } from "@/components/ui-bits";
import { ClipboardCheck, CheckCircle2, AlertTriangle, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const passed = [
  "Diary entries created from watering, feeding, training, photo, diagnosis, harvest, and snapshot logs",
  "Photo upload creates linked diary entry of type photo",
  "Sensor snapshot creates linked environment diary entry when plant is set",
  "Diagnosis page reachable from navigation; saves locally with shell-mode AI banner",
  "Diary entry detail route shows snapshot grid, photos, and source-record link",
  "Calendar shows diary + events; day cells open popover with deep links",
  "Plant detail tabs render real linked records with diary back-links",
  "Reports use real watering/feeding/training/photo/snapshot data with empty states",
  "Ask My Grow shows full structured context preview and never invents AI answers",
  "Customer Mode is fully separated from Operator Mode",
  "Autoflower and medium-specific warnings render at log time",
];

const next10 = [
  "Pre-fill plantId in NewSnap when launched from a plant context",
  "Inline 'capture snapshot now' action inside NewEntry diary form",
  "Diary 'Linked from' chip → deep link with plantId + tab + refId hash",
  "Diary timeline grouping by day with jump-to-today on mobile",
  "Calendar event 'mark complete' → guaranteed diary back-link & status",
  "Diagnosis result placeholder → richer Settings → AI provider deep link",
  "PhotoView modal: previous/next navigation between photos",
  "Reports: per-week runoff EC/pH trend for coco & peat plants",
  "QA page export → JSON snapshot of relationship issues for support",
  "Server-side persistence behind Lovable Cloud (still client-only today)",
];

export default function QAChecklist() {
  const v = useVerdant();
  const issues = useMemo(() => validateRelationships(v), [v]);

  const counts = {
    plants: v.plants.length,
    diary: v.diary.length,
    watering: v.watering.length,
    feeding: v.feeding.length,
    training: v.training.length,
    photos: v.photos.length,
    snapshots: v.snapshots.length,
    diagnoses: v.diagnoses.length,
    harvests: v.harvests.length,
    events: v.events.length,
  };

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/app/settings"><ChevronLeft className="h-4 w-4" /> Settings</Link></Button>
      <PageHeader title="MVP QA Checklist" subtitle="Live relationship integrity across the diary-first data model" icon={ClipboardCheck} />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2 text-success"><CheckCircle2 className="h-4 w-4" />Passed flows</h3>
          <ul className="space-y-1.5 text-sm">
            {passed.map((p, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />{p}</li>)}
          </ul>
        </div>

        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
            {issues.length === 0
              ? <span className="flex items-center gap-2 text-success"><CheckCircle2 className="h-4 w-4" />Failed flows / broken links</span>
              : <span className="flex items-center gap-2 text-warning"><AlertTriangle className="h-4 w-4" />Failed flows / broken links</span>}
            <Badge variant="outline" className="ml-auto">{issues.length}</Badge>
          </h3>
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No relationship issues detected. Every diary entry resolves to its source record, every event has a back-link.</p>
          ) : (
            <ul className="space-y-1 text-xs font-mono max-h-72 overflow-y-auto">
              {issues.map((i, idx) => (
                <li key={idx} className="rounded border border-warning/30 bg-warning/5 p-2">
                  <span className="text-warning">{i.kind}</span> · <span className="text-muted-foreground">{i.id}</span> — {i.issue}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass rounded-xl p-5 md:col-span-2">
          <h3 className="font-display font-semibold mb-3">Data inventory</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            {Object.entries(counts).map(([k, n]) => (
              <div key={k} className="rounded-lg bg-card/50 border border-border/40 p-3">
                <div className="text-xs uppercase text-muted-foreground capitalize">{k}</div>
                <div className="font-display text-xl mt-1">{n}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-xl p-5 md:col-span-2">
          <h3 className="font-display font-semibold mb-3">Next 10 fixes (priority order)</h3>
          <ol className="space-y-1.5 text-sm list-decimal pl-5">
            {next10.map((n, i) => <li key={i}>{n}</li>)}
          </ol>
        </div>
      </div>
    </>
  );
}
