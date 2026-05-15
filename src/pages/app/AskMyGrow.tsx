import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useVerdant } from "@/store/verdant";
import { PageHeader } from "@/components/ui-bits";
import { Bot, Send, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { assembleContext } from "@/lib/askContext";

const suggested = [
  "Am I watering too often?",
  "What changed before this issue?",
  "Compare this week to last week",
  "What should I check tomorrow?",
  "What context should I review for this autoflower?",
];

const contexts = ["diary", "watering", "feeding", "training", "photos", "snapshots", "diagnosis", "harvest"];

export default function AskMyGrow() {
  const v = useVerdant();
  const [plantId, setPlantId] = useState(v.plants[0]?.id || "");
  const [selectedCtx, setSelectedCtx] = useState<string[]>(["diary", "snapshots"]);
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function toggle(c: string) { setSelectedCtx(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c]); }

  const bundle = useMemo(() => assembleContext(plantId, selectedCtx, v), [plantId, selectedCtx, v]);

  function ask() {
    if (!q.trim()) return;
    setSubmitted(true);
  }

  return (
    <>
      <PageHeader title="Ask My Grow" subtitle="AI co-pilot for your diary timeline" icon={Bot} />

      <div className="rounded-lg border border-warning/40 bg-warning/5 text-warning text-xs p-3 mb-4 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Shell mode</span> — no AI provider connected. Verdant will not invent answers.{" "}
          <Link to="/app/settings" className="underline">Connect a provider in Settings</Link>.
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-xl p-5 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Plant</div>
            <Select value={plantId} onValueChange={setPlantId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{v.plants.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Context to send</div>
            <div className="flex flex-wrap gap-2">
              {contexts.map(c => (
                <button key={c} onClick={() => toggle(c)} type="button"
                  className={`px-3 py-1 rounded-full text-xs border transition capitalize ${selectedCtx.includes(c) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <Textarea rows={4} placeholder="Ask anything about your grow..." value={q} onChange={e => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {suggested.map(s => (
              <Badge key={s} variant="outline" className="cursor-pointer hover:border-primary" onClick={() => setQ(s)}>{s}</Badge>
            ))}
          </div>
          <Button onClick={ask} className="gradient-leaf text-primary-foreground gap-1.5"><Send className="h-4 w-4" />Preview request</Button>

          {submitted && (
            <div className="rounded-lg border border-info/40 bg-info/5 p-4 text-sm space-y-3">
              <div className="flex items-center gap-2 text-info"><Sparkles className="h-4 w-4" /><span className="font-semibold">No AI answer generated</span></div>
              <p className="text-xs text-muted-foreground">When a provider is connected, your question and the bundle below will be sent. Until then, no fake answer is produced.</p>
              <div className="rounded-md bg-card/40 border border-border/40 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Question</div>
                <div className="text-sm">{q}</div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border/60 p-4 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Context preview</div>
            <ContextSection label="Plant" data={bundle.plant} />
            {selectedCtx.includes("diary") && <ContextSection label={`Diary (${bundle.diary.length})`} data={bundle.diary} />}
            {selectedCtx.includes("watering") && <ContextSection label={`Watering (${bundle.watering.length})`} data={bundle.watering} />}
            {selectedCtx.includes("feeding") && <ContextSection label={`Feeding (${bundle.feeding.length})`} data={bundle.feeding} />}
            {selectedCtx.includes("training") && <ContextSection label={`Training (${bundle.training.length})`} data={bundle.training} />}
            {selectedCtx.includes("photos") && <ContextSection label={`Photos (${bundle.photos.length})`} data={bundle.photos} />}
            {selectedCtx.includes("snapshots") && <ContextSection label={`Snapshots (${bundle.snapshots.length})`} data={bundle.snapshots} />}
            {selectedCtx.includes("diagnosis") && <ContextSection label={`Diagnosis (${bundle.diagnosis.length})`} data={bundle.diagnosis} />}
            {selectedCtx.includes("harvest") && <ContextSection label={`Harvest (${bundle.harvest.length})`} data={bundle.harvest} />}
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold mb-2">Cautious AI policy</h3>
          <p className="text-sm text-muted-foreground">Verdant never pretends fake AI is real. When no provider is connected, you see exactly the structured bundle that would be sent. Future answers will always include confidence levels and sources from your diary.</p>
        </div>
      </div>
    </>
  );
}

function ContextSection({ label, data }: { label: string; data: any }) {
  const empty = data == null || (Array.isArray(data) && data.length === 0);
  return (
    <details className="text-xs" open={!empty}>
      <summary className="cursor-pointer font-medium select-none">{label}{empty && <span className="ml-2 text-muted-foreground">empty</span>}</summary>
      {!empty && <pre className="mt-2 max-h-48 overflow-auto rounded bg-background/60 p-2 font-mono text-[11px] leading-snug">{JSON.stringify(data, null, 2)}</pre>}
    </details>
  );
}
