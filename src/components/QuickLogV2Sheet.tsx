import { useState, useEffect, useMemo, useRef, type ChangeEvent } from "react";
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

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { usePlants } from "@/hooks/use-plants";
import { useTents } from "@/hooks/use-tents";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";

import {
  buildQuickLogV2TargetOptions,
  resolveQuickLogV2Target,
  shouldShowVolumeField,
  EMPTY_QUICKLOG_V2_FORM,
  type QuickLogV2FormState,
  type QuickLogV2Action,
} from "@/lib/quickLogV2Rules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";
import { buildQuickLogPhotoGateState } from "@/lib/quickLogPhotoGateRules";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTargetKey?: string | null;
}

const NOTE_LIMIT = 500;

export default function QuickLogV2Sheet({
  open,
  onOpenChange,
  defaultTargetKey,
}: Props) {
  const { user } = useAuth();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const plantsQ = usePlants() as {
    data?: unknown[];
    isLoading?: boolean;
    isError?: boolean;
    refetch?: () => void;
  };
  const tentsQ = useTents() as {
    data?: unknown[];
    isLoading?: boolean;
    isError?: boolean;
    refetch?: () => void;
  };
  const plants = (plantsQ.data as Parameters<typeof buildQuickLogV2TargetOptions>[1]) ?? [];
  const tents = (tentsQ.data as Parameters<typeof buildQuickLogV2TargetOptions>[0]) ?? [];
  const queryClient = useQueryClient();
  const { save, saving } = useQuickLogV2Save();

  const [form, setForm] = useState<QuickLogV2FormState>(EMPTY_QUICKLOG_V2_FORM);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const options = useMemo(
    () => buildQuickLogV2TargetOptions(tents, plants),
    [tents, plants],
  );

  const isLoadingContext = Boolean(plantsQ.isLoading || tentsQ.isLoading);
  const hasFetchError = Boolean(plantsQ.isError || tentsQ.isError);
  const hasNoTargets =
    !isLoadingContext && !hasFetchError && options.length === 0;
  const contextBlocked = isLoadingContext || hasFetchError || hasNoTargets;
  const selectedTargetMissing = !contextBlocked && !form.selectedKey;
  const noteLength = form.note.length;
  const volumeMissing = form.action === "water" && form.volumeMl.trim() === "";
  const saveHelper = getSaveHelperMessage({
    contextBlocked,
    isLoadingContext,
    hasFetchError,
    hasNoTargets,
    selectedTargetMissing,
    volumeMissing,
    saving,
  });

  function resetPhotoSelection() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  }

  useEffect(() => {
    if (open) {
      setForm({
        ...EMPTY_QUICKLOG_V2_FORM,
        selectedKey: defaultTargetKey ?? null,
      });
      setLocalError(null);
      setSaveStatus("");
      resetPhotoSelection();
    }
  }, [open, defaultTargetKey]);

  const setField = <K extends keyof QuickLogV2FormState>(
    k: K,
    v: QuickLogV2FormState[K],
  ) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleAction = (a: QuickLogV2Action) => {
    setField("action", a);
    setLocalError(null);
    setSaveStatus("");
  };

  const photoGate = useMemo(() => buildQuickLogPhotoGateState(), []);

  function handlePhotoSelected(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setLocalError(null);
    setSaveStatus(file ? "Photo selected. Add a note if helpful, then save." : "");
  }

  function handlePhotoInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0] ?? null;
    if (!file) return;
    handlePhotoSelected(file);
    e.currentTarget.value = "";
  }

  async function uploadQuickLogPhoto(growId: string): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
    if (!photoFile) return { ok: false, message: "No photo selected." };
    if (!user) return { ok: false, message: "Sign in to attach photos." };
    const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/${growId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("diary-photos")
      .upload(path, photoFile, {
        contentType: photoFile.type,
        upsert: false,
      });
    if (error) return { ok: false, message: `Photo upload failed: ${error.message}` };
    return { ok: true, path };
  }

  async function createPhotoDiaryEntry(input: {
    growId: string;
    tentId: string | null;
    plantId: string | null;
    photoPath: string;
  }): Promise<{ ok: true } | { ok: false; message: string }> {
    const note = form.note.trim() || "Photo attached from Quick Log.";
    const { error } = await supabase
      .from("diary_entries")
      .insert({
        grow_id: input.growId,
        tent_id: input.tentId,
        plant_id: input.plantId,
        note,
        photo_url: input.photoPath,
        entry_at: new Date().toISOString(),
        details: {
          event_type: "quicklog_photo_attachment",
          source: "manual",
          attached_to_action: form.action,
        },
      } as never);
    if (error) return { ok: false, message: `Photo diary entry failed: ${error.message}` };
    return { ok: true };
  }

  const handleSave = async () => {
    setLocalError(null);
    setSaveStatus("");
    const resolved = resolveQuickLogV2Target(options, form.selectedKey);
    if (!resolved.ok) {
      setLocalError("Choose a plant or tent before saving.");
      return;
    }

    let uploadedPath: string | null = null;
    if (photoFile) {
      if (!resolved.growId) {
        setLocalError("Choose a target with grow context before attaching a photo.");
        return;
      }
      setSaveStatus("Uploading photo…");
      const upload = await uploadQuickLogPhoto(resolved.growId);
      if (!upload.ok) {
        setLocalError((upload as { message: string }).message);
        setSaveStatus("");
        return;
      }
      uploadedPath = upload.path;
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
      if (uploadedPath) {
        await supabase.storage.from("diary-photos").remove([uploadedPath]).catch(() => {});
      }
      setLocalError(reasonToMessage(built.reason));
      setSaveStatus("");
      return;
    }

    setSaveStatus("Saving log…");
    const res = await save(built.payload);
    if (!res.ok) {
      if (uploadedPath) {
        await supabase.storage.from("diary-photos").remove([uploadedPath]).catch(() => {});
      }
      setLocalError(reasonToMessage(res.reason || "save_failed"));
      setSaveStatus("");
      return;
    }

    if (uploadedPath && resolved.growId) {
      const photoEntry = await createPhotoDiaryEntry({
        growId: resolved.growId,
        tentId: resolved.tentId ?? null,
        plantId: resolved.plantId ?? null,
        photoPath: uploadedPath,
      });
      if (!photoEntry.ok) {
        setLocalError((photoEntry as { message: string }).message);
        setSaveStatus("");
        return;
      }
    }

    const successMessage = photoFile ? "Log and photo saved" : "Log saved";
    setSaveStatus(successMessage);
    toast.success(successMessage);
    applyQuickLogV2Refresh(queryClient, {
      targetType: resolved.targetType as "plant" | "tent",
      targetId: resolved.targetId as string,
      tentId: resolved.tentId ?? null,
    });
    resetPhotoSelection();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto text-base"
        aria-describedby="qlv2-sheet-description"
      >
        <SheetHeader>
          <SheetTitle>Quick Log</SheetTitle>
          <p id="qlv2-sheet-description" className="text-sm text-muted-foreground">
            Capture what changed. Add detail only if it helps.
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {isLoadingContext && (
            <div
              role="status"
              data-testid="qlv2-context-loading"
              className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
            >
              Loading your plants and tents…
            </div>
          )}
          {hasFetchError && (
            <div
              role="alert"
              aria-live="assertive"
              data-testid="qlv2-context-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between gap-2"
            >
              <span>Could not load your plants and tents.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="qlv2-context-retry"
                aria-label="Retry loading plants and tents"
                onClick={() => {
                  plantsQ.refetch?.();
                  tentsQ.refetch?.();
                }}
              >
                Retry
              </Button>
            </div>
          )}
          {hasNoTargets && (
            <div
              role="status"
              data-testid="qlv2-context-empty"
              className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2"
            >
              <p className="text-foreground">
                No plants or tents are available for this log.
              </p>
              <p className="text-muted-foreground">
                Add a plant or tent first, then come back to Quick Log.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href="/plants"
                  data-testid="qlv2-context-empty-add-plant"
                  className="text-sm px-3 min-h-11 inline-flex items-center rounded-md border border-border/60 hover:bg-secondary/60 touch-manipulation"
                >
                  Add a plant
                </a>
                <a
                  href="/tents"
                  data-testid="qlv2-context-empty-add-tent"
                  className="text-sm px-3 min-h-11 inline-flex items-center rounded-md border border-border/60 hover:bg-secondary/60 touch-manipulation"
                >
                  Add a tent
                </a>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="qlv2-target">Target</Label>
            <Select
              value={form.selectedKey ?? ""}
              onValueChange={(v) => {
                setField("selectedKey", v);
                setLocalError(null);
                setSaveStatus("");
              }}
              disabled={contextBlocked}
            >
              <SelectTrigger
                id="qlv2-target"
                aria-label="Choose plant or tent for this Quick Log"
                aria-describedby="qlv2-target-help"
              >
                <SelectValue
                  placeholder={
                    isLoadingContext
                      ? "Loading…"
                      : hasFetchError
                        ? "Could not load targets"
                        : hasNoTargets
                          ? "No plants or tents yet"
                          : "Choose a tent or plant"
                  }
                />
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
            <p id="qlv2-target-help" className="mt-1 text-sm text-muted-foreground">
              Choose where this log belongs.
            </p>
            {selectedTargetMissing && (
              <p className="mt-2 rounded-md border border-border/60 bg-secondary/20 p-2 text-sm text-muted-foreground" data-testid="qlv2-missing-target-help">
                Start by choosing a plant or tent above.
              </p>
            )}
          </div>

          <div>
            <Label>Action</Label>
            <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label="Quick Log action type">
              <Button
                type="button"
                variant={form.action === "water" ? "default" : "outline"}
                aria-label="Log watering"
                onClick={() => handleAction("water")}
              >
                Water
              </Button>
              <Button
                type="button"
                variant={form.action === "note" ? "default" : "outline"}
                aria-label="Log observation note"
                onClick={() => handleAction("note")}
              >
                Note
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
                aria-describedby="qlv2-volume-help"
                onChange={(e) => {
                  setField("volumeMl", e.target.value);
                  setLocalError(null);
                }}
                placeholder="e.g. 500"
              />
              <p id="qlv2-volume-help" className="mt-1 text-sm text-muted-foreground">
                Required for watering logs. Use milliliters.
              </p>
              {volumeMissing && (
                <p className="mt-2 rounded-md border border-border/60 bg-secondary/20 p-2 text-sm text-muted-foreground" data-testid="qlv2-missing-volume-help">
                  Enter the amount watered before saving.
                </p>
              )}
            </div>
          )}

          <div className="rounded-md border border-border p-3" data-testid="qlv2-photo-attachment">
            <Label>Photo attachment</Label>
            {photoPreview ? (
              <div className="mt-2 space-y-2">
                <img
                  src={photoPreview}
                  alt="Selected Quick Log photo preview"
                  className="aspect-[4/3] w-full rounded-md object-cover"
                  data-testid="qlv2-photo-preview"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetPhotoSelection}
                  data-testid="qlv2-photo-remove"
                  aria-label="Remove selected Quick Log photo"
                >
                  Remove photo
                </Button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    aria-controls="qlv2-photo-camera-input"
                    aria-label={photoGate.cameraInputAriaLabel}
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    {photoGate.takePhotoLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    aria-controls="qlv2-photo-library-input"
                    aria-label={photoGate.libraryInputAriaLabel}
                    onClick={() => libraryInputRef.current?.click()}
                  >
                    {photoGate.chooseLibraryLabel}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">{photoGate.pickerHelperText}</p>
              </div>
            )}
            <input
              ref={cameraInputRef}
              id="qlv2-photo-camera-input"
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label={photoGate.cameraInputAriaLabel}
              tabIndex={-1}
              onChange={handlePhotoInputChange}
              data-testid="qlv2-photo-camera-input"
            />
            <input
              ref={libraryInputRef}
              id="qlv2-photo-library-input"
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={photoGate.libraryInputAriaLabel}
              tabIndex={-1}
              onChange={handlePhotoInputChange}
              data-testid="qlv2-photo-library-input"
            />
          </div>

          <div>
            <Label htmlFor="qlv2-note">Note (optional)</Label>
            <Textarea
              id="qlv2-note"
              value={form.note}
              maxLength={NOTE_LIMIT}
              aria-describedby="qlv2-note-helper qlv2-note-count"
              onChange={(e) => setField("note", e.target.value)}
              placeholder="What did you observe?"
            />
            <div className="mt-1 flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <p id="qlv2-note-helper">Keep it short. Add more detail later from the timeline.</p>
              <p id="qlv2-note-count" aria-live="polite">{noteLength}/{NOTE_LIMIT}</p>
            </div>
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
            <p className="mt-2 text-sm text-muted-foreground">
              Source: manual. Leave blank to skip.
            </p>
          </details>

          {localError && (
            <div
              role="alert"
              aria-live="assertive"
              data-testid="qlv2-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
            >
              {localError}
            </div>
          )}

          <div className="sr-only" aria-live="polite" data-testid="qlv2-save-status">
            {saveStatus}
          </div>

          <div className="space-y-2 pt-2">
            <p id="qlv2-save-helper" className="text-sm text-muted-foreground" data-testid="qlv2-save-helper">
              {saveHelper}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                aria-label="Cancel Quick Log"
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={handleSave}
                disabled={saving || contextBlocked}
                aria-describedby="qlv2-save-helper"
                aria-label="Save Quick Log"
                data-testid="qlv2-save"
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function getSaveHelperMessage(input: {
  contextBlocked: boolean;
  isLoadingContext: boolean;
  hasFetchError: boolean;
  hasNoTargets: boolean;
  selectedTargetMissing: boolean;
  volumeMissing: boolean;
  saving: boolean;
}): string {
  if (input.saving) return "Saving your Quick Log…";
  if (input.isLoadingContext) return "Loading plants and tents before saving.";
  if (input.hasFetchError) return "Retry loading plants and tents before saving.";
  if (input.hasNoTargets) return "Add a plant or tent before saving a Quick Log.";
  if (input.selectedTargetMissing) return "Choose a plant or tent before saving.";
  if (input.volumeMissing) return "Watering logs need a volume before they can save.";
  return "Ready to save when this log matches what happened.";
}

function reasonToMessage(reason: string): string {
  switch (reason) {
    case "no_selection":
    case "target_unresolved":
    case "selection_not_found":
      return "Choose a plant or tent before saving.";
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
      return "You do not have access to that target.";
    case "not_authenticated":
      return "Sign in to log entries.";
    case "save_failed":
    default:
      return "Could not save. Try again.";
  }
}
