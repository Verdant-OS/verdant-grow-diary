/**
 * PlantQuickLog — Gate 1 fast manual logging surface.
 *
 * Opens from Plant Detail. Slide-up bottom sheet on mobile / centered modal on
 * desktop. Single scrolling view:
 *   1) Plant context
 *   2) What changed: grow action chips + optional note detail
 *   3) Response after last change: Better/Same/Worse when this is a follow-up
 *   4) Optional photo + manual readings
 *   5) Sticky mobile-safe "Save log" button
 *
 * Safety contract is enforced by src/test/plant-quick-log.test.ts — keep this
 * component a presenter writing only to diary_entries + diary-photos storage.
 * Manual sensor values are stored under details.manual_sensor_snapshot with
 * source set to "manual" by the pure helper in src/lib/quickLogRules.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
  buildManualSensorSnapshot,
  buildQuickLogInsertDraft,
  parseOptionalNumber,
  type QuickLogSensorInput,
} from "@/lib/quickLogRules";
import {
  computeChronologyDelta,
  type ChronologyDelta,
} from "@/lib/manualSensorChronologyDeltaRules";
import type { ManualSensorMetric } from "@/lib/manualSensorFreshnessRules";
import { usePlantManualSensorLogs } from "@/hooks/usePlantManualSensorHistory";
import { buildQuickLogPhotoGateState } from "@/lib/quickLogPhotoGateRules";
import {
  QUICK_LOG_ACTION_CHIPS,
  RESPONSE_CHECK_STATUSES,
  applyQuickLogActionChip,
  applyResponseCheck,
  hasResponseCheck,
  type QuickLogActionChip,
  type ResponseCheckStatus,
} from "@/lib/tenSecondQuickCheckRules";

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
const SAVE_DETAIL_HELPER = "You can add more detail later from the timeline.";

function buildTimelineNote(rawNote: string, hasPhoto: boolean, hasManualReadings: boolean): string {
  const note = rawNote.trim();
  if (note) return note;
  if (hasPhoto) return "Photo attached from Quick Log.";
  if (hasManualReadings) return "Manual readings captured from Quick Log.";
  return "";
}

function blurActiveElement() {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

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
  const libraryFileRef = useRef<HTMLInputElement | null>(null);
  const { data: logs } = usePlantManualSensorLogs(open ? plantId : null);
  const photoGate = useMemo(() => buildQuickLogPhotoGateState(), []);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sensors, setSensors] = useState<QuickLogSensorInput>(EMPTY_SENSORS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentCapturedAt = useMemo(
    () => new Date().toISOString(),
    [open, logs],
  );

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const hasManualReadings = !!buildManualSensorSnapshot(sensors);
  const hasPhoto = !!photoFile;
  const hasPlantResponseCheck = hasResponseCheck(note);
  const timelineNote = buildTimelineNote(note, hasPhoto, hasManualReadings);
  const hasAnyContent = timelineNote.trim().length > 0;
  const canSave = hasAnyContent && !busy && !!growId;

  const saveHelper = !growId
    ? "Missing grow context. This plant needs a grow before saving."
    : busy
      ? "Saving this log to the timeline…"
      : !hasAnyContent
        ? "Tap what changed, add a photo, or add a manual reading."
        : hasPlantResponseCheck
          ? "Ready to save this plant response follow-up."
          : hasPhoto
            ? "Ready to save this photo and log to the timeline."
            : hasManualReadings
              ? "Ready to save these manual readings to the timeline."
              : "Ready to save what changed to the timeline.";

  function deltaFor(metric: ManualSensorMetric, raw: string): ChronologyDelta | null {
    const current = parseOptionalNumber(raw);
    return computeChronologyDelta(metric, current, currentCapturedAt, logs ?? []);
  }

  function resetForm() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setNote("");
    setSensors(EMPTY_SENSORS);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    if (libraryFileRef.current) libraryFileRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (busy) return;
    onOpenChange(next);
    if (!next) resetForm();
  }

  function handleFileSelected(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setError(null);
  }

  function handlePhotoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0] ?? null;
    if (!file) return;
    handleFileSelected(file);
    e.currentTarget.value = "";
  }

  function clearPhoto() {
    handleFileSelected(null);
    if (fileRef.current) fileRef.current.value = "";
    if (libraryFileRef.current) libraryFileRef.current.value = "";
  }

  function handleResponseCheck(status: ResponseCheckStatus) {
    setNote((prev) => applyResponseCheck(prev, status));
    setError(null);
  }

  function handleActionChip(chip: QuickLogActionChip) {
    if (chip === "Photo only" && !hasPhoto) {
      setError("Add a photo before marking this as photo only.");
      return;
    }
    setNote((prev) => applyQuickLogActionChip(prev, chip));
    setError(null);
  }

  async function handleSave() {
    if (busy) return;
    blurActiveElement();
    setError(null);

    if (!growId) {
      setError("Missing grow context for this plant.");
      return;
    }

    if (!hasAnyContent) {
      setError("Add what changed, a photo, or a reading before saving.");
      return;
    }

    if (photoFile && !user) {
      setError("Sign in to attach photos.");
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
          console.error("PlantQuickLog photo upload failed", upErr);
          setError("Could not save this log. Check connection and try again.");
          return;
        }
        uploadedPath = path;
      }

      const result = buildQuickLogInsertDraft({
        plantId,
        plantName,
        growId,
        tentId: tentId ?? null,
        note: timelineNote,
        photoPath: uploadedPath,
        sensors,
      });
      if (!result.ok) {
        if (uploadedPath) {
          await supabase.storage
            .from("diary-photos")
            .remove([uploadedPath])
            .catch(() => {});
        }
        setError("Add what changed, a photo, or a reading before saving.");
        return;
      }

      const { error: insErr } = await supabase
        .from("diary_entries")
        .insert(result.draft as never);

      if (insErr) {
        console.error("PlantQuickLog diary insert failed", insErr);
        if (uploadedPath) {
          await supabase.storage
            .from("diary-photos")
            .remove([uploadedPath])
            .catch(() => {});
        }
        setError("Could not save this log. Check connection and try again.");
        return;
      }

      toast.success("Log saved to timeline.");
      queryClient.invalidateQueries({ queryKey: ["plant_recent_activity"] });
      queryClient.invalidateQueries({ queryKey: ["diary_entries"] });
      queryClient.invalidateQueries({ queryKey: ["plant_manual_sensor_history"] });
      window.dispatchEvent(
        new CustomEvent("verdant:entry-created", {
          detail: { plantId, createdAt: new Date().toISOString() },
        }),
      );
      resetForm();
      onOpenChange(false);
      onSaved?.();
    } catch (err: unknown) {
      console.error("PlantQuickLog save failed", err);
      if (uploadedPath) {
        await supabase.storage
          .from("diary-photos")
          .remove([uploadedPath])
          .catch(() => {});
      }
      setError("Could not save this log. Check connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border/60 max-h-[92vh] overflow-y-auto rounded-t-2xl pb-0 sm:max-w-md sm:mx-auto"
        data-testid="plant-quick-log-sheet"
        aria-describedby="plant-quick-log-subtitle"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-base">Quick Log</SheetTitle>
          <p id="plant-quick-log-subtitle" className="text-sm text-muted-foreground">
            Capture what changed. Better/Same/Worse is for the plant response afterward.
          </p>
        </SheetHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="grid gap-4 mt-4"
        >
          <section
            className="rounded-xl border border-border/50 bg-secondary/10 p-3"
            aria-labelledby="plant-quick-log-plant-heading"
            data-testid="plant-quick-log-plant-section"
          >
            <h3 id="plant-quick-log-plant-heading" className="text-sm font-semibold">
              1. Plant
            </h3>
            <p className="mt-1 text-sm text-foreground" aria-label="Selected plant for this Quick Log">
              {plantName || "Selected plant"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This log will attach to the current plant timeline.
            </p>
          </section>

          <section
            className="grid gap-3"
            aria-labelledby="plant-quick-log-action-heading"
            data-testid="plant-quick-log-observation-section"
          >
            <div>
              <h3 id="plant-quick-log-action-heading" className="text-sm font-semibold">
                2. What changed?
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Tap the grow action. This is the thing the plant will respond to.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Quick Log grow action">
              {QUICK_LOG_ACTION_CHIPS.map((chip) => (
                <Button
                  key={chip}
                  type="button"
                  variant="outline"
                  aria-label={`Log action ${chip}`}
                  data-testid={`plant-quick-log-action-${chip.toLowerCase().replace(/\s*\/\s*/g, "-").replace(/\s+/g, "-")}`}
                  onClick={() => handleActionChip(chip)}
                  className="min-h-11 rounded-xl px-2 text-sm font-semibold"
                >
                  {chip}
                </Button>
              ))}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plant-quick-log-note" className="text-sm">
                Grower notes (optional)
              </Label>
              <Textarea
                id="plant-quick-log-note"
                data-testid="plant-quick-log-note"
                aria-label="Quick Log grow action note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setError(null);
                }}
                placeholder="Example: Watered 1 gal, raised light, spotted yellow tips..."
                rows={4}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
                Quick Log captures what changed. Verdant can ask how she responded later.
              </p>
            </div>
          </section>

          <section
            className="grid gap-3 rounded-xl border border-border/50 bg-secondary/10 p-3"
            aria-labelledby="plant-quick-log-response-heading"
            data-testid="plant-quick-log-response-section"
          >
            <div>
              <h3 id="plant-quick-log-response-heading" className="text-sm font-semibold">
                3. Response follow-up
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use this when you are checking how the plant responded after a previous change.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Plant response after a previous change">
              {RESPONSE_CHECK_STATUSES.map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant="outline"
                  aria-label={`Response check ${status}`}
                  data-testid={`plant-response-check-${status.toLowerCase()}`}
                  onClick={() => handleResponseCheck(status)}
                  className="min-h-12 rounded-xl px-2 text-base font-semibold"
                >
                  {status}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Better/Same/Worse records the plant response, not the grow action.
            </p>
          </section>

          <section
            className="grid gap-4"
            aria-labelledby="plant-quick-log-optional-heading"
            data-testid="plant-quick-log-optional-section"
          >
            <div>
              <h3 id="plant-quick-log-optional-heading" className="text-sm font-semibold">
                4. Optional details
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a photo or manual readings only if they help.
              </p>
            </div>

            <div className="grid gap-2" data-testid="plant-quick-log-photo-zone">
              <Label className="text-sm">Photo</Label>
              {photoPreview ? (
                <div className="relative aspect-[4/3] w-full rounded-xl border-2 border-dashed border-border/60 overflow-hidden bg-secondary/30">
                  <img
                    src={photoPreview}
                    alt="Selected Quick Log photo preview"
                    className="h-full w-full object-cover"
                    data-testid="plant-quick-log-photo-preview"
                  />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    aria-label="Remove photo"
                    data-testid="plant-quick-log-photo-remove"
                    className="absolute top-2 right-2 z-10 rounded-full bg-background/85 backdrop-blur p-1.5 border border-border/60 hover:bg-background"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      data-testid="plant-quick-log-take-photo-button"
                      aria-label={photoGate.takePhotoLabel}
                      aria-controls="plant-quick-log-photo-input"
                      className="h-12"
                    >
                      <Camera className="h-4 w-4 mr-2" aria-hidden="true" />
                      {photoGate.takePhotoLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => libraryFileRef.current?.click()}
                      data-testid="plant-quick-log-choose-library-button"
                      aria-label={photoGate.chooseLibraryLabel}
                      aria-controls="plant-quick-log-photo-library-input"
                      className="h-12"
                    >
                      {photoGate.chooseLibraryLabel}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A photo can be enough for today.
                  </p>
                </div>
              )}
              <input
                ref={fileRef}
                id="plant-quick-log-photo-input"
                name="plant-quick-log-photo-camera"
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label={photoGate.cameraInputAriaLabel}
                tabIndex={-1}
                onChange={handlePhotoInputChange}
                data-testid="plant-quick-log-photo-input"
              />
              <input
                ref={libraryFileRef}
                id="plant-quick-log-photo-library-input"
                name="plant-quick-log-photo-library"
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label={photoGate.libraryInputAriaLabel}
                tabIndex={-1}
                onChange={handlePhotoInputChange}
                data-testid="plant-quick-log-photo-library-input"
              />
            </div>

            <fieldset
              className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-secondary/10 p-3"
              data-testid="plant-quick-log-sensors"
              aria-describedby="plant-quick-log-manual-readings-helper"
            >
              <legend className="col-span-2 mb-1 text-sm font-medium">
                Manual readings
              </legend>
              <p
                id="plant-quick-log-manual-readings-helper"
                className="col-span-2 mb-1 text-xs text-muted-foreground"
              >
                Optional. Manual readings are not live sensor data.
              </p>
              <SensorField
                id="plant-quick-log-temp"
                label="Temp (°F)"
                value={sensors.temp}
                onChange={(v) => {
                  setSensors((s) => ({ ...s, temp: v }));
                  setError(null);
                }}
                inputMode="decimal"
                step="any"
                delta={deltaFor("temp_f", sensors.temp)}
              />
              <SensorField
                id="plant-quick-log-humidity"
                label="Humidity (%)"
                value={sensors.humidity}
                onChange={(v) => {
                  setSensors((s) => ({ ...s, humidity: v }));
                  setError(null);
                }}
                inputMode="decimal"
                step="any"
                delta={deltaFor("humidity_percent", sensors.humidity)}
              />
              <SensorField
                id="plant-quick-log-ph"
                label="pH"
                value={sensors.ph}
                onChange={(v) => {
                  setSensors((s) => ({ ...s, ph: v }));
                  setError(null);
                }}
                inputMode="decimal"
                step="0.1"
                delta={deltaFor("ph", sensors.ph)}
              />
              <SensorField
                id="plant-quick-log-ec"
                label="EC"
                value={sensors.ec}
                onChange={(v) => {
                  setSensors((s) => ({ ...s, ec: v }));
                  setError(null);
                }}
                inputMode="decimal"
                step="0.01"
                delta={deltaFor("ec", sensors.ec)}
              />
            </fieldset>
          </section>

          {error && (
            <p
              role="alert"
              aria-live="assertive"
              data-testid="plant-quick-log-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="sticky bottom-0 z-10 -mx-6 border-t border-border/50 bg-background/95 px-6 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
            <p
              id="plant-quick-log-save-helper"
              data-testid="plant-quick-log-save-helper"
              className="mb-1 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {saveHelper}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              {SAVE_DETAIL_HELPER}
            </p>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
              data-testid="plant-quick-log-save"
              aria-label="Save Quick Log"
              aria-describedby="plant-quick-log-save-helper"
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
                "Save log"
              )}
            </Button>
          </div>
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
  delta: ChronologyDelta | null;
}

function SensorField({ id, label, value, onChange, inputMode, step, delta }: SensorFieldProps) {
  const deltaTone =
    delta?.direction === "up"
      ? "text-primary"
      : delta?.direction === "down"
        ? "text-amber-400/90"
        : "text-muted-foreground";
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
      {delta && (
        <span
          data-testid={`${id}-delta`}
          data-direction={delta.direction}
          className={cn("text-[10px] leading-tight", deltaTone)}
        >
          {delta.label}
        </span>
      )}
    </div>
  );
}
