import { useState, useEffect, useRef, useCallback, useMemo, type ChangeEvent } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  ImagePlus,
  Droplets,
  FileText,
  Eye,
  Sprout,
  Utensils,
  Loader2,
  Scissors,
} from "lucide-react";

import { createQuickLogEvent, type QuickLogEventType } from "@/lib/quick-log/createQuickLogEvent";
import { fetchLatestSensorSnapshot } from "@/lib/quick-log/fetchLatestSensorSnapshot";
import type { QuickLogSensorSnapshot } from "@/lib/quick-log/createQuickLogEvent";
import {
  getQuickLogActivityDetailFields,
  sanitizeQuickLogActivityDetails,
  QUICK_LOG_DETAIL_TEXT_MAX,
} from "@/lib/quick-log/quickLogActivityDetailFields";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import MetricChip from "@/components/MetricChip";
import { cn } from "@/lib/utils";

interface PlantOption {
  id: string;
  name: string;
}

export interface QuickLogModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tentId: string;
  growId: string;
  tentName: string;
  plants: PlantOption[];
}

const EVENT_TYPES: {
  type: QuickLogEventType;
  label: string;
  icon: React.ReactNode;
  variant: "default" | "outline";
}[] = [
  { type: "observe", label: "Observe", icon: <Eye className="h-4 w-4" />, variant: "outline" },
  { type: "water", label: "Water", icon: <Droplets className="h-4 w-4" />, variant: "outline" },
  { type: "feed", label: "Feed", icon: <Utensils className="h-4 w-4" />, variant: "outline" },
  { type: "photo", label: "Photo", icon: <Camera className="h-4 w-4" />, variant: "outline" },
  { type: "note", label: "Note", icon: <FileText className="h-4 w-4" />, variant: "outline" },
  { type: "training", label: "Training", icon: <Scissors className="h-4 w-4" />, variant: "outline" },
];

const TRAINING_TECHNIQUE_FIELD = getQuickLogActivityDetailFields("training")[0];
const TRAINING_INTENSITY_FIELD = getQuickLogActivityDetailFields("training")[1];
const PHOTO_SUBJECT_FIELD = getQuickLogActivityDetailFields("photo")[0];

