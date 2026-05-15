import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Camera, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { STAGES } from "@/lib/grow";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; onCreated?: () => void; }

export default function QuickLog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { grows, activeGrow, activeGrowId, setActiveGrowId } = useGrows();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [stage, setStage] = useState(activeGrow?.stage || "veg");
  const [showMore, setShowMore] = useState(false);
  const [details, setDetails] = useState({ ph: "", ec: "", runoff: "", nutrients: "", training: "", watering: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    setPhotoFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function reset() {
    setPhotoFile(null); setPreview(null); setNote(""); setShowMore(false);
    setDetails({ ph: "", ec: "", runoff: "", nutrients: "", training: "", watering: "" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeGrowId) { toast.error("Pick a grow first"); return; }
    if (!photoFile) { toast.error("Photo required"); return; }
    if (!note.trim()) { toast.error("Add a quick note"); return; }
    setBusy(true);
    try {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/${activeGrowId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("diary-photos").upload(path, photoFile, { contentType: photoFile.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("diary-photos").getPublicUrl(path);

      const cleanDetails = Object.fromEntries(Object.entries(details).filter(([, v]) => v && v.toString().trim()));
      const { error: insErr } = await supabase.from("diary_entries").insert({
        user_id: user.id, grow_id: activeGrowId, photo_url: pub.publicUrl,
        note: note.trim(), stage, details: cleanDetails,
      });
      if (insErr) throw insErr;

      // If stage changed, update grow
      if (activeGrow && stage !== activeGrow.stage) {
        await supabase.from("grows").update({ stage }).eq("id", activeGrowId);
      }

      toast.success("Logged 🌱");
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="glass max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Quick Log</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {/* Photo */}
          <button type="button" onClick={() => fileRef.current?.click()}
            className="relative aspect-square w-full rounded-xl border-2 border-dashed border-border/60 overflow-hidden bg-secondary/40 hover:border-primary/60 transition">
            {preview ? <img src={preview} className="h-full w-full object-cover" alt="" /> : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Camera className="h-10 w-10" /><span className="text-sm">Tap to add photo</span>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          </button>

          {/* Grow + stage */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Grow</Label>
              <Select value={activeGrowId ?? ""} onValueChange={setActiveGrowId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{grows.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>What's happening?</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Watered, looking healthy, slight yellowing on a fan leaf…" rows={3} />
          </div>

          <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-3">
            <span className="text-sm">Add more details</span>
            <Switch checked={showMore} onCheckedChange={setShowMore} />
          </label>

          {showMore && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">pH</Label><Input value={details.ph} onChange={(e) => setDetails({ ...details, ph: e.target.value })} placeholder="6.2" /></div>
              <div><Label className="text-xs">EC / PPM</Label><Input value={details.ec} onChange={(e) => setDetails({ ...details, ec: e.target.value })} placeholder="1.4" /></div>
              <div><Label className="text-xs">Watering (ml)</Label><Input value={details.watering} onChange={(e) => setDetails({ ...details, watering: e.target.value })} /></div>
              <div><Label className="text-xs">Runoff</Label><Input value={details.runoff} onChange={(e) => setDetails({ ...details, runoff: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Nutrients</Label><Input value={details.nutrients} onChange={(e) => setDetails({ ...details, nutrients: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Training / actions</Label><Input value={details.training} onChange={(e) => setDetails({ ...details, training: e.target.value })} placeholder="LST, defoliation…" /></div>
            </div>
          )}

          <Button type="submit" disabled={busy} className="gradient-leaf text-primary-foreground">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save entry"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
