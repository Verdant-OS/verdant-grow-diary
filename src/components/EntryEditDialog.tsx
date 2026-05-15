import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { STAGES } from "@/lib/grow";
import { toast } from "sonner";

interface Entry {
  id: string;
  note: string;
  photo_url: string | null;
  stage: string | null;
  details: Record<string, any>;
  entry_at: string;
}

interface Props {
  entry: Entry | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (updated: Partial<Entry> & { id: string }) => void;
  onDeleted?: (id: string) => void;
}

const SUGGESTED_KEYS = ["ph", "ec", "runoff", "watering", "nutrients", "training"];

export default function EntryEditDialog({ entry, open, onOpenChange, onSaved, onDeleted }: Props) {
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<string>("veg");
  const [rows, setRows] = useState<{ key: string; value: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setNote(entry.note || "");
    setStage(entry.stage || "veg");
    setRows(
      Object.entries(entry.details || {}).map(([key, value]) => ({ key, value: String(value ?? "") })),
    );
  }, [entry]);

  function setRow(i: number, patch: Partial<{ key: string; value: string }>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow(key = "") {
    setRows((rs) => [...rs, { key, value: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!entry) return;
    if (!note.trim()) { toast.error("Note can't be empty"); return; }
    setBusy(true);
    const details: Record<string, string> = {};
    for (const r of rows) {
      const k = r.key.trim();
      const v = r.value.trim();
      if (k && v) details[k] = v;
    }
    const patch = { note: note.trim(), stage, details };
    const { error } = await supabase.from("diary_entries").update(patch).eq("id", entry.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Entry updated");
    onSaved?.({ id: entry.id, ...patch });
    onOpenChange(false);
  }

  async function remove() {
    if (!entry) return;
    if (!confirm("Delete this entry? This can't be undone.")) return;
    setDeleting(true);
    const { error } = await supabase.from("diary_entries").delete().eq("id", entry.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Entry deleted");
    onDeleted?.(entry.id);
    onOpenChange(false);
  }

  const usedKeys = new Set(rows.map((r) => r.key.trim()).filter(Boolean));
  const quickAdd = SUGGESTED_KEYS.filter((k) => !usedKeys.has(k));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Edit entry</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label className="text-xs">Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Details</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => addRow()} className="h-7 px-2 text-xs">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {rows.length === 0 && (
              <p className="text-xs text-muted-foreground mb-2">No details yet. Add measurements or actions below.</p>
            )}
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={r.key}
                    onChange={(e) => setRow(i, { key: e.target.value })}
                    placeholder="key"
                    className="w-1/3"
                  />
                  <Input
                    value={r.value}
                    onChange={(e) => setRow(i, { value: e.target.value })}
                    placeholder="value"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(i)}
                    aria-label="Remove detail"
                    className="h-9 w-9 shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {quickAdd.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {quickAdd.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => addRow(k)}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/60 border border-border/40 capitalize hover:bg-secondary"
                  >
                    + {k}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={remove} disabled={deleting || busy} className="text-destructive hover:text-destructive">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={save} disabled={busy} className="gradient-leaf text-primary-foreground">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
