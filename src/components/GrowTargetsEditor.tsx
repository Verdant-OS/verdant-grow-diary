/**
 * GrowTargetsEditor — manual editor for per-grow environment target ranges.
 *
 * Strictly user-driven. No AI. No external-control. No recommendations.
 * Save path uses Supabase upsert on (grow_id) — RLS enforces ownership.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Field =
  | "temp"
  | "rh"
  | "vpd"
  | "soil_wc"
  | "soil_ec"
  | "soil_temp"
  | "ppfd";

interface FieldDef {
  key: Field;
  label: string;
  unit: string;
  step: string;
}

const FIELDS: FieldDef[] = [
  { key: "temp", label: "Temperature", unit: "°C", step: "0.1" },
  { key: "rh", label: "Humidity", unit: "%", step: "1" },
  { key: "vpd", label: "VPD", unit: "kPa", step: "0.01" },
  { key: "soil_wc", label: "Soil water", unit: "%", step: "1" },
  { key: "soil_ec", label: "Soil EC", unit: "mS/cm", step: "0.01" },
  { key: "soil_temp", label: "Soil temp", unit: "°C", step: "0.1" },
  { key: "ppfd", label: "PPFD", unit: "µmol", step: "1" },
];

type FormState = Record<string, string>;

function emptyForm(): FormState {
  const out: FormState = {};
  for (const f of FIELDS) {
    out[`${f.key}_min`] = "";
    out[`${f.key}_max`] = "";
  }
  return out;
}

function rowToForm(row: Record<string, unknown> | null): FormState {
  const form = emptyForm();
  if (!row) return form;
  for (const f of FIELDS) {
    const min = row[`${f.key}_min`];
    const max = row[`${f.key}_max`];
    form[`${f.key}_min`] = min === null || min === undefined ? "" : String(min);
    form[`${f.key}_max`] = max === null || max === undefined ? "" : String(max);
  }
  return form;
}

function parseField(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  growId: string;
  growName?: string;
  onSaved?: () => void;
}

export default function GrowTargetsEditor({
  open,
  onOpenChange,
  growId,
  growName,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing row when dialog opens.
  useEffect(() => {
    if (!open || !user || !growId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("grow_targets")
        .select("*")
        .eq("grow_id", growId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast({ title: "Could not load targets", description: error.message });
        setForm(emptyForm());
      } else {
        setForm(rowToForm(data as Record<string, unknown> | null));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, growId, toast]);

  const invalid = useMemo(() => {
    for (const f of FIELDS) {
      const min = parseField(form[`${f.key}_min`]);
      const max = parseField(form[`${f.key}_max`]);
      if (min !== null && max !== null && min > max) {
        return `${f.label} min must be ≤ max`;
      }
    }
    return null;
  }, [form]);

  async function handleSave() {
    if (!user) return;
    if (invalid) {
      toast({ title: "Check ranges", description: invalid });
      return;
    }
    setSaving(true);
    const payload = {
      grow_id: growId,
      user_id: user.id,
    } as Record<string, unknown>;
    for (const f of FIELDS) {
      payload[`${f.key}_min`] = parseField(form[`${f.key}_min`]);
      payload[`${f.key}_max`] = parseField(form[`${f.key}_max`]);
    }
    const { error } = await supabase
      .from("grow_targets")
      // upsert with onConflict on the unique grow_id constraint
      .upsert(payload as never, { onConflict: "grow_id" });

    setSaving(false);
    if (error) {
      toast({ title: "Could not save targets", description: error.message });
      return;
    }
    toast({ title: "Targets saved" });
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit grow targets</DialogTitle>
          <DialogDescription>
            Manual ranges for {growName ?? "this grow"}. Leave a field empty
            for "no target". Not advice — used only for the Target Comparison
            card.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
            {FIELDS.map((f) => (
              <div
                key={f.key}
                className="rounded-lg border border-border/40 p-2"
              >
                <Label className="text-xs">
                  {f.label} ({f.unit})
                </Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    placeholder="min"
                    aria-label={`${f.label} min`}
                    value={form[`${f.key}_min`]}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        [`${f.key}_min`]: e.target.value,
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    placeholder="max"
                    aria-label={`${f.label} max`}
                    value={form[`${f.key}_max`]}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        [`${f.key}_max`]: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {invalid && (
          <p className="text-xs text-amber-600 mt-2">{invalid}</p>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !!invalid}>
            {saving ? "Saving…" : "Save targets"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
