/**
 * GrowTargetsEditor — manual editor for per-grow environment target ranges.
 *
 * Strictly user-driven. No AI. No external-control. No recommendations.
 * Save path uses Supabase upsert on (grow_id) — RLS enforces ownership.
 *
 * Temperature fields (temp, soil_temp) are stored as canonical Celsius in
 * grow_targets, matching sensor storage everywhere else in the app — but
 * DEFAULT_TEMPERATURE_UNIT is Fahrenheit, so this dialog must display and
 * accept input in the user's preferred unit, not hardcode °C. Converts on
 * load (DB Celsius -> display unit) and on save (display unit -> Celsius),
 * reusing the same celsiusToFahrenheit/fahrenheitToCelsius the rest of the
 * app uses. Never converts the non-temperature fields (%, kPa, mS/cm, µmol).
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useToast } from "@/hooks/use-toast";
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";
import {
  parseTemperatureInput,
  temperatureInputUnitFromPreference,
} from "@/lib/sensorInputUnitConversion";
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

type Field = "temp" | "rh" | "vpd" | "soil_wc" | "soil_ec" | "soil_temp" | "ppfd";

interface FieldDef {
  key: Field;
  label: string;
  /** Static unit for non-temperature fields. Ignored for temperature
   * fields — those compute their symbol from the live preference. */
  unit: string;
  step: string;
  /** True for temp/soil_temp: convert between canonical Celsius storage
   * and the user's preferred display unit. */
  isTemperature?: boolean;
}

export const FIELDS: readonly FieldDef[] = [
  { key: "temp", label: "Temperature", unit: "°C", step: "0.1", isTemperature: true },
  { key: "rh", label: "Humidity", unit: "%", step: "1" },
  { key: "vpd", label: "VPD", unit: "kPa", step: "0.01" },
  { key: "soil_wc", label: "Soil water", unit: "%", step: "1" },
  { key: "soil_ec", label: "Soil EC", unit: "mS/cm", step: "0.01" },
  { key: "soil_temp", label: "Soil temp", unit: "°C", step: "0.1", isTemperature: true },
  { key: "ppfd", label: "PPFD", unit: "µmol", step: "1" },
];

export function temperatureUnitSymbol(unit: TemperatureUnitPreference): string {
  return unit === "fahrenheit" ? "°F" : "°C";
}

/**
 * Round-trip precision for the editable C<->F conversion. Read-only display
 * elsewhere in the app rounds to whole degrees (formatTemperatureDisplay's
 * default), which is fine for a glance but would silently drift a stored
 * min/max by up to ~0.3°C every time this dialog is reopened and re-saved
 * without touching the field. Two decimal places keeps that drift below
 * floating-point noise instead of compounding on every save.
 */
const TEMPERATURE_ROUND_TRIP_DIGITS = 2;

export function celsiusToDisplayUnit(celsius: number, unit: TemperatureUnitPreference): number {
  const displayed = unit === "fahrenheit" ? celsiusToFahrenheit(celsius) : celsius;
  return Number(displayed.toFixed(TEMPERATURE_ROUND_TRIP_DIGITS));
}

export function displayUnitToCelsius(displayed: number, unit: TemperatureUnitPreference): number {
  const celsius = unit === "fahrenheit" ? fahrenheitToCelsius(displayed) : displayed;
  return Number(celsius.toFixed(TEMPERATURE_ROUND_TRIP_DIGITS));
}

type FormState = Record<string, string>;

function emptyForm(): FormState {
  const out: FormState = {};
  for (const f of FIELDS) {
    out[`${f.key}_min`] = "";
    out[`${f.key}_max`] = "";
  }
  return out;
}

export function rowValueToFormValue(
  raw: unknown,
  field: FieldDef,
  displayUnit: TemperatureUnitPreference,
): string {
  if (raw === null || raw === undefined) return "";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "";
  const displayed = field.isTemperature ? celsiusToDisplayUnit(n, displayUnit) : n;
  return String(displayed);
}

export function rowToForm(
  row: Record<string, unknown> | null,
  displayUnit: TemperatureUnitPreference,
): FormState {
  const form = emptyForm();
  if (!row) return form;
  for (const f of FIELDS) {
    form[`${f.key}_min`] = rowValueToFormValue(row[`${f.key}_min`], f, displayUnit);
    form[`${f.key}_max`] = rowValueToFormValue(row[`${f.key}_max`], f, displayUnit);
  }
  return form;
}

type ParsedTargetField =
  | { kind: "empty"; value: null }
  | { kind: "invalid"; value: null }
  | { kind: "ok"; value: number };

function parseTargetField(
  raw: string,
  field: FieldDef,
  displayUnit: TemperatureUnitPreference,
): ParsedTargetField {
  if (raw.trim() === "") return { kind: "empty", value: null };
  if (field.isTemperature) {
    const parsed = parseTemperatureInput(raw, temperatureInputUnitFromPreference(displayUnit));
    return parsed.kind === "ok" && parsed.celsius !== null
      ? { kind: "ok", value: parsed.celsius }
      : { kind: "invalid", value: null };
  }
  const value = Number(raw);
  return Number.isFinite(value) ? { kind: "ok", value } : { kind: "invalid", value: null };
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
  const unit = useTemperatureUnitPreference();
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing row when dialog opens. Re-runs on a unit change too, so a
  // grower who flips their preference while the dialog is open sees the
  // fields re-labelled and re-converted rather than left stale.
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
        setForm(rowToForm(data as Record<string, unknown> | null, unit));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, growId, toast, unit]);

  const invalid = useMemo(() => {
    for (const f of FIELDS) {
      const min = parseTargetField(form[`${f.key}_min`], f, unit);
      const max = parseTargetField(form[`${f.key}_max`], f, unit);
      if (min.kind === "invalid" || max.kind === "invalid") {
        return `${f.label} must be a valid number${f.isTemperature ? " with an optional °F or °C suffix" : ""}`;
      }
      if (min.value !== null && max.value !== null && min.value > max.value) {
        return `${f.label} min must be ≤ max`;
      }
    }
    return null;
  }, [form, unit]);

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
      const min = parseTargetField(form[`${f.key}_min`], f, unit);
      const max = parseTargetField(form[`${f.key}_max`], f, unit);
      payload[`${f.key}_min`] = min.value;
      payload[`${f.key}_max`] = max.value;
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
            Manual ranges for {growName ?? "this grow"}. Leave a field empty for "no target". Not
            advice — used only for the Target Comparison card.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
            {FIELDS.map((f) => (
              <div key={f.key} className="rounded-lg border border-border/40 p-2">
                <Label className="text-xs">
                  {f.label} ({f.isTemperature ? temperatureUnitSymbol(unit) : f.unit})
                </Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type={f.isTemperature ? "text" : "number"}
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
                    type={f.isTemperature ? "text" : "number"}
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

        {invalid && <p className="text-xs text-amber-600 mt-2">{invalid}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
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
