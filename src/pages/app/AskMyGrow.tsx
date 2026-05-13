import { useState } from "react";
import { useVerdant } from "@/store/verdant";
import { PageHeader } from "@/components/ui-bits";
import { Bot, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const suggested = [
  "Am I watering too often?",
  "What changed before this issue?",
  "Compare this week to last week",
  "What should I check tomorrow?",
  "Is this autoflower stressed?",
];

const contexts = ["diary", "watering", "feeding", "training", "photos", "snapshots", "harvest"];

export default function AskMyGrow() {
  const v = useVerdant();
  const [plantId, setPlantId] = useState(v.plants[0]?.id || "");
  const [selectedCtx, setSelectedCtx] = useState<string[]>(["diary", "snapshots"]);
  const [q, setQ] = useState("");
  const [response, setResponse] = useState<string | null>(null);

  function toggle(c: string) { setSelectedCtx(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c]); }

  function ask() {
    if (!q.trim()) return;
    const plant = v.plants.find(p => p.id === plantId);
    const summary = [
      `Question: ${q}`,
      plant ? `Plant: ${plant.name} (${plant.strain}, ${plant.seedType}, ${plant.medium})` : "",
      selectedCtx.includes("diary") ? `Recent diary: ${v.diary.filter(d => d.plantId === plantId).slice(0, 3).map(d => d.type + ": " + d.note).join(" | ")}` : "",
      selectedCtx.includes("snapshots") ? `Latest snapshot: ${JSON.stringify(v.snapshots[0] ?? {})}` : "",
    ].filter(Boolean).join("\n");

    setResponse(
      "Ask My Grow is in MVP shell mode — no AI provider connected yet.\n\n" +
      "When connected, your question would be answered using this exact context bundle:\n\n" + summary +
      "\n\nUntil then, this view shows you what data would be sent so you can verify accuracy."
    );
  }

  return (
    <>
      <PageHeader title="Ask My Grow" subtitle="AI co-pilot for your diary timeline" icon={Bot} />

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
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Context</div>
            <div className="flex flex-wrap gap-2">
              {contexts.map(c => (
                <button key={c} onClick={() => toggle(c)} type="button"
                  className={`px-3 py-1 rounded-full text-xs border transition ${selectedCtx.includes(c) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
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
          <Button onClick={ask} className="gradient-leaf text-primary-foreground gap-1.5"><Send className="h-4 w-4" />Ask</Button>

          {response && (
            <div className="rounded-lg border border-info/40 bg-info/5 p-4 text-sm whitespace-pre-wrap">
              <div className="flex items-center gap-2 mb-2 text-info"><Sparkles className="h-4 w-4" /><span className="font-semibold">MVP placeholder response</span></div>
              {response}
            </div>
          )}
        </div>

        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold mb-2">Cautious AI policy</h3>
          <p className="text-sm text-muted-foreground">Verdant never pretends fake AI is real. When no provider is connected, you see exactly what would be sent. AI answers will always include confidence levels and sources from your diary.</p>
        </div>
      </div>
    </>
  );
}
