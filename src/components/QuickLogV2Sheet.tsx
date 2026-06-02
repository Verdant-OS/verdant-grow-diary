import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { usePlants } from "@/hooks/use-plants";
import { useTents } from "@/hooks/use-tents";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";

import {
  buildQuickLogV2TargetOptions,
  resolveQuickLogV2Target,
  shouldShowVolumeField,
  isPhotoSavingSupported,
  EMPTY_QUICKLOG_V2_FORM,
  type QuickLogV2FormState,
  type QuickLogV2Action,
} from "@/lib/quickLogV2Rules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTargetKey?: string | null;
}

export default function QuickLogV2Sheet({
  open,
  onOpenChange,
  defaultTargetKey,
}: Props) {
  const { data: plants = [] } = usePlants();
  const { data: tents = [] } = useTents();
  const queryClient = useQueryClient();
  const { save, saving } = useQuickLogV2Save();

  const [form, setForm] = useState<QuickLogV2FormState>(EMPTY_QUICKLOG_V2_FORM);
  const [localError, setLocalError] = useState<string | null>(null);

  const options = useMemo(
    () => buildQuickLogV2TargetOptions(tents, plants),
    [tents, plants],
  );

  useEffect(() => {
    if (open) {
      setForm({
        ...EMPTY_QUICKLOG_V2_FORM,
        selectedKey: defaultTargetKey ?? null,
      });
      setLocalError(null);
    }
  }, [open, defaultTargetKey]);

  const setField = <K extends keyof QuickLogV2FormState>(
    k: K,
    v: QuickLogV2FormState[K],
  ) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleAction = (a: QuickLogV2Action) => {
    setField("action", a);
    setLocalError(null);
  };

  const handlePhotoPick = () => {
    if (!isPhotoSavingSupported()) {
      setLocalError("Photo saving is not enabled yet.");
      return;
    }
  };

  const handleSave = async () => {
    setLocalError(null);
    const resolved = resolveQuickLogV2Target(options, form.selectedKey);
    if (!resolved.ok) {
      setLocalError("Pick a tent or plant first.");
      return;
    }
    if (form.action === "photo") {
      setLocalError("Photo saving is not enabled yet.");
      return;
    }
    const built = buildQuickLogV2SavePayload({
      resolved,
      action: form.action,
      volumeMl: form.volumeMl,
      note: form.note,
      temperatureC: form.temperatureC,
      humidityPct: form.humidityPct,
      vpdKpa: form.vpdKpa,
    });
    if (built.ok !== true) {
      setLocalError(reasonToMessage(built.reason));
      return;
    }
    const res = await save(built.payload);
    if (!res.ok) {
      setLocalError(reasonToMessage(res.reason || "save_failed"));
      return;
    }
    toast.success("Log saved");
    applyQuickLogV2Refresh(queryClient, {
      targetType: resolved.targetType as "plant" | "tent",
      targetId: resolved.targetId as string,
      tentId: resolved.tentId ?? null,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Quick Log</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="qlv2-target">Target</Label>
            <Select
              value={form.selectedKey ?? ""}
              onValueChange={(v) => setField("selectedKey", v)}
            >
              <SelectTrigger id="qlv2-target" aria-label="Target">
                <SelectValue placeholder="Choose a tent or plant" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>
                    {o.type === "tent" ? "Tent · " : "Plant · "}
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Action</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={form.action === "water" ? "default" : "outline"}
                onClick={() => handleAction("water")}
              >
                Water
              </Button>
              <Button
                type="button"
                variant={form.action === "note" ? "default" : "outline"}
                onClick={() => handleAction("note")}
              >
                Note
              </Button>
              <Button
                type="button"
                variant={form.action === "photo" ? "default" : "outline"}
                onClick={() => handleAction("photo")}
              >
                Photo
              </Button>
            </div>
          </div>

          {shouldShowVolumeField(form.action) && (
            <div>
              <Label htmlFor="qlv2-volume">Volume (ml)</Label>
              <Input
                id="qlv2-volume"
                inputMode="decimal"
                value={form.volumeMl}
                onChange={(e) => setField("volumeMl", e.target.value)}
                placeholder="e.g. 500"
              />
            </div>
          )}

          {form.action === "photo" && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoPick}
                aria-label="Photo picker"
              />
              <p className="mt-2 text-muted-foreground">
                Photo saving is not enabled yet.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="qlv2-note">Note (optional)</Label>
            <Textarea
              id="qlv2-note"
              value={form.note}
              onChange={(e) => setField("note", e.target.value)}
              placeholder="What did you observe?"
            />
          </div>

          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Manual sensor snapshot (optional)
            </summary>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="qlv2-temp">Temp (°C)</Label>
                <Input
                  id="qlv2-temp"
                  inputMode="decimal"
                  value={form.temperatureC}
                  onChange={(e) => setField("temperatureC", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="qlv2-rh">RH (%)</Label>
                <Input
                  id="qlv2-rh"
                  inputMode="decimal"
                  value={form.humidityPct}
                  onChange={(e) => setField("humidityPct", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="qlv2-vpd">VPD (kPa)</Label>
                <Input
                  id="qlv2-vpd"
                  inputMode="decimal"
                  value={form.vpdKpa}
                  onChange={(e) => setField("vpdKpa", e.target.value)}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Source: manual. Leave blank to skip.
            </p>
          </details>

          {localError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
            >
              {localError}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function reasonToMessage(reason: string): string {
  switch (reason) {
    case "no_selection":
    case "target_unresolved":
    case "selection_not_found":
      return "Pick a tent or plant first.";
    case "invalid_volume":
      return "Enter a watering volume greater than zero.";
    case "humidity_out_of_range":
      return "Humidity must be between 0 and 100.";
    case "invalid_sensor_value":
      return "Sensor values must be numbers.";
    case "photo_saving_not_enabled":
      return "Photo saving is not enabled yet.";
    case "target_not_owned":
    case "grow_not_owned":
      return "You don't have access to that target.";
    case "not_authenticated":
      return "Sign in to log entries.";
    case "save_failed":
    default:
      return "Could not save. Try again.";
  }
}
