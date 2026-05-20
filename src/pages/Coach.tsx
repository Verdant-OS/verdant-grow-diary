import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGrows } from "@/store/grows";
import { useAuth } from "@/store/auth";

import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Camera, Loader2, Wand2, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";

type Mode = "diagnose" | "next_steps";

interface Analysis {
  summary: string;
  likely_issue: string | null;
  confidence: "low" | "medium" | "high";
  risk_level: "low" | "medium" | "high" | "unknown";
  evidence: string[];
  possible_causes: string[];
  recommended_actions: string[];
  do_not_do: string[];
  follow_up_24h: string;
  follow_up_3_day: string;
}

interface CoachResponse {
  analysis?: Analysis;
  sparse?: boolean;
  empty?: boolean;
  error?: string;
}

export default function Coach() {
  const { user } = useAuth();

  const { activeGrow, activeGrowId } = useGrows();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CoachResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [queuedIdx, setQueuedIdx] = useState<Set<number>>(new Set());
  const [queuingIdx, setQueuingIdx] = useState<number | null>(null);

  // SECURITY: never send user_id from the client. DB default (auth.uid()) wins.
  // status always defaults to pending_approval. No device-control fields.
  async function addToQueue(idx: number, recommendation: string) {
    if (!user || !activeGrowId || !analysis) return;
    const risk: "low" | "medium" | "high" | "critical" =
      analysis.risk_level === "unknown" ? "low" : analysis.risk_level;
    setQueuingIdx(idx);
    const { error } = await supabase.from("action_queue").insert({
      grow_id: activeGrowId,
      action_type: "advisory",
      target_metric: "general",
      suggested_change: recommendation,
      reason: analysis.likely_issue || analysis.summary || "AI Coach recommendation",
      risk_level: risk,
      source: "ai_coach",
      status: "pending_approval",
    });
    setQueuingIdx(null);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (error.code === "42501" || msg.includes("row-level security") || msg.includes("violates")) {
        toast.error(
          "This action cannot be queued until the plant/tent is assigned to this grow.",
          { description: "Open Lineage Repair to assign tents to this grow." },
        );
        return;
      }
      toast.error(error.message);
      return;
    }
    setQueuedIdx((s) => new Set(s).add(idx));
    toast.success("Action queued for approval.");
  }

  async function ask(mode: Mode) {
    if (!user) return;
    setBusy(true); setResult(null);
    try {
      let photoUrl: string | undefined;
      if (mode === "diagnose" && photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/coach/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("diary-photos").upload(path, photoFile, { contentType: photoFile.type });
        if (error) throw error;
        const { data: signed, error: sErr } = await supabase.storage.from("diary-photos").createSignedUrl(path, 600);
        if (sErr) throw sErr;
        photoUrl = signed.signedUrl;
      }
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: { mode, growId: activeGrowId, photoUrl, question: question.trim() || undefined },
      });
      if (error) throw error;
      const d = data as CoachResponse | null;
      if (d?.error) throw new Error(d.error);
      setResult(d ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Coach failed");
    } finally { setBusy(false); }
  }

  function handleFile(f: File | null) {
    setPhotoFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  const analysis = result?.analysis;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI Coach</h1>
        <p className="text-sm text-muted-foreground">
          {activeGrow ? <>Coaching <span className="text-foreground">{activeGrow.name}</span> using your recent diary.</> : "Pick a grow for personalized advice."}
        </p>
      </div>

      <div className="glass rounded-2xl p-4 space-y-4">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="relative aspect-video w-full rounded-xl border-2 border-dashed border-border/60 overflow-hidden bg-secondary/40 hover:border-primary/60 transition">
          {preview ? <img src={preview} className="h-full w-full object-cover" alt="" /> : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Camera className="h-8 w-8" /><span className="text-sm">Add photo to diagnose</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </button>

        <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Optional: ask a question, e.g. 'why are leaves curling?'" rows={2} />

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => ask("diagnose")} disabled={busy || !photoFile} className="gradient-leaf text-primary-foreground">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Wand2 className="h-4 w-4" />Diagnose photo</>}
          </Button>
          <Button onClick={() => ask("next_steps")} disabled={busy || !activeGrowId} variant="secondary">
            What should I do next?
          </Button>
        </div>
      </div>

      {analysis && (
        <div className="glass rounded-2xl p-4 mt-4 animate-fade-in space-y-3 text-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />Coach
            <span className="ml-auto uppercase tracking-wider">
              conf: {analysis.confidence} · risk: {analysis.risk_level}
              {result?.sparse && " · sparse data"}
            </span>
          </div>
          <p className="font-medium">{analysis.summary}</p>
          {analysis.likely_issue && (
            <p className="text-xs"><span className="text-muted-foreground">Likely issue:</span> {analysis.likely_issue}</p>
          )}
          <Section title="Evidence" items={analysis.evidence} />
          <Section title="Possible causes" items={analysis.possible_causes} />
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Recommended actions
            </p>
            <ul className="space-y-1.5">
              {analysis.recommended_actions.map((it, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-1">• {it}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 shrink-0"
                    disabled={
                      !activeGrowId || queuingIdx === i || queuedIdx.has(i)
                    }
                    onClick={() => addToQueue(i, it)}
                  >
                    {queuingIdx === i ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : queuedIdx.has(i) ? (
                      "Queued"
                    ) : (
                      <>
                        <Plus className="h-3 w-3" />
                        Add to Action Queue
                      </>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                <Link to="/actions">
                  <ListChecks className="h-3 w-3" /> Open Action Queue
                </Link>
              </Button>
            </div>
          </div>
          <Section title="Do NOT do" items={analysis.do_not_do} />
          <div className="text-xs space-y-1 pt-2 border-t border-border/40">
            <p><span className="text-muted-foreground">Next 24h:</span> {analysis.follow_up_24h}</p>
            <p><span className="text-muted-foreground">Next 3 days:</span> {analysis.follow_up_3_day}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
      <ul className="list-disc list-inside space-y-0.5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