export default function QuickLogModal({
  open,
  onOpenChange,
  tentId,
  growId,
  tentName,
  plants,
}: QuickLogModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const [eventType, setEventType] = useState<QuickLogEventType>("observe");
  const [plantId, setPlantId] = useState<string>("");
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sensorSnapshot, setSensorSnapshot] = useState<QuickLogSensorSnapshot | null>(null);
  const [sensorLoading, setSensorLoading] = useState(false);
  const [technique, setTechnique] = useState("");
  const [intensity, setIntensity] = useState("");
  const [subject, setSubject] = useState("");
  const [caption, setCaption] = useState("");

  const resetForm = useCallback(() => {
    setEventType("observe");
    setPlantId("");
    setNote("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setSensorSnapshot(null);
    setSensorLoading(false);
    setTechnique("");
    setIntensity("");
    setSubject("");
    setCaption("");
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  }, []);

  // Intensity only applies to technique="defoliation" (see
  // quickLogActivityDetailFields.ts's dependsOn gate) — clear it whenever the
  // grower picks a different technique so a prior selection can never leak
  // into a save it doesn't apply to. The sanitizer drops a mismatched pair
  // defensively too; this just keeps the visible form state honest.
  useEffect(() => {
    if (technique !== "defoliation" && intensity !== "") setIntensity("");
  }, [technique, intensity]);

  // Reset form when modal opens and fetch sensor snapshot
  useEffect(() => {
    if (open) {
      resetForm();
      if (tentId) {
        setSensorLoading(true);
        fetchLatestSensorSnapshot(tentId)
          .then((snapshot) => {
            setSensorSnapshot(snapshot);
            setSensorLoading(false);
          })
          .catch(() => {
            setSensorSnapshot(null);
            setSensorLoading(false);
          });
      }
    }
  }, [open, tentId, resetForm]);

  const handlePhotoSelected = (file: File | null) => {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handlePhotoInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0] ?? null;
    handlePhotoSelected(file);
    e.currentTarget.value = "";
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile || !user) return null;
    const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/${growId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("diary-photos")
      .upload(path, photoFile, {
        contentType: photoFile.type,
        upsert: false,
      });
    if (error) {
      toast.error(`Photo upload failed: ${error.message}`);
      return null;
    }
    return path;
  };

  const handleSave = async () => {
    if (saving) return; // belt-and-suspenders against double-submit
    setSaving(true);
    let uploadedPath: string | null = null;
    // One idempotency key per save attempt; reused implicitly on synchronous
    // retries via the disabled-button guard.
    const idempotencyKey =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `ql-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      if (photoFile) {
        uploadedPath = await uploadPhoto();
        if (!uploadedPath) {
          // uploadPhoto already toasted the failure. Block save cleanly.
          setSaving(false);
          return;
        }
      }

      const extraDetails = sanitizeQuickLogActivityDetails(eventType, {
        technique,
        intensity,
        subject,
        caption,
      });

      await createQuickLogEvent({
        growId,
        tentId,
        plantId: plantId || undefined,
        eventType,
        note: note.trim() || undefined,
        photoUrl: uploadedPath ?? undefined,
        idempotencyKey,
        extraDetails,
      });

      toast.success("Log saved");
      queryClient.invalidateQueries({ queryKey: ["grow_events"] });
      queryClient.invalidateQueries({ queryKey: ["diary_entries"] });
      queryClient.invalidateQueries({ queryKey: ["sensor_readings"] });
      onOpenChange(false);
      resetForm();
    } catch (err) {
      // Clean up orphan storage object so a failed save does not leak files.
      if (uploadedPath) {
        try {
          await supabase.storage.from("diary-photos").remove([uploadedPath]);
        } catch (cleanupErr) {
          console.error("QuickLog photo cleanup failed:", cleanupErr);
        }
      }
      const message =
        err instanceof Error ? err.message : "Could not save your log. Please try again.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };


  const selectedPlantName = plants.find((p) => p.id === plantId)?.name ?? null;

  // Technique is required for a training save to mean anything — mirrors
  // quickLogTypedEventPayloadRules.ts's own technique:missing invariant for
  // the same concept. A Photo save with no attached file is the same class
  // of problem: sanitizeQuickLogActivityDetails still stamps
  // event_type: "photo" onto the row with no photo_url, so History renders
  // a missing-image card for a photo that was never taken.
  const missingRequiredDetail =
    (eventType === "training" && !technique) || (eventType === "photo" && !photoFile);

  const metricChips = useMemo(() => {
    if (!sensorSnapshot?.metrics) return [];
    return Object.entries(sensorSnapshot.metrics).map(([metric, value]) => ({
      metric,
      value: value.toFixed(1),
    }));
  }, [sensorSnapshot]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto text-base"
        aria-describedby="quick-log-modal-description"
      >
        <SheetHeader>
          <SheetTitle>Quick Log</SheetTitle>
          <p id="quick-log-modal-description" className="text-sm text-muted-foreground">
            {tentName} — capture what just happened.
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Plant selector */}
          <div>
            <Label htmlFor="qlm-plant">Plant (optional)</Label>
            <Select value={plantId} onValueChange={setPlantId}>
              <SelectTrigger id="qlm-plant">
                <SelectValue placeholder="All plants in tent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All plants in tent</SelectItem>
                {plants.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <Sprout className="h-3.5 w-3.5" />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPlantName && (
              <p className="mt-1 text-xs text-muted-foreground">
                Logging for: {selectedPlantName}
              </p>
            )}
          </div>

          {/* Event type */}
          <div>
            <Label>What happened?</Label>
            <div className="mt-1 grid grid-cols-3 sm:grid-cols-5 gap-2" role="group" aria-label="Event type">
              {EVENT_TYPES.map((et) => (
                <Button
                  key={et.type}
                  type="button"
                  variant={eventType === et.type ? "default" : "outline"}
                  aria-label={et.label}
                  onClick={() => setEventType(et.type)}
                  className={cn(
                    "flex-col gap-1 h-auto py-2",
                    eventType === et.type && "gradient-leaf text-primary-foreground",
                  )}
                >
                  {et.icon}
                  <span className="text-[11px]">{et.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Training detail */}
          {eventType === "training" && TRAINING_TECHNIQUE_FIELD && TRAINING_INTENSITY_FIELD && (
            <div className="rounded-md border border-border p-3" data-testid="qlm-training-detail">
              <Label htmlFor="qlm-technique">{TRAINING_TECHNIQUE_FIELD.label}</Label>
              <Select value={technique} onValueChange={setTechnique}>
                <SelectTrigger id="qlm-technique" data-testid="qlm-technique">
                  <SelectValue placeholder="Select a technique" />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_TECHNIQUE_FIELD.options?.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {technique === "defoliation" && (
                <div className="mt-3">
                  <Label htmlFor="qlm-intensity">{TRAINING_INTENSITY_FIELD.label}</Label>
                  <Select value={intensity} onValueChange={setIntensity}>
                    <SelectTrigger id="qlm-intensity" data-testid="qlm-intensity">
                      <SelectValue placeholder="Select an amount" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAINING_INTENSITY_FIELD.options?.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Photo detail */}
          {eventType === "photo" && PHOTO_SUBJECT_FIELD && (
            <div className="rounded-md border border-border p-3" data-testid="qlm-photo-detail">
              <Label htmlFor="qlm-subject">{PHOTO_SUBJECT_FIELD.label}</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger id="qlm-subject" data-testid="qlm-subject">
                  <SelectValue placeholder="Select a subject" />
                </SelectTrigger>
                <SelectContent>
                  {PHOTO_SUBJECT_FIELD.options?.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-3">
                <Label htmlFor="qlm-caption">Caption</Label>
                <input
                  id="qlm-caption"
                  data-testid="qlm-caption"
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, QUICK_LOG_DETAIL_TEXT_MAX))}
                  maxLength={QUICK_LOG_DETAIL_TEXT_MAX}
                  placeholder="What this photo shows"
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p
                  className="mt-1 text-[11px] text-muted-foreground text-right"
                  data-testid="qlm-caption-count"
                >
                  {caption.length}/{QUICK_LOG_DETAIL_TEXT_MAX}
                </p>
              </div>
            </div>
          )}

          {/* Sensor snapshot */}
          <div className="rounded-md border border-border p-3" data-testid="qlm-sensor-snapshot">
            <Label>Latest sensor snapshot</Label>
            {sensorLoading ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading sensor data…
              </div>
            ) : metricChips.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {metricChips.map(({ metric, value }) => (
                  <MetricChip key={metric} label={metric} value={value} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No sensor readings yet for this tent.
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <Label htmlFor="qlm-note">Note</Label>
            <Textarea
              id="qlm-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you notice?"
              className="mt-1 min-h-[80px]"
            />
          </div>

          {/* Photo attachment */}
          <div className="rounded-md border border-border p-3" data-testid="qlm-photo-attachment">
            <Label>Photo attachment</Label>
            {photoPreview ? (
              <div className="mt-2 space-y-2">
                <img
                  src={photoPreview}
                  alt="Selected photo preview"
                  className="aspect-[4/3] w-full rounded-md object-cover"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => handlePhotoSelected(null)}>
                  Remove photo
                </Button>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" />
                  Take Photo
                </Button>
                <Button type="button" variant="outline" onClick={() => libraryRef.current?.click()}>
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Choose Photo
                </Button>
              </div>
            )}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              onChange={handlePhotoInput}
            />
            <input
              ref={libraryRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              onChange={handlePhotoInput}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 gradient-leaf text-primary-foreground"
              onClick={handleSave}
              disabled={saving || missingRequiredDetail}
              data-testid="qlm-save"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Log"
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
