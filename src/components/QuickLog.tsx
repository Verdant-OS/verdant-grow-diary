import { useState, useRef, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Camera, Loader2, Sparkles, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";

import { STAGES } from "@/lib/grow";
import { EVENT_TYPES, snapshotForTent } from "@/lib/diary";
import { usePlants } from "@/hooks/use-plants";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; onCreated?: () => void; }

export default function QuickLog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { grows, activeGrow, activeGrowId, setActiveGrowId } = useGrows();
  const { data: plants = [] } = usePlants();
  
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [stage, setStage] = useState(activeGrow?.stage || "veg");
  const [eventType, setEventType] = useState<string>("observation");
  const [plantId, setPlantId] = useState<string>("");
  const [snapshot, setSnapshot] = useState(false);
  const [remindAt, setRemindAt] = useState<string>("");
  const [showMore, setShowMore] = useState(false);
  const [details, setDetails] = useState({ ph: "", ec: "", runoff: "", nutrients: "", training: "", watering: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-pick a sensible event type when adding a photo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (photoFile && eventType === "observation") setEventType("photo"); }, [photoFile]);

  const selectedPlant = useMemo(() => plants.find((p) => p.id === plantId) ?? null, [plantId, plants]);

  function handleFile(f: File | null) {
    setPhotoFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function reset() {
    setPhotoFile(null); setPreview(null); setNote(""); setShowMore(false);
    setEventType("observation"); setPlantId(""); setSnapshot(false); setRemindAt("");
    setDetails({ ph: "", ec: "", runoff: "", nutrients: "", training: "", watering: "" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeGrowId) { toast.error("Pick a grow first"); return; }
    if (!note.trim()) { toast.error("Add a quick note"); return; }
    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      if (photoFile) {
        const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/${activeGrowId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("diary-photos")
          .upload(path, photoFile, { contentType: photoFile.type, upsert: false });
        if (upErr) {
          toast.error(`Photo upload failed: ${upErr.message}`);
          console.error("[QuickLog] storage upload error", upErr);
          return;
        }
        uploadedPath = path;
      }

      const cleanDetails: Record<string, unknown> = Object.fromEntries(
        Object.entries(details).filter(([, v]) => v && v.toString().trim()),
      );
      cleanDetails.event_type = eventType;
      if (selectedPlant) {
        cleanDetails.plant_id = selectedPlant.id;
        cleanDetails.plant_name = selectedPlant.name;
        if (selectedPlant.tent_id) cleanDetails.tent_id = selectedPlant.tent_id;
      }
      if (snapshot && selectedPlant?.tent_id) {
        const snap = snapshotForTent(selectedPlant.tent_id);
        if (snap) cleanDetails.sensor = snap;
      }
      if (eventType === "reminder" && remindAt) cleanDetails.remind_at = remindAt;

      const { error: insErr } = await supabase.from("diary_entries").insert({
        user_id: user.id, grow_id: activeGrowId, photo_url: uploadedPath,
        note: note.trim(), stage, details: cleanDetails as Record<string, never>,
      });
      if (insErr) {
        if (uploadedPath) {
          await supabase.storage.from("diary-photos").remove([uploadedPath]).catch(() => {});
        }
        toast.error(`Couldn't save entry: ${insErr.message}`);
        console.error("[QuickLog] insert error", insErr);
        return;
      }

      if (activeGrow && stage !== activeGrow.stage) {
        await supabase.from("grows").update({ stage }).eq("id", activeGrowId);
      }

      toast.success("Logged 🌱");
      reset();
      onOpenChange(false);
      onCreated?.();
      window.dispatchEvent(new CustomEvent("verdant:entry-created"));
    } catch (err: unknown) {
      if (uploadedPath) {
        await supabase.storage.from("diary-photos").remove([uploadedPath]).catch(() => {});
      }
      toast.error(err instanceof Error ? err.message : "Failed to save");
      console.error("[QuickLog] unexpected error", err);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="glass max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Quick Log</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {/* Photo */}
          <div className="relative aspect-square w-full rounded-xl border-2 border-dashed border-border/60 overflow-hidden bg-secondary/40 hover:border-primary/60 transition">
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute inset-0 h-full w-full">
              {preview ? <img src={preview} className="h-full w-full object-cover" alt="" /> : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Camera className="h-10 w-10" /><span className="text-sm">Tap to add photo (optional)</span>
                </div>
              )}
            </button>
            {preview && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                aria-label="Remove photo"
                className="absolute top-2 right-2 z-10 rounded-full bg-background/80 backdrop-blur px-2 py-1 text-xs font-medium border border-border/60 hover:bg-background"
              >
                Remove
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          </div>

          {/* Event type + Stage */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Event</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="inline-flex items-center gap-2"><t.icon className="h-3.5 w-3.5" />{t.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
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

          {/* Grow + Plant */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Grow</Label>
              <Select value={activeGrowId ?? ""} onValueChange={setActiveGrowId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{grows.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Plant (optional)</Label>
              <Select value={plantId || "__none"} onValueChange={(v) => setPlantId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No specific plant</SelectItem>
                  {plants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.strain ? ` · ${p.strain}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>What's happening?</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Watered, looking healthy, slight yellowing on a fan leaf…" rows={3} />
          </div>

          {eventType === "reminder" && (
            <div>
              <Label className="text-xs">Remind me at</Label>
              <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
            </div>
          )}

          <label className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${selectedPlant ? "border-border/60" : "border-border/40 opacity-60"}`}>
            <span className="text-sm flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" />Attach sensor snapshot</span>
            <Switch checked={snapshot && !!selectedPlant} onCheckedChange={setSnapshot} disabled={!selectedPlant} />
          </label>
          {snapshot && !selectedPlant && (
            <p className="text-[11px] text-muted-foreground -mt-2">Pick a plant to capture its tent's latest readings.</p>
          )}

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
