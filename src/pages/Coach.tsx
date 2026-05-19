import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGrows } from "@/store/grows";
import { useAuth } from "@/store/auth";

import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Camera, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

type Mode = "diagnose" | "next_steps";

export default function Coach() {
  const { user } = useAuth();
  
  const { activeGrow, activeGrowId } = useGrows();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function ask(mode: Mode) {
    if (!user) return;
    setBusy(true); setReply(null);
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
      const d = data as { error?: string; reply?: string } | null;
      if (d?.error) throw new Error(d.error);
      setReply(d?.reply ?? "");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Coach failed");
    } finally { setBusy(false); }
  }

  function handleFile(f: File | null) {
    setPhotoFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

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

      {reply && (
        <div className="glass rounded-2xl p-4 mt-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground"><Sparkles className="h-3 w-3 text-primary" />Coach</div>
          <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-sm">{reply}</div>
        </div>
      )}
    </div>
  );
}
