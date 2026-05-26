/**
 * PlantQuickLog — Gate 1 fast manual logging surface.
 *
 * Opens from Plant Detail. Slide-up bottom sheet on mobile / centered modal on
 * desktop. Single scrolling view:
 *   1) Tap-to-add photo (optional)
 *   2) Grower Notes (required)
 *   3) 2x2 grid: Temp °F, Humidity %, pH, EC (all optional, decimals allowed)
 *   4) Full-width "Save to Timeline" button
 *
 * Safety contract is enforced by src/test/plant-quick-log.test.ts — keep this
 * component a presenter writing only to diary_entries + diary-photos storage.
 * Manual sensor values are stored under details.manual_sensor_snapshot with
 * source set to "manual" by the pure helper in src/lib/quickLogRules.ts.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  buildQuickLogInsertDraft,
  type QuickLogSensorInput,
} from "@/lib/quickLogRules";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plantId: string;
  plantName?: string | null;
  growId: string | null;
  tentId?: string | null;
  onSaved?: () => void;
}

const EMPTY_SENSORS: QuickLogSensorInput = { temp: "", humidity: "", ph: "", ec: "" };

export default function PlantQuickLog({
  open,
  onOpenChange,
  plantId,
  plantName,
  growId,
  tentId,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sensors, setSensors] = useState<QuickLogSensorInput>(EMPTY_SENSORS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setNote("");
    setSensors(EMPTY_SENSORS);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (busy) return;
    onOpenChange(next);
    if (!next) resetForm();
  }

  function handleFileSelected(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  function clearPhoto() {
    handleFileSelected(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const canSave = note.trim().length > 0 && !busy && !!growId;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!growId) {
      setError("Missing grow context for this plant.");
      return;
    }

    const result = buildQuickLogInsertDraft({
      plantId,
      plantName,
      growId,
      tentId: tentId ?? null,
      note,
      sensors,
    });
    if (!result.ok) {
      setError("Grower notes are required.");
      return;
    }

    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      if (photoFile && user) {
        const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/${growId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("diary-photos")
          .upload(path, photoFile, {
            contentType: photoFile.type,
            upsert: false,
          });
        if (upErr) {
          setError(`Photo upload failed: ${upErr.message}`);
          return;
        }
        uploadedPath = path;
      }

      const draft = {
        ...result.draft,
        photo_url: uploadedPath,
      };

      // NOTE: no `user_id` in payload — DB default auth.uid() is trusted.
      const { error: insErr } = await supabase
        .from("diary_entries")
        .insert(draft as never);

      if (insErr) {
        if (uploadedPath) {
          await supabase.storage
            .from("diary-photos")
            .remove([uploadedPath])
            .catch(() => {});
        }
        setError(`Couldn't save entry: ${insErr.message}`);
        return;
      }

      toast.success("Saved to timeline 🌱");
      queryClient.invalidateQueries({ queryKey: ["plant_recent_activity"] });
      queryClient.invalidateQueries({ queryKey: ["diary_entries"] });
      window.dispatchEvent(
        new CustomEvent("verdant:entry-created", {
          detail: { plantId, createdAt: new Date().toISOString() },
        }),
      );
      resetForm();
      onOpenChange(false);
      onSaved?.();
    } catch (err: unknown) {
      if (uploadedPath) {
        await supabase.storage
          .from("diary-photos")
          .remove([uploadedPath])
          .catch(() => {});
      }
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border/60 max-h-[92vh] overflow-y-auto rounded-t-2xl sm:max-w-md sm:mx-auto"
        data-testid="plant-quick-log-sheet"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-base">Quick Log</SheetTitle>
          {plantName ? (
            <p className="text-xs text-muted-foreground">{plantName}</p>
          ) : null}
        </SheetHeader>

        <form onSubmit={handleSave} className="grid gap-4 mt-4">
          {/* 1. Photo */}
          <div
            className="relative aspect-[4/3] w-full rounded-xl border-2 border-dashed border-border/60 overflow-hidden bg-secondary/30 hover:border-primary/60 transition"
            data-testid="plant-quick-log-photo-zone"
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 h-full w-full flex flex-col items-center justify-center gap-2 text-muted-foreground"
              aria-label="Tap to add photo"
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Selected"
                  className="h-full w-full object-cover"
                  data-testid="plant-quick-log-photo-preview"
                />
              ) : (
                <>
                  <Camera className="h-10 w-10" />
                  <span className="text-sm">Tap to Add Photo</span>
                  <span className="text-xs text-muted-foreground/70">Optional</span>
                </>
              )}
            </button>
            {photoPreview && (
              <button
                type="button"
                onClick={clearPhoto}
                aria-label="Remove photo"
                data-testid="plant-quick-log-photo-remove"
                className="absolute top-2 right-2 z-10 rounded-full bg-background/85 backdrop-blur p-1.5 border border-border/60 hover:bg-background"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
              data-testid="plant-quick-log-photo-input"
            />
          </div>

          {/* 2. Grower Notes (required) */}
          <div className="grid gap-1.5">
            <Label htmlFor="plant-quick-log-note" className="text-sm">
              Grower Notes (Required)
            </Label>
            <Textarea
              id="plant-quick-log-note"
              data-testid="plant-quick-log-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Watered 1 gallon, raised lights 2 inches..."
              rows={4}
              autoFocus
              required
              className="text-base"
            />
          </div>

          {/* 3. Manual Sensor Snapshot — 2x2 grid, all optional */}
          <fieldset className="grid grid-cols-2 gap-2" data-testid="plant-quick-log-sensors">
            <legend className="sr-only">Manual sensor snapshot (optional)</legend>
            <SensorField
              id="plant-quick-log-temp"
              label="Temp (°F)"
              value={sensors.temp}
              onChange={(v) => setSensors((s) => ({ ...s, temp: v }))}
              inputMode="decimal"
              step="any"
            />
            <SensorField
              id="plant-quick-log-humidity"
              label="Humidity (%)"
              value={sensors.humidity}
              onChange={(v) => setSensors((s) => ({ ...s, humidity: v }))}
              inputMode="decimal"
              step="any"
            />
            <SensorField
              id="plant-quick-log-ph"
              label="pH"
              value={sensors.ph}
              onChange={(v) => setSensors((s) => ({ ...s, ph: v }))}
              inputMode="decimal"
              step="0.1"
            />
            <SensorField
              id="plant-quick-log-ec"
              label="EC"
              value={sensors.ec}
              onChange={(v) => setSensors((s) => ({ ...s, ec: v }))}
              inputMode="decimal"
              step="0.01"
            />
          </fieldset>

          {error && (
            <p
              role="alert"
              data-testid="plant-quick-log-error"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {/* 4. Save */}
          <Button
            type="submit"
            disabled={!canSave}
            data-testid="plant-quick-log-save"
            className={cn(
              "w-full h-12 text-base font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "transition-none",
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save to Timeline"
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface SensorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode: "decimal" | "numeric";
  step: string;
}

function SensorField({ id, label, value, onChange, inputMode, step }: SensorFieldProps) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        data-testid={id}
        type="number"
        inputMode={inputMode}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="text-base"
      />
    </div>
  );
}
